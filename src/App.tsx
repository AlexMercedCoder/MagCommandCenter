import { useEffect, useMemo, useState } from "react";
import { ApprovalCenter } from "./components/approval-center";
import {
  AppRail,
  CommandPalette,
  ContextSidebar,
  WorkspaceHeader,
} from "./components/app-shell";
import { ToastStack } from "./components/common";
import { RuntimeProvider, type Runtimes } from "./app/runtime-context";
import { ViewRouter } from "./app/view-router";
import { projectHealthLabel } from "./app/home-view";
import { useAllProjects } from "./app/use-all-projects";
import { useShortcuts } from "./app/use-shortcuts";
import { useChatStore } from "./features/chat/chat-store";
import { useProfileRuntime } from "./features/profiles/use-profile-runtime";
import { useExecutionRuntime } from "./hooks/use-execution-runtime";
import { useSchedules } from "./hooks/use-schedules";
import { useWorkbenchRuntime } from "./hooks/use-workbench-runtime";
import { magentCompatibility } from "./lib/compatibility";
import { minimumMagentVersion } from "./lib/constants";
import { viewTitle } from "./lib/navigation";
import {
  activeProfileName,
  createChatSession,
  openSession,
} from "./features/chat/chat-actions";
import type { GraphSchedule } from "./lib/types";
import { runMagentStream } from "./magent";
import { effectiveTheme, useAppStore } from "./stores/app-store";
import {
  chooseProjectFolder,
  detectMagent,
  enableNotifications,
  exportDiagnostics,
  runReadiness,
} from "./stores/magent-actions";
import { usePersistence } from "./stores/use-persistence";
import { desktopAvailable, desktopInvoke } from "./lib/desktop";
import { useWorkbenchStore } from "./features/workbench/workbench-store";

const setWorkbenchResult = (result: Record<string, unknown>) =>
  useWorkbenchStore.getState().set({ result });

export function App() {
  const [startedAt] = useState(() => performance.now());
  usePersistence(startedAt);

  const project = useAppStore((state) => state.project);
  const system = useAppStore((state) => state.system);
  const view = useAppStore((state) => state.view);
  const theme = useAppStore((state) => state.theme);
  const systemDark = useAppStore((state) => state.systemDark);
  const accent = useAppStore((state) => state.accent);
  const railCollapsed = useAppStore((state) => state.railCollapsed);
  const mobileNavOpen = useAppStore((state) => state.mobileNavOpen);
  const paletteOpen = useAppStore((state) => state.paletteOpen);
  const pinnedProjects = useAppStore((state) => state.pinnedProjects);
  const readiness = useAppStore((state) => state.readiness);
  const setupDismissed = useAppStore((state) => state.setupDismissed);
  const toasts = useAppStore((state) => state.toasts);
  const {
    set,
    navigate,
    notify,
    setBusy,
    rememberProject,
    togglePinnedProject,
    recordCommand,
  } = useAppStore.getState();
  const sessions = useChatStore((state) => state.sessions);
  const session = useChatStore((state) => state.session);
  const allProjects = useAllProjects();

  const execution = useExecutionRuntime(project);
  const workbench = useWorkbenchRuntime(project, {
    setBusy,
    notify,
    onResult: setWorkbenchResult,
  });
  const profiles = useProfileRuntime(project, Boolean(system?.magent_version));
  const defaultProfile = profiles.defaultProfile;
  const refreshTasks = execution.refreshTasks;
  const schedules = useSchedules(async (schedule: GraphSchedule) => {
    const result = await runMagentStream(
      [
        "graph",
        "run",
        schedule.path,
        "--project",
        schedule.project,
        "--agent",
        activeProfileName({ defaultProfile }),
        "--json",
      ],
      () => undefined,
    );
    recordCommand(result, false);
    await refreshTasks();
    if (!result.ok) throw new Error(result.stderr || "Scheduled graph failed");
  });
  const runtimes: Runtimes = useMemo(
    () => ({ execution, profiles, schedules, workbench }),
    [execution, profiles, schedules, workbench],
  );

  const magentOk = magentCompatibility(system).ok;
  const needsSetup = !system?.magent_version || !magentOk;
  const resolvedTheme = effectiveTheme({ theme, systemDark });

  useShortcuts(runtimes);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const update = () => set({ systemDark: query.matches });
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [set]);

  useEffect(() => {
    void detectMagent();
  }, []);

  const notifications = useAppStore((state) => state.notifications);
  useEffect(() => {
    if (!desktopAvailable()) return;
    void desktopInvoke("set_notification_preferences", notifications).catch(
      () => undefined,
    );
  }, [notifications]);

  useEffect(() => {
    if (system?.magent_version && magentOk && setupDismissed) {
      const current = useAppStore.getState().view;
      if (current === "setup") set({ view: "chat" });
    }
  }, [system, magentOk, setupDismissed, set]);

  const shellTitle = viewTitle(view);
  const shortcuts = useAppStore((state) => state.shortcuts);
  const attention = execution.tasks.filter((task) =>
    ["waiting", "awaiting_human", "blocked", "failed"].includes(task.state),
  ).length;

  return (
    <RuntimeProvider value={runtimes}>
      <div
        className={`app-shell ${railCollapsed ? "rail-collapsed" : ""}`}
        data-theme={resolvedTheme}
        data-accent={accent}
      >
        <AppRail
          view={view}
          collapsed={railCollapsed}
          mobileOpen={mobileNavOpen}
          onNavigate={navigate}
          onToggle={() => set({ railCollapsed: !railCollapsed })}
          onMobileClose={() => set({ mobileNavOpen: false })}
          attention={attention}
          shortcuts={shortcuts}
        />
        <ContextSidebar
          view={view}
          project={project}
          pinned={pinnedProjects.includes(project)}
          sessions={sessions}
          activeSession={session}
          tasks={execution.tasks}
          onNavigate={navigate}
          onProject={chooseProjectFolder}
          onPin={() => togglePinnedProject()}
          onSession={openSession}
          onNewSession={() =>
            createChatSession({
              profiles: profiles.profiles,
              defaultProfile: profiles.defaultProfile,
            })
          }
        />
        <main className="workspace">
          <WorkspaceHeader
            title={shellTitle}
            project={project}
            status={needsSetup ? "Setup needed" : projectHealthLabel(readiness)}
            theme={resolvedTheme}
            onTheme={() => set({ theme: theme === "light" ? "dark" : "light" })}
            onMenu={() => set({ mobileNavOpen: true })}
            onPalette={() => set({ paletteOpen: true })}
            onDetect={detectMagent}
            onReadiness={runReadiness}
            onDiagnostics={exportDiagnostics}
            onNotifications={enableNotifications}
          />

          {needsSetup && !setupDismissed && view !== "setup" && (
            <button
              className="setup-strip"
              onClick={() => navigate("setup")}
              type="button"
            >
              <span>
                MagAgent {minimumMagentVersion}+ is required for the full
                workspace.
              </span>
              <strong>Review setup →</strong>
            </button>
          )}

          <div className="workspace-content">
            <ViewRouter />
          </div>
          <ToastStack toasts={toasts} />
          <ApprovalCenter notify={notify} />
        </main>
        <CommandPalette
          open={paletteOpen}
          onClose={() => set({ paletteOpen: false })}
          onNavigate={navigate}
          onDetect={detectMagent}
          onReadiness={runReadiness}
          projects={allProjects}
          sessions={sessions}
          profiles={profiles.profiles.map((item) => item.name)}
          tasks={execution.tasks}
          onProject={rememberProject}
          onSession={openSession}
        />
      </div>
    </RuntimeProvider>
  );
}
