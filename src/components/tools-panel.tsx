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
import { parseJson, runMagent, type MagentCommandResult } from "../magent";
import type { Toast } from "../lib/types";
import { extractRows, pretty } from "../lib/utils";

type Inventory = {
  capabilities: MagentCommandResult | null;
  backends: MagentCommandResult | null;
  plugins: MagentCommandResult | null;
  skills: MagentCommandResult | null;
  mcp: MagentCommandResult | null;
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
      const entries = await Promise.all(
        Object.entries(commands).map(
          async ([key, args]) => [key, await runMagent(args)] as const,
        ),
      );
      setInventory(Object.fromEntries(entries) as Inventory);
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
