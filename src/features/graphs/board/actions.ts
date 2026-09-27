import { open, save } from "@tauri-apps/plugin-dialog";
import { saveAppState } from "../../../lib/persistence";
import type { AgenticGraphDocument } from "../../../lib/types";
import {
  cancelMagentStream,
  magentClient,
  runMagentStream,
} from "../../../magent";
import { localDraftFromGoal, sourceDiff } from "../graph-model";
import { useGraphBoard } from "./store";
import {
  draftKey,
  localDigest,
  message,
  pinnedKey,
  rememberGraph,
} from "./utils";

/** Where board actions report results; the view passes the app's toast notifier. */
export type BoardContext = {
  project: string;
  notify: (text: string, tone?: "info" | "good" | "bad") => void;
};

const board = () => useGraphBoard.getState();

export function gatesOf(plan: Record<string, unknown> | null): string[] {
  return Array.isArray(plan?.gates) ? plan.gates.map(String) : [];
}

export function isPlanStale() {
  const { plan, document, planDigest } = board();
  return Boolean(
    plan && document && planDigest && planDigest !== localDigest(document),
  );
}

export function confirmAbandon() {
  return (
    !board().dirty ||
    window.confirm("Discard the recoverable unsaved graph draft?")
  );
}

async function openPath(
  ctx: BoardContext,
  chosen: string,
  failure: string,
  remember: boolean,
) {
  board().set({ busy: true });
  try {
    const result = await magentClient.inspectGraph(chosen);
    board().replaceDocument(result.document, {
      baseline: structuredClone(result.document),
      path: result.path,
      digest: result.digest,
      dirty: false,
    });
    if (remember) await rememberGraph(ctx.project, result.path);
    ctx.notify("Graph loaded", "good");
  } catch (error) {
    ctx.notify(message(error, failure), "bad");
  } finally {
    board().set({ busy: false });
  }
}

export async function loadGraph(ctx: BoardContext) {
  if (!confirmAbandon()) return;
  const chosen = await open({
    title: "Open Agentic Graph",
    filters: [{ name: "Agentic Graph", extensions: ["yaml", "yml", "json"] }],
  });
  if (typeof chosen !== "string") return;
  board().set({ generationStarted: Date.now() });
  try {
    await openPath(ctx, chosen, "Could not load graph", true);
  } finally {
    board().set({ generationStarted: null });
  }
}

export async function openKnown(ctx: BoardContext, chosen: string) {
  if (!confirmAbandon()) return;
  await openPath(ctx, chosen, "Could not open recent graph", false);
}

export async function generate(
  ctx: BoardContext,
  modelBacked = false,
  preset = "",
) {
  const objective = preset || board().goal.trim();
  if (!objective || !confirmAbandon()) return;
  const draft = { baseline: null, path: "", digest: "", dirty: true };
  board().set({ busy: true, generationStarted: Date.now() });
  try {
    const result = modelBacked
      ? await magentClient.modelGraphDraft(objective, ctx.project)
      : await magentClient.generateGraph(objective, ctx.project);
    board().replaceDocument(result.document, draft);
    if (modelBacked && result.fallback) {
      ctx.notify(
        `The planning model did not return a valid graph, so MagAgent loaded a safe, runnable draft instead${result.fallback_reason ? `: ${result.fallback_reason}` : "."}`,
        "info",
      );
    } else {
      ctx.notify(
        modelBacked
          ? "Planning model produced a validated review draft"
          : "Generated a deterministic review draft",
        "good",
      );
    }
  } catch (error) {
    if (!modelBacked && !("__TAURI_INTERNALS__" in window)) {
      board().replaceDocument(localDraftFromGoal(objective), draft);
      ctx.notify(
        "Generated a local preview draft; desktop execution still uses MagAgent",
        "info",
      );
    } else ctx.notify(message(error, "Could not generate graph"), "bad");
  } finally {
    board().set({ busy: false, generationStarted: null });
  }
}

