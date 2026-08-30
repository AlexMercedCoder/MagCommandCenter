import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  ArrowLeft,
  ArrowRight,
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
  applyTemplate,
  buildProfileDocument,
  draftFromDocument,
  emptyProfileDraft,
  type ProfileDraft,
} from "../features/profiles/profile-builder";

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

  const grouped = useMemo(() => {
    const groups: Record<string, typeof runtime.profiles> = {
      managed: [],
      user: [],
      project: [],
      portable: [],
      universal: [],
    };
    runtime.profiles.forEach((profile) => {
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
  }, [runtime.profiles]);

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

function ProfileBuilder(props: {
  contract: NonNullable<ProfileRuntime["contract"]>;
  draft: ProfileDraft;
  setDraft: (draft: ProfileDraft) => void;
  step: number;
  setStep: (step: number) => void;
  busy: boolean;
  error: string;
  preview: ProfileRuntime["preview"];
  models: ProfileRuntime["models"];
  onLoadModels: (provider: string) => Promise<void>;
  onReview: () => Promise<void>;
  onSave: () => Promise<void>;
  onClose: () => void;
  editing: boolean;
}) {
  const steps = [
    "Identity",
    "Behavior",
    "Authority",
    "Memory & Team",
    "Review",
  ];
  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) =>
    props.setDraft({ ...props.draft, [key]: value });
  const toggle = (items: string[], value: string) =>
    items.includes(value)
      ? items.filter((item) => item !== value)
      : [...items, value];
  const canContinue =
    props.step !== 0 ||
    Boolean(props.draft.name.trim() && props.draft.title.trim());

  return (
    <section className="profile-builder">
      <header className="profile-builder-header">
        <button
          className="icon-button"
          onClick={props.onClose}
          type="button"
          title="Close profile builder"
        >
          <X size={20} />
        </button>
        <div>
          <p className="label">
            {props.editing ? "Edit profile" : "New profile"}
          </p>
          <h2>{props.draft.title || "Create an agent"}</h2>
        </div>
      </header>
      <nav className="builder-steps" aria-label="Profile builder steps">
        {steps.map((label, index) => (
          <button
            className={
              index === props.step
                ? "active"
                : index < props.step
                  ? "complete"
                  : ""
            }
            onClick={() => props.setStep(index)}
            type="button"
            key={label}
          >
            <span>{index < props.step ? <Check size={14} /> : index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      {props.error && (
        <div className="inline-error" role="alert">
          {props.error}
        </div>
      )}
      <div className="builder-stage">
        {props.step === 0 && (
          <IdentityStep
            contract={props.contract}
            draft={props.draft}
            set={set}
            setDraft={props.setDraft}
          />
        )}
        {props.step === 1 && (
          <BehaviorStep
            contract={props.contract}
            draft={props.draft}
            set={set}
            models={props.models}
            onLoadModels={props.onLoadModels}
          />
        )}
        {props.step === 2 && (
          <AuthorityStep
            contract={props.contract}
            draft={props.draft}
            set={set}
            toggle={toggle}
          />
        )}
        {props.step === 3 && (
          <MemoryTeamStep
            contract={props.contract}
            draft={props.draft}
            set={set}
            toggle={toggle}
          />
        )}
        {props.step === 4 && (
          <ReviewStep
            draft={props.draft}
            preview={props.preview}
            setDefault={(value) => set("makeDefault", value)}
          />
        )}
      </div>
      <footer className="builder-footer">
        <button
          className="icon-action"
          onClick={() => props.setStep(Math.max(0, props.step - 1))}
          disabled={props.step === 0}
          type="button"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        {props.step < 3 && (
          <button
            className="primary-action"
            onClick={() => props.setStep(props.step + 1)}
            disabled={!canContinue}
            type="button"
          >
            <span>Continue</span>
            <ArrowRight size={16} />
          </button>
        )}
        {props.step === 3 && (
          <button
            className="primary-action"
            onClick={() => void props.onReview()}
            disabled={props.busy}
            type="button"
          >
            <ShieldCheck size={17} />
            <span>Review Authority</span>
          </button>
        )}
        {props.step === 4 && (
          <button
            className="primary-action"
            onClick={() => void props.onSave()}
            disabled={props.busy || !props.preview?.ok}
            type="button"
          >
            <Save size={17} />
            <span>{props.editing ? "Save Revision" : "Create Agent"}</span>
          </button>
        )}
      </footer>
    </section>
  );
}

type SetDraft = <K extends keyof ProfileDraft>(
  key: K,
  value: ProfileDraft[K],
) => void;

function IdentityStep(props: {
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

function BehaviorStep(props: {
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

function AuthorityStep(props: {
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

function MemoryTeamStep(props: {
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

function ReviewStep(props: {
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

function EffectiveAuthority({
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

function ProfileSections(props: {
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

function ProfileMark({
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

function profileColor(annotations?: Record<string, unknown>) {
  return String(annotations?.["dev.magcommandcenter.color"] ?? "");
}
function profileTitle(document: {
  metadata: { name: string; annotations?: Record<string, unknown> };
}) {
  return String(
    document.metadata.annotations?.["dev.magcommandcenter.title"] ??
      document.metadata.name,
  );
}
function profileScope(source: string) {
  return source.includes("/.magent/")
    ? "project"
    : source.includes("/.agentprofiles/")
      ? "universal"
      : source.includes("/.agents/")
        ? "portable"
        : "user";
}
function profileGroupHelp(group: string) {
  if (group === "managed") return "built-in, read-only";
  if (group === "project") return "editable in this project";
  if (group === "portable")
    return "shared from this project's .agents directory";
  if (group === "universal")
    return "shared across compatible harnesses on this computer";
  return "available to this MagAgent user";
}
