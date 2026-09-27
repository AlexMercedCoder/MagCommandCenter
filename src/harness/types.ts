/**
 * HarnessAdapter: the seam between Command Center and an agent CLI (Phase 6).
 *
 * MagAgent is the first implementation and the default. Loro is the second and is
 * experimental here. Every harness is spawned natively, streams lines on the shared
 * `magent-stream` event, answers AAIS approvals over stdin, and stops as a process tree.
 */
import type { MagentCommandResult, MagentStreamEvent } from "../magent";

export type HarnessId = "magent" | "loro";

export type HarnessCapabilities = {
  /** Live output while a run is in progress. */
  streaming: boolean;
  /** AAIS 1.0 approval requests over --approval-stdio. */
  approvals: boolean;
  /** Stop ends the whole process tree. */
  cancel: boolean;
  /** Durable MagAgent execution tasks (Runs view, recovery after restart). */
  durableTasks: boolean;
  /** Open Agent Profiles selected with --agent. */
  profiles: boolean;
  /** Agentic Graph runs from the Graph Board. */
  graphs: boolean;
  /** MagGraph memory and per-run memory evidence. */
  memory: boolean;
  /** Works through the experimental remote runtime. */
  remote: boolean;
};

export type HarnessDetection = {
  available: boolean;
  version?: string | null;
  command: string;
  error?: string | null;
};

export type AskRequest = {
  prompt: string;
  project: string;
  profile?: string;
  permissionMode?: string;
  /** MagAgent durable task to attach to (ignored by harnesses without durable tasks). */
  executionTaskId?: string;
};

export type AskResult = {
  result: MagentCommandResult;
  /** Parsed JSON result document, when the harness printed one. */
  data: Record<string, unknown> | null;
  /** The assistant's reply for the transcript. */
  text: string;
};

export interface HarnessAdapter {
  id: HarnessId;
  label: string;
  experimental: boolean;
  capabilities: HarnessCapabilities;
  detect(): Promise<HarnessDetection>;
  /** Machine-readable contracts the harness advertises. */
  contracts(): Promise<Record<string, unknown>>;
  /** Spawns a run and streams its output until it ends. */
  ask(
    request: AskRequest,
    onEvent: (event: MagentStreamEvent) => void,
    options: { id: string },
  ): Promise<AskResult>;
  /** Writes an AAIS `approval.decided` envelope to the run. */
  decide(streamId: string, envelopeLine: string): Promise<boolean>;
  /** Stops the run and everything it started. */
  cancel(streamId: string): Promise<boolean>;
}