export function blankGraph() {
  if (!confirmAbandon()) return;
  const objective = board().goal.trim();
  const title =
    objective.replace(/\.$/, "").slice(0, 180) || "Untitled workflow";
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "untitled";
  board().replaceDocument(
    {
      ags_version: "1.0",
      kind: "AgenticGraph",
      id: `magent/command-center/${slug}`,
      title,
      objective:
        objective || "Describe the outcome this workflow should achieve.",
      version: "1.0.0",
      requires_conformance: 1,
      constraints: { max_parallel_nodes: 1, max_node_executions: 50 },
      policy: {
        on_expression_error: "fail",
        on_node_failure: "halt",
        checkpointing: "per_node",
      },
      entrypoints: [],
      nodes: {},
      outputs: {},
    },
    { baseline: null, path: "", digest: "", dirty: true },
  );
}

export function applyTemplateDocument(next: AgenticGraphDocument) {
  if (!confirmAbandon()) return;
  board().replaceDocument(structuredClone(next), {
    baseline: null,
    path: "",
    digest: "",
    dirty: true,
  });
}

export async function saveGraph(ctx: BoardContext, saveAs = false) {
  const { document, baseline, path, digest } = board();
  if (!document) return;
  let target = saveAs ? "" : path;
  if (!target) {
    const chosen = await save({
      title: "Save Agentic Graph",
      defaultPath: `${ctx.project}/workflow.agraph.yaml`,
      filters: [{ name: "Agentic Graph", extensions: ["yaml", "json"] }],
    });
    if (typeof chosen !== "string") return;
    target = chosen;
  }
  const changed = baseline ? sourceDiff(baseline, document).length : 0;
  if (
    changed &&
    !window.confirm(`Save ${changed} changed source lines to this graph?`)
  )
    return;
  board().set({ busy: true });
  try {
    const result = await magentClient.saveGraph(
      document,
      target,
      ctx.project,
      digest,
    );
    board().set({
      path: result.path,
      digest: result.digest,
      baseline: structuredClone(document),
      dirty: false,
      past: [],
      future: [],
    });
    await saveAppState(draftKey(ctx.project), null);
    await rememberGraph(ctx.project, result.path);
    board().set({
      recentGraphs: [
        result.path,
        ...board().recentGraphs.filter((item) => item !== result.path),
      ].slice(0, 25),
      externalDocument: null,
    });
    ctx.notify("Graph saved atomically and validated", "good");
  } catch (error) {
    ctx.notify(
      message(
        error,
        "Could not save graph. Reload, compare, or save as a new file if it changed externally.",
      ),
      "bad",
    );
  } finally {
    board().set({ busy: false });
  }
}

export async function previewPlan(ctx: BoardContext) {
  const { document } = board();
  if (!document) return;
  board().set({ busy: true });
  try {
    const result = await magentClient.previewGraph(document, ctx.project);
    board().set({
      plan: (result.plan as Record<string, unknown>) ?? result,
      planDigest: localDigest(document),
      approvedGates: new Set(),
    });
    ctx.notify("Graph is valid and its digest-bound plan is current", "good");
  } catch (error) {
    ctx.notify(message(error, "Graph needs attention"), "bad");
  } finally {
    board().set({ busy: false });
  }
}

export async function propose(ctx: BoardContext) {
  const { document, assistantPrompt } = board();
  if (!document || !assistantPrompt.trim()) return;
  board().set({ busy: true });
  try {
    const result = await magentClient.modelGraphDraft(
      document.objective,
      ctx.project,
      document,
      assistantPrompt.trim(),
    );
    const changes = result.changes ?? [];
    board().set({
      proposal: {
        document: result.document,
        changes,
        model: result.model,
        profile: result.profile,
      },
      proposalSelection: new Set(changes.map((_, index) => index)),
    });
    ctx.notify(
      result.fallback
        ? `The planning model did not return valid changes, so MagAgent prepared a safe baseline for review${result.fallback_reason ? `: ${result.fallback_reason}` : "."}`
        : "A validated graph proposal is ready for review",
      result.fallback ? "info" : "good",
    );
  } catch (error) {
    ctx.notify(message(error, "Could not propose graph changes"), "bad");
  } finally {
    board().set({ busy: false });
  }
}

export function applyProposal() {
  const { document, proposal, proposalSelection } = board();
  if (!document || !proposal) return;
  const next = structuredClone(document);
  proposal.changes.forEach((change, index) => {
    if (!proposalSelection.has(index)) return;
    const pointer = String(change.pointer ?? "");
    if (pointer === "/objective") next.objective = proposal.document.objective;
    const match = pointer.match(/^\/nodes\/([^/]+)/);
    if (match) {
      const id = match[1];
      if (String(change.operation) === "remove") delete next.nodes[id];
      else if (proposal.document.nodes[id])
        next.nodes[id] = structuredClone(proposal.document.nodes[id]);
    }
  });
  board().commit(next);
  board().set({ proposal: null });
}

