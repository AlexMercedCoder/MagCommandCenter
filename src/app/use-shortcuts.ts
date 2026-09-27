import { useEffect } from "react";
import { createChatSession } from "../features/chat/chat-actions";
import {
  normalizeShortcut,
  shortcutConflicts,
  shortcutFromEvent,
  type ShortcutMap,
} from "../lib/keybindings";
import { useAppStore } from "../stores/app-store";
import type { Runtimes } from "./runtime-context";

/** Global keyboard shortcuts (palette, navigation, new session, Escape). */
export function useShortcuts(runtimes: Pick<Runtimes, "profiles">) {
  const shortcuts = useAppStore((state) => state.shortcuts);
  const { profiles, defaultProfile } = runtimes.profiles;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { set, navigate, paletteOpen } = useAppStore.getState();
      const pressed = shortcutFromEvent(event);
      const editable =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable);
      if (pressed === normalizeShortcut(shortcuts.palette)) {
        event.preventDefault();
        set({ paletteOpen: !paletteOpen });
        return;
      }
      if (!editable && shortcutConflicts(shortcuts).length === 0) {
        const action = (
          Object.entries(shortcuts) as Array<[keyof ShortcutMap, string]>
        ).find(([, value]) => normalizeShortcut(value) === pressed)?.[0];
        if (action) event.preventDefault();
        if (action === "newSession")
          createChatSession({ profiles, defaultProfile });
        if (action === "workspace") navigate("workspace");
        if (action === "runs") navigate("runs");
        if (action === "graphs") navigate("graphs");
        if (action === "tools") navigate("tools");
        if (action === "help") navigate("docs");
      }
      if (event.key === "Escape")
        set({ paletteOpen: false, mobileNavOpen: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, profiles, defaultProfile]);
}
