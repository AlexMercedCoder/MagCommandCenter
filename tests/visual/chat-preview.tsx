import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChatPanel } from "../../src/components/chat-panel";
import type {
  ChatMessage,
  ExecutionTask,
  RunCockpit,
} from "../../src/lib/types";
import "../../src/styles.css";

const startedAt = new Date().toISOString();

function runningTask(state: ExecutionTask["state"]): ExecutionTask {
  return {
    id: "visual-task",
    schema_version: "magent.task.v2",
    kind: "ask",
    title: "Research and build a project",
    state,
    project_id: "visual-project",
    project_path: "/home/alexmerced/development/research",
    session_id: "default",
    parent_task_id: "",
    created_at: startedAt,
    updated_at: new Date().toISOString(),
    started_at: startedAt,
    finished_at: state === "cancelled" ? new Date().toISOString() : "",
    attempt: 1,
    usage: {},
    files_changed: [],
    checkpoints: [],
    final_audit: {},
    metadata: {},
  };
}

function Preview() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [task, setTask] = useState<ExecutionTask | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [heartbeat, setHeartbeat] = useState(0);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(
      () => setHeartbeat((current) => current + 1),
      500,
    );
    return () => window.clearInterval(timer);
  }, [busy]);

  const streamLines = busy
    ? [`status: MagAgent is still running (${heartbeat + 1}s)`]
    : [];
  const cockpit = useMemo<RunCockpit>(
    () => ({
      started: busy,
      completed: false,
      ok: null,
      modelRounds: 0,
      toolCount: 0,
      failedToolCount: 0,
      totalDurationMs: 0,
      tools: [],
      permissions: [],
      artifacts: [],
      headline: busy ? "MagAgent is working" : "Waiting for MagAgent activity",
    }),
    [busy],
  );

  const send = () => {
    const content = prompt.trim();
    if (!content) return;
    setHistory((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      },
    ]);
    setPrompt("");
    setTask(runningTask("running"));
    setBusy(true);
  };

  return (
    <main
      className="app-shell"
      data-theme="light"
      style={{ display: "block", padding: 24 }}
    >
      <ChatPanel
        busy={busy}
        prompt={prompt}
        setPrompt={setPrompt}
        session="default"
        sessions={[
          {
            id: "default",
            name: "Default session",
            createdAt: startedAt,
            updatedAt: startedAt,
            permissionMode: "balanced",
          },
        ]}
        setSession={() => undefined}
        sessionDraftName=""
        setSessionDraftName={() => undefined}
        onNewSession={() => undefined}
        onRenameSession={() => undefined}
        onDeleteSession={() => undefined}
        onForkSession={() => undefined}
        onCompactSession={() => undefined}
        onExportSession={() => undefined}
        onConfigureGroup={() => undefined}
        onPermissionMode={() => undefined}
        profiles={[
          {
            name: "magent",
            revision: 1,
            profile_digest: "sha256:visual",
            source: "managed",
            path: "",
          },
        ]}
        agentProfile="magent"
        profileDrifted={false}
        onAgentProfileChange={() => undefined}
        streamLines={streamLines}
        response={null}
        events={[]}
        history={history}
        assistantDraft={
          busy
            ? "I’m building the project now and will report back with the files and validation results."
            : ""
        }
        progressUpdates={
          busy ? ["Creating the project files", "Checking the result"] : []
        }
        quickPrompts={[]}
        project="/home/alexmerced/development/research"
        allProjects={["/home/alexmerced/development/research"]}
        onProjectSelect={() => undefined}
        onOpenProject={() => undefined}
        cockpit={cockpit}
        tasks={task ? [task] : []}
        activeTask={task}
        taskEvents={[]}
        taskError=""
        artifactPreview={null}
        onPreviewArtifact={() => undefined}
        onCloseArtifact={() => undefined}
        onSelectTask={() => undefined}
        onTaskAction={(_, action) => {
          if (action !== "cancel") return;
          setTask(runningTask("cancelled"));
          setBusy(false);
        }}
        onRun={send}
        onCreateOrchestratedGoal={() => undefined}
        onClear={() => setHistory([])}
        contextFiles={[]}
        onRemoveContext={() => undefined}
        onOpenWorkspace={() => undefined}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
