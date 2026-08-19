import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import type { ExecutionTask } from "../lib/types";
import { ArtifactViewer, TaskStrip } from "./chat-panel";
import { Dashboard, EnvironmentCenter } from "./dashboard-panel";
import { MemoryPanel, MemoryProvenance } from "./memory-panel";
import { PluginReview } from "./plugins-panel";
import { setupGuidance } from "./setup-panel";
import { formatExport, SQLitePanel } from "./sqlite-panel";
import { GraphPlanView } from "./workbench-panel";
import { AgentsPanel } from "./agents-panel";
import type { ProfileRuntime } from "../features/profiles/use-profile-runtime";

const task: ExecutionTask = {
  id: "task_1", schema_version: "magent.task.v2", kind: "ask", title: "Build dashboard",
  state: "running", project_id: "p1", project_path: "/tmp/project", session_id: "s1",
  parent_task_id: "", created_at: "now", updated_at: "now", started_at: "now", finished_at: "",
  attempt: 1, usage: {}, files_changed: [], checkpoints: [], final_audit: {}, metadata: {}
};

describe("task runtime UI", () => {
  it("shows durable task state and event count", () => {
    render(<TaskStrip tasks={[task]} activeTask={task} events={[{ schema_version: "magent.task-event.v1", task_id: task.id, sequence: 1, type: "task_created", state: "running", created_at: "now", detail: {} }]} error="" onSelect={() => undefined} onAction={() => undefined} onPreviewArtifact={() => undefined} />);
    expect(screen.getByText("Build dashboard")).toBeInTheDocument();
    expect(screen.getByText("1 events")).toBeInTheDocument();
  });

  it("selects and pauses a running task", async () => {
    const select = vi.fn();
    const action = vi.fn();
    render(<TaskStrip tasks={[task]} activeTask={task} events={[]} error="" onSelect={select} onAction={action} onPreviewArtifact={() => undefined} />);
    await userEvent.click(screen.getByText("Build dashboard"));
    await userEvent.click(screen.getByTitle("Pause task"));
    expect(select).toHaveBeenCalledWith("task_1");
    expect(action).toHaveBeenCalledWith("task_1", "pause");
  });

  it("offers retry for a failed task and exposes errors", () => {
    render(<TaskStrip tasks={[{ ...task, state: "failed" }]} activeTask={{ ...task, state: "failed" }} events={[]} error="runtime offline" onSelect={() => undefined} onAction={() => undefined} onPreviewArtifact={() => undefined} />);
    expect(screen.getByTitle("Retry task")).toBeInTheDocument();
    expect(screen.getByText("runtime offline")).toBeInTheDocument();
  });

  it("treats task-v2 succeeded state as terminal", () => {
    render(<TaskStrip tasks={[{ ...task, state: "succeeded" }]} activeTask={{ ...task, state: "succeeded" }} events={[]} error="" onSelect={() => undefined} onAction={() => undefined} onPreviewArtifact={() => undefined} />);
    expect(screen.getByTitle("Retry task")).toBeInTheDocument();
    expect(screen.queryByTitle("Cancel task")).not.toBeInTheDocument();
  });

  it("opens files recorded by durable execution evidence", async () => {
    const preview = vi.fn();
    const withFile = { ...task, files_changed: ["/tmp/project/index.html"] };
    render(<TaskStrip tasks={[withFile]} activeTask={withFile} events={[]} error="" onSelect={() => undefined} onAction={() => undefined} onPreviewArtifact={preview} />);
    await userEvent.click(screen.getByText("index.html"));
    expect(preview).toHaveBeenCalledWith("/tmp/project/index.html");
  });

  it("sandboxes rendered HTML artifact previews", () => {
    render(<ArtifactViewer preview={{ path: "/tmp/index.html", kind: "html", mime_type: "text/html", text: "<h1>Hello</h1>", data_url: null, bytes: 14, truncated: false }} onClose={() => undefined} />);
    expect(screen.getByTitle("index.html rendered preview")).toHaveAttribute("sandbox");
    expect(screen.getByText("14 B")).toBeInTheDocument();
  });
});

