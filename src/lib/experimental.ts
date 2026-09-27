/**
 * Opt-in flags for features that are not part of the stable 1.0 surface.
 *
 * Flags are per-device conveniences stored in localStorage. They default to off, so a
 * fresh install never shows an experimental control until the user turns it on.
 */
const REMOTE_RUNTIME_KEY = "mcc.experimental.remoteRuntime";

export function remoteRuntimeEnabled(): boolean {
  try {
    return localStorage.getItem(REMOTE_RUNTIME_KEY) === "true";
  } catch {
    return false;
  }
}

export function setRemoteRuntimeEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(REMOTE_RUNTIME_KEY, "true");
    else localStorage.removeItem(REMOTE_RUNTIME_KEY);
  } catch {
    // Storage can be unavailable; the flag then lasts only for this session.
  }
}
