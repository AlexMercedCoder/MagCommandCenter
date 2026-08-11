import { useCallback, useEffect, useRef, useState } from "react";
import type { ExecutionEvent, ExecutionTask } from "../lib/types";
import { cancelMagentStream, magentClient } from "../magent";
import { recordPerformance } from "../lib/performance";
import { activeExecutionStates, terminalExecutionStates } from "../lib/constants";

export function useExecutionRuntime(project: string) {
  const [tasks, setTasks] = useState<ExecutionTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState("");
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [error, setError] = useState("");
  const [recoveredTaskIds, setRecoveredTaskIds] = useState<string[]>([]);
  const streamIds = useRef(new Map<string, string>());
  const sequence = useRef(0);
  const priorStates = useRef(new Map<string, string>());
  const taskStarts = useRef(new Map<string, number>());

  const refreshTasks = useCallback(async () => {
    try {
      const all = await magentClient.listTasks(200);
      const projectTasks = all.filter((task) => task.project_path === project);
      setTasks(projectTasks);
      setRecoveredTaskIds(projectTasks.filter((task) => activeExecutionStates.has(task.state)).map((task) => task.id));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [project]);

  const selectTask = useCallback(async (taskId: string) => {
    setActiveTaskId(taskId);
    sequence.current = 0;
    try {
      const history = await magentClient.events(taskId);
      setEvents(history);
      sequence.current = history[history.length - 1]?.sequence ?? 0;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  const createTask = useCallback(async (title: string, sessionId: string) => {
    const task = await magentClient.createTask(title, project, sessionId);
    setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
    setActiveTaskId(task.id);
    setEvents([]);
    sequence.current = 0;
    taskStarts.current.set(task.id, performance.now());
    return task;
  }, [project]);

  const registerStream = useCallback((taskId: string, streamId: string) => {
    streamIds.current.set(taskId, streamId);
  }, []);

  const controlTask = useCallback(async (taskId: string, action: "pause" | "resume" | "cancel" | "retry") => {
    if (action === "cancel") {
      const streamId = streamIds.current.get(taskId);
      if (streamId) await cancelMagentStream(streamId).catch(() => false);
    }
    const task = await magentClient.action(taskId, action);
    setRecoveredTaskIds((current) => current.filter((id) => id !== taskId));
    setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
    return task;
  }, []);

  useEffect(() => {
    setTasks([]);
    setActiveTaskId("");
    setEvents([]);
    sequence.current = 0;
    void refreshTasks();
  }, [refreshTasks]);

  useEffect(() => {
    for (const task of tasks) {
      const previous = priorStates.current.get(task.id);
      if (previous && previous !== task.state && (terminalExecutionStates.has(task.state) || task.state === "blocked")) {
        notifyTask(task);
      }
      priorStates.current.set(task.id, task.state);
    }
  }, [tasks]);

  useEffect(() => {
    if (!activeTaskId) return;
    let disposed = false;
    const poll = async () => {
      try {
        const [task, nextEvents] = await Promise.all([
          magentClient.task(activeTaskId),
          magentClient.events(activeTaskId, sequence.current)
        ]);
        if (disposed) return;
        setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
        if (nextEvents.length) {
          const startedAt = taskStarts.current.get(activeTaskId);
          if (startedAt !== undefined) {
            recordPerformance("task.first_activity", startedAt);
            taskStarts.current.delete(activeTaskId);
          }
          sequence.current = nextEvents[nextEvents.length - 1]?.sequence ?? sequence.current;
          setEvents((current) => [...current, ...nextEvents].slice(-1000));
        }
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 750);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [activeTaskId]);

  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? null;
  return {
    tasks,
    activeTask,
    activeTaskId,
    events,
    error,
    recoveredTaskIds,
    isActive: Boolean(activeTask && activeExecutionStates.has(activeTask.state)),
    createTask,
    registerStream,
    selectTask,
    controlTask,
    refreshTasks
  };
}

function notifyTask(task: ExecutionTask) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  new Notification(`MagAgent task ${task.state}`, {
    body: task.title,
    tag: task.id
  });
}
