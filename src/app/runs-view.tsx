import { lazy } from "react";
import { magentClient } from "../magent";
import { previewArtifact } from "../features/chat/chat-actions";
import { useAppStore } from "../stores/app-store";
import { useRuntimes } from "./runtime-context";

const RunCenterPanel = lazy(() =>
  import("../components/run-center-panel").then((module) => ({
    default: module.RunCenterPanel,
  })),
);

export function RunsView() {
  const { execution, schedules } = useRuntimes();
  const project = useAppStore((state) => state.project);

  async function createSchedule(path: string, intervalMinutes: number) {
    const { setBusy, notify } = useAppStore.getState();
    setBusy(true);
    try {
      const validation = await magentClient.validateGraph(path);
      const plan = await magentClient.planGraph(path);
      const gates = Array.isArray(plan.gates) ? plan.gates : [];
      if (validation.ok === false)
        throw new Error(
          "Graph validation failed; fix findings before scheduling.",
        );
      schedules.add({
        project,
        path,
        intervalMinutes: Math.max(1, Math.min(10080, intervalMinutes)),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        enabled: true,
        requiresApproval: gates.length > 0,
      });
      notify(
        gates.length
          ? "Schedule created. Each due run will wait for gate approval."
          : "Schedule created.",
        "good",
      );
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Could not schedule graph",
        "bad",
      );
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  function scheduleAction(
    id: string,
    action: "pause" | "resume" | "run" | "approve" | "delete",
  ) {
    const schedule = schedules.schedules.find((item) => item.id === id);
    if (!schedule) return;
    if (action === "delete") {
      if (window.confirm(`Delete schedule for ${schedule.path}?`))
        schedules.remove(id);
    } else if (action === "pause" || action === "resume") {
      schedules.update(id, { enabled: action === "resume" });
    } else {
      void schedules.execute(
        schedule,
        action === "approve" || !schedule.requiresApproval,
      );
    }
  }

  return (
    <RunCenterPanel
      tasks={execution.tasks}
      activeTask={execution.activeTask}
      events={execution.events}
      error={execution.error}
      recoveredTaskIds={execution.recoveredTaskIds}
      onSelect={execution.selectTask}
      onAction={execution.controlTask}
      onPreviewArtifact={previewArtifact}
      schedules={schedules.schedules.filter((item) => item.project === project)}
      onCreateSchedule={createSchedule}
      onScheduleAction={scheduleAction}
    />
  );
}
