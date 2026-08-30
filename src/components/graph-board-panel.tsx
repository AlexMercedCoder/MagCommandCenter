import { open, save } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  FileCode2,
  Filter,
  FolderOpen,
  GitFork,
  ListTree,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  addNode,
  duplicateNodeLocal,
  filterNodeIds,
  graphDiagnostics,
  graphStages,
  jsonSource,
  localDraftFromGoal,
  measureGraphModel,
  outgoingDependents,
  removeNode,
  replaceNodeType,
  sourceDiff,
  updateNode,
} from "../features/graphs/graph-model";
import type {
  AgenticGraphDocument,
  AgenticGraphNode,
  AgentProfileSummary,
  EffectiveAgentProfile,
  ExecutionTask,
  GraphAuthoringContract,
  GraphNodeType,
} from "../lib/types";
import { loadAppState, saveAppState } from "../lib/persistence";
import { recordPerformance } from "../lib/performance";
import { cancelMagentStream, magentClient, runMagentStream } from "../magent";
import { GraphPlanView } from "./workbench-panel";

type Props = {
  project: string;
  profiles: AgentProfileSummary[];
  notify: (text: string, tone?: "info" | "good" | "bad") => void;
  onDirtyChange?: (dirty: boolean) => void;
};
type ViewMode = "board" | "map" | "source";
type WorkspacePanel = "assistant" | "templates" | "review" | "execution";
type Proposal = {
  document: AgenticGraphDocument;
  changes: Array<Record<string, string>>;
  model: string;
  profile: string;
};
type DraftRecord = {
  document: AgenticGraphDocument;
  path: string;
  digest: string;
  baseline: AgenticGraphDocument | null;
  updatedAt: string;
};
const nodeTypes: GraphNodeType[] = [
  "task",
  "decision",
  "gate",
  "loop",
  "map",
  "subgraph",
];
const activeStates = new Set([
  "queued",
  "planning",
  "running",
  "waiting",
  "awaiting_human",
  "validating",
  "ready",
]);