async function streamRun(
  ctx: BoardContext,
  title: string,
  args: (taskId: string) => string[],
  labels: { ok: string; review: string; failure: string },
) {
  board().set({ busy: true, activity: [] });
  try {
    const task = await magentClient.createGraphTask(title, ctx.project);
    const streamId = crypto.randomUUID();
    board().set({ runTask: task, childTasks: [], streamId });
    const result = await runMagentStream(
      args(task.id),
      (event) =>
        board().setActivity((lines) => [...lines.slice(-499), event.line]),
      { id: streamId },
    );
    const [refreshed, children] = await Promise.all([
      magentClient.task(task.id).catch(() => task),
      magentClient.childTasks(task.id).catch(() => []),
    ]);
    board().set({ runTask: refreshed, childTasks: children });
    ctx.notify(
      result.ok ? labels.ok : labels.review,
      result.ok ? "good" : "bad",
    );
  } catch (error) {
    ctx.notify(message(error, labels.failure), "bad");
  } finally {
    board().set({ busy: false, streamId: "" });
  }
}

export async function runGraph(ctx: BoardContext) {
  const { document, dirty, path, plan, approvedGates } = board();
  if (!document || dirty || !path || !plan || isPlanStale()) {
    ctx.notify("Save and validate the current graph before running it", "bad");
    return;
  }
  if (gatesOf(plan).some((gate) => !approvedGates.has(gate))) {
    ctx.notify("Review every human gate before starting this run", "bad");
    return;
  }
  if (
    !window.confirm(
      "Start this exact digest-bound graph with the displayed limits and gate decisions?",
    )
  )
    return;
  await streamRun(
    ctx,
    document.title,
    (taskId) => [
      "graph",
      "run",
      path,
      "--project",
      ctx.project,
      "--execution-task-id",
      taskId,
      "--approve-gates",
      [...approvedGates].join(","),
      "--jsonl",
    ],
    {
      ok: "Graph run completed",
      review: "Graph run needs review",
      failure: "Could not run graph",
    },
  );
}

export async function controlRun(
  ctx: BoardContext,
  action: "pause" | "resume" | "cancel" | "retry",
  selectedRetryNodes: string[] = [],
) {
  const { runTask, path, document, childTasks, approvedGates, streamId } =
    board();
  if (!runTask) return;
  if (action === "retry") {
    const runId = String(runTask.metadata.run_id ?? "");
    if (!runId || !path) {
      ctx.notify("This task has no digest-bound graph run to resume", "bad");
      return;
    }
    const failedNodes = selectedRetryNodes.length
      ? selectedRetryNodes
      : childTasks
          .filter((child) =>
            ["failed", "blocked", "cancelled"].includes(child.state),
          )
          .map((child) => String(child.metadata.node_id ?? ""))
          .filter(Boolean);
    await streamRun(
      ctx,
      `${document?.title ?? runTask.title} resume`,
      (taskId) => {
        const args = [
          "graph",
          "resume",
          runId,
          "--file",
          path,
          "--project",
          ctx.project,
          "--execution-task-id",
          taskId,
          "--approve-gates",
          [...approvedGates].join(","),
          "--jsonl",
        ];
        if (failedNodes.length)
          args.push("--retry-nodes", failedNodes.join(","));
        return args;
      },
      {
        ok: "Graph resume completed",
        review: "Graph resume needs review",
        failure: "Could not resume graph run",
      },
    );
    return;
  }
  if (action === "cancel" && streamId)
    await cancelMagentStream(streamId).catch(() => false);
  board().set({ runTask: await magentClient.action(runTask.id, action) });
}

export function togglePinnedGraph(project: string, item: string) {
  const { pinnedGraphs } = board();
  const next = pinnedGraphs.includes(item)
    ? pinnedGraphs.filter((path) => path !== item)
    : [item, ...pinnedGraphs];
  board().set({ pinnedGraphs: next });
  void saveAppState(pinnedKey(project), next);
}
