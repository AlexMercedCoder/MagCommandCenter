import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import type { Toast } from "../lib/types";

type WakeLockSentinelLike = {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
};
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
};

export function KeepAwakePanel(props: {
  notify: (text: string, tone?: Toast["tone"]) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const lock = useRef<WakeLockSentinelLike | null>(null);

  async function enable() {
    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!wakeLock) {
      props.notify(
        "This platform does not expose the screen wake-lock API.",
        "bad",
      );
      return;
    }
    try {
      lock.current = await wakeLock.request("screen");
      lock.current.addEventListener("release", () => setEnabled(false));
      setEnabled(true);
      props.notify(
        "The display will stay awake while Command Center remains visible.",
        "good",
      );
    } catch (reason) {
      props.notify(
        reason instanceof Error
          ? reason.message
          : "Could not acquire wake lock",
        "bad",
      );
    }
  }

  async function disable() {
    await lock.current?.release();
    lock.current = null;
    setEnabled(false);
  }

  useEffect(
    () => () => {
      void lock.current?.release();
    },
    [],
  );

  return (
    <section className="panel keep-awake">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Long runs</p>
          <h3>Keep display awake</h3>
        </div>
        {enabled ? <Sun /> : <Moon />}
      </div>
      <p className="field-help">
        Opt in while monitoring long local runs. The lock releases when this
        window closes or the operating system revokes it.
      </p>
      <button
        className={enabled ? "danger-action" : "primary-action"}
        onClick={() => void (enabled ? disable() : enable())}
        type="button"
      >
        {enabled ? "Release wake lock" : "Keep awake"}
      </button>
    </section>
  );
}
