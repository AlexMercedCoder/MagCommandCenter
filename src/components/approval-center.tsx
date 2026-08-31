import { useEffect, useState } from "react";
import {
  decideApproval,
  subscribeApprovals,
  type AAISChoice,
  type PendingAAISApproval,
} from "../magent";

type Props = {
  notify: (message: string, tone?: "good" | "bad") => void;
};

export function ApprovalCenter({ notify }: Props) {
  const [pending, setPending] = useState<PendingAAISApproval[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => subscribeApprovals(setPending), []);

  const active = pending[0];
  if (!active) return null;
  const request = active.envelope.request;

  async function decide(choice: AAISChoice) {
    setSubmitting(true);
    try {
      await decideApproval(active, choice);
      notify(
        choice.decision === "approve"
          ? "Action approved"
          : choice.decision === "cancel"
            ? "Action cancelled"
            : "Action denied",
        choice.decision === "approve" ? "good" : undefined,
      );
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
          {request.choices.map((choice) => (
            <button
              className={choice.decision === "deny" ? "secondary" : "primary"}
              disabled={submitting}
              key={`${choice.decision}:${choice.scope}`}
              onClick={() => void decide(choice)}
            >
              {choice.label}
            </button>
          ))}
        </div>
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
