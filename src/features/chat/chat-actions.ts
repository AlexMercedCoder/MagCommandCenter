import { storageKeys } from "../../lib/constants";
import { loadAppState, saveAppState } from "../../lib/persistence";
import type {
  AgentProfileSummary,
  ChatMessage,
  ChatSession,
  ExecutionTask,
} from "../../lib/types";
import { summarizeChatResponse } from "../../lib/utils";
import { newChatMessage, summarizeOrchestratedGoal } from "../../lib/workspace";
import { workspaceClient } from "../../lib/workspace-client";
import {
  parseJson,
  readProjectArtifact,
  runMagent,
  runMagentStream,
} from "../../magent";
import { useAppStore } from "../../stores/app-store";
import { useChatStore } from "./chat-store";

/** The parts of the execution runtime and profile runtime that chat actions use. */
export type ChatRuntime = {
  createTask: (title: string, sessionId: string) => Promise<ExecutionTask>;
  registerStream: (taskId: string, streamId: string) => void;
  refreshTasks: () => Promise<void>;
  profiles: AgentProfileSummary[];
  defaultProfile: string;
};

const chat = () => useChatStore.getState();
const app = () => useAppStore.getState();

function message(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

export function activeSession(): ChatSession | undefined {
  const { sessions, session } = chat();
  return sessions.find((item) => item.id === session);
}

/** Profile used for the next ask: session pin, then crew coordinator, then default. */
export function activeProfileName(
  runtime: Pick<ChatRuntime, "defaultProfile">,
) {
  const { projectCrews, project } = app();
  return (
    activeSession()?.agentProfile ||
    projectCrews[project]?.coordinator ||
    runtime.defaultProfile ||
    "magagent"
  );
}

function sameOrigin(origin: { project: string; session: string }) {
  return app().project === origin.project && chat().session === origin.session;
}

function summarizeSession(content: string) {
  chat().patchActiveSession({ summary: content.trim().slice(0, 140) });
}

function askArgs(
  project: string,
  profile: string,
  taskId: string,
  permissionMode: ChatSession["permissionMode"],
  prompt: string,
) {
  const args = [
    "ask",
    "--json",
    "--events",
    "--project",
    project,
    "--agent",
    profile,
    "--execution-task-id",
    taskId,
    "--repair-attempts",
    "1",
  ];
  if (permissionMode) args.push("--permission-mode", permissionMode);
  args.push(prompt);
  return args;
}

export async function runAsk(runtime: ChatRuntime) {
  app().rememberProject();
  const { project } = app();
  const state = chat();
  const rawPrompt = state.prompt.trim();
  let prompt = rawPrompt;
  if (state.context.length) {
    try {
      const context = await workspaceClient.context(
        project,
        state.context.map((item) => item.path),
      );
      prompt += context.prompt;
    } catch (reason) {
      app().notify(
        message(reason, "Could not attach workspace context"),
        "bad",
      );
      return;
    }
  }
  if (!prompt) return;
  const session = activeSession();
  if (session?.kind === "group" && (session.participants?.length ?? 0) >= 2) {
    await runGroupAsk(runtime, rawPrompt, prompt, session);
    return;
  }
  const profile = activeProfileName(runtime);
  const origin = { project, session: state.session };
  if (!session) {
    const now = new Date().toISOString();
    chat().setSessions((current) =>
      [
        {
          id: origin.session,
          name: origin.session,
          createdAt: now,
          updatedAt: now,
          agentProfile: profile,
          profileDigest: runtime.profiles.find((item) => item.name === profile)
            ?.profile_digest,
        },
        ...current,
      ].slice(0, 12),
    );
  }
  chat().setHistory((current) => [
    ...current,
    {
      id: crypto.randomUUID(),
      role: "user",
      content: rawPrompt,
      createdAt: new Date().toISOString(),
    },
  ]);
  chat().set({
    prompt: "",
    streamLines: [],
    events: [{ type: "queued", detail: "Starting MagAgent ask", project }],
    busy: true,
  });
  try {
    const task = await runtime.createTask(prompt, origin.session);
    const streamId = crypto.randomUUID();
    runtime.registerStream(task.id, streamId);
    const result = await runMagentStream(
      askArgs(project, profile, task.id, session?.permissionMode, prompt),
      (event) => {
        if (!sameOrigin(origin)) return;
        chat().setStreamLines((current) =>
          [...current, `${event.stream}: ${event.line}`].slice(-120),
        );
        chat().setEvents((current) =>
          [...current, { type: event.stream, detail: event.line }].slice(-80),
        );
      },
      { id: streamId },
    );
    app().recordCommand(result);
    const data = parseJson<Record<string, unknown>>(result);
    const summary =
      summarizeChatResponse(data) ||
      result.stderr ||
      result.stdout ||
      "No response body returned.";
    const finalEvents = Array.isArray(data?.events)
      ? (data.events as Array<Record<string, unknown>>)
      : [];
    if (sameOrigin(origin)) {
      chat().set({ response: data });
      chat().setPrompt((current) => current || rawPrompt);
      chat().setEvents((current) =>
        [
          ...current,
          ...finalEvents,
          { type: "completed", ok: result.ok, status: result.status },
        ].slice(-160),
      );
      summarizeSession(summary || prompt);
      chat().setHistory((current) => [
        ...current,
        newChatMessage("agent", summary),
      ]);
    } else {
      const key = `${storageKeys.chat}:${origin.project}:${origin.session}`;
      const stored = await loadAppState<ChatMessage[]>(key, []);
      await saveAppState(
        key,
        [...stored, newChatMessage("agent", summary)].slice(-1000),
      );
    }
  } catch (reason) {
    const text = message(reason, "MagAgent did not return a response.");
    if (sameOrigin(origin)) {
      chat().setEvents((current) =>
        [...current, { type: "failed", detail: text }].slice(-160),
      );
      chat().setHistory((current) => [
        ...current,
        newChatMessage("system", `Run failed: ${text}`),
      ]);
    }
    app().notify(text, "bad");
  } finally {
    chat().set({ busy: false });
    void runtime.refreshTasks();
  }
}

async function runGroupAsk(
  runtime: ChatRuntime,
  rawPrompt: string,
  prompt: string,
  session: ChatSession,
) {
  const { project } = app();
  const chatSession = chat().session;
  const participants = (session.participants || []).slice(0, 5);
  const mode = session.groupMode || "sequential";
  const coordinator = session.coordinator || participants[0];
  chat().setHistory((current) => [
    ...current,
    newChatMessage("user", rawPrompt),
  ]);
  chat().set({
    busy: true,
    events: [{ type: "group.started", mode, participants }],
  });
  const ask = async (profile: string, input: string) => {
    const task = await runtime.createTask(
      `[${profile}] ${rawPrompt}`,
      `${chatSession}:${profile}`,
    );
    const streamId = crypto.randomUUID();
    runtime.registerStream(task.id, streamId);
    const result = await runMagentStream(
      askArgs(project, profile, task.id, session.permissionMode, input),
      (event) =>
        chat().setEvents((current) =>
          [
            ...current,
            { type: event.stream, detail: event.line, profile },
          ].slice(-160),
        ),
      { id: streamId },
    );
    const data = parseJson<Record<string, unknown>>(result);
    const summary =
      summarizeChatResponse(data) ||
      result.stderr ||
      result.stdout ||
      "No response returned.";
    chat().setEvents((current) =>
      [
        ...current,
        { type: "group.participant.completed", profile, ok: result.ok },
      ].slice(-160),
    );
    chat().setHistory((current) => [
      ...current,
      {
        ...newChatMessage(result.ok ? "agent" : "system", summary),
        speaker: profile,
      },
    ]);
    return { profile, summary, ok: result.ok };
  };
  try {
    let findings: Array<{ profile: string; summary: string; ok: boolean }> = [];
    if (mode === "sequential") {
      let handoff = prompt;
      for (const profile of participants) {
        const result = await ask(
          profile,
          `${handoff}\n\nYou are ${profile}. Build on prior attributed findings when present.`,
        );
        findings.push(result);
        handoff += `\n\n## ${profile}\n${result.summary}`;
      }
    } else {
      const specialists =
        mode === "coordinator"
          ? participants.filter((item) => item !== coordinator)
          : participants;
      findings = await Promise.all(
        specialists.map((profile) => ask(profile, prompt)),
      );
      if (mode === "coordinator") {
        const evidence = findings
          .map((item) => `## ${item.profile}\n${item.summary}`)
          .join("\n\n");
        findings.push(
          await ask(
            coordinator,
            `${prompt}\n\nSynthesize these attributed specialist findings. Preserve disagreements and evidence.\n\n${evidence}`,
          ),
        );
      }
    }
    summarizeSession(findings[findings.length - 1]?.summary || rawPrompt);
    app().notify(
      `Group run completed with ${findings.length} attributed responses.`,
      findings.every((item) => item.ok) ? "good" : "bad",
    );
  } catch (reason) {
    app().notify(message(reason, "Group run failed"), "bad");
  } finally {
    chat().set({ busy: false });
    void runtime.refreshTasks();
  }
}

export async function createOrchestratedGoal(runtime: ChatRuntime) {
  app().rememberProject();
  const { project } = app();
  const prompt = chat().prompt.trim();
  if (!prompt) return;
  chat().setHistory((current) => [
    ...current,
    {
      id: crypto.randomUUID(),
      role: "user",
      content: `Stage goal: ${prompt}`,
      createdAt: new Date().toISOString(),
    },
  ]);
  chat().set({
    streamLines: [],
    events: [
      {
        type: "queued",
        detail: "Creating orchestrated MagAgent goal",
        project,
      },
    ],
    busy: true,
  });
  try {
    const result = await runMagent([
      "goal",
      prompt,
      "--project",
      project,
      "--agent",
      activeProfileName(runtime),
      "--orchestrated",
      "--json",
    ]);
    app().recordCommand(result);
    const data = parseJson<Record<string, unknown>>(result);
    chat().set({ response: data });
    chat().setEvents((current) =>
      [
        ...current,
        { type: "completed", ok: result.ok, status: result.status },
      ].slice(-160),
    );
    const summary =
      summarizeOrchestratedGoal(data) ||
      result.stderr ||
      result.stdout ||
      "No staged plan details returned.";
    summarizeSession(summary);
    chat().setHistory((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "agent",
        content: summary,
        createdAt: new Date().toISOString(),
      },
    ]);
  } finally {
    chat().set({ busy: false });
  }
}

