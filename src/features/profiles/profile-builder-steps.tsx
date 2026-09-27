import { Check, Network, ShieldCheck } from "lucide-react";
import type { ProfileRuntime } from "../../features/profiles/use-profile-runtime";
import {
  applyTemplate,
  type ProfileDraft,
} from "../../features/profiles/profile-builder";
import { EffectiveAuthority, ProfileMark } from "./profile-sections";
import type { SetDraft } from "./profile-builder-view";

export function IdentityStep(props: {
  contract: NonNullable<ProfileRuntime["contract"]>;
  draft: ProfileDraft;
  set: SetDraft;
  setDraft: (draft: ProfileDraft) => void;
}) {
  return (
    <div className="builder-form">
      <fieldset>
        <legend>Starting point</legend>
        <div className="template-grid">
          {props.contract.templates.map((template) => (
            <button
              className={
                props.draft.template === template.id
                  ? "template-option active"
                  : "template-option"
              }
              onClick={() =>
                props.setDraft(applyTemplate(props.draft, template.id))
              }
              type="button"
              key={template.id}
            >
              <strong>{template.title}</strong>
              <span>{template.description}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <label>
          Name
          <input
            value={props.draft.name}
            onChange={(event) => props.set("name", event.target.value)}
            placeholder="research-assistant"
          />
        </label>
        <label>
          Display title
          <input
            value={props.draft.title}
            onChange={(event) => props.set("title", event.target.value)}
            placeholder="Research Assistant"
          />
        </label>
        <label className="span-two">
          Description
          <input
            value={props.draft.description}
            onChange={(event) => props.set("description", event.target.value)}
            placeholder="Finds reliable sources and prepares concise research."
          />
        </label>
        <label>
          Color
          <input
            type="color"
            value={props.draft.color}
            onChange={(event) => props.set("color", event.target.value)}
          />
        </label>
        <label>
          Symbol
          <select
            value={props.draft.icon}
            onChange={(event) => props.set("icon", event.target.value)}
          >
            <option value="sparkles">Sparkles</option>
            <option value="code">Code</option>
            <option value="search">Search</option>
            <option value="shield">Shield</option>
            <option value="book">Book</option>
          </select>
        </label>
        <label>
          Save scope
          <select
            value={props.draft.scope}
            onChange={(event) => props.set("scope", event.target.value)}
          >
            <option value="user">All projects for this user</option>
            <option value="project">Current project only</option>
            <option value="portable">Portable .agents directory</option>
            <option value="universal">
              Universal ~/.agentprofiles directory
            </option>
          </select>
        </label>
        <label>
          Extends
          <select
            multiple
            value={props.draft.extends}
            onChange={(event) =>
              props.set(
                "extends",
                Array.from(
                  event.target.selectedOptions,
                  (option) => option.value,
                ),
              )
            }
          >
            {props.contract.choices.profiles.map((profile) => (
              <option value={profile.name} key={profile.name}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="field-note">{props.contract.guidance.profile_boundary}</p>
    </div>
  );
}

export function BehaviorStep(props: {
  contract: NonNullable<ProfileRuntime["contract"]>;
  draft: ProfileDraft;
  set: SetDraft;
  models: ProfileRuntime["models"];
  onLoadModels: (provider: string) => Promise<void>;
}) {
  const provider = props.contract.choices.providers.find(
    (item) => item.id === props.draft.provider,
  );
  return (
    <div className="builder-form">
      <label>
        Core instructions
        <textarea
          value={props.draft.instructions}
          onChange={(event) => props.set("instructions", event.target.value)}
          rows={6}
          placeholder="Describe the outcomes this agent owns and how it should approach them."
        />
      </label>
      <div className="form-grid">
        <label>
          Communication style
          <input
            value={props.draft.persona}
            onChange={(event) => props.set("persona", event.target.value)}
          />
        </label>
        <label>
          Objectives, comma separated
          <input
            value={props.draft.objectives}
            onChange={(event) => props.set("objectives", event.target.value)}
          />
        </label>
        <label className="span-two">
          Constraints, comma separated
          <input
            value={props.draft.constraints}
            onChange={(event) => props.set("constraints", event.target.value)}
          />
        </label>
        <label>
          Provider
          <select
            value={props.draft.provider}
            onChange={(event) => {
              const next = props.contract.choices.providers.find(
                (item) => item.id === event.target.value,
              );
              props.set("provider", event.target.value);
              props.set("model", next?.default_model ?? "");
              void props.onLoadModels(event.target.value);
            }}
          >
            {props.contract.choices.providers.map((item) => (
              <option value={item.id} key={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Model
          <input
            list="profile-models"
            value={props.draft.model}
            onChange={(event) => props.set("model", event.target.value)}
            placeholder={provider?.default_model}
          />
          <datalist id="profile-models">
            {props.models.map((item) => (
              <option
                value={String(item.id ?? item.name ?? "")}
                key={String(item.id ?? item.name)}
              />
            ))}
          </datalist>
        </label>
      </div>
    </div>
  );
}

export function AuthorityStep(props: {
  contract: NonNullable<ProfileRuntime["contract"]>;
  draft: ProfileDraft;
  set: SetDraft;
  toggle: (items: string[], value: string) => string[];
}) {
  return (
    <div className="builder-form">
      <fieldset>
        <legend>Tool capability packs</legend>
        <div className="choice-grid">
          {props.contract.choices.tool_packs.map((pack) => (
            <label className="check-option" key={pack.name}>
              <input
                type="checkbox"
                checked={props.draft.toolPacks.includes(pack.name)}
                onChange={() =>
                  props.set(
                    "toolPacks",
                    props.toggle(props.draft.toolPacks, pack.name),
                  )
                }
              />
              <span>
                <strong>{pack.name}</strong>
                <small>{pack.description}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <label>
          Permission posture
          <select
            value={props.draft.permissionMode}
            onChange={(event) =>
              props.set("permissionMode", event.target.value)
            }
          >
            {props.contract.choices.permission_modes.map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </select>
        </label>
        <label>
          Network access
          <select
            value={props.draft.network}
            onChange={(event) => props.set("network", event.target.value)}
          >
            {props.contract.choices.network_modes.map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="network-guidance">
        <Network size={20} />
        <div>
          <strong>{props.draft.network}</strong>
          <p>{props.contract.guidance.network[props.draft.network]}</p>
        </div>
      </div>
      <fieldset>
        <legend>Skills</legend>
        <div className="chip-options">
          {props.contract.choices.skills.map((skill) => (
            <label key={skill.name}>
              <input
                type="checkbox"
                checked={props.draft.skills.includes(skill.name)}
                onChange={() =>
                  props.set(
                    "skills",
                    props.toggle(props.draft.skills, skill.name),
                  )
                }
              />
              <span>{skill.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>MCP servers</legend>
        {props.contract.choices.mcp_servers.length ? (
          <div className="chip-options">
            {props.contract.choices.mcp_servers.map((server) => (
              <label key={server}>
                <input
                  type="checkbox"
                  checked={props.draft.mcpServers.includes(server)}
                  onChange={() =>
                    props.set(
                      "mcpServers",
                      props.toggle(props.draft.mcpServers, server),
                    )
                  }
                />
                <span>{server}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="muted">No configured MCP servers.</p>
        )}
      </fieldset>
    </div>
  );
}

export function MemoryTeamStep(props: {
  contract: NonNullable<ProfileRuntime["contract"]>;
  draft: ProfileDraft;
  set: SetDraft;
  toggle: (items: string[], value: string) => string[];
}) {
  return (
    <div className="builder-form">
      <div className="form-grid">
        <label>
          Memory access
          <select
            value={props.draft.memoryMode}
            onChange={(event) => props.set("memoryMode", event.target.value)}
          >
            {props.contract.choices.memory_modes.map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </select>
        </label>
        <label>
          Profile-state writeback
          <select
            value={props.draft.writeback}
            onChange={(event) => props.set("writeback", event.target.value)}
          >
            {props.contract.choices.writeback_modes.map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </select>
        </label>
        <label>
          Maximum turns
          <input
            type="number"
            min={1}
            value={props.draft.maxTurns}
            onChange={(event) =>
              props.set("maxTurns", Number(event.target.value))
            }
          />
        </label>
        <label>
          State context tokens
          <input
            type="number"
            min={0}
            value={props.draft.maxStateTokens}
            onChange={(event) =>
              props.set("maxStateTokens", Number(event.target.value))
            }
          />
        </label>
        <label className="span-two">
          Context files, comma separated
          <input
            value={props.draft.contextFiles}
            onChange={(event) => props.set("contextFiles", event.target.value)}
            placeholder="AGENTS.md, docs/architecture.md"
          />
        </label>
        <label>
          Start hook
          <input
            value={props.draft.onStart}
            onChange={(event) => props.set("onStart", event.target.value)}
            placeholder="Named local hook"
          />
        </label>
        <label>
          End hook
          <input
            value={props.draft.onEnd}
            onChange={(event) => props.set("onEnd", event.target.value)}
            placeholder="Named local hook"
          />
        </label>
      </div>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={props.draft.allowSubagents}
          onChange={(event) =>
            props.set("allowSubagents", event.target.checked)
          }
        />
        <span>
          <strong>Allow delegation</strong>
          <small>
            Subagents remain bounded by this profile and the harness ceiling.
          </small>
        </span>
      </label>
      {props.draft.allowSubagents && (
        <>
          <fieldset>
            <legend>Allowed subagents</legend>
            <div className="chip-options">
              {props.contract.choices.profiles
                .filter((profile) => profile.name !== props.draft.name)
                .map((profile) => (
                  <label key={profile.name}>
                    <input
                      type="checkbox"
                      checked={props.draft.subagents.includes(profile.name)}
                      onChange={() =>
                        props.set(
                          "subagents",
                          props.toggle(props.draft.subagents, profile.name),
                        )
                      }
                    />
                    <span>{profile.name}</span>
                  </label>
                ))}
            </div>
          </fieldset>
          <div className="form-grid three">
            <label>
              Maximum agents
              <input
                type="number"
                min={0}
                value={props.draft.maxSubagents}
                onChange={(event) =>
                  props.set("maxSubagents", Number(event.target.value))
                }
              />
            </label>
            <label>
              Parallel agents
              <input
                type="number"
                min={0}
                value={props.draft.maxParallel}
                onChange={(event) =>
                  props.set("maxParallel", Number(event.target.value))
                }
              />
            </label>
            <label>
              Delegation depth
              <input
                type="number"
                min={0}
                value={props.draft.maxDepth}
                onChange={(event) =>
                  props.set("maxDepth", Number(event.target.value))
                }
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}

export function ReviewStep(props: {
  draft: ProfileDraft;
  preview: ProfileRuntime["preview"];
  setDefault: (value: boolean) => void;
}) {
  const profile = props.preview?.effective_profile;
  if (!props.preview)
    return (
      <div className="empty-state">
        <ShieldCheck size={28} />
        <p>Review has not run.</p>
      </div>
    );
  return (
    <div className="review-layout">
      <div className="review-summary">
        <ProfileMark
          profile={props.draft.name}
          color={props.draft.color}
          large
        />
        <div>
          <p className="label">Effective agent</p>
          <h2>{props.draft.title}</h2>
          <p>{props.draft.description}</p>
        </div>
      </div>
      <EffectiveAuthority profile={profile} />
      {!props.preview.ready && (
        <div className="dependency-warning">
          <strong>Local connections needed</strong>
          {Object.entries(props.preview.dependencies.missing)
            .filter(([, values]) => values.length)
            .map(([kind, values]) => (
              <p key={kind}>
                {kind}: {values.join(", ")}
              </p>
            ))}
        </div>
      )}
      {profile?.adjustments.length ? (
        <div>
          <h3>Policy adjustments</h3>
          <div className="adjustment-list">
            {profile.adjustments.map((item, index) => (
              <div key={`${item.field}-${index}`}>
                <strong>{item.field}</strong>
                <span>{item.reason}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="success-line">
          <Check size={16} />
          Requested authority fits the current harness policy.
        </p>
      )}
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={props.draft.makeDefault}
          onChange={(event) => props.setDefault(event.target.checked)}
        />
        <span>
          <strong>Use as default</strong>
          <small>New chats start with this identity.</small>
        </span>
      </label>
    </div>
  );
}
