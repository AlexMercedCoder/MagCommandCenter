import { loroAdapter } from "./loro-adapter";
import { magentAdapter } from "./magent-adapter";
import type { HarnessAdapter, HarnessId } from "./types";

export const harnesses: Record<HarnessId, HarnessAdapter> = {
  magent: magentAdapter,
  loro: loroAdapter,
};

export function harnessFor(id: string | undefined): HarnessAdapter {
  return id === "loro" ? loroAdapter : magentAdapter;
}

const LORO_FLAG = "mcc.experimental.loroHarness";

/** Loro appears in Chat only after opting in under Settings > Experimental features. */
export function loroHarnessEnabled(): boolean {
  try {
    return localStorage.getItem(LORO_FLAG) === "true";
  } catch {
    return false;
  }
}

export function setLoroHarnessEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(LORO_FLAG, "true");
    else localStorage.removeItem(LORO_FLAG);
  } catch {
    // Storage unavailable: the choice lasts for this session only.
  }
}
