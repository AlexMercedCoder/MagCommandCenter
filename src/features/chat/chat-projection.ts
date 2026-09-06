type EventLike = Record<string, unknown>;

export type ChatProjection = {
  assistantText: string;
  progress: string[];
};

function record(value: unknown): EventLike | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as EventLike)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rawText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function decoded(value: unknown): EventLike | null {
  if (typeof value !== "string") return record(value);
  const candidate = value.replace(/^(?:stdout|stderr|status):\s*/, "").trim();
  if (!candidate.startsWith("{")) return null;
  try {
    return record(JSON.parse(candidate));
  } catch {
    return null;
  }
}

function eventContent(event: EventLike): string {
  const detail = record(event.detail);
  return (
    text(event.content) ||
    text(event.text) ||
    text(event.response) ||
    text(event.answer) ||
    text(event.message) ||
    text(detail?.content) ||
    text(detail?.text) ||
    text(detail?.response) ||
    text(detail?.message)
  );
}

function eventChunkContent(event: EventLike): string {
  const detail = record(event.detail);
  return (
    rawText(event.content) ||
    rawText(event.text) ||
    rawText(event.response) ||
    rawText(event.message) ||
    rawText(detail?.content) ||
    rawText(detail?.text) ||
    rawText(detail?.response) ||
    rawText(detail?.message)
  );
}

function progressContent(event: EventLike): string {
  const detail = record(event.detail);
  const activity = record(event.activity) ?? record(detail?.activity);
  const phase = text(activity?.phase);
  const intent = text(activity?.intent);
  const expected = text(activity?.expected);
  if (intent) return expected ? `${intent} — ${expected}` : intent;
  if (phase) return phase.replace(/_/g, " ");
  const kind = text(event.type);
  if (kind.includes("model_round_started"))
    return "Preparing the next model response";
  if (kind.includes("model_round_finished")) return "Model response received";
  return "";
}

function flatten(events: unknown[]): EventLike[] {
  const flattened: EventLike[] = [];
  for (const value of events) {
    const outer = record(value);
    if (!outer) continue;
    const parsed = decoded(outer.detail);
    const candidate = parsed ?? outer;
    flattened.push(candidate);
    if (Array.isArray(candidate.events)) {
      flattened.push(
        ...(candidate.events.map(record).filter(Boolean) as EventLike[]),
      );
    }
  }
  return flattened;
}

/** Project stable user-visible conversation and lifecycle summaries from MagAgent events. */
export function projectChatEvents(events: unknown[]): ChatProjection {
  const chunks: string[] = [];
  let finalMessage = "";
  const progress: string[] = [];
  for (const event of flatten(events)) {
    const kind = text(event.type).toLowerCase();
    const content = eventContent(event);
    if (kind === "assistant_message" || kind.endsWith(".assistant_message")) {
      finalMessage = content || finalMessage;
    } else if (
      ["chunk", "assistant_chunk", "message_chunk", "response_chunk"].some(
        (name) => kind === name || kind.endsWith(`.${name}`),
      ) &&
      content
    ) {
      chunks.push(eventChunkContent(event));
    }
    const summary = progressContent(event);
    if (summary && progress[progress.length - 1] !== summary)
      progress.push(summary);
  }
  return {
    assistantText: finalMessage || chunks.join(""),
    progress: progress.slice(-5),
  };
}

export function responseAssistantText(value: EventLike | null): string {
  if (!value) return "";
  const direct = eventContent(value);
  if (direct) return direct;
  if (Array.isArray(value.events)) {
    return projectChatEvents(value.events).assistantText;
  }
  return "";
}
