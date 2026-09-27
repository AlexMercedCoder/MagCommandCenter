import { Copy, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { outgoingDependents } from "../graph-model";
import type {
  AgenticGraphDocument,
  AgenticGraphNode,
  AgentProfileSummary,
  EffectiveAgentProfile,
  GraphAuthoringContract,
  GraphNodeType,
} from "../../../lib/types";
import { csv, nodeTypes, schemaEnum } from "./utils";

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
                <input
                  key={props.id}
                  defaultValue={props.id}
                  id="graph-node-id"
                />
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

export function JsonEditor({
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

export function NumberField({
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

export function numberValue(value: unknown) {
  return typeof value === "number" ? value : undefined;
}
