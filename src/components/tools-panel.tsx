import { useEffect, useState } from "react";
import {
  Blocks,
  Bot,
  CheckCircle2,
  Globe2,
  Plug,
  RefreshCcw,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  magentClient,
  parseJson,
  runMagent,
  type MagentCommandResult,
} from "../magent";
import type { Toast } from "../lib/types";
import { extractRows, pretty } from "../lib/utils";

type Inventory = {
  capabilities: MagentCommandResult | null;
  backends: MagentCommandResult | null;
  plugins: MagentCommandResult | null;
  skills: MagentCommandResult | null;
  mcp: MagentCommandResult | null;
};

type WebMCPOrigin = string | { origin: string; [key: string]: unknown };
type WebMCPTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: { readOnlyHint?: boolean; [key: string]: unknown };
  [key: string]: unknown;
};
type WebMCPState = {
  available?: boolean;
  ok?: boolean;
  url?: string;
  registry_revision?: string;
  origins?: WebMCPOrigin[];
  tools?: WebMCPTool[];
  [key: string]: unknown;
};

const emptyInventory: Inventory = {
  capabilities: null,
  backends: null,
  plugins: null,
  skills: null,
  mcp: null,
};

export function ToolsPanel(props: {
  project: string;
  notify: (text: string, tone?: Toast["tone"]) => void;
}) {
  const [inventory, setInventory] = useState<Inventory>(emptyInventory);
  const [busy, setBusy] = useState(false);
  const [webmcp, setWebmcp] = useState<WebMCPState | null>(null);
  const [webmcpUrl, setWebmcpUrl] = useState("https://alexmerced.app/");
  const [originDraft, setOriginDraft] = useState("");
  const [selectedTool, setSelectedTool] = useState<WebMCPTool | null>(null);
  const [argumentsText, setArgumentsText] = useState("{}");
  const [webmcpResult, setWebmcpResult] = useState<Record<
    string,
    unknown
  > | null>(null);

  async function load() {
    setBusy(true);
    const commands: Record<keyof Inventory, string[]> = {
      capabilities: ["tools", "doctor"],
      backends: ["tools", "gateway"],
      plugins: ["plugin", "list", "--json"],
      skills: ["skill", "list", "--project", props.project],
      mcp: ["mcp", "list"],
    };
    try {
      const [entries, webmcpStatus] = await Promise.all([
        Promise.all(
          Object.entries(commands).map(
            async ([key, args]) => [key, await runMagent(args)] as const,
          ),
        ),
        magentClient.webmcpStatus().catch((error: unknown) => ({
          ok: false,
          available: false,
          error: error instanceof Error ? error.message : String(error),
        })),
      ]);
      setInventory(Object.fromEntries(entries) as Inventory);
      setWebmcp(webmcpStatus);
      const failures = entries.filter(([, result]) => !result.ok).length;
      props.notify(
        failures
          ? `${failures} extension inventory checks need review.`
          : "Extension inventory refreshed.",
        failures ? "bad" : "good",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [props.project]);

  async function inspectWebmcp() {
    setBusy(true);
    try {
      const detail = (await magentClient.inspectWebmcp(
        webmcpUrl,
      )) as WebMCPState;
      setWebmcp((current) => ({
        ...(current || {}),
        ...detail,
        origins: detail.origins || current?.origins,
      }));
      setSelectedTool(null);
      setWebmcpResult(null);
    } catch (error) {
      props.notify(
        error instanceof Error ? error.message : String(error),
        "bad",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addOrigin() {
    if (!originDraft.trim()) return;
    try {
      const origins = await magentClient.addWebmcpOrigin(originDraft.trim());
      setWebmcp((current) => ({ ...(current || {}), origins }));
      setOriginDraft("");
      props.notify("WebMCP origin added.", "good");
    } catch (error) {
      props.notify(
        error instanceof Error ? error.message : String(error),
        "bad",
      );
    }
  }

  async function invokeWebmcp() {
    if (!selectedTool) return;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argumentsText) as Record<string, unknown>;
      if (!args || Array.isArray(args) || typeof args !== "object")
        throw new Error();
    } catch {
      props.notify("WebMCP arguments must be a JSON object.", "bad");
      return;
    }
    const annotations = selectedTool.annotations || {};
    if (
      annotations.readOnlyHint !== true &&
      !window.confirm(
        `Allow ${selectedTool.name} once?\n\n${argumentsText}\n\nThe site tool may change data.`,
      )
    )
      return;
    setBusy(true);
    try {
      const response = await magentClient.callWebmcp(
        String(webmcp?.url || webmcpUrl),
        String(selectedTool.name),
        args,
        String(webmcp?.registry_revision || ""),
      );
      setWebmcpResult(response);
      props.notify("WebMCP tool completed.", "good");
    } catch (error) {
      props.notify(
        error instanceof Error ? error.message : String(error),
        "bad",
      );
    } finally {
      setBusy(false);
    }
  }

  const doctor = parseJson<{
    capabilities?: Array<{
      capability: string;
      available: boolean;
      missing_modules?: string[];
      install?: string;
    }>;
  }>(inventory.capabilities || emptyResult());
  const plugins = extractRows(
    parseJson<Record<string, unknown>>(inventory.plugins || emptyResult()),
  );

  return (
    <section className="tools-surface">
      <header className="section-intro split-heading">
        <div>
          <p className="eyebrow">Effective environment</p>
          <h2>Tools and extensions</h2>
          <p>
            Readiness, origin, integrity, and effective availability without
            exposing secret configuration.
          </p>
        </div>
        <button
          className="icon-action"
          onClick={() => void load()}
          disabled={busy}
          type="button"
        >
          <RefreshCcw />
          Refresh
        </button>
      </header>
      <article className="panel webmcp-console">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Browser-native capability</p>
            <h3>WebMCP</h3>
          </div>
          <span
            className={`status-pill ${webmcp?.available || webmcp?.ok ? "good" : "bad"}`}
          >
            {webmcp?.available || webmcp?.ok ? "Ready" : "Needs setup"}
          </span>
        </div>
        <p>
          Open an allowlisted HTTPS page, inspect its live tool schemas, and run
          an exact revision through MagAgent’s approval boundary.
        </p>
        <div className="webmcp-origin-list">
          {(webmcp?.origins || []).map((entry: WebMCPOrigin) => {
            const origin = typeof entry === "string" ? entry : entry.origin;
            return (
              <span key={origin}>
                {origin}
                <button
                  type="button"
                  aria-label={`Remove ${origin}`}
                  onClick={() =>
                    void (async () => {
                      if (
                        !window.confirm(
                          `Remove ${origin} from the WebMCP allowlist?`,
                        )
                      )
                        return;
                      try {
                        const origins =
                          await magentClient.removeWebmcpOrigin(origin);
                        setWebmcp((current) => ({
                          ...(current || {}),
                          origins,
                        }));
                      } catch (error) {
                        props.notify(
                          error instanceof Error
                            ? error.message
                            : String(error),
                          "bad",
                        );
                      }
                    })()
                  }
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
        <div className="webmcp-row">
          <input
            aria-label="New WebMCP HTTPS origin"
            type="url"
            placeholder="https://tools.example.com"
            value={originDraft}
            onChange={(event) => setOriginDraft(event.target.value)}
          />
          <button
            className="secondary-action"
            type="button"
            onClick={() => void addOrigin()}
          >
            Add origin
          </button>
        </div>
        <div className="webmcp-row">
          <input
            aria-label="WebMCP page URL"
            type="url"
            value={webmcpUrl}
            onChange={(event) => setWebmcpUrl(event.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void inspectWebmcp()}
          >
            {busy ? "Opening…" : "Open and inspect"}
          </button>
        </div>
        {Array.isArray(webmcp?.tools) && (
          <div className="webmcp-tools">
            {webmcp.tools.map((item: WebMCPTool) => (
              <button
                type="button"
                key={item.name}
                className={selectedTool?.name === item.name ? "selected" : ""}
                onClick={() => {
                  setSelectedTool(item);
                  setArgumentsText("{}");
                  setWebmcpResult(null);
                }}
              >
                <strong>{item.name}</strong>
                <small>
                  {item.annotations?.readOnlyHint
                    ? "Read only"
                    : "Approval governed"}
                </small>
              </button>
            ))}
          </div>
        )}
        {selectedTool && (
          <div className="webmcp-invoke">
            <h4>{String(selectedTool.name)}</h4>
            <details>
              <summary>Input schema</summary>
              <pre>{pretty(selectedTool.inputSchema || {})}</pre>
            </details>
            <label>
              Arguments (JSON)
              <textarea
                rows={5}
                value={argumentsText}
                onChange={(event) => setArgumentsText(event.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void invokeWebmcp()}
            >
              Run tool
            </button>
            {webmcpResult && <pre>{pretty(webmcpResult)}</pre>}
          </div>
        )}
      </article>
      <div className="tool-card-grid">
        {(doctor?.capabilities || []).map((item) => (
          <article className="panel tool-card" key={item.capability}>
            <div className="tool-card-title">
              {item.available ? (
                <CheckCircle2 className="good" />
              ) : (
                <XCircle className="bad" />
              )}
              <div>
                <h3>{item.capability}</h3>
                <small>
                  {item.available ? "Ready" : "Optional dependencies missing"}
                </small>
              </div>
            </div>
            {!item.available && (
              <>
                <p>{(item.missing_modules || []).join(", ")}</p>
                <code>{item.install}</code>
              </>
            )}
          </article>
        ))}
      </div>
      <div className="workspace-grid">
        <InventoryCard
          title="Tool backends"
          icon={<Globe2 />}
          result={inventory.backends}
        />
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Trusted packs</p>
              <h3>Plugins and integrity</h3>
            </div>
            <Plug />
          </div>
          {plugins.length ? (
            <div className="inventory-list">
              {plugins.map((item, index) => (
                <div key={String(item.name || index)}>
                  <Blocks />
                  <span>
                    <strong>{String(item.name || "Plugin")}</strong>
                    <small>
                      {String(item.enabled ?? "unknown")} ·{" "}
                      {String(
                        item.integrity ||
                          item.status ||
                          "review status unavailable",
                      )}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-copy">No installed plugins.</p>
          )}
        </article>
        <InventoryCard
          title="Discovered skills"
          icon={<Bot />}
          result={inventory.skills}
        />
        <InventoryCard
          title="MCP servers"
          icon={<ShieldCheck />}
          result={inventory.mcp}
        />
      </div>
      <article className="panel trust-boundary">
        <Wrench />
        <div>
          <h3>Effective authority remains profile-bound</h3>
          <p>
            Presence does not grant permission. A tool, skill, plugin, or MCP
            server still passes through the active Open Agent Profile, managed
            policy, runtime approval, and audit boundaries.
          </p>
        </div>
      </article>
    </section>
  );
}

function InventoryCard(props: {
  title: string;
  icon: React.ReactNode;
  result: MagentCommandResult | null;
}) {
  const data = props.result
    ? parseJson<Record<string, unknown>>(props.result)
    : null;
  return (
    <article className="panel inventory-card">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Inventory</p>
          <h3>{props.title}</h3>
        </div>
        {props.icon}
      </div>
      {!props.result && <p className="empty-copy">Loading…</p>}
      {props.result && (
        <pre>
          {data
            ? pretty(data)
            : props.result.stdout || props.result.stderr || "No entries."}
        </pre>
      )}
    </article>
  );
}

function emptyResult(): MagentCommandResult {
  return { ok: false, command: "", stdout: "", stderr: "", status: null };
}