export async function previewArtifact(path: string) {
  try {
    chat().set({
      artifactPreview: await readProjectArtifact(app().project, path),
    });
  } catch (reason) {
    app().notify(message(reason, "Could not preview artifact"), "bad");
  }
}

export function createChatSession(
  runtime: Pick<ChatRuntime, "profiles" | "defaultProfile">,
) {
  const now = new Date().toISOString();
  const { projectCrews, project } = app();
  const name =
    chat().sessionDraftName.trim() ||
    `session-${now.slice(0, 19).replace(/[:T]/g, "-")}`;
  const initialProfile =
    projectCrews[project]?.coordinator || runtime.defaultProfile;
  const session: ChatSession = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    agentProfile: initialProfile,
    profileDigest: runtime.profiles.find((item) => item.name === initialProfile)
      ?.profile_digest,
    kind: "chat",
  };
  chat().setSessions((current) => [session, ...current].slice(0, 12));
  chat().set({
    session: session.id,
    sessionDraftName: "",
    history: [],
    events: [],
    response: null,
    streamLines: [],
  });
}

export function forkChatSession() {
  const active = activeSession();
  if (!active) return;
  const now = new Date().toISOString();
  const fork = {
    ...active,
    id: crypto.randomUUID(),
    name: `${active.name} · fork`,
    parentSessionId: active.id,
    createdAt: now,
    updatedAt: now,
  };
  void saveAppState(
    `${storageKeys.chat}:${app().project}:${fork.id}`,
    chat().history,
  );
  chat().setSessions((current) => [fork, ...current].slice(0, 40));
  chat().set({ session: fork.id });
  app().notify("Session forked with the current transcript.", "good");
}

