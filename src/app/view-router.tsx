import { lazy, Suspense, type ReactNode } from "react";
import { LibraryLanding } from "../components/app-shell";
import { ChatView } from "../features/chat/chat-view";
import { useChatStore } from "../features/chat/chat-store";
import { selectSessionProfile } from "../features/chat/chat-actions";
import { SettingsView } from "../features/config/settings-view";
import { MemoryView } from "../features/memory/memory-view";
import { PluginsView } from "../features/plugins/plugins-view";
import { ResearchView } from "../features/research/research-view";
import { SqliteView } from "../features/sqlite/sqlite-view";
import { WorkbenchView } from "../features/workbench/workbench-view";
import { projectCrewFor, useAppStore } from "../stores/app-store";
import { HomeView } from "./home-view";
import { RunsView } from "./runs-view";
import { useRuntimes } from "./runtime-context";
import { SetupView } from "./setup-view";

const WorkspacePanel = lazy(() =>
  import("../components/workspace-panel").then((module) => ({
    default: module.WorkspacePanel,
  })),
);
const ToolsPanel = lazy(() =>
  import("../components/tools-panel").then((module) => ({
    default: module.ToolsPanel,
  })),
);
const AgentsPanel = lazy(() =>
  import("../components/agents-panel").then((module) => ({
    default: module.AgentsPanel,
  })),
);
const GraphBoardPanel = lazy(() =>
  import("../components/graph-board-panel").then((module) => ({
    default: module.GraphBoardPanel,
  })),
);
const DocsPanel = lazy(() =>
  import("../components/docs").then((module) => ({
    default: module.DocsPanel,
  })),
);

function Loading(props: { label: string; children: ReactNode }) {
  return (
    <Suspense
      fallback={<div className="panel loading-panel">{props.label}</div>}
    >
      {props.children}
    </Suspense>
  );
}

function WorkspaceView() {
  const project = useAppStore((state) => state.project);
  const notify = useAppStore((state) => state.notify);
  const rememberProject = useAppStore((state) => state.rememberProject);
  const session = useChatStore((state) => state.session);
  const context = useChatStore((state) => state.context);
  const setContext = useChatStore((state) => state.setContext);
  return (
    <WorkspacePanel
      project={project}
      sessionId={session}
      context={context}
      onContextChange={setContext}
      onProjectOpen={rememberProject}
      notify={notify}
    />
  );
}

function AgentsView() {
  const { profiles } = useRuntimes();
  const project = useAppStore((state) => state.project);
  const projectCrews = useAppStore((state) => state.projectCrews);
  const updateProjectCrew = useAppStore((state) => state.updateProjectCrew);
  const setApp = useAppStore((state) => state.set);
  return (
    <AgentsPanel
      runtime={profiles}
      project={project}
      crew={projectCrewFor({ projectCrews, project })}
      onCrewChange={updateProjectCrew}
      onUseInChat={(name) => {
        selectSessionProfile(name, profiles.profiles);
        setApp({ view: "chat" });
      }}
    />
  );
}

const setGraphDirty = (graphDirty: boolean) =>
  useAppStore.getState().set({ graphDirty });

function GraphsView() {
  const { profiles } = useRuntimes();
  const project = useAppStore((state) => state.project);
  const notify = useAppStore((state) => state.notify);
  return (
    <GraphBoardPanel
      project={project}
      profiles={profiles.profiles}
      notify={notify}
      onDirtyChange={setGraphDirty}
    />
  );
}

/** Renders the active view. Graph Board stays mounted so unsaved drafts survive. */
export function ViewRouter() {
  const view = useAppStore((state) => state.view);
  const navigate = useAppStore((state) => state.navigate);
  const notify = useAppStore((state) => state.notify);
  const project = useAppStore((state) => state.project);
  return (
    <>
      {view === "setup" && <SetupView />}
      {view === "dashboard" && <HomeView />}
      {view === "chat" && <ChatView />}
      {view === "workspace" && (
        <Loading label="Loading workspace tools…">
          <WorkspaceView />
        </Loading>
      )}
      {view === "tools" && (
        <Loading label="Loading extension inventory…">
          <ToolsPanel project={project} notify={notify} />
        </Loading>
      )}
      {view === "agents" && (
        <Loading label="Loading agents…">
          <AgentsView />
        </Loading>
      )}
      {view === "research" && <ResearchView />}
      {view === "config" && <SettingsView />}
      {view === "memory" && <MemoryView />}
      {view === "sqlite" && <SqliteView />}
      {view === "plugins" && <PluginsView />}
      {view === "workbench" && <WorkbenchView />}
      <div hidden={view !== "graphs"}>
        <Loading label="Loading Graph Board…">
          <GraphsView />
        </Loading>
      </div>
      {view === "runs" && (
        <Loading label="Loading runs…">
          <RunsView />
        </Loading>
      )}
      {view === "library" && <LibraryLanding onNavigate={navigate} />}
      {view === "docs" && (
        <Loading label="Loading help…">
          <DocsPanel />
        </Loading>
      )}
    </>
  );
}
