import { useCallback, useEffect, useRef, useState } from "react";
import type { ExecutionEvent, ExecutionTask } from "../lib/types";
import { cancelMagentStream, magentClient } from "../magent";

const ACTIVE_STATES = new Set(["queued", "planning", "running", "waiting", "validating"]);

export function useExecutionRuntime(project: string) {
  const [tasks, setTasks] = useState<ExecutionTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState("");
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [error, setError] = useState("");
  const streamIds = useRef(new Map<string, string>());
  const sequence = useRef(0);

  const refreshTasks = useCallback(async () => {
    try {
      const all = await magentClient.listTasks(200);
      setTasks(all.filter((task) => task.project_path === project));
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
    setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
    return task;
  }, []);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

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
    isActive: Boolean(activeTask && ACTIVE_STATES.has(activeTask.state)),
    createTask,
    registerStream,
    selectTask,
    controlTask,
    refreshTasks
  };
}