export function GraphBoardPanel({
  project,
  profiles: knownProfiles,
  notify,
  onDirtyChange,
}: Props) {
  const [document, setDocument] = useState<AgenticGraphDocument | null>(null);
  const [baseline, setBaseline] = useState<AgenticGraphDocument | null>(null);
  const [contract, setContract] = useState<GraphAuthoringContract | null>(null);
  const [path, setPath] = useState("");
  const [digest, setDigest] = useState("");
  const [selected, setSelected] = useState("");
  const [multi, setMulti] = useState<Set<string>>(new Set());
  const [goal, setGoal] = useState("");
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposalSelection, setProposalSelection] = useState<Set<number>>(
    new Set(),
  );
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [planDigest, setPlanDigest] = useState("");
  const [activity, setActivity] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [generationStarted, setGenerationStarted] = useState<number | null>(
    null,
  );
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [past, setPast] = useState<AgenticGraphDocument[]>([]);
  const [future, setFuture] = useState<AgenticGraphDocument[]>([]);
  const [view, setView] = useState<ViewMode>("board");
  const [workspacePanel, setWorkspacePanel] =
    useState<WorkspacePanel>("assistant");
  const [compact, setCompact] = useState(false);
  const [presentationOrder, setPresentationOrder] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [profileFilter, setProfileFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [approvedGates, setApprovedGates] = useState<Set<string>>(new Set());
  const [runTask, setRunTask] = useState<ExecutionTask | null>(null);
  const [childTasks, setChildTasks] = useState<ExecutionTask[]>([]);
  const [effectiveProfile, setEffectiveProfile] =
    useState<EffectiveAgentProfile | null>(null);
  const [recentGraphs, setRecentGraphs] = useState<string[]>([]);
  const [pinnedGraphs, setPinnedGraphs] = useState<string[]>([]);
  const [externalDocument, setExternalDocument] = useState<{
    document: AgenticGraphDocument;
    digest: string;
  } | null>(null);
  const streamId = useRef("");
  const diagnostics = useMemo(
    () => (document ? graphDiagnostics(document) : []),
    [document],
  );
  const profiles = contract?.profiles ?? knownProfiles;
  const nodeCount = document ? Object.keys(document.nodes).length : 0;
  const effectiveCompact = compact || nodeCount >= 100;
  const labels = useMemo(
    () =>
      document
        ? [
            ...new Set(
              Object.values(document.nodes).flatMap(
                (node) => node.labels ?? [],
              ),
            ),
          ].sort()
        : [],
    [document],
  );
  const visible = useMemo(
    () =>
      document
        ? filterNodeIds(document, query, typeFilter, profileFilter, labelFilter)
        : new Set<string>(),
    [document, query, typeFilter, profileFilter, labelFilter],
  );
  const stalePlan = Boolean(
    plan && document && planDigest && planDigest !== localDigest(document),
  );
  useEffect(() => {
    if (!generationStarted) {
      setGenerationElapsed(0);
      return;
    }
    const tick = () =>
      setGenerationElapsed(Math.floor((Date.now() - generationStarted) / 1000));
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [generationStarted]);
  const gates = useMemo(
    () => (Array.isArray(plan?.gates) ? plan.gates.map(String) : []),
    [plan],
  );

  useEffect(() => {
    let disposed = false;
    void magentClient
      .graphContract(project)
      .then((value) => {
        if (!disposed) setContract(value);
      })
      .catch(() => setContract(null));
    void restoreDraft(project).then((draft) => {
      if (disposed || !draft) return;
      setDocument(draft.document);
      setBaseline(draft.baseline);
      setPath(draft.path);
      setDigest(draft.digest);
      setDirty(true);
      setSelected(Object.keys(draft.document.nodes)[0] ?? "");
      notify("Recovered an unsaved Graph Board draft", "info");
    });
    void magentClient
      .listTasks(250)
      .then((tasks) => {
        const graphTasks = tasks.filter(
          (task) =>
            task.kind === "agentic_graph" && task.project_path === project,
        );
        const recovered =
          graphTasks.find((task) => activeStates.has(task.state)) ??
          graphTasks[0];
        if (recovered && !disposed) {
          setRunTask(recovered);
          void magentClient
            .childTasks(recovered.id)
            .then((children) => {
              if (!disposed) setChildTasks(children);
            })
            .catch(() => undefined);
          const runId = String(recovered.metadata.run_id ?? "");
          if (runId)
            void magentClient
              .graphRun(runId)
              .then((status) => {
                const task = status.task as ExecutionTask | undefined;
                const nodes = Array.isArray(status.nodes)
                  ? (status.nodes as Array<Record<string, unknown>>)
                  : [];
                if (!disposed && task) setRunTask(task);
                if (!disposed && nodes.length)
                  setChildTasks(
                    nodes
                      .map((node) => node.task)
                      .filter(Boolean) as ExecutionTask[],
                  );
              })
              .catch(() => undefined);
        }
      })
      .catch(() => undefined);
    void Promise.all([
      loadAppState<string[]>(recentKey(project), []),
      loadAppState<string[]>(pinnedKey(project), []),
    ]).then(([recent, pinned]) => {
      if (!disposed) {
        setRecentGraphs(recent);
        setPinnedGraphs(pinned);
      }
    });
    return () => {
      disposed = true;
    };
  }, [project]);

  useEffect(() => {
    if (!document || !dirty) return;
    const timer = window.setTimeout(
      () =>
        void saveAppState(draftKey(project), {
          document,
          path,
          digest,
          baseline,
          updatedAt: new Date().toISOString(),
        } satisfies DraftRecord).catch(() => undefined),
      400,
    );
    return () => window.clearTimeout(timer);
  }, [document, dirty, path, digest, baseline, project]);

  useEffect(() => {
    if (!runTask || !activeStates.has(runTask.state)) return;
    let disposed = false;
    const refresh = async () => {
      try {
        const [root, children] = await Promise.all([
          magentClient.task(runTask.id),
          magentClient.childTasks(runTask.id),
        ]);
        if (!disposed) {
          setRunTask(root);
          setChildTasks(children);
        }
      } catch {
        /* The stream carries the actionable error. */
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 750);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [runTask?.id, runTask?.state]);

  useEffect(() => {
    if (!path || !digest) return;
    let disposed = false;
    const check = async () => {
      try {
        const current = await magentClient.inspectGraph(path);
        if (!disposed)
          setExternalDocument(
            current.digest !== digest
              ? { document: current.document, digest: current.digest }
              : null,
          );
      } catch {
        /* Saving still performs the authoritative conflict check. */
      }
    };
    const timer = window.setInterval(() => void check(), 5000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [path, digest]);

  useEffect(() => {
    const profile = document?.nodes[selected]?.["x-magagent-profile"];
    if (!profile) {
      setEffectiveProfile(null);
      return;
    }
    void magentClient
      .effectiveProfile(profile, project)
      .then(setEffectiveProfile)
      .catch(() => setEffectiveProfile(null));
  }, [document, selected, project]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!document) return;
    setPresentationOrder((current) => [
      ...current.filter((id) => document.nodes[id]),
      ...Object.keys(document.nodes).filter((id) => !current.includes(id)),
    ]);
  }, [document ? Object.keys(document.nodes).join("|") : ""]);

  useEffect(() => {
    if (document)
      recordPerformance("graph.model", 0, measureGraphModel(document));
  }, [document]);

  function commit(next: AgenticGraphDocument) {
    if (document) setPast((items) => [...items.slice(-49), document]);
    setFuture([]);
    setDocument(next);
    setDirty(true);
    setPlan(null);
    setPlanDigest("");
    setProposal(null);
  }
  function undo() {
    if (!document || !past.length) return;
    const previous = past[past.length - 1];
    setFuture((items) => [document, ...items].slice(0, 50));
    setPast((items) => items.slice(0, -1));
    setDocument(previous);
    setDirty(true);
    setPlan(null);
  }
  function redo() {
    if (!document || !future.length) return;
    const next = future[0];
    setPast((items) => [...items, document].slice(-50));
    setFuture((items) => items.slice(1));
    setDocument(next);
    setDirty(true);
    setPlan(null);
  }
  function movePresentation(id: string, delta: number) {
    setPresentationOrder((current) => {
      const next = [...current];
      const index = next.indexOf(id);
      const target = Math.max(0, Math.min(next.length - 1, index + delta));
      if (index < 0 || index === target) return current;
      next.splice(index, 1);
      next.splice(target, 0, id);
      return next;
    });
  }
  function confirmAbandon() {
    return (
      !dirty || window.confirm("Discard the recoverable unsaved graph draft?")
    );
  }

  async function loadGraph() {
    if (!confirmAbandon()) return;
    const chosen = await open({
      title: "Open Agentic Graph",
      filters: [{ name: "Agentic Graph", extensions: ["yaml", "yml", "json"] }],
    });
    if (typeof chosen !== "string") return;
    setBusy(true);
    setGenerationStarted(Date.now());
    try {
      const result = await magentClient.inspectGraph(chosen);
      setDocument(result.document);
      setBaseline(structuredClone(result.document));
      setPath(result.path);
      setDigest(result.digest);
      setDirty(false);
      setPlan(null);
      setPast([]);
      setFuture([]);
      setSelected(Object.keys(result.document.nodes)[0] ?? "");
      await rememberGraph(project, result.path);
      notify("Graph loaded", "good");
    } catch (error) {
      notify(message(error, "Could not load graph"), "bad");
    } finally {
      setBusy(false);
      setGenerationStarted(null);
    }
  }

  async function openKnown(chosen: string) {
    if (!confirmAbandon()) return;
    setBusy(true);
    try {
      const result = await magentClient.inspectGraph(chosen);
      setDocument(result.document);
      setBaseline(structuredClone(result.document));
      setPath(result.path);
      setDigest(result.digest);
      setDirty(false);
      setPlan(null);
      setPast([]);
      setFuture([]);
      setSelected(Object.keys(result.document.nodes)[0] ?? "");
      notify("Graph loaded", "good");
    } catch (error) {
      notify(message(error, "Could not open recent graph"), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function generate(modelBacked = false, preset = "") {
    const objective = preset || goal.trim();
    if (!objective || !confirmAbandon()) return;
    setBusy(true);
    setGenerationStarted(Date.now());
    try {
      const result = modelBacked
        ? await magentClient.modelGraphDraft(objective, project)
        : await magentClient.generateGraph(objective, project);
      setDocument(result.document);
      setBaseline(null);
      setDigest("");
      setPath("");
      setDirty(true);
      setPlan(null);
      setPast([]);
      setFuture([]);
      setSelected(Object.keys(result.document.nodes)[0] ?? "");
      if (modelBacked && result.fallback) {
        notify(
          `The planning model did not return a valid graph, so MagAgent loaded a safe, runnable draft instead${result.fallback_reason ? `: ${result.fallback_reason}` : "."}`,
          "info",
        );
      } else {
        notify(
          modelBacked
            ? "Planning model produced a validated review draft"
            : "Generated a deterministic review draft",
          "good",
        );
      }
    } catch (error) {
      if (!modelBacked && !("__TAURI_INTERNALS__" in window)) {
        const next = localDraftFromGoal(objective);
        setDocument(next);
        setBaseline(null);
        setDigest("");
        setPath("");
        setDirty(true);
        setPlan(null);
        setPast([]);
        setFuture([]);
        setSelected(Object.keys(next.nodes)[0] ?? "");
        notify(
          "Generated a local preview draft; desktop execution still uses MagAgent",
          "info",
        );
      } else notify(message(error, "Could not generate graph"), "bad");
    } finally {
      setBusy(false);
      setGenerationStarted(null);
    }
  }

  async function saveGraph(saveAs = false) {
    if (!document) return;
    let target = saveAs ? "" : path;
    if (!target) {
      const chosen = await save({
        title: "Save Agentic Graph",
        defaultPath: `${project}/workflow.agraph.yaml`,
        filters: [{ name: "Agentic Graph", extensions: ["yaml", "json"] }],
      });
      if (typeof chosen !== "string") return;
      target = chosen;
    }
    if (
      baseline &&
      sourceDiff(baseline, document).length &&
      !window.confirm(
        `Save ${sourceDiff(baseline, document).length} changed source lines to this graph?`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await magentClient.saveGraph(
        document,
        target,
        project,
        digest,
      );
      setPath(result.path);
      setDigest(result.digest);
      setBaseline(structuredClone(document));
      setDirty(false);
      setPast([]);
      setFuture([]);
      await saveAppState(draftKey(project), null);
      await rememberGraph(project, result.path);
      setRecentGraphs((items) =>
        [result.path, ...items.filter((item) => item !== result.path)].slice(
          0,
          25,
        ),
      );
      setExternalDocument(null);
      notify("Graph saved atomically and validated", "good");
    } catch (error) {
      notify(
        message(
          error,
          "Could not save graph. Reload, compare, or save as a new file if it changed externally.",
        ),
        "bad",
      );
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    if (!document) return;
    setBusy(true);
    try {
      const result = await magentClient.previewGraph(document, project);
      setPlan((result.plan as Record<string, unknown>) ?? result);
      setPlanDigest(localDigest(document));
      setApprovedGates(new Set());
      notify("Graph is valid and its digest-bound plan is current", "good");
    } catch (error) {
      notify(message(error, "Graph needs attention"), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function propose() {
    if (!document || !assistantPrompt.trim()) return;
    setBusy(true);
    try {
      const result = await magentClient.modelGraphDraft(
        document.objective,
        project,
        document,
        assistantPrompt.trim(),
      );
      const changes = result.changes ?? [];
      setProposal({
        document: result.document,
        changes,
        model: result.model,
        profile: result.profile,
      });
      setProposalSelection(new Set(changes.map((_, index) => index)));
      notify(
        result.fallback
          ? `The planning model did not return valid changes, so MagAgent prepared a safe baseline for review${result.fallback_reason ? `: ${result.fallback_reason}` : "."}`
          : "A validated graph proposal is ready for review",
        result.fallback ? "info" : "good",
      );
    } catch (error) {
      notify(message(error, "Could not propose graph changes"), "bad");
    } finally {
      setBusy(false);
    }
  }

  function applyProposal() {
    if (!document || !proposal) return;
    const next = structuredClone(document);
    proposal.changes.forEach((change, index) => {
      if (!proposalSelection.has(index)) return;
      const pointer = String(change.pointer ?? "");
      if (pointer === "/objective")
        next.objective = proposal.document.objective;
      const match = pointer.match(/^\/nodes\/([^/]+)/);
      if (match) {
        const id = match[1];
        if (String(change.operation) === "remove") delete next.nodes[id];
        else if (proposal.document.nodes[id])
          next.nodes[id] = structuredClone(proposal.document.nodes[id]);
      }
    });
    commit(next);
    setProposal(null);
  }

  async function runGraph() {
    if (!document || dirty || !path || !plan || stalePlan) {
      notify("Save and validate the current graph before running it", "bad");
      return;
    }
    if (gates.some((gate) => !approvedGates.has(gate))) {
      notify("Review every human gate before starting this run", "bad");
      return;
    }
    if (
      !window.confirm(
        "Start this exact digest-bound graph with the displayed limits and gate decisions?",
      )
    )
      return;
    setBusy(true);
    setActivity([]);
    try {
      const task = await magentClient.createGraphTask(document.title, project);
      setRunTask(task);
      setChildTasks([]);
      streamId.current = crypto.randomUUID();
      const args = [
        "graph",
        "run",
        path,
        "--project",
        project,
        "--execution-task-id",
        task.id,
        "--approve-gates",
        [...approvedGates].join(","),
        "--jsonl",
      ];
      const result = await runMagentStream(
        args,
        (event) => setActivity((lines) => [...lines.slice(-499), event.line]),
        { id: streamId.current },
      );
      const [refreshed, completedChildren] = await Promise.all([
        magentClient.task(task.id).catch(() => task),
        magentClient.childTasks(task.id).catch(() => []),
      ]);
      setRunTask(refreshed);
      setChildTasks(completedChildren);
      notify(
        result.ok ? "Graph run completed" : "Graph run needs review",
        result.ok ? "good" : "bad",
      );
    } catch (error) {
      notify(message(error, "Could not run graph"), "bad");
    } finally {
      setBusy(false);
      streamId.current = "";
    }
  }

  async function controlRun(
    action: "pause" | "resume" | "cancel" | "retry",
    selectedRetryNodes: string[] = [],
  ) {
    if (!runTask) return;
    if (action === "retry") {
      const runId = String(runTask.metadata.run_id ?? "");
      if (!runId || !path) {
        notify("This task has no digest-bound graph run to resume", "bad");
        return;
      }
      setBusy(true);
      setActivity([]);
      try {
        const task = await magentClient.createGraphTask(
          `${document?.title ?? runTask.title} resume`,
          project,
        );
        setRunTask(task);
        setChildTasks([]);
        streamId.current = crypto.randomUUID();
        const failedNodes = selectedRetryNodes.length
          ? selectedRetryNodes
          : childTasks
              .filter((child) =>
                ["failed", "blocked", "cancelled"].includes(child.state),
              )
              .map((child) => String(child.metadata.node_id ?? ""))
              .filter(Boolean);
        const args = [
          "graph",
          "resume",
          runId,
          "--file",
          path,
          "--project",
          project,
          "--execution-task-id",
          task.id,
          "--approve-gates",
          [...approvedGates].join(","),
          "--jsonl",
        ];
        if (failedNodes.length)
          args.push("--retry-nodes", failedNodes.join(","));
        const result = await runMagentStream(
          args,
          (event) => setActivity((lines) => [...lines.slice(-499), event.line]),
          { id: streamId.current },
        );
        const [refreshed, completedChildren] = await Promise.all([
          magentClient.task(task.id).catch(() => task),
          magentClient.childTasks(task.id).catch(() => []),
        ]);
        setRunTask(refreshed);
        setChildTasks(completedChildren);
        notify(
          result.ok ? "Graph resume completed" : "Graph resume needs review",
          result.ok ? "good" : "bad",
        );
      } catch (error) {
        notify(message(error, "Could not resume graph run"), "bad");
      } finally {
        setBusy(false);
        streamId.current = "";
      }
      return;
    }
    if (action === "cancel" && streamId.current)
      await cancelMagentStream(streamId.current).catch(() => false);
    const task = await magentClient.action(runTask.id, action);
    setRunTask(task);
  }

  const selectedNode = document?.nodes[selected];
  const nodeStates = new Map(
    childTasks.map((task) => [
      String(task.metadata.node_id ?? task.metadata.scope_path ?? ""),
      task,
    ]),
  );
  return (
    <section
      className={
        effectiveCompact ? "graph-workspace compact" : "graph-workspace"
      }
    >
      <header className="graph-toolbar panel">
        <div>
          <p className="label">Agentic Graph Spec 1.0</p>
          <h3>{document?.title ?? "Visual workflow authoring"}</h3>
          <p className="muted">
            Dependencies determine execution. Presentation order and labels
            never change behavior.
          </p>
        </div>
        <div className="row-actions">
          <button
            className="icon-action"
            onClick={loadGraph}
            disabled={busy}
            type="button"
          >
            <FolderOpen size={16} />
            <span>Open</span>
          </button>
          {document && (
            <select
              aria-label="Create card type"
              defaultValue=""
              onChange={(event) => {
                const type = event.target.value as GraphNodeType;
                if (type) {
                  commit(
                    addNode(document, type, contract?.node_templates?.[type]),
                  );
                  event.target.value = "";
                }
              }}
            >
              <option value="" disabled>
                + Card
              </option>
              {nodeTypes.map((type) => (
                <option value={type} key={type}>
                  {type}
                </option>
              ))}
            </select>
          )}
          <button
            className="icon-action"
            onClick={undo}
            disabled={!past.length}
            type="button"
          >
            <Undo2 size={16} />
            <span>Undo</span>
          </button>
          <button
            className="icon-action"
            onClick={redo}
            disabled={!future.length}
            type="button"
          >
            <Redo2 size={16} />
            <span>Redo</span>
          </button>
          <button
            className="icon-action"
            onClick={preview}
            disabled={
              busy ||
              !document ||
              diagnostics.some((item) => item.severity === "error")
            }
            type="button"
          >
            <Check size={16} />
            <span>Validate</span>
          </button>
          <button
            className="icon-action"
            onClick={() => void saveGraph(false)}
            disabled={busy || !document}
            type="button"
          >
            <Save size={16} />
            <span>{dirty ? "Save changes" : "Saved"}</span>
          </button>
          <button
            className="primary-action"
            onClick={runGraph}
            disabled={busy || !document || dirty || !plan || stalePlan}
            type="button"
          >
            <Play size={16} />
            <span>Run graph</span>
          </button>
        </div>
      </header>
      {generationStarted && (
        <div
          className="operation-health panel"
          role="status"
          aria-live="polite"
        >
          <span className="operation-spinner" aria-hidden="true" />
          <div>
            <strong>Generating and validating the graph</strong>
            <p>
              {generationElapsed >= 90
                ? "This is taking longer than usual. The underlying MagAgent provider request is bounded and can be cancelled from its task controls. "
                : ""}
              The planning service is authoring a bounded draft, then validating
              its structure. This reports lifecycle progress, not private model
              reasoning; the board stays mounted if you navigate elsewhere.
            </p>
          </div>
          <b>{generationElapsed}s</b>
        </div>
      )}
      {!document ? (
        <Welcome
          goal={goal}
          setGoal={setGoal}
          busy={busy}
          onGenerate={(model) => generate(model)}
          onOpen={loadGraph}
        />
      ) : (
        <>
          <div className="graph-meta panel">
            <label>
              Graph title
              <input
                value={document.title}
                onChange={(event) =>
                  commit({ ...document, title: event.target.value })
                }
              />
            </label>
            <label>
              Objective
              <textarea
                value={document.objective}
                onChange={(event) =>
                  commit({ ...document, objective: event.target.value })
                }
              />
            </label>
            <div className="stacked-status">
              <span
                className={dirty ? "status-badge warning" : "status-badge good"}
              >
                {dirty ? "Recoverable draft" : "Saved"}
              </span>
              {plan && (
                <span
                  className={
                    stalePlan ? "status-badge warning" : "status-badge good"
                  }
                >
                  {stalePlan ? "Plan stale" : "Plan digest matched"}
                </span>
              )}
            </div>
          </div>
          <GraphControls
            view={view}
            setView={setView}
            query={query}
            setQuery={setQuery}
            type={typeFilter}
            setType={setTypeFilter}
            profile={profileFilter}
            setProfile={setProfileFilter}
            label={labelFilter}
            setLabel={setLabelFilter}
            profiles={profiles}
            labels={labels}
            compact={compact}
            setCompact={setCompact}
          />
          {(pinnedGraphs.length > 0 || recentGraphs.length > 0) && (
            <div className="known-graphs panel">
              <strong>Recent graphs</strong>
              {[...new Set([...pinnedGraphs, ...recentGraphs])]
                .slice(0, 12)
                .map((item) => (
                  <span key={item}>
                    <button
                      onClick={() => void openKnown(item)}
                      title={item}
                      type="button"
                    >
                      {item.split(/[\\/]/).pop()}
                    </button>
                    <button
                      aria-label={
                        pinnedGraphs.includes(item)
                          ? `Unpin ${item}`
                          : `Pin ${item}`
                      }
                      onClick={() => {
                        const next = pinnedGraphs.includes(item)
                          ? pinnedGraphs.filter((path) => path !== item)
                          : [item, ...pinnedGraphs];
                        setPinnedGraphs(next);
                        void saveAppState(pinnedKey(project), next);
                      }}
                      type="button"
                    >
                      {pinnedGraphs.includes(item) ? "★" : "☆"}
                    </button>
                  </span>
                ))}
            </div>
          )}
          {externalDocument && (
            <div className="graph-warning external-change">
              <AlertTriangle />
              The graph changed on disk.
              <button
                onClick={() => {
                  setDocument(externalDocument.document);
                  setBaseline(structuredClone(externalDocument.document));
                  setDigest(externalDocument.digest);
                  setDirty(false);
                  setExternalDocument(null);
                }}
                type="button"
              >
                Reload disk version
              </button>
              <button onClick={() => setView("source")} type="button">
                Compare
              </button>
              <button onClick={() => void saveGraph(true)} type="button">
                Save as
              </button>
            </div>
          )}
          {diagnostics.map((item) => (
            <button
              className="graph-warning"
              key={`${item.code}-${item.nodeId ?? ""}`}
              onClick={() => item.nodeId && setSelected(item.nodeId)}
              type="button"
            >
              <AlertTriangle size={18} />
              {item.message}
            </button>
          ))}
          {view === "board" && (
            <div className="graph-editor-shell">
              <GraphKanban
                document={document}
                visible={visible}
                selected={selected}
                checked={multi}
                tasks={nodeStates}
                presentationOrder={presentationOrder}
                onSelect={setSelected}
                onCheck={(id) => setMulti(toggleSet(multi, id))}
                onReorder={movePresentation}
                onRetry={(id) => void controlRun("retry", [id])}
              />
              {selectedNode && (
                <NodeEditor
                  id={selected}
                  node={selectedNode}
                  document={document}
                  profiles={profiles}
                  contract={contract}
                  effective={effectiveProfile}
                  onChange={(patch) =>
                    commit(updateNode(document, selected, patch))
                  }
                  onType={(type) => {
                    if (
                      window.confirm(
                        `Replace type-specific fields with a valid ${type} template?`,
                      )
                    )
                      commit(
                        replaceNodeType(
                          document,
                          selected,
                          type,
                          contract?.node_templates?.[type],
                        ),
                      );
                  }}
                  onRename={async (next) => {
                    const result = await magentClient.renameGraphNode(
                      document,
                      selected,
                      next,
                    );
                    commit(result.document);
                    setSelected(next);
                  }}
                  onDuplicate={async () => {
                    const local = duplicateNodeLocal(document, selected);
                    const result = await magentClient.duplicateGraphNode(
                      document,
                      selected,
                      local.id,
                    );
                    commit(result.document);
                    setSelected(local.id);
                  }}
                  onDelete={() => {
                    commit(removeNode(document, selected));
                    setSelected("");
                  }}
                />
              )}
            </div>
          )}
          {view === "map" && (
            <DependencyMap
              document={document}
              selected={selected}
              onSelect={setSelected}
              onChange={commit}
            />
          )}
          {view === "source" && (
            <SourcePanel
              format={path.toLowerCase().endsWith(".json") ? "json" : "yaml"}
              document={document}
              baseline={baseline}
              text={sourceText || serializeSource(document, path)}
              setText={(value) => {
                setSourceText(value);
                setSourceError("");
              }}
              error={sourceError}
              onReset={() => {
                setSourceText(serializeSource(document, path));
                setSourceError("");
              }}
              onApply={() => {
                try {
                  const value = parseSource(
                    sourceText || serializeSource(document, path),
                    path,
                  );
                  commit(value);
                  setSourceText("");
                } catch (error) {
                  setSourceError(message(error, "Invalid graph source"));
                }
              }}
            />
          )}
          {multi.size > 0 && (
            <BulkBar
              count={multi.size}
              profiles={profiles}
              onProfile={(profile) => {
                let next = document;
                multi.forEach((id) => {
                  next = updateNode(next, id, {
                    "x-magagent-profile": profile || undefined,
                  });
                });
                commit(next);
              }}
              onLabel={(label) => {
                let next = document;
                multi.forEach((id) => {
                  const labels = new Set(next.nodes[id].labels ?? []);
                  if (label.trim()) labels.add(label.trim());
                  next = updateNode(next, id, { labels: [...labels] });
                });
                commit(next);
              }}
              onClear={() => setMulti(new Set())}
            />
          )}
          <section className="graph-workspace-drawer panel">
            <nav aria-label="Graph workspace panels">
              {(
                [
                  "assistant",
                  "templates",
                  "review",
                  "execution",
                ] as WorkspacePanel[]
              ).map((item) => (
                <button
                  className={workspacePanel === item ? "active" : ""}
                  onClick={() => setWorkspacePanel(item)}
                  disabled={
                    (item === "review" && !plan) ||
                    (item === "execution" && !runTask)
                  }
                  type="button"
                  key={item}
                >
                  {item}
                  {item === "review" && stalePlan ? (
                    <span>stale</span>
                  ) : item === "execution" && runTask ? (
                    <span>{runTask.state}</span>
                  ) : null}
                </button>
              ))}
            </nav>
            {workspacePanel === "assistant" && (
              <AssistantPanel
                prompt={assistantPrompt}
                setPrompt={setAssistantPrompt}
                busy={busy}
                onPropose={propose}
                proposal={proposal}
                selection={proposalSelection}
                setSelection={setProposalSelection}
                onApply={applyProposal}
                onReject={() => setProposal(null)}
              />
            )}
            {workspacePanel === "templates" && (
              <TemplateGallery
                busy={busy}
                contributed={contract?.graph_templates ?? []}
                onUse={(preset, model) => generate(model, preset)}
                onDocument={(next) => {
                  if (confirmAbandon()) {
                    setDocument(structuredClone(next));
                    setBaseline(null);
                    setPath("");
                    setDigest("");
                    setDirty(true);
                    setSelected(Object.keys(next.nodes)[0] ?? "");
                  }
                }}
              />
            )}
            {workspacePanel === "review" && plan && (
              <div className={stalePlan ? "stale-plan" : ""}>
                <GraphPlanView value={plan} />
                <RunReview
                  plan={plan}
                  gates={gates}
                  approved={approvedGates}
                  setApproved={setApprovedGates}
                />
              </div>
            )}
            {workspacePanel === "execution" && runTask && (
              <ExecutionCockpit
                root={runTask}
                children={childTasks}
                activity={activity}
                onAction={controlRun}
              />
            )}
          </section>
        </>
      )}
    </section>
  );
}

function Welcome(props: {
  goal: string;
  setGoal: (value: string) => void;
  busy: boolean;
  onGenerate: (model: boolean) => void;
  onOpen: () => void;
}) {
  return (
    <div className="graph-welcome panel">
      <GitFork size={34} />
      <div>
        <h3>Start from a goal or an existing graph</h3>
        <p>
          Use deterministic generation for a fast baseline or the configured
          planning model for a project-aware proposal.
        </p>
      </div>
      <label>
        What should this workflow accomplish?
        <textarea
          value={props.goal}
          onChange={(event) => props.setGoal(event.target.value)}
          placeholder="Implement the feature, verify it, and review the result."
        />
      </label>
      <div className="row-actions">
        <button
          className="icon-action"
          onClick={() => props.onGenerate(false)}
          disabled={props.busy || !props.goal.trim()}
          type="button"
        >
          <Sparkles size={17} />
          <span>Deterministic draft</span>
        </button>
        <button
          className="primary-action"
          onClick={() => props.onGenerate(true)}
          disabled={props.busy || !props.goal.trim()}
          type="button"
        >
          <Bot size={17} />
          <span>Planning model</span>
        </button>
        <button
          className="icon-action"
          onClick={props.onOpen}
          disabled={props.busy}
          type="button"
        >
          <FolderOpen size={17} />
          <span>Open file</span>
        </button>
      </div>
    </div>
  );
}

function GraphControls(props: {
  view: ViewMode;
  setView: (view: ViewMode) => void;
  query: string;
  setQuery: (value: string) => void;
  type: string;
  setType: (value: string) => void;
  profile: string;
  setProfile: (value: string) => void;
  label: string;
  setLabel: (value: string) => void;
  profiles: AgentProfileSummary[];
  labels: string[];
  compact: boolean;
  setCompact: (value: boolean) => void;
}) {
  return (
    <div className="graph-controls panel">
      <div className="segmented">
        {(["board", "map", "source"] as ViewMode[]).map((view) => (
          <button
            className={props.view === view ? "active" : ""}
            onClick={() => props.setView(view)}
            type="button"
            key={view}
          >
            {view === "board" ? (
              <GitFork />
            ) : view === "map" ? (
              <ListTree />
            ) : (
              <FileCode2 />
            )}
            {view}
          </button>
        ))}
      </div>
      <label className="search-field">
        <Search size={15} />
        <input
          aria-label="Filter graph cards"
          value={props.query}
          onChange={(event) => props.setQuery(event.target.value)}
          placeholder="Filter cards"
        />
      </label>
      <Filter size={16} />
      <select
        aria-label="Filter by node type"
        value={props.type}
        onChange={(event) => props.setType(event.target.value)}
      >
        <option value="">All types</option>
        {nodeTypes.map((type) => (
          <option key={type}>{type}</option>
        ))}
      </select>
      <select
        aria-label="Filter by profile"
        value={props.profile}
        onChange={(event) => props.setProfile(event.target.value)}
      >
        <option value="">All profiles</option>
        {props.profiles.map((profile) => (
          <option key={profile.name}>{profile.name}</option>
        ))}
      </select>
      <select
        aria-label="Filter by label"
        value={props.label}
        onChange={(event) => props.setLabel(event.target.value)}
      >
        <option value="">All labels</option>
        {props.labels.map((label) => (
          <option key={label}>{label}</option>
        ))}
      </select>
      <label className="inline-check">
        <input
          type="checkbox"
          checked={props.compact}
          onChange={(event) => props.setCompact(event.target.checked)}
        />
        Compact
      </label>
    </div>
  );
}

const doneStates = new Set([
  "completed",
  "succeeded",
  "failed",
  "blocked",
  "cancelled",
  "skipped",
]);
const todoStates = new Set(["queued", "ready", "waiting"]);
type KanbanLane = "todo" | "current" | "done";

function taskLane(task?: ExecutionTask): KanbanLane {
  return !task || todoStates.has(task.state)
    ? "todo"
    : doneStates.has(task.state)
      ? "done"
      : "current";
}

export function GraphKanban(props: {
  document: AgenticGraphDocument;
  visible: Set<string>;
  selected: string;
  checked: Set<string>;
  tasks: Map<string, ExecutionTask>;
  presentationOrder: string[];
  onSelect: (id: string) => void;
  onCheck: (id: string) => void;
  onReorder: (id: string, delta: number) => void;
  onRetry?: (id: string) => void;
}) {
  const definitions: Array<{
    id: KanbanLane;
    title: string;
    description: string;
  }> = [
    {
      id: "todo",
      title: "To do",
      description: "Waiting for the run or dependencies",
    },
    {
      id: "current",
      title: "Current work",
      description: "Actively handled by the agent",
    },
    {
      id: "done",
      title: "Done",
      description: "Succeeded and failed jobs with summaries",
    },
  ];
  const ids = ordered(
    Object.keys(props.document.nodes),
    props.presentationOrder,
  ).filter((id) => props.visible.has(id));
  return (
    <div className="graph-board" aria-label="Agentic Graph execution Kanban">
      {definitions.map((lane) => {
        const laneIds = ids.filter(
          (id) => taskLane(props.tasks.get(id)) === lane.id,
        );
        return (
          <section
            className={`graph-stage kanban-lane ${lane.id}`}
            key={lane.id}
          >
            <header>
              <div>
                <span>{lane.title}</span>
                <small>{lane.description}</small>
              </div>
              <strong>{laneIds.length}</strong>
            </header>
            <div className="graph-card-list">
              {laneIds.map((id) => (
                <GraphCard
                  key={id}
                  id={id}
                  node={props.document.nodes[id]}
                  selected={props.selected === id}
                  checked={props.checked.has(id)}
                  task={props.tasks.get(id)}
                  onSelect={() => props.onSelect(id)}
                  onCheck={() => props.onCheck(id)}
                  onReorder={(delta) => props.onReorder(id, delta)}
                  onRetry={
                    props.onRetry ? () => props.onRetry?.(id) : undefined
                  }
                />
              ))}
              {laneIds.length === 0 && (
                <div className="kanban-empty">
                  {lane.id === "todo"
                    ? "No remaining work"
                    : lane.id === "current"
                      ? "The agent is not working a card"
                      : "Completed jobs will appear here"}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const GraphCard = memo(function GraphCard({
  id,
  node,
  selected,
  checked,
  task,
  onSelect,
  onCheck,
  onReorder,
  onRetry,
}: {
  id: string;
  node: AgenticGraphNode;
  selected: boolean;
  checked: boolean;
  task?: ExecutionTask;
  onSelect: () => void;
  onCheck: () => void;
  onReorder: (delta: number) => void;
  onRetry?: () => void;
}) {
  const terminal = Boolean(task && doneStates.has(task.state));
  const succeeded = task?.state === "succeeded" || task?.state === "completed";
  return (
    <div className={`graph-card-wrap ${task?.state ?? "todo"}`}>
      <input
        aria-label={`Select ${id} for bulk edit`}
        type="checkbox"
        checked={checked}
        onChange={onCheck}
      />
      <button
        className={selected ? "graph-card selected" : "graph-card"}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (!event.altKey) return;
          if (event.key === "ArrowUp") {
            event.preventDefault();
            onReorder(-1);
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            onReorder(1);
          }
        }}
        title="Alt+Up/Down changes presentation order only"
        type="button"
      >
        <div className="graph-card-heading">
          <span className="graph-card-type">{node.type ?? "task"}</span>
          {task && (
            <span
              className={`node-run-state ${succeeded ? "success" : terminal ? "failure" : "active"}`}
            >
              {task.state}
            </span>
          )}
        </div>
        <strong>{node.title}</strong>
        <p>{node.description}</p>
        {node.depends_on?.length ? (
          <div className="card-dependencies">
            <small>Depends on</small>
            <span>{node.depends_on.join(", ")}</span>
          </div>
        ) : (
          <div className="card-dependencies entry">
            <small>Entry card · no dependencies</small>
          </div>
        )}
        {terminal && (
          <div className={`job-summary ${succeeded ? "success" : "failure"}`}>
            <strong>
              {succeeded ? "Job succeeded" : "Job did not succeed"}
            </strong>
            <span>{taskSummary(task!)}</span>
            {task!.files_changed.length > 0 && (
              <small>
                {task!.files_changed.length} file
                {task!.files_changed.length === 1 ? "" : "s"} changed
              </small>
            )}
          </div>
        )}
        {node.labels?.length ? (
          <div className="tag-row">
            {node.labels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        ) : null}
        <div className="graph-card-footer">
          <span>
            <GitFork size={13} />
            {node.depends_on?.length ?? 0}
          </span>
          <span>
            <Bot size={13} />
            {node["x-magagent-profile"] || "run default"}
          </span>
          {task && !terminal && <span>attempt {task.attempt}</span>}
        </div>
      </button>
      {task &&
        ["failed", "blocked", "cancelled"].includes(task.state) &&
        onRetry && (
          <button className="card-retry" onClick={onRetry} type="button">
            <RotateCcw size={14} />
            Retry this job + dependents
          </button>
        )}
    </div>
  );
});

function taskSummary(task: ExecutionTask) {
  const candidates = [
    task.final_audit.summary,
    task.final_audit.message,
    task.metadata.summary,
    task.metadata.result_summary,
    task.metadata.error,
  ];
  const value = candidates.find(
    (item) => typeof item === "string" && item.trim(),
  );
  if (typeof value === "string") return value;
  if (task.state === "succeeded" || task.state === "completed")
    return "The agent completed this job successfully.";
  if (task.state === "skipped")
    return "The job was skipped because its execution condition was not met.";
  if (task.state === "cancelled")
    return "The job was cancelled before it completed.";
  return "The job failed. Open execution details to review its audit evidence and error context.";
}

export function NodeEditor(props: {
  id: string;
  node: AgenticGraphNode;
  document: AgenticGraphDocument;
  profiles: AgentProfileSummary[];
  contract?: GraphAuthoringContract | null;
  effective?: EffectiveAgentProfile | null;
  onChange: (patch: Partial<AgenticGraphNode>) => void;
  onType?: (type: GraphNodeType) => void;
  onRename?: (id: string) => Promise<void>;
  onDuplicate?: () => Promise<void>;
  onDelete: () => void;
}) {
  const [section, setSection] = useState<
    "basics" | "authority" | "flow" | "advanced"
  >("basics");
  const dependencies = new Set(props.node.depends_on ?? []);
  const tiers = schemaEnum(props.contract?.schema, "intelligence", "tier", [
    "minimal",
    "standard",
    "advanced",
    "frontier",
  ]);
  const workspaces = schemaEnum(
    props.contract?.schema,
    "requirements",
    "workspace",
    ["read_only", "read_write", "isolated"],
  );
  return (
    <aside className="graph-inspector panel">
      <div className="panel-heading">
        <div>
          <p className="label">Selected card</p>
          <h3>{props.id}</h3>
        </div>
        <div className="row-actions">
          <button
            className="icon-button"
            title="Duplicate card"
            onClick={() => void props.onDuplicate?.()}
            type="button"
          >
            <Copy size={17} />
          </button>
          <button
            className="icon-button danger"
            title="Delete card"
            onClick={props.onDelete}
            type="button"
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>
      <nav className="inspector-nav" aria-label="Node inspector sections">
        {(["basics", "authority", "flow", "advanced"] as const).map((item) => (
          <button
            className={section === item ? "active" : ""}
            onClick={() => setSection(item)}
            type="button"
            key={item}
          >
            {item}
          </button>
        ))}
      </nav>
      {section === "basics" && (
        <div className="inspector-section">
          {props.onRename && (
            <label>
              Node ID
              <div className="input-action">
                <input defaultValue={props.id} id="graph-node-id" />
                <button
                  onClick={() => {
                    const input = globalThis.document.getElementById(
                      "graph-node-id",
                    ) as HTMLInputElement;
                    if (input.value !== props.id)
                      void props.onRename?.(input.value);
                  }}
                  type="button"
                >
                  Rename
                </button>
              </div>
              <small className="field-help">
                References update through MagAgent.
              </small>
            </label>
          )}
          <label>
            Title
            <input
              value={props.node.title}
              onChange={(event) =>
                props.onChange({ title: event.target.value })
              }
            />
          </label>
          <label>
            Instructions
            <textarea
              value={props.node.description}
              onChange={(event) =>
                props.onChange({ description: event.target.value })
              }
            />
          </label>
          <div className="form-grid">
            <label>
              Node type
              <select
                value={props.node.type ?? "task"}
                onChange={(event) =>
                  props.onType?.(event.target.value as GraphNodeType)
                }
              >
                {nodeTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label>
              Labels
              <input
                value={(props.node.labels ?? []).join(", ")}
                onChange={(event) =>
                  props.onChange({ labels: csv(event.target.value) })
                }
                placeholder="review, backend"
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Effort
              <select
                value={String(props.node.estimate?.effort ?? "s")}
                onChange={(event) =>
                  props.onChange({
                    estimate: {
                      ...(props.node.estimate ?? {}),
                      effort: event.target.value,
                    },
                  })
                }
              >
                <option>xs</option>
                <option>s</option>
                <option>m</option>
                <option>l</option>
                <option>xl</option>
              </select>
            </label>
            <NumberField
              label="Estimated cost"
              value={props.node.estimate?.cost_usd}
              min={0}
              step={0.01}
              onChange={(value) =>
                props.onChange({
                  estimate: { ...(props.node.estimate ?? {}), cost_usd: value },
                })
              }
            />
          </div>
        </div>
      )}
      {section === "authority" && (
        <div className="inspector-section">
          <label>
            Agent profile
            <select
              value={props.node["x-magagent-profile"] ?? ""}
              onChange={(event) =>
                props.onChange({
                  "x-magagent-profile": event.target.value || undefined,
                })
              }
            >
              <option value="">Use run default</option>
              {props.profiles.map((profile) => (
                <option value={profile.name} key={profile.name}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          {props.effective && (
            <div className="authority-summary">
              <strong>Effective authority</strong>
              <span>
                {props.effective.provider}/{props.effective.model}
              </span>
              <span>
                {props.effective.permission_mode} · network{" "}
                {props.effective.network_access}
              </span>
              <small>
                {props.effective.tools.length} tools after harness narrowing
              </small>
              {(props.node.requirements?.tools ?? [])
                .filter((tool) => !props.effective!.tools.includes(tool))
                .map((tool) => (
                  <small className="warning-text" key={tool}>
                    Unavailable tool: {tool}
                  </small>
                ))}
              {(props.node.requirements?.permissions ?? []).some(
                (permission) =>
                  permission.startsWith("net:") ||
                  permission.startsWith("http:"),
              ) && props.effective.network_access === "none" ? (
                <small className="warning-text">
                  Network requested, but this profile has no network access.
                </small>
              ) : null}
              {props.effective.adjustments.map((item) => (
                <small className="warning-text" key={item.field}>
                  {item.field}: {item.reason}
                </small>
              ))}
            </div>
          )}
          <div className="form-grid">
            <label>
              Intelligence tier
              <select
                disabled={props.node.type === "gate"}
                value={String(props.node.intelligence?.tier ?? "standard")}
                onChange={(event) =>
                  props.onChange({
                    intelligence: {
                      ...(props.node.intelligence ?? {}),
                      tier: event.target.value,
                    },
                  })
                }
              >
                {tiers.map((tier) => (
                  <option key={tier}>{tier}</option>
                ))}
              </select>
            </label>
            <label>
              Workspace
              <select
                value={String(
                  props.node.requirements?.workspace ?? "read_only",
                )}
                onChange={(event) =>
                  props.onChange({
                    requirements: {
                      ...(props.node.requirements ?? {}),
                      workspace: event.target.value,
                    },
                  })
                }
              >
                {workspaces.map((mode) => (
                  <option key={mode}>{mode}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Required tools
            <input
              value={(props.node.requirements?.tools ?? []).join(", ")}
              onChange={(event) =>
                props.onChange({
                  requirements: {
                    ...(props.node.requirements ?? {}),
                    tools: csv(event.target.value),
                  },
                })
              }
              placeholder="file_read, shell"
            />
          </label>
          <label>
            Permissions
            <input
              value={(props.node.requirements?.permissions ?? []).join(", ")}
              onChange={(event) =>
                props.onChange({
                  requirements: {
                    ...(props.node.requirements ?? {}),
                    permissions: csv(event.target.value),
                  },
                })
              }
              placeholder="fs:read:**"
            />
          </label>
        </div>
      )}
      {section === "flow" && (
        <div className="inspector-section">
          <label>
            Guard expression
            <input
              value={props.node.when ?? ""}
              onChange={(event) =>
                props.onChange({ when: event.target.value || undefined })
              }
              placeholder="context.enabled == true"
            />
          </label>
          <fieldset>
            <legend>Depends on</legend>
            <div className="dependency-list">
              {Object.keys(props.document.nodes)
                .filter((candidate) => candidate !== props.id)
                .map((candidate) => (
                  <label key={candidate}>
                    <input
                      type="checkbox"
                      checked={dependencies.has(candidate)}
                      onChange={() => {
                        const next = new Set(dependencies);
                        next.has(candidate)
                          ? next.delete(candidate)
                          : next.add(candidate);
                        props.onChange({ depends_on: [...next] });
                      }}
                    />
                    <span>{props.document.nodes[candidate].title}</span>
                  </label>
                ))}
            </div>
            <small>
              Outgoing:{" "}
              {outgoingDependents(props.document, props.id).join(", ") ||
                "none"}
            </small>
          </fieldset>
          <div className="form-grid">
            <NumberField
              label="Max agent steps"
              value={numberValue(props.node.constraints?.max_agent_steps)}
              min={1}
              step={1}
              onChange={(value) =>
                props.onChange({
                  constraints: {
                    ...(props.node.constraints ?? {}),
                    max_agent_steps: value,
                  },
                })
              }
            />
            <NumberField
              label="Wall-clock limit (s)"
              value={numberValue(
                props.node.constraints?.max_wall_clock_seconds,
              )}
              min={1}
              step={1}
              onChange={(value) =>
                props.onChange({
                  constraints: {
                    ...(props.node.constraints ?? {}),
                    max_wall_clock_seconds: value,
                  },
                })
              }
            />
          </div>
          <NumberField
            label="Retry attempts"
            value={numberValue(
              (props.node.failure?.retry as Record<string, unknown> | undefined)
                ?.max_attempts,
            )}
            min={1}
            step={1}
            onChange={(value) =>
              props.onChange({
                failure: {
                  ...(props.node.failure ?? {}),
                  retry: {
                    ...((props.node.failure?.retry as
                      Record<string, unknown> | undefined) ?? {}),
                    max_attempts: value,
                  },
                },
              })
            }
          />
          {props.node.type && props.node.type !== "task" && (
            <JsonEditor
              label={`${props.node.type} settings`}
              value={
                (props.node[props.node.type as GraphNodeType] as Record<
                  string,
                  unknown
                >) ?? {}
              }
              onChange={(value) =>
                props.onChange({ [props.node.type as GraphNodeType]: value })
              }
            />
          )}
        </div>
      )}
      {section === "advanced" && (
        <div className="inspector-section">
          <p className="field-help">
            Portable contract fields remain available for precise editing.
            Invalid JSON stays visible and is marked until corrected.
          </p>
          <JsonEditor
            label="Inputs"
            value={props.node.inputs ?? {}}
            onChange={(inputs) =>
              props.onChange({ inputs: inputs as AgenticGraphNode["inputs"] })
            }
          />
          <JsonEditor
            label="Outputs"
            value={props.node.outputs ?? {}}
            onChange={(outputs) =>
              props.onChange({
                outputs: outputs as AgenticGraphNode["outputs"],
              })
            }
          />
          <JsonEditor
            label="Success criteria"
            value={props.node.success ?? {}}
            onChange={(success) => props.onChange({ success })}
          />
          <JsonEditor
            label="Failure policy"
            value={props.node.failure ?? {}}
            onChange={(failure) => props.onChange({ failure })}
          />
          <JsonEditor
            label="All limits"
            value={props.node.constraints ?? {}}
            onChange={(constraints) => props.onChange({ constraints })}
          />
        </div>
      )}
    </aside>
  );
}

function JsonEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState("");
  useEffect(() => setText(JSON.stringify(value, null, 2)), [value]);
  return (
    <label>
      {label}
      <textarea
        className={error ? "json-editor invalid" : "json-editor"}
        value={text}
        aria-invalid={Boolean(error)}
        onChange={(event) => {
          setText(event.target.value);
          setError("");
        }}
        onBlur={() => {
          try {
            const parsed = JSON.parse(text);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
              throw new Error("Enter a JSON object");
            onChange(parsed);
            setError("");
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Invalid JSON");
          }
        }}
      />
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  step,
  onChange,
}: {
  label: string;
  value?: number;
  min: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        step={step}
        value={value ?? ""}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function DependencyMap({
  document,
  selected,
  onSelect,
  onChange,
}: {
  document: AgenticGraphDocument;
  selected: string;
  onSelect: (id: string) => void;
  onChange: (document: AgenticGraphDocument) => void;
}) {
  const ids = Object.keys(document.nodes);
  const [from, setFrom] = useState(ids[0] ?? "");
  const [to, setTo] = useState(ids[1] ?? ids[0] ?? "");
  const [kind, setKind] = useState<"sequence" | "conditional" | "on_failure">(
    "sequence",
  );
  const [when, setWhen] = useState("");
  const stages = graphStages(document).stages;
  const positions = new Map<string, { x: number; y: number }>();
  stages.forEach((stage, column) =>
    stage.nodeIds.forEach((id, row) =>
      positions.set(id, { x: 34 + column * 250, y: 34 + row * 116 }),
    ),
  );
  ids
    .filter((id) => !positions.has(id))
    .forEach((id, row) => positions.set(id, { x: 34, y: 34 + row * 116 }));
  const canvasWidth = Math.max(700, Math.max(stages.length, 1) * 250 + 68);
  const canvasHeight = Math.max(
    300,
    ...[...positions.values()].map(({ y }) => y + 92),
  );
  const dependencyEdges = ids.flatMap((target) =>
    (document.nodes[target].depends_on ?? []).map((source) => ({
      from: source,
      to: target,
      kind: "dependency",
    })),
  );
  const visibleEdges = [...dependencyEdges, ...(document.edges ?? [])];
  return (
    <section
      className="dependency-map panel"
      aria-label="Accessible graph dependency map"
    >
      <div className="panel-heading">
        <div>
          <p className="label">Workflow topology</p>
          <h3>Dependency map</h3>
          <p className="muted">
            Stages flow left to right. Select any node to open its inspector.
          </p>
        </div>
        <span className="status-badge">
          {ids.length} nodes · {visibleEdges.length} routes
        </span>
      </div>
      <div className="dependency-canvas-scroll">
        <div
          className="dependency-canvas"
          style={{ width: canvasWidth, height: canvasHeight }}
        >
          <svg aria-hidden="true" width={canvasWidth} height={canvasHeight}>
            {visibleEdges.map((edge, index) => {
              const start = positions.get(edge.from);
              const end = positions.get(edge.to);
              if (!start || !end) return null;
              const x1 = start.x + 184;
              const y1 = start.y + 34;
              const x2 = end.x;
              const y2 = end.y + 34;
              const bend = Math.max(30, (x2 - x1) / 2);
              return (
                <path
                  className={`dependency-edge ${edge.kind ?? "sequence"}`}
                  d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                  key={`${edge.from}-${edge.to}-${index}`}
                />
              );
            })}
          </svg>
          {ids.map((id) => {
            const node = document.nodes[id];
            const position = positions.get(id)!;
            return (
              <button
                style={{ left: position.x, top: position.y }}
                className={
                  selected === id ? "canvas-node active" : "canvas-node"
                }
                onClick={() => onSelect(id)}
                key={id}
                type="button"
              >
                <span>{node.type ?? "task"}</span>
                <strong>{node.title || id}</strong>
                <small>{id}</small>
              </button>
            );
          })}
        </div>
      </div>
      <details className="edge-editor">
        <summary>Edit explicit routes</summary>
        <fieldset>
          <legend>Add explicit edge</legend>
          <div className="form-grid three">
            <label>
              From
              <select
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              >
                {ids.map((id) => (
                  <option key={id}>{id}</option>
                ))}
              </select>
            </label>
            <label>
              Kind
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as typeof kind)}
              >
                <option>sequence</option>
                <option>conditional</option>
                <option>on_failure</option>
              </select>
            </label>
            <label>
              To
              <select
                value={to}
                onChange={(event) => setTo(event.target.value)}
              >
                {ids.map((id) => (
                  <option key={id}>{id}</option>
                ))}
              </select>
            </label>
          </div>
          {kind === "conditional" && (
            <label>
              Condition
              <input
                value={when}
                onChange={(event) => setWhen(event.target.value)}
                placeholder="nodes.review.outputs.decision == 'ready'"
              />
            </label>
          )}
          <button
            onClick={() => {
              if (
                !from ||
                !to ||
                from === to ||
                (kind === "conditional" && !when.trim())
              )
                return;
              onChange({
                ...document,
                edges: [
                  ...(document.edges ?? []),
                  {
                    from,
                    to,
                    kind,
                    ...(kind === "conditional" ? { when: when.trim() } : {}),
                  },
                ],
              });
            }}
            type="button"
          >
            Add edge
          </button>
        </fieldset>
        {document.edges?.length ? (
          <table>
            <caption>Explicit edges</caption>
            <thead>
              <tr>
                <th>From</th>
                <th>Kind</th>
                <th>To</th>
                <th>Condition</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {document.edges.map((edge, index) => (
                <tr key={index}>
                  <td>{edge.from}</td>
                  <td>{edge.kind ?? "sequence"}</td>
                  <td>{edge.to}</td>
                  <td>{edge.when ?? "—"}</td>
                  <td>
                    <button
                      aria-label={`Remove edge ${edge.from} to ${edge.to}`}
                      onClick={() =>
                        onChange({
                          ...document,
                          edges: document.edges?.filter(
                            (_, item) => item !== index,
                          ),
                        })
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </details>
    </section>
  );
}

function SourcePanel({
  format,
  document,
  baseline,
  text,
  setText,
  error,
  onReset,
  onApply,
}: {
  format: "yaml" | "json";
  document: AgenticGraphDocument;
  baseline: AgenticGraphDocument | null;
  text: string;
  setText: (value: string) => void;
  error: string;
  onReset: () => void;
  onApply: () => void;
}) {
  const diff = sourceDiff(baseline, document);
  return (
    <section className="source-workspace">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <p className="label">Advanced · {format.toUpperCase()}</p>
            <h3>Synchronized portable source</h3>
          </div>
          <div className="row-actions">
            <button onClick={onReset} type="button">
              <RotateCcw />
              Reset
            </button>
            <button onClick={onApply} type="button">
              <Check />
              Apply source
            </button>
          </div>
        </div>
        <textarea
          className="source-editor"
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
        />
        {error && <p className="warning-text">{error}</p>}
      </div>
      <div className="panel">
        <h3>Structured diff from disk</h3>
        <pre className="source-diff">
          {diff.length ? diff.slice(0, 1000).join("\n") : "No source changes."}
        </pre>
      </div>
    </section>
  );
}

function BulkBar({
  count,
  profiles,
  onProfile,
  onLabel,
  onClear,
}: {
  count: number;
  profiles: AgentProfileSummary[];
  onProfile: (value: string) => void;
  onLabel: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="bulk-bar panel">
      <strong>{count} selected</strong>
      <select
        defaultValue=""
        onChange={(event) => onProfile(event.target.value)}
      >
        <option value="">Set run default profile</option>
        {profiles.map((profile) => (
          <option key={profile.name}>{profile.name}</option>
        ))}
      </select>
      <input id="bulk-label" placeholder="Add label" />
      <button
        onClick={() =>
          onLabel(
            (document.getElementById("bulk-label") as HTMLInputElement).value,
          )
        }
        type="button"
      >
        Apply label
      </button>
      <button onClick={onClear} type="button">
        Clear
      </button>
    </div>
  );
}

function AssistantPanel(props: {
  prompt: string;
  setPrompt: (value: string) => void;
  busy: boolean;
  onPropose: () => void;
  proposal: Proposal | null;
  selection: Set<number>;
  setSelection: (value: Set<number>) => void;
  onApply: () => void;
  onReject: () => void;
}) {
  return (
    <section className="panel graph-assistant">
      <div className="panel-heading">
        <div>
          <p className="label">Agent-assisted design</p>
          <h3>Propose a reviewable graph patch</h3>
        </div>
        <Sparkles />
      </div>
      <div className="input-action">
        <input
          value={props.prompt}
          onChange={(event) => props.setPrompt(event.target.value)}
          placeholder="Add verification, reduce cost, increase parallelism, or add a human approval…"
        />
        <button
          onClick={props.onPropose}
          disabled={props.busy || !props.prompt.trim()}
          type="button"
        >
          Propose
        </button>
      </div>
      {props.proposal && (
        <div className="proposal-review">
          <p>
            <strong>{props.proposal.model}</strong> via {props.proposal.profile}
          </p>
          {props.proposal.changes.map((change, index) => (
            <label className="proposal-change" key={index}>
              <input
                type="checkbox"
                checked={props.selection.has(index)}
                onChange={() =>
                  props.setSelection(toggleSet(props.selection, index))
                }
              />
              <span>
                <strong>
                  {change.operation} {change.pointer}
                </strong>
                <small>{change.explanation}</small>
              </span>
            </label>
          ))}
          <div className="row-actions">
            <button onClick={props.onReject} type="button">
              Reject all
            </button>
            <button
              className="primary-action"
              onClick={props.onApply}
              disabled={!props.selection.size}
              type="button"
            >
              Accept selected
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function TemplateGallery({
  busy,
  contributed,
  onUse,
  onDocument,
}: {
  busy: boolean;
  contributed: GraphAuthoringContract["graph_templates"];
  onUse: (goal: string, model: boolean) => void;
  onDocument: (document: AgenticGraphDocument) => void;
}) {
  const templates = [
    [
      "Release prep",
      "Prepare a release: inspect readiness, run verification in parallel where safe, review evidence, and gate publishing.",
    ],
    [
      "Bug triage",
      "Triage a reported defect, reproduce it, identify the root cause, implement a fix, and verify regression coverage.",
    ],
    [
      "Docs audit",
      "Audit project documentation for drift and gaps, update the highest-impact pages, and verify links and examples.",
    ],
    [
      "Dependency upgrade",
      "Inspect an outdated dependency, plan a compatible upgrade, implement it, and run focused verification.",
    ],
    [
      "Test repair",
      "Inspect failing tests, isolate root causes, repair behavior without weakening assertions, and verify the suite.",
    ],
  ] as const;
  return (
    <details className="panel template-gallery">
      <summary>Workflow template gallery</summary>
      <div className="template-grid">
        {templates.map(([title, goal]) => (
          <div className="template-option" key={title}>
            <strong>{title}</strong>
            <span>{goal}</span>
            <div className="row-actions">
              <button
                disabled={busy}
                onClick={() => onUse(goal, false)}
                type="button"
              >
                Deterministic
              </button>
              <button
                disabled={busy}
                onClick={() => onUse(goal, true)}
                type="button"
              >
                Planning model
              </button>
            </div>
          </div>
        ))}
        {contributed.map((template) => (
          <div className="template-option" key={template.id}>
            <strong>{template.title}</strong>
            <span>{template.description}</span>
            <small>
              {template.plugin} · {template.trust} ·{" "}
              {template.digest.slice(0, 18)}…
            </small>
            <button
              disabled={busy}
              onClick={() => onDocument(template.document)}
              type="button"
            >
              Use trusted plugin template
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}

function RunReview({
  plan,
  gates,
  approved,
  setApproved,
}: {
  plan: Record<string, unknown>;
  gates: string[];
  approved: Set<string>;
  setApproved: (value: Set<string>) => void;
}) {
  return (
    <section className="panel run-review">
      <h3>Execution review</h3>
      <div className="form-grid three">
        <span>
          <small>Projected cost</small>
          <strong>${Number(plan.projected_cost_usd ?? 0).toFixed(2)}</strong>
        </span>
        <span>
          <small>Execution bound</small>
          <strong>{String(plan.worst_case_node_executions ?? "—")}</strong>
        </span>
        <span>
          <small>Parallel limit</small>
          <strong>{String(plan.max_parallel_nodes ?? "—")}</strong>
        </span>
      </div>
      {gates.length ? (
        <fieldset>
          <legend>Human gates</legend>
          {gates.map((gate) => (
            <label className="check-option" key={gate}>
              <input
                type="checkbox"
                checked={approved.has(gate)}
                onChange={() => setApproved(toggleSet(approved, gate))}
              />
              <span>
                <strong>{gate}</strong>
                <small>
                  Approve only this declared checkpoint for the reviewed graph
                  digest.
                </small>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="muted">No human gates are declared.</p>
      )}
    </section>
  );
}

function ExecutionCockpit({
  root,
  children,
  activity,
  onAction,
}: {
  root: ExecutionTask;
  children: ExecutionTask[];
  activity: string[];
  onAction: (action: "pause" | "resume" | "cancel" | "retry") => void;
}) {
  return (
    <section className="panel execution-cockpit">
      <div className="panel-heading">
        <div>
          <p className="label">Durable graph execution</p>
          <h3>{root.title}</h3>
          <span
            className={`status-badge ${root.state === "succeeded" ? "good" : activeStates.has(root.state) ? "warning" : ""}`}
          >
            {root.state}
          </span>
        </div>
        <div className="row-actions">
          {root.state === "running" && (
            <button onClick={() => onAction("pause")} type="button">
              <Pause />
              Pause
            </button>
          )}
          {["waiting", "blocked", "awaiting_human"].includes(root.state) && (
            <button onClick={() => onAction("resume")} type="button">
              <Play />
              Resume
            </button>
          )}
          {activeStates.has(root.state) && (
            <button onClick={() => onAction("cancel")} type="button">
              <Square />
              Cancel
            </button>
          )}
          {["failed", "cancelled"].includes(root.state) && (
            <button onClick={() => onAction("retry")} type="button">
              <RotateCcw />
              Retry
            </button>
          )}
        </div>
      </div>
      <div className="execution-node-list">
        {children.map((task) => (
          <details key={task.id}>
            <summary>
              <strong>{String(task.metadata.node_id ?? task.title)}</strong>
              <span>{task.state}</span>
              <small>
                attempt {task.attempt} ·{" "}
                {String(task.usage.total_tokens ?? task.usage.tokens ?? 0)}{" "}
                tokens
              </small>
            </summary>
            {task.files_changed.length ? (
              <p>Files: {task.files_changed.join(", ")}</p>
            ) : null}
            <pre>
              {JSON.stringify(
                {
                  usage: task.usage,
                  audit: task.final_audit,
                  metadata: task.metadata,
                },
                null,
                2,
              )}
            </pre>
          </details>
        ))}
      </div>
      {activity.length > 0 && (
        <details className="activity-disclosure">
          <summary>Bounded live log ({activity.length})</summary>
          <pre className="code-preview" aria-live="polite">
            {activity.join("\n")}
          </pre>
        </details>
      )}
    </section>
  );
}

function schemaEnum(
  schema: Record<string, unknown> | undefined,
  def: string,
  property: string,
  fallback: string[],
): string[] {
  const defs = schema?.["$defs"] as
    Record<string, Record<string, unknown>> | undefined;
  const properties = defs?.[def]?.properties as
    Record<string, Record<string, unknown>> | undefined;
  const values = properties?.[property]?.enum;
  return Array.isArray(values) ? values.map(String) : fallback;
}
function csv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
function toggleSet<T>(set: Set<T>, value: T) {
  const next = new Set(set);
  next.has(value) ? next.delete(value) : next.add(value);
  return next;
}
function localDigest(document: AgenticGraphDocument) {
  return JSON.stringify(document);
}
function serializeSource(document: AgenticGraphDocument, path: string) {
  return path.toLowerCase().endsWith(".json")
    ? jsonSource(document)
    : stringifyYaml(document, { lineWidth: 100 });
}
function parseSource(text: string, path: string) {
  const value = path.toLowerCase().endsWith(".json")
    ? JSON.parse(text)
    : parseYaml(text);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Graph source must contain an object");
  return value as AgenticGraphDocument;
}
function ordered(ids: string[], order: string[]) {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...ids].sort(
    (a, b) =>
      (rank.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
}
function draftKey(project: string) {
  return `mcc.graphDraft:${project}`;
}
function recentKey(project: string) {
  return `mcc.recentGraphs:${project}`;
}
function pinnedKey(project: string) {
  return `mcc.pinnedGraphs:${project}`;
}
async function restoreDraft(project: string) {
  return loadAppState<DraftRecord | null>(draftKey(project), null);
}
async function rememberGraph(project: string, path: string) {
  const key = recentKey(project);
  const current = await loadAppState<string[]>(key, []);
  await saveAppState(
    key,
    [path, ...current.filter((item) => item !== path)].slice(0, 25),
  );
}
