import { invoke } from "@tauri-apps/api/core";

export async function loadAppState<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await invoke<T | null>("load_app_state", { key });
    if (value !== null && value !== undefined) return value;
    await saveAppState(key, fallback);
  } catch {
    // Browser previews and older app builds use the caller's migration fallback.
  }
  return fallback;
}

export async function saveAppState<T>(key: string, value: T): Promise<void> {
  await invoke("save_app_state", { key, value });
}