describe("ecosystem readiness", () => {
  it("keeps deterministic checks separate from external release gates", () => {
    render(
      <Dashboard
        busy={false}
        project="/tmp/project"
        setProject={() => undefined}
        recentProjects={[]}
        pinnedProjects={[]}
        allProjects={[]}
        projectHealth="Unchecked"
        rememberProject={() => undefined}
        togglePinnedProject={() => undefined}
        chooseProjectFolder={() => undefined}
        system={null}
        magentOk={false}
        readiness={null}
        ecosystemReadiness={{ ok: true, checks: [{ name: "magent-contracts", ok: true, status: "passed", detail: "v1" }], external_gates: ["signed packages"] }}
        toolReadiness={null}
        providerDetection={null}
        cacheReadiness={null}
        projectInspection={null}
        commandHistory={[]}
        lastCommand={null}
        onSystem={() => undefined}
        onReadiness={() => undefined}
        onEcosystemReadiness={() => undefined}
        onEnvironment={() => undefined}
        onInspectProject={() => undefined}
      />
    );
    expect(screen.getByText("Local checks pass")).toBeInTheDocument();
    expect(screen.getByText("magent-contracts")).toBeInTheDocument();
    expect(screen.getByText("signed packages")).toBeInTheDocument();
  });


  it("summarizes 0.91 provider, tool, cache, and contract readiness", () => {
    render(<EnvironmentCenter
      busy={false}
      system={{ contracts: { desktop_cli: { version: "1", status: "stable" }, task: { version: "magent.task.v2", status: "stable" }, memory_recall: { version: "2", status: "stable" } } }}
      tools={{ core_ready: true, capabilities: [{ capability: "browser", available: true }, { capability: "media", available: false }] }}
      providers={{ providers: [{ id: "nous-portal", label: "Nous", default_model: "deepseek", env_present: true, local: false }] }}
      cache={{ provider: "nous-portal", model: "deepseek", enabled: true }}
      onRefresh={() => undefined}
    />);
    expect(screen.getByText("1/2 ready")).toBeInTheDocument();
    expect(screen.getByText("nous-portal")).toBeInTheDocument();
    expect(screen.getByText("3 stable")).toBeInTheDocument();
    expect(screen.getByText("magent.task.v2")).toBeInTheDocument();
  });
});

describe("memory studio", () => {
  it("renders recall reasons, backlinks, and score evidence", () => {
    render(<MemoryProvenance node={{ links: ["a"], backlinks: ["b", "c"], provenance: { source: "task" }, reasons: ["semantic match", "backlink"], score_breakdown: { semantic: 0.8 } }} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/semantic match/)).toBeInTheDocument();
    expect(screen.getByText("Retrieval score")).toBeInTheDocument();
  });

  it("offers reviewed batch preview and apply actions", async () => {
    const batch = vi.fn();
    render(<MemoryPanel busy={false} query="" setQuery={() => undefined} nodes={[]} selectedNodeId="" setSelectedNodeId={() => undefined} selectedNode={null} editBody="" setEditBody={() => undefined} preview={null} inbox={null} selectedInboxId="" setSelectedInboxId={() => undefined} inboxEditBody="" setInboxEditBody={() => undefined} improvePrompt="Improve" setImprovePrompt={() => undefined} mergeTargetId="" mergeSourceId="" suppressReason="" setMergeTargetId={() => undefined} setMergeSourceId={() => undefined} setSuppressReason={() => undefined} batchText="[]" setBatchText={() => undefined} onLoad={() => undefined} onLoadNode={() => undefined} onPreview={() => undefined} onApply={() => undefined} onImprove={() => undefined} onLoadInbox={() => undefined} onInboxAction={() => undefined} onSuppress={() => undefined} onUnsuppress={() => undefined} onMerge={() => undefined} onBatch={batch} />);
    await userEvent.click(screen.getByText("Reviewed Batch"));
    await userEvent.click(screen.getByText("Preview Batch"));
    await userEvent.click(screen.getByText("Apply Batch"));
    expect(batch.mock.calls).toEqual([[true], [false]]);
  });
});

describe("SQLite workspace", () => {
  it("formats JSON and escaped CSV exports", () => {
    const table = { columns: ["name"], rows: [{ name: 'A "quote"' }] };
    expect(formatExport(table, "json")).toContain('A \\"quote\\"');
    expect(formatExport(table, "csv")).toContain('"A ""quote"""');
  });

  it("drafts a safe paged query from a table button", async () => {
    const setQuery = vi.fn();
    render(<SQLitePanel busy={false} databases={[{ key: "main", label: "Main" }]} selectedDb="main" setSelectedDb={() => undefined} tables={{}} tableRows={{ columns: ["name"], rows: [{ name: "tasks" }] }} query="select 1" setQuery={setQuery} page={0} setPage={() => undefined} savedQueries={[]} onSaveQuery={() => undefined} result={null} resultRows={{ columns: [], rows: [] }} exportFormat="json" setExportFormat={() => undefined} onLoadDbs={() => undefined} onLoadTables={() => undefined} onRunQuery={() => undefined} />);
    await userEvent.click(screen.getAllByText("tasks")[0]);
    expect(setQuery).toHaveBeenCalledWith("select * from tasks");
  });
});

