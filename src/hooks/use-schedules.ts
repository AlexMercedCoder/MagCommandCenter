import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphSchedule } from "../lib/types";
import { loadAppState, saveAppState } from "../lib/persistence";

const scheduleKey = "mcc.graphSchedules.v1";

export function useSchedules(run: (schedule: GraphSchedule) => Promise<void>) {
  const [schedules, setSchedules] = useState<GraphSchedule[]>([]);
  const [ready, setReady] = useState(false);
  const running = useRef(new Set<string>());

  useEffect(() => {
    void loadAppState<GraphSchedule[]>(scheduleKey, []).then((items) => {
      setSchedules(items);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (ready) void saveAppState(scheduleKey, schedules);
  }, [ready, schedules]);

  const execute = useCallback(
    async (schedule: GraphSchedule, approved = false) => {
      if (running.current.has(schedule.id)) return;
      if (schedule.requiresApproval && !approved) {
        setSchedules((items) =>
          items.map((item) =>
            item.id === schedule.id
              ? {
                  ...item,
                  approvalPending: true,
                  lastStatus: "waiting_approval",
                }
              : item,
          ),
        );
        return;
      }
      running.current.add(schedule.id);
      try {
        await run(schedule);
        const now = new Date();
        setSchedules((items) =>
          items.map((item) =>
            item.id === schedule.id
              ? {
                  ...item,
                  approvalPending: false,
                  lastRunAt: now.toISOString(),
                  lastStatus: "succeeded",
                  lastError: undefined,
                  nextRunAt: new Date(
                    now.getTime() + item.intervalMinutes * 60_000,
                  ).toISOString(),
                }
              : item,
          ),
        );
      } catch (reason) {
        const now = new Date();
        setSchedules((items) =>
          items.map((item) =>
            item.id === schedule.id
              ? {
                  ...item,
                  approvalPending: false,
                  lastRunAt: now.toISOString(),
                  lastStatus: "failed",
                  lastError:
                    reason instanceof Error ? reason.message : String(reason),
                  nextRunAt: new Date(
                    now.getTime() + item.intervalMinutes * 60_000,
                  ).toISOString(),
                }
              : item,
          ),
        );
      } finally {
        running.current.delete(schedule.id);
      }
    },
    [run],
  );

  useEffect(() => {
    if (!ready) return;
    const poll = () => {
      const now = Date.now();
      for (const schedule of schedules) {
        if (
          schedule.enabled &&
          !schedule.approvalPending &&
          Date.parse(schedule.nextRunAt) <= now
        )
          void execute(schedule);
      }
    };
    poll();
    const timer = window.setInterval(poll, 30_000);
    return () => window.clearInterval(timer);
  }, [ready, schedules, execute]);

  function add(
    input: Omit<
      GraphSchedule,
      "id" | "createdAt" | "nextRunAt" | "approvalPending"
    >,
  ) {
    const now = new Date();
    const item: GraphSchedule = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now.toISOString(),
      nextRunAt: new Date(
        now.getTime() + input.intervalMinutes * 60_000,
      ).toISOString(),
      approvalPending: false,
    };
    setSchedules((items) => [item, ...items]);
    return item;
  }

  function update(id: string, patch: Partial<GraphSchedule>) {
    setSchedules((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function remove(id: string) {
    setSchedules((items) => items.filter((item) => item.id !== id));
  }

  return { schedules, add, update, remove, execute };
}
