import { minimumMagentVersion } from "./constants";
import type { SystemInfo } from "./types";
import { compareVersions } from "./utils";

/** Contract MagAgent 1.4 added for per-run memory evidence (G-3). */
export const MEMORY_EVIDENCE_CONTRACT = "magent.run-memory-evidence.v1";

export type Compatibility = {
  ok: boolean;
  contractsOk: boolean;
  /** True when a pre-release build (still numbered below the minimum) advertises the 1.4 contracts. */
  viaContracts: boolean;
};

/**
 * Mag Command Center needs MagAgent 1.4.0. A development build of MagAgent keeps its
 * previous version number until release, so a build that already advertises the 1.4
 * memory-evidence contract is accepted too: the app negotiates contracts, not labels.
 */
export function magentCompatibility(system: SystemInfo | null): Compatibility {
  const contracts = system?.contracts;
  const contractsOk =
    contracts?.desktop_cli?.version === "1" &&
    contracts?.task?.version === "magent.task.v2" &&
    contracts?.task_event?.version === "magent.task-event.v1" &&
    contracts?.memory_recall?.version === "2";
  const versionOk =
    compareVersions(system?.magent_version, minimumMagentVersion) >= 0;
  const viaContracts =
    !versionOk &&
    compareVersions(system?.magent_version, "1.3.0") >= 0 &&
    contracts?.memory_evidence?.version === MEMORY_EVIDENCE_CONTRACT;
  return {
    ok: Boolean(contractsOk && (versionOk || viaContracts)),
    contractsOk: Boolean(contractsOk),
    viaContracts: Boolean(contractsOk && viaContracts),
  };
}
