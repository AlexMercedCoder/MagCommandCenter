import { useMemo } from "react";
import { useRuntimes } from "../../app/runtime-context";
import { ChatPanel } from "../../components/chat-panel";
import { activeExecutionStates, quickPrompts } from "../../lib/constants";
import { deriveRunCockpit } from "../../lib/utils";
import { useAppStore } from "../../stores/app-store";
import { chooseProjectFolder } from "../../stores/magent-actions";
import { projectChatEvents } from "./chat-projection";
import {
  compactChatSession,
  configureGroup,
  createChatSession,
  createOrchestratedGoal,
  deleteChatSession,
  exportChatSession,
  forkChatSession,
  previewArtifact,
  renameChatSession,
  runAsk,
  selectSessionProfile,
  setSessionHarness,
  setSessionPermissionMode,
  stopActiveStream,
} from "./chat-actions";
import { harnesses, loroHarnessEnabled } from "../../harness/registry";
import { useChatStore } from "./chat-store";
import { useAllProjects } from "../../app/use-all-projects";
import { useChatRuntime } from "./use-chat-runtime";

export function ChatView() {
  const { execution, profiles } = useRuntimes();
  const { runtime, activeProfile, profileDrifted } = useChatRuntime();
  const chat = useChatStore();
  const project = useAppStore((state) => state.project);
  const rememberProject = useAppStore((state) => state.rememberProject);
  const navigate = useAppStore((state) => state.navigate);
  const allProjects = useAllProjects();
  const harnessOptions = useMemo(
    () =>
      Object.values(harnesses)
        .filter((item) => item.id === "magent" || loroHarnessEnabled())
        .map(({ id, label, experimental }) => ({ id, label, experimental })),
    [],
  );

  const runtimeEvents = useMemo(
    () =>
      execution.events.map((event) => ({
        type: event.type,
        state: event.state,
        ...event.detail,
      })),
    [execution.events],
  );
  const cockpit = useMemo(
    () =>
      deriveRunCockpit(
        [...chat.events, ...runtimeEvents],
        chat.response,
        chat.streamLines,
      ),
    [chat.events, runtimeEvents, chat.response, chat.streamLines],
  );
  const projection = useMemo(
    () =>
      projectChatEvents([
        ...chat.events,
        ...runtimeEvents,
        ...(chat.response ? [chat.response] : []),
      ]),
    [chat.events, runtimeEvents, chat.response],
  );

  return (
    <ChatPanel
      busy={
        chat.busy ||
        execution.tasks.some((task) => activeExecutionStates.has(task.state))
      }
      prompt={chat.prompt}
      setPrompt={chat.setPrompt}
      session={chat.session}
      sessions={chat.sessions}
      setSession={(id) => chat.set({ session: id })}
      sessionDraftName={chat.sessionDraftName}
      setSessionDraftName={(value) => chat.set({ sessionDraftName: value })}
      onNewSession={() => createChatSession(runtime)}
      onRenameSession={renameChatSession}
      onDeleteSession={deleteChatSession}
      onForkSession={forkChatSession}
      onCompactSession={compactChatSession}
      onExportSession={exportChatSession}
      onConfigureGroup={configureGroup}
      onPermissionMode={setSessionPermissionMode}
      profiles={profiles.profiles}
      agentProfile={activeProfile}
      profileDrifted={profileDrifted}
      harness={
        chat.sessions.find((item) => item.id === chat.session)?.harness ??
        "magent"
      }
      harnessOptions={harnessOptions}
      onHarnessChange={setSessionHarness}
      onStopStream={
        chat.activeStream && chat.activeStream.harness !== "magent"
          ? () => void stopActiveStream()
          : undefined
      }
      onAgentProfileChange={(name) =>
        selectSessionProfile(name, profiles.profiles)
      }
      streamLines={chat.streamLines}
      response={chat.response}
      events={chat.events}
      history={chat.history}
      assistantDraft={projection.assistantText}
      progressUpdates={projection.progress}
      quickPrompts={quickPrompts}
      project={project}
      allProjects={allProjects}
      onProjectSelect={rememberProject}
      onOpenProject={chooseProjectFolder}
      cockpit={cockpit}
      tasks={execution.tasks}
      activeTask={execution.activeTask}
      taskEvents={execution.events}
      taskError={execution.error}
      recoveredTaskIds={execution.recoveredTaskIds}
      artifactPreview={chat.artifactPreview}
      onPreviewArtifact={previewArtifact}
      onCloseArtifact={() => chat.set({ artifactPreview: null })}
      onSelectTask={execution.selectTask}
      onTaskAction={execution.controlTask}
      onRun={() => runAsk(runtime)}
      onCreateOrchestratedGoal={() => createOrchestratedGoal(runtime)}
      onClear={chat.clearTranscript}
      contextFiles={chat.context}
      onRemoveContext={(path) =>
        chat.setContext((current) =>
          current.filter((item) => item.path !== path),
        )
      }
      onOpenWorkspace={() => navigate("workspace")}
    />
  );
}
