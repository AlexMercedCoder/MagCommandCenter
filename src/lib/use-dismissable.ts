import { useEffect, type RefObject } from "react";

/**
 * Closes an open `<details>` popover on Escape (returning focus to its summary) or on a
 * pointer press outside it.
 */
export function useDismissableDetails(
  ref: RefObject<HTMLDetailsElement | null>,
) {
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const details = ref.current;
      if (details?.open && !details.contains(event.target as Node))
        details.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      const details = ref.current;
      if (event.key !== "Escape" || !details?.open) return;
      details.open = false;
      details.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref]);
}