describe("setup and plugins", () => {
  it("guides a compatible installation to the desktop API", () => {
    expect(setupGuidance(null, "0.33.0", true)[0].title).toBe("Desktop API Ready");
  });

  it("recognizes PATH failures with actionable guidance", () => {
    const command = { ok: false, command: "magent", stdout: "", stderr: "command not found", status: 127 };
    expect(setupGuidance(command, undefined, false)[0].title).toContain("PATH");
  });

  it("summarizes plugin capabilities, permissions, and trust", () => {
    render(<PluginReview value={{ capabilities: ["tools", "skills"], permissions: ["shell"], trust_status: "reviewed" }} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("reviewed")).toBeInTheDocument();
  });

  it("keeps plugin review controls free of critical accessibility violations", async () => {
    const { container } = render(<PluginReview value={{ capabilities: ["skills"], permissions: [], trust_status: "reviewed" }} />);
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } }
    });
    expect(results.violations.filter((item) => ["button-name", "label", "duplicate-id", "aria-valid-attr"].includes(item.id))).toEqual([]);
  });
});

describe("Agentic Graph workbench", () => {
  it("renders a plan as a reviewable execution table", () => {
    render(<GraphPlanView value={{
      ok: true,
      graph_id: "example/release",
      order: ["inspect", "publish"],
      gates: ["publish"],
      projected_cost_usd: 1.25,
      worst_case_node_executions: 3,
      max_parallel_nodes: 2,
      nodes: [
        { id: "inspect", title: "Inspect", type: "task", tier: "standard", level: 0, estimate: { cost_usd: 0.25 } },
        { id: "publish", title: "Publish", type: "gate", tier: "none", level: 1, estimate: {} },
      ],
    }} />);
    expect(screen.getByText("example/release")).toBeInTheDocument();
    expect(screen.getByText("$1.25")).toBeInTheDocument();
    expect(screen.getByText(/Human gates:/)).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("Open Agent Profile Center", () => {
  it("renders effective authority and project crew controls", async () => {
    const document = { oap: "1.0", metadata: { name: "reviewer", description: "Reviews changes", revision: 2 }, spec: { role: { instructions: "Review carefully." } } } as const;
    const summary = { name: "reviewer", revision: 2, source: "/tmp/.magent/agents/reviewer.md", trust: "project", encoding: "md", legacy: false, spec_digest: "s", profile_digest: "p", resolution_digest: "r", warnings: [], extends: [] };
    const runtime = {
      profiles: [summary], contract: null, selectedName: "reviewer", setSelectedName: vi.fn(),
      selected: { ...summary, document }, effective: { ...summary, tools: ["read_file"], permission_mode: "paranoid", network_access: "none", provider: "nous-portal", model: "deepseek-v4-flash", max_turns: 8, max_state_tokens: 600, writeback: "propose", mcp_servers: [], skills: [], subagents: [], max_subagents: 0, max_parallel_subagents: 0, max_delegation_depth: 0, memory_stores: [{ name: "profile-state", kind: "oap-state", mode: "read" }], adjustments: [] },
      defaultProfile: "magagent", preview: null, setPreview: vi.fn(), inbox: [], models: [], revisions: [], busy: false, error: "",
      load: vi.fn(), inspect: vi.fn(), previewDocument: vi.fn(), saveDocument: vi.fn(), setDefault: vi.fn(), clone: vi.fn(), remove: vi.fn(), restoreRevision: vi.fn(), decideDelta: vi.fn(), importProfile: vi.fn(), exportProfile: vi.fn(), loadModels: vi.fn()
    } as unknown as ProfileRuntime;
    const changeCrew = vi.fn();
    const { container } = render(<AgentsPanel runtime={runtime} project="/tmp/project" crew={{ project: "/tmp/project", coordinator: "", members: [] }} onCrewChange={changeCrew} onUseInChat={() => undefined} />);

    expect(screen.getByText("Reviews changes")).toBeInTheDocument();
    expect(screen.getByText("paranoid")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Assigned to this project"));
    expect(changeCrew).toHaveBeenCalledWith(expect.objectContaining({ members: [{ profile: "reviewer", role: "Specialist" }] }));
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(results.violations.filter((item) => ["button-name", "label", "duplicate-id", "aria-valid-attr"].includes(item.id))).toEqual([]);
  });

  it("explains why effective authority is unavailable before setup", () => {
    const document = { oap: "1.0", metadata: { name: "magagent", description: "Default agent", revision: 1 }, spec: {} } as const;
    const summary = { name: "magagent", revision: 1, source: "managed", trust: "managed", encoding: "md", legacy: false, spec_digest: "s", profile_digest: "p", resolution_digest: "r", warnings: [], extends: [] };
    const runtime = {
      profiles: [summary], contract: null, selectedName: "magagent", setSelectedName: vi.fn(),
      selected: { ...summary, document }, effective: null, defaultProfile: "magagent", preview: null,
      setPreview: vi.fn(), inbox: [], models: [], revisions: [], busy: false, error: "", load: vi.fn(),
    } as unknown as ProfileRuntime;

    render(<AgentsPanel runtime={runtime} project="/tmp/project" crew={{ project: "/tmp/project", coordinator: "", members: [] }} onCrewChange={() => undefined} onUseInChat={() => undefined} />);

    expect(screen.getByText(/Configure MagAgent to resolve this profile's effective tools/)).toBeInTheDocument();
  });
});
