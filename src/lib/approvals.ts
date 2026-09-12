import {
  desktopAvailable,
  desktopInvoke,
  runtimeTransportKind,
} from "./desktop";

export type AAISChoice = {
  decision: "approve" | "deny" | "cancel";
  scope: "once" | "session" | "persistent";
  label: string;
  scope_constraints?: Record<string, unknown>;
};
export type AAISRequestEnvelope = {
  aais: "1.0";
  type: "approval.requested";
  id: string;
  occurred_at: string;
  sequence: number;
  stream: string;
  request: {
    id: string;
    created_at?: string;
    expires_at?: string;
    origin?: Record<string, string>;
    action_digest: string;
    action: {
      kind: string;
      name: string;
      summary: string;
      arguments?: Record<string, unknown>;
      working_directory?: string;
      effects?: string[];
    };
    risk: { level: string; reasons?: string[] };
    choices: AAISChoice[];
  };
};
export type PendingAAISApproval = {
  streamId: string;
  envelope: AAISRequestEnvelope;
  sent?: boolean;
  choice?: AAISChoice;
};
export type ApprovalOutcome = {
  request_id: string;
  outcome: string;
  message: string;
};
type Snapshot = {
  pending: PendingAAISApproval[];
  receipts: { envelope: { id: string; resolution: ApprovalOutcome } }[];
};
let pending: PendingAAISApproval[] = [];
let refreshing: Promise<void> | null = null;
const receipts = new Set<string>();
const decisionKey = (id: string) => `mcc.aais.decision.${id}`;

export function approvalSnapshot() {
  return pending;
}

export function refreshApprovals(): Promise<void> {
  if (!desktopAvailable() || runtimeTransportKind() !== "native")
    return Promise.resolve();
  if (refreshing) return refreshing;
  refreshing = desktopInvoke<Snapshot>("approval_snapshot")
    .then((snapshot) => {
      if (!snapshot || !Array.isArray(snapshot.pending)) return;
      const previous = pending;
      pending = snapshot.pending.map((item) => ({
        ...item,
        sent:
          sessionStorage.getItem(
            decisionKey(item.envelope.request.id) + ".delivered",
          ) === "true",
        choice: JSON.parse(
          sessionStorage.getItem(decisionKey(item.envelope.request.id)) ||
            "null",
        )?.decision,
      }));
      for (const item of snapshot.receipts ?? []) {
        if (receipts.has(item.envelope.id)) continue;
        receipts.add(item.envelope.id);
        if (receipts.size > 100)
          receipts.delete(receipts.values().next().value!);
        const outcome = item.envelope.resolution;
        if (
          previous.some(
            (request) => request.envelope.request.id === outcome.request_id,
          )
        ) {
          window.dispatchEvent(
            new CustomEvent("mcc-aais-outcome", { detail: outcome }),
          );
        }
        sessionStorage.removeItem(decisionKey(outcome.request_id));
      }
      for (const item of previous) {
        const id = item.envelope.request.id;
        if (!pending.some((value) => value.envelope.request.id === id)) {
          sessionStorage.removeItem(decisionKey(id));
        }
      }
      window.dispatchEvent(
        new CustomEvent("mcc-aais-approvals", { detail: pending }),
      );
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export function subscribeApprovals(
  listener: (requests: PendingAAISApproval[]) => void,
) {
  const handler = (event: Event) =>
    listener((event as CustomEvent<PendingAAISApproval[]>).detail);
  window.addEventListener("mcc-aais-approvals", handler);
  listener(pending);
  const refresh = () => {
    void refreshApprovals().catch(() => undefined);
  };
  refresh();
  const timer = window.setInterval(refresh, 800);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("mcc-aais-approvals", handler);
  };
}

export function subscribeApprovalOutcomes(
  listener: (outcome: ApprovalOutcome) => void,
) {
  const handler = (event: Event) =>
    listener((event as CustomEvent<ApprovalOutcome>).detail);
  window.addEventListener("mcc-aais-outcome", handler);
  return () => window.removeEventListener("mcc-aais-outcome", handler);
}

export async function decideApproval(
  item: PendingAAISApproval,
  choice: AAISChoice,
): Promise<void> {
  const request = item.envelope.request;
  if (request.expires_at && Date.parse(request.expires_at) <= Date.now()) {
    throw new Error(
      "This approval expired; wait for a new request from the harness.",
    );
  }
  if (
    choice.decision !== "cancel" &&
    !request.choices.some(
      (offered) =>
        offered.decision === choice.decision && offered.scope === choice.scope,
    )
  ) {
    throw new Error(
      "The requested approval choice was not offered by the harness.",
    );
  }
  const key = decisionKey(request.id);
  const stored = sessionStorage.getItem(key);
  const envelope = stored
    ? JSON.parse(stored)
    : {
        aais: "1.0",
        type: "approval.decided",
        id: `evt_${crypto.randomUUID()}`,
        occurred_at: new Date().toISOString(),
        sequence: Date.now(),
        stream: `presenter_${item.streamId}`,
        decision: {
          id: `dec_${crypto.randomUUID()}`,
          request_id: request.id,
          action_digest: request.action_digest,
          decided_at: new Date().toISOString(),
          decision: choice.decision,
          scope: choice.scope,
          actor: {
            id: "local-user",
            type: "human",
            authenticated_by: "tauri-local-session",
          },
        },
      };
  if (
    envelope.decision.decision !== choice.decision ||
    envelope.decision.scope !== choice.scope
  ) {
    throw new Error(
      "A decision was already sent. Wait for its authority receipt or cancel the run.",
    );
  }
  sessionStorage.setItem(key, JSON.stringify(envelope));
  const written = await desktopInvoke<boolean>("write_magent_stream", {
    id: item.streamId,
    line: JSON.stringify(envelope),
  });
  if (!written)
    throw new Error("The harness did not accept the decision for delivery.");
  sessionStorage.setItem(key + ".delivered", "true");
  await refreshApprovals();
}
