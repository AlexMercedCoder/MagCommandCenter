import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProjectCrew } from "../../lib/types";
import type { ProfileRuntime } from "../../features/profiles/use-profile-runtime";

export function EffectiveAuthority({
  profile,
}: {
  profile: ProfileRuntime["effective"] | undefined;
}) {
  if (!profile) return null;
  return (
    <div className="authority-strip">
      <div>
        <span>Provider</span>
        <strong>{profile.provider || "default"}</strong>
        <small>{profile.model || "default model"}</small>
      </div>
      <div>
        <span>Permission</span>
        <strong>{profile.permission_mode}</strong>
        <small>{profile.network_access} network</small>
      </div>
      <div>
        <span>Tools</span>
        <strong>{profile.tools.length}</strong>
        <small>
          {profile.skills?.length ?? 0} skills ·{" "}
          {profile.mcp_servers?.length ?? 0} MCP
        </small>
      </div>
      <div>
        <span>Delegation</span>
        <strong>{profile.max_subagents}</strong>
        <small>
          {profile.max_parallel_subagents} parallel · depth{" "}
          {profile.max_delegation_depth}
        </small>
      </div>
    </div>
  );
}

export function ProfileSections(props: {
  runtime: ProfileRuntime;
  crew: ProjectCrew;
  updateCrew: (profile: string, role: string, enabled: boolean) => void;
  setCoordinator: (profile: string) => void;
}) {
  const profile = props.runtime.selected!;
  const effective = props.runtime.effective!;
  const crewMember = props.crew.members.find(
    (item) => item.profile === profile.name,
  );
  const [role, setRole] = useState(crewMember?.role ?? "Specialist");
  useEffect(
    () => setRole(crewMember?.role ?? "Specialist"),
    [crewMember?.role, profile.name],
  );
  return (
    <div className="profile-section-grid">
      <section>
        <h3>Role</h3>
        <p className="profile-instructions">
          {String(profile.document.spec.role.instructions ?? "")}
        </p>
        <div className="tag-row">
          {profile.extends.map((name) => (
            <span className="status-chip info" key={name}>
              extends {name}
            </span>
          ))}
        </div>
      </section>
      <section>
        <h3>Capabilities</h3>
        <div className="tag-row">
          {effective.tools.slice(0, 18).map((tool) => (
            <span className="status-chip" key={tool}>
              {tool}
            </span>
          ))}
          {effective.tools.length > 18 && (
            <span className="status-chip info">
              +{effective.tools.length - 18}
            </span>
          )}
        </div>
      </section>
      <section>
        <h3>Memory</h3>
        {effective.memory_stores.map((store) => (
          <div className="key-value-row" key={`${store.kind}-${store.name}`}>
            <span>{store.name}</span>
            <strong>
              {store.kind} · {store.mode}
            </strong>
          </div>
        ))}
      </section>
      <section>
        <h3>Project crew</h3>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={Boolean(crewMember)}
            onChange={(event) =>
              props.updateCrew(profile.name, role, event.target.checked)
            }
          />
          <span>
            <strong>Assigned to this project</strong>
            <small>{props.crew.project}</small>
          </span>
        </label>
        {crewMember && (
          <>
            <label>
              Role
              <input
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                  props.updateCrew(profile.name, event.target.value, true);
                }}
              />
            </label>
            <label className="toggle-row">
              <input
                type="radio"
                name="coordinator"
                checked={props.crew.coordinator === profile.name}
                onChange={() => props.setCoordinator(profile.name)}
              />
              <span>
                <strong>Coordinator</strong>
                <small>Used as the suggested lead for new project work.</small>
              </span>
            </label>
          </>
        )}
      </section>
      <section>
        <h3>Profile state inbox</h3>
        {props.runtime.inbox.length ? (
          props.runtime.inbox.map((delta) => (
            <div className="delta-row" key={String(delta.id)}>
              <div>
                <strong>{String(delta.profile ?? profile.name)}</strong>
                <small>
                  {String(delta.evidence ?? "Pending state proposal")}
                </small>
              </div>
              <button
                className="icon-button"
                onClick={() =>
                  void props.runtime.decideDelta(String(delta.id), "accept")
                }
                title="Accept state proposal"
                type="button"
              >
                <Check size={16} />
              </button>
              <button
                className="icon-button"
                onClick={() =>
                  void props.runtime.decideDelta(String(delta.id), "reject")
                }
                title="Reject state proposal"
                type="button"
              >
                <X size={16} />
              </button>
            </div>
          ))
        ) : (
          <p className="muted">No pending state proposals.</p>
        )}
      </section>
      <section>
        <h3>Identity & trust</h3>
        <div className="key-value-row">
          <span>Source</span>
          <strong>{profile.source}</strong>
        </div>
        <div className="key-value-row">
          <span>Trust</span>
          <strong>{profile.trust}</strong>
        </div>
        <div className="key-value-row">
          <span>Resolution</span>
          <strong title={profile.resolution_digest}>
            {profile.resolution_digest.slice(0, 20)}…
          </strong>
        </div>
      </section>
    </div>
  );
}

export function ProfileMark({
  profile,
  color,
  large = false,
}: {
  profile: string;
  color: string;
  large?: boolean;
}) {
  return (
    <span
      className={large ? "profile-mark large" : "profile-mark"}
      style={{ backgroundColor: color || undefined }}
      aria-hidden="true"
    >
      {profile.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function profileColor(annotations?: Record<string, unknown>) {
  return String(annotations?.["dev.magcommandcenter.color"] ?? "");
}
export function profileTitle(document: {
  metadata: { name: string; annotations?: Record<string, unknown> };
}) {
  return String(
    document.metadata.annotations?.["dev.magcommandcenter.title"] ??
      document.metadata.name,
  );
}
export function profileScope(source: string) {
  return source.includes("/.magent/")
    ? "project"
    : source.includes("/.agentprofiles/")
      ? "universal"
      : source.includes("/.agents/")
        ? "portable"
        : "user";
}
export function profileGroupHelp(group: string) {
  if (group === "managed") return "built-in, read-only";
  if (group === "project") return "editable in this project";
  if (group === "portable")
    return "shared from this project's .agents directory";
  if (group === "universal")
    return "shared across compatible harnesses on this computer";
  return "available to this MagAgent user";
}
