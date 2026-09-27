import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  Bot,
  Check,
  Copy,
  Download,
  Network,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ProjectCrew } from "../lib/types";
import type { ProfileRuntime } from "../features/profiles/use-profile-runtime";
import {
  buildProfileDocument,
  draftFromDocument,
  emptyProfileDraft,
  type ProfileDraft,
} from "../features/profiles/profile-builder";
import { ProfileBuilder } from "../features/profiles/profile-builder-view";
import {
  EffectiveAuthority,
  ProfileMark,
  ProfileSections,
  profileColor,
  profileGroupHelp,
  profileScope,
  profileTitle,
} from "../features/profiles/profile-sections";

export function AgentsPanel(props: {
  runtime: ProfileRuntime;
  project: string;
  crew: ProjectCrew;
  onCrewChange: (crew: ProjectCrew) => void;
  onUseInChat: (profile: string) => void;
}) {
  const { runtime } = props;
  const [builderOpen, setBuilderOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [generationName, setGenerationName] = useState("");
  const [generationStarted, setGenerationStarted] = useState<number | null>(
    null,
  );
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const [editingDigest, setEditingDigest] = useState("");
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    emptyProfileDraft(runtime.contract),
  );
  const [cloneName, setCloneName] = useState("");
  const [transferScope, setTransferScope] = useState("user");

  useEffect(() => {
    if (!builderOpen && runtime.contract)
      setDraft(emptyProfileDraft(runtime.contract));
  }, [runtime.contract, builderOpen]);

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

  const profiles = runtime.profiles;
  const grouped = useMemo(() => {
    const groups: Record<string, typeof profiles> = {
      managed: [],
      user: [],
      project: [],
      portable: [],
      universal: [],
    };
    profiles.forEach((profile) => {
      const key =
        profile.source === "managed"
          ? "managed"
          : profile.source.includes("/.magent/")
            ? "project"
            : profile.source.includes("/.agentprofiles/")
              ? "universal"
              : profile.source.includes("/.agents/")
                ? "portable"
                : "user";
      groups[key].push(profile);
    });
    return groups;
  }, [profiles]);

  function beginCreate() {
    setEditingDigest("");
    setDraft(emptyProfileDraft(runtime.contract));
    setStep(0);
    runtime.setPreview(null);
    setBuilderOpen(true);
  }

  async function generateDraft(event: React.FormEvent) {
    event.preventDefault();
    setGenerationStarted(Date.now());
    let result;
    try {
      result = await runtime.generateDocument(
        generationPrompt.trim(),
        generationName.trim(),
      );
    } finally {
      setGenerationStarted(null);
    }
    if (!result || !runtime.contract) return;
    setEditingDigest("");
    setDraft(draftFromDocument(result.document, "project"));
    setStep(4);
    setGeneratorOpen(false);
    setBuilderOpen(true);
  }

  function beginEdit() {
    if (!runtime.selected) return;
    setEditingDigest(runtime.selected.profile_digest);
    setDraft(
      draftFromDocument(
        runtime.selected.document,
        profileScope(runtime.selected.source),
      ),
    );
    setStep(0);
    runtime.setPreview(null);
    setBuilderOpen(true);
  }

  async function reviewDraft() {
    if (!runtime.contract) return;
    await runtime.previewDocument(
      buildProfileDocument(draft, runtime.contract),
    );
    setStep(4);
  }

  async function saveDraft() {
    if (!runtime.contract) return;
    const result = await runtime.saveDocument(
      buildProfileDocument(draft, runtime.contract),
      draft.scope,
      editingDigest,
      draft.makeDefault,
    );
    if (result) setBuilderOpen(false);
  }

  async function importProfile() {
    const source = await open({
      multiple: false,
      filters: [
        {
          name: "Open Agent Profile",
          extensions: ["md", "yaml", "yml", "json"],
        },
      ],
    });
    if (typeof source === "string")
      await runtime.importProfile(source, transferScope);
  }

  async function exportProfile() {
    if (!runtime.selected) return;
    const output = await saveDialog({
      defaultPath: `${runtime.selected.name}.md`,
      filters: [{ name: "Open Agent Profile", extensions: ["md"] }],
    });
    if (output) await runtime.exportProfile(runtime.selected.name, output);
  }

  function updateCrew(profile: string, role: string, enabled: boolean) {
    const existing = props.crew.members.filter(
      (item) => item.profile !== profile,
    );
    props.onCrewChange({
      ...props.crew,
      members: enabled
        ? [...existing, { profile, role: role || "Specialist" }]
        : existing,
      coordinator:
        !enabled && props.crew.coordinator === profile
          ? ""
          : props.crew.coordinator,
    });
  }

  if (builderOpen && runtime.contract) {
    return (
      <ProfileBuilder
        contract={runtime.contract}
        draft={draft}
        setDraft={setDraft}
        step={step}
        setStep={setStep}
        busy={runtime.busy}
        error={runtime.error}
        preview={runtime.preview}
        models={runtime.models}
        onLoadModels={runtime.loadModels}
        onReview={reviewDraft}
        onSave={saveDraft}
        onClose={() => setBuilderOpen(false)}
        editing={Boolean(editingDigest)}
      />
    );
  }

  return (
    <section className="agent-center">
      <div className="agent-center-toolbar">
        <div>
          <p className="label">Open Agent Profiles</p>
          <h2>Agents</h2>
        </div>
        <div className="button-row">
          <button
            className="icon-action"
            onClick={() => void runtime.load()}
            disabled={runtime.busy}
            type="button"
            title="Refresh agent profiles"
          >
            <RefreshCcw size={16} />
            <span>Refresh</span>
          </button>
          <select
            aria-label="Import profile scope"
            value={transferScope}
            onChange={(event) => setTransferScope(event.target.value)}
          >
            <option value="user">User scope</option>
            <option value="project">Project scope</option>
            <option value="portable">Portable scope</option>
            <option value="universal">Universal ~/.agentprofiles scope</option>
          </select>
          <button
            className="icon-action"
            onClick={() => void importProfile()}
            disabled={runtime.busy}
            type="button"
          >
            <Upload size={16} />
            <span>Import</span>
          </button>
          <button
            className="icon-action"
            onClick={() => setGeneratorOpen(true)}
            type="button"
          >
            <Sparkles size={17} />
            <span>Generate Agent</span>
          </button>
          <button
            className="primary-action"
            onClick={beginCreate}
            type="button"
          >
            <Plus size={17} />
            <span>New Agent</span>
          </button>
        </div>
      </div>
      {generatorOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Generate agent profile"
        >
          <form className="agent-generator-dialog" onSubmit={generateDraft}>
            <div className="dialog-heading">
              <div>
                <p className="label">OAP profile author</p>
                <h2>Generate an agent</h2>
              </div>
              <button
                className="icon-action"
                type="button"
                onClick={() => setGeneratorOpen(false)}
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>
            <p>
              Describe the specialist, when it should be used, and its limits.
              The validated draft opens in the full five-step profile builder
              before anything is saved.
            </p>
            <label>
              What should this agent do?
              <textarea
                required
                rows={7}
                value={generationPrompt}
                onChange={(event) => setGenerationPrompt(event.target.value)}
              />
            </label>
            <label>
              Preferred name <small>(optional)</small>
              <input
                pattern="[a-z0-9][a-z0-9._-]*"
                value={generationName}
                onChange={(event) => setGenerationName(event.target.value)}
                placeholder="accessibility-reviewer"
              />
            </label>
            {generationStarted && (
              <div
                className="operation-health"
                role="status"
                aria-live="polite"
              >
                <span className="operation-spinner" aria-hidden="true" />
                <div>
                  <strong>Authoring and validating the profile</strong>
                  <p>
                    Capabilities and policy are being checked before the draft
                    opens.
                  </p>
                </div>
                <b>{generationElapsed}s</b>
              </div>
            )}
            <div className="button-row">
              <button
                className="icon-action"
                type="button"
                disabled={runtime.busy}
                onClick={() => setGeneratorOpen(false)}
              >
                Cancel
              </button>
              <button
                className="primary-action"
                type="submit"
                disabled={runtime.busy}
              >
                {runtime.busy ? "Generating…" : "Generate validated draft"}
              </button>
            </div>
          </form>
        </div>
      )}
      {runtime.error && (
        <div className="inline-error" role="alert">
          {runtime.error}
        </div>
      )}
      <div className="agent-center-layout">
        <aside className="agent-profile-rail" aria-label="Agent profiles">
          {Object.entries(grouped).map(
            ([group, profiles]) =>
              profiles.length > 0 && (
                <div className="agent-profile-group" key={group}>
                  <p className="label" title={profileGroupHelp(group)}>
                    {group}
                    <small> · {profileGroupHelp(group)}</small>
                  </p>
                  {profiles.map((profile) => (
                    <button
                      className={
                        runtime.selectedName === profile.name
                          ? "agent-profile-row active"
                          : "agent-profile-row"
                      }
                      key={profile.name}
                      onClick={() => runtime.setSelectedName(profile.name)}
                      type="button"
                    >
                      <ProfileMark
                        profile={profile.name}
                        color={
                          profile.name === runtime.selected?.name
                            ? profileColor(
                                runtime.selected.document.metadata.annotations,
                              )
                            : ""
                        }
                      />
                      <span>
                        <strong>{profile.name}</strong>
                        <small>
                          r{profile.revision} · {profile.trust}
                        </small>
                      </span>
                      {runtime.defaultProfile === profile.name && (
                        <span className="default-dot" title="Default profile" />
                      )}
                    </button>
                  ))}
                </div>
              ),
          )}
        </aside>
        <main className="agent-profile-detail">
          {runtime.selected && runtime.effective ? (
            <>
              <header className="agent-identity-header">
                <ProfileMark
                  profile={runtime.selected.name}
                  color={profileColor(
                    runtime.selected.document.metadata.annotations,
                  )}
                  large
                />
                <div>
                  <p className="label">
                    {runtime.selected.trust} profile · revision{" "}
                    {runtime.selected.revision}
                  </p>
                  <h2>{profileTitle(runtime.selected.document)}</h2>
                  <p>{runtime.selected.document.metadata.description}</p>
                </div>
                <div className="agent-header-actions">
                  <button
                    className="primary-action"
                    onClick={() => props.onUseInChat(runtime.selected!.name)}
                    type="button"
                  >
                    <Sparkles size={17} />
                    <span>Open Chat</span>
                  </button>
                  {runtime.defaultProfile !== runtime.selected.name && (
                    <button
                      className="icon-action"
                      onClick={() =>
                        void runtime.setDefault(runtime.selected!.name)
                      }
                      type="button"
                    >
                      <Check size={16} />
                      <span>Set Default</span>
                    </button>
                  )}
                  <button
                    className="icon-action"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Use ${runtime.selected!.name} for new Slack, Discord, and Telegram gateway sessions?`,
                        )
                      )
                        void runtime.useForGateways(runtime.selected!.name);
                    }}
                    type="button"
                  >
                    <Network size={16} />
                    <span>Use for Gateways</span>
                  </button>
                  {runtime.selected.source !== "managed" && (
                    <button
                      className="icon-action"
                      onClick={beginEdit}
                      type="button"
                    >
                      <Save size={16} />
                      <span>Edit</span>
                    </button>
                  )}
                </div>
              </header>
              <EffectiveAuthority profile={runtime.effective} />
              <ProfileSections
                runtime={runtime}
                crew={props.crew}
                updateCrew={updateCrew}
                setCoordinator={(profile) =>
                  props.onCrewChange({ ...props.crew, coordinator: profile })
                }
              />
              <div className="profile-utility-bar">
                <input
                  value={cloneName}
                  onChange={(event) => setCloneName(event.target.value)}
                  placeholder="copy-name"
                  aria-label="New profile copy name"
                />
                <select
                  aria-label="Duplicate profile scope"
                  value={transferScope}
                  onChange={(event) => setTransferScope(event.target.value)}
                >
                  <option value="user">User scope</option>
                  <option value="project">Project scope</option>
                  <option value="portable">Portable scope</option>
                  <option value="universal">
                    Universal ~/.agentprofiles scope
                  </option>
                </select>
                <button
                  className="icon-action"
                  onClick={() =>
                    void runtime.clone(
                      runtime.selected!.name,
                      cloneName,
                      transferScope,
                    )
                  }
                  disabled={!cloneName.trim()}
                  type="button"
                >
                  <Copy size={16} />
                  <span>Duplicate</span>
                </button>
                <button
                  className="icon-action"
                  onClick={() => void exportProfile()}
                  type="button"
                >
                  <Download size={16} />
                  <span>Export</span>
                </button>
                {runtime.selected.source !== "managed" && (
                  <button
                    className="danger-action"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete ${runtime.selected!.name}? This cannot be undone.`,
                        )
                      )
                        void runtime.remove(
                          runtime.selected!.name,
                          runtime.selected!.profile_digest,
                        );
                    }}
                    type="button"
                  >
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </button>
                )}
              </div>
              {runtime.revisions.length > 0 && (
                <details className="revision-drawer">
                  <summary>
                    Revision history ({runtime.revisions.length})
                  </summary>
                  <div className="revision-list">
                    {runtime.revisions.map((revision) => (
                      <div className="key-value-row" key={revision.path}>
                        <span>Revision {revision.revision}</span>
                        <button
                          className="icon-action"
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Restore revision ${revision.revision} of ${runtime.selected!.name}?`,
                              )
                            )
                              void runtime.restoreRevision(
                                runtime.selected!.name,
                                revision.path,
                                runtime.selected!.profile_digest,
                              );
                          }}
                        >
                          <RefreshCcw size={15} />
                          <span>Restore</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : runtime.selected ? (
            <div className="empty-state">
              <ShieldCheck size={28} />
              <p>
                Configure MagAgent to resolve this profile's effective tools,
                permissions, provider, and model.
              </p>
            </div>
          ) : (
            <div className="empty-state">
              <Bot size={28} />
              <p>Select an agent profile.</p>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
