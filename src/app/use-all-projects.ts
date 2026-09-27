import { useMemo } from "react";
import { useAppStore } from "../stores/app-store";

/** Pinned projects first, then recent ones, without duplicates. */
export function useAllProjects() {
  const pinned = useAppStore((state) => state.pinnedProjects);
  const recent = useAppStore((state) => state.recentProjects);
  return useMemo(
    () => Array.from(new Set([...pinned, ...recent])).filter(Boolean),
    [pinned, recent],
  );
}
