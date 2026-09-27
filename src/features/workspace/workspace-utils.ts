import type { Toast } from "../../lib/types";

export const MAX_CONTEXT_FILES = 20;
export const MAX_CONTEXT_BYTES = 750 * 1024;

export type Notify = (text: string, tone?: Toast["tone"]) => void;

export function statusPath(line: string) {
  const value = line.slice(3).trim();
  const renamed = value.split(" -> ");
  return value.includes(" -> ") ? renamed[renamed.length - 1] || value : value;
}

export function message(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
