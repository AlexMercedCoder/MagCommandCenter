import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { extensionInventory, subscribeExtensions } from "../extensions/api";
import { configureNativeTransport, runtimeTransportKind } from "../lib/desktop";
import {
  remoteRuntimeEnabled,
  setRemoteRuntimeEnabled,
} from "../lib/experimental";
import type { Toast } from "../lib/types";
import { ExperimentalBadge } from "./experimental-badge";
import { RuntimeTransportPanel } from "./runtime-transport-panel";

export function ExperimentalPanel(props: {
  notify: (text: string, tone?: Toast["tone"]) => void;
}) {
  const [remote, setRemote] = useState(remoteRuntimeEnabled);
  const [extensions, setExtensions] = useState(extensionInventory);

  useEffect(() => {
    const unsubscribe = subscribeExtensions(() =>
      setExtensions(extensionInventory()),
    );
    return () => {
      unsubscribe();
    };
  }, []);

  function toggleRemote(enabled: boolean) {
    setRemoteRuntimeEnabled(enabled);
    setRemote(enabled);
    if (!enabled && runtimeTransportKind() === "remote") {
      configureNativeTransport();
      props.notify(
        "Remote runtime turned off. Using the native desktop runtime.",
        "good",
      );
    }
  }

  return (
    <section
      className="panel experimental-panel"
      aria-labelledby="experimental-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Opt-in</p>
          <h3 id="experimental-title">Experimental features</h3>
        </div>
        <FlaskConical aria-hidden="true" />
      </div>
      <p className="field-help">
        These features work but are outside the 1.0 stability promise. They can
        change or be removed in a minor release.
      </p>
      <ul className="experimental-list">
        <li>
          <label className="experimental-toggle">
            <input
              type="checkbox"
              checked={remote}
              onChange={(event) => toggleRemote(event.target.checked)}
            />
            <span>
              <strong>Remote runtime</strong> <ExperimentalBadge />
              <small>
                Drives MagAgent on another machine through its{" "}
                <code>magent serve --rpc</code> gateway (MagAgent 1.4, also
                experimental): chat and graph runs stream, approvals and Stop
                work, and the token can live in your system keychain. Project
                file and Git views still use this computer.
              </small>
            </span>
          </label>
        </li>
        <li>
          <span>
            <strong>Group sessions</strong> <ExperimentalBadge />
            <small>
              Chat &rarr; Group runs two to five agent profiles on one prompt.
              Always available; results and orchestration may change.
            </small>
          </span>
        </li>
        <li>
          <span>
            <strong>Renderer extensions</strong> <ExperimentalBadge />
            <small>
              <code>window.MagCommandCenter.registerExtension</code> runs
              extension code inside this window with no sandbox.{" "}
              {extensions.length
                ? `${extensions.length} registered: ${extensions
                    .map((item) => item.name)
                    .join(", ")}.`
                : "None registered."}
            </small>
          </span>
        </li>
      </ul>
      {remote && <RuntimeTransportPanel notify={props.notify} />}
    </section>
  );
}