export function compactChatSession() {
  const { history } = chat();
  if (history.length < 6) {
    app().notify("This session is already compact.");
    return;
  }
  const retained = history.slice(-6);
  const older = history.slice(0, -6);
  const summary = older
    .map((item) => `${item.speaker || item.role}: ${item.content}`)
    .join("\n")
    .slice(0, 12_000);
  chat().set({
    history: [
      newChatMessage(
        "system",
        `Compacted session context (${older.length} messages):\n${summary}`,
      ),
      ...retained,
    ],
  });
  chat().patchActiveSession({ compactedAt: new Date().toISOString() });
  app().notify("Older context compacted into a bounded summary.", "good");
}

export function exportChatSession() {
  const active = activeSession();
  const body = [
    `# ${active?.name || "MagAgent session"}`,
    "",
    ...chat().history.map(
      (item) => `## ${item.speaker || item.role}\n\n${item.content}`,
    ),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/markdown" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${(active?.name || "session").replace(/[^A-Za-z0-9_.-]/g, "-")}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function configureGroup(
  participants: string[],
  mode: "sequential" | "parallel" | "coordinator",
  coordinator: string,
) {
  const bounded = participants.slice(0, 5);
  chat().patchActiveSession({
    kind: bounded.length >= 2 ? "group" : "chat",
    participants: bounded,
    groupMode: mode,
    coordinator: bounded.includes(coordinator) ? coordinator : bounded[0],
  });
}

export function setSessionPermissionMode(
  mode: "paranoid" | "balanced" | "silent" | "yolo",
) {
  if (
    mode === "yolo" &&
    !window.confirm(
      "Full access can allow consequential tools without per-action prompts. The profile and managed policy still apply. Continue for this session?",
    )
  )
    return;
  chat().patchActiveSession({ permissionMode: mode });
}

export function renameChatSession() {
  const name = chat().sessionDraftName.trim();
  if (!name) return;
  chat().patchActiveSession({ name });
  chat().set({ sessionDraftName: "" });
}

export function deleteChatSession() {
  const { sessions, session } = chat();
  const active = activeSession();
  if (
    !window.confirm(
      `Delete “${active?.name || "this session"}” and its transcript?`,
    )
  )
    return;
  const remaining = sessions.filter((item) => item.id !== session);
  const fallback = remaining[0] ?? {
    id: "default",
    name: "default",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  chat().set({
    sessions: remaining.length ? remaining : [fallback],
    session: fallback.id,
  });
  void saveAppState(`${storageKeys.chat}:${app().project}:${session}`, []);
}

export function selectSessionProfile(
  name: string,
  profiles: AgentProfileSummary[],
) {
  chat().patchActiveSession({
    agentProfile: name,
    profileDigest: profiles.find((item) => item.name === name)?.profile_digest,
  });
}

export function openSession(id: string) {
  chat().set({ session: id });
  app().navigate("chat");
}
