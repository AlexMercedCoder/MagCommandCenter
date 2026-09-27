import {
  ArrowLeft,
  ArrowRight,
  Check,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import type { ProfileRuntime } from "../../features/profiles/use-profile-runtime";
import { type ProfileDraft } from "../../features/profiles/profile-builder";
import {
  AuthorityStep,
  BehaviorStep,
  IdentityStep,
  MemoryTeamStep,
  ReviewStep,
} from "./profile-builder-steps";

export function ProfileBuilder(props: {
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

export type SetDraft = <K extends keyof ProfileDraft>(
  key: K,
  value: ProfileDraft[K],
) => void;
