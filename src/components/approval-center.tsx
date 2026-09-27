import { useEffect, useRef, useState } from "react";
import { useModalFocus } from "../lib/use-modal-focus";
import {
  decideApproval,
  approvalSnapshot,
  subscribeApprovals,
  subscribeApprovalOutcomes,
  type AAISChoice,
  type PendingAAISApproval,
} from "../magent";

type Props = {
  notify: (message: string, tone?: "good" | "bad") => void;
};

const outcomeTitles: Record<string, string> = {
  approved: "Approved",
  denied: "Denied",
  cancelled: "Cancelled",
  expired: "Expired",
  interrupted: "Approval interrupted",
};

export function ApprovalCenter({ notify }: Props) {
  const [pending, setPending] = useState<PendingAAISApproval[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Escape (or "Decide later") hides a request without deciding it (D9). The request
  // stays pending in the native runtime and the waiting pill brings it back.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => subscribeApprovals(setPending), []);

  const active = pending.find(
    (item) => !dismissed.has(item.envelope.request.id),
  );
  const dialog = useRef<HTMLElement>(null);
  const reopen = useRef<HTMLButtonElement>(null);
  useModalFocus(dialog, active?.envelope.request.id);
  useEffect(
    () =>
      subscribeApprovalOutcomes((outcome) => {
        notify(
          `${outcomeTitles[outcome.outcome] ?? outcome.outcome}: ${outcome.message}`,
          outcome.outcome === "approved" ? "good" : "bad",
        );
      }),
    [notify],
  );
  useEffect(() => {
    // Forget dismissals for requests that are no longer pending.
    setDismissed((current) => {
      const live = new Set(pending.map((item) => item.envelope.request.id));
      const next = new Set([...current].filter((id) => live.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [pending]);
  useEffect(() => {
    if (!active) return;
    const id = active.envelope.request.id;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setDismissed((current) => new Set(current).add(id));
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [active]);

  if (!active) {
    if (!pending.length) return null;
    return (
      <button
        ref={reopen}
        type="button"
        className="approval-waiting"
        onClick={() => setDismissed(new Set())}
      >
        <span className="approval-waiting-dot" aria-hidden="true" />
        {pending.length} permission request{pending.length === 1 ? "" : "s"}{" "}
        waiting · Review
      </button>
    );
  }
  const item = active;
  const request = item.envelope.request;
  const dismiss = () =>
    setDismissed((current) => new Set(current).add(request.id));

  async function decide(choice: AAISChoice) {
    setSubmitting(true);
    try {
      await decideApproval(item, choice);
      if (
        approvalSnapshot().some(
          (entry) => entry.envelope.request.id === request.id,
        )
      ) {
        notify("Decision sent. Waiting for the harness receipt.");
      }
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Could not submit approval",
        "bad",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="approval-backdrop" role="presentation">
      <section
        ref={dialog}
        tabIndex={-1}
        className="approval-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="approval-title"
        aria-describedby="approval-summary"
      >
        <div className="approval-heading">
          <div>
            <p className="eyebrow">Permission required</p>
            <h2 id="approval-title">{request.action.name}</h2>
          </div>
          <span className={`approval-risk risk-${request.risk.level}`}>
            {request.risk.level} risk
          </span>
        </div>
        <p id="approval-summary" className="approval-summary">
          {request.action.summary}
        </p>
        {request.origin && (
          <p>From {Object.values(request.origin).join(" · ")}</p>
        )}
        {request.expires_at && (
          <p>Expires {new Date(request.expires_at).toLocaleString()}</p>
        )}
        {active.sent && (
          <p role="status">
            Decision sent; waiting for the harness to resolve it.
          </p>
        )}
        {request.action.working_directory && (
          <dl className="approval-facts">
            <dt>Working directory</dt>
            <dd>{request.action.working_directory}</dd>
          </dl>
        )}
        {request.risk.reasons?.length ? (
          <div className="approval-reasons">
            <strong>Why confirmation is needed</strong>
            <ul>
              {request.risk.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <details className="approval-details">
          <summary>Review exact arguments</summary>
          <pre>{JSON.stringify(request.action.arguments ?? {}, null, 2)}</pre>
          <small>Action digest: {request.action_digest}</small>
        </details>
        <div className="approval-actions">
          {[
            // Refusals first so Deny sits beside Decide later, away from Allow.
            ...request.choices.filter(
              (choice) => choice.decision !== "approve",
            ),
            ...request.choices.filter(
              (choice) => choice.decision === "approve",
            ),
          ].map((choice) => (
            <button
              className={
                choice.decision === "approve" ? "primary-action" : "icon-action"
              }
              disabled={
                submitting ||
                Boolean(
                  active.choice &&
                  (active.choice.decision !== choice.decision ||
                    active.choice.scope !== choice.scope),
                )
              }
              key={`${choice.decision}:${choice.scope}`}
              onClick={() => void decide(choice)}
            >
              {active.choice ? `Retry ${choice.label}` : choice.label}
            </button>
          ))}
          <button
            type="button"
            className="icon-action approval-later"
            onClick={dismiss}
            aria-keyshortcuts="Escape"
          >
            Decide later
          </button>
        </div>
        <p className="approval-hint">
          Esc or <strong>Decide later</strong> hides this request. It stays
          pending and the agent keeps waiting; nothing is approved or denied.
        </p>
        {pending.length > 1 && (
          <p className="approval-queue">
            {pending.length - 1} more permission request
            {pending.length === 2 ? "" : "s"} waiting
          </p>
        )}
      </section>
    </div>
  );
}
