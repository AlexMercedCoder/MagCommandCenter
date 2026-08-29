import { useState } from "react";
import { Cable, Laptop, ShieldCheck } from "lucide-react";
import {
  configureNativeTransport,
  configureRemoteTransport,
  desktopInvoke,
  runtimeTransportKind,
} from "../lib/desktop";
import type { Toast } from "../lib/types";

export function RuntimeTransportPanel(props: {
  notify: (text: string, tone?: Toast["tone"]) => void;
}) {
  const [endpoint, setEndpoint] = useState(
    () => localStorage.getItem("mcc.remoteEndpoint") || "https://",
  );
  const [token, setToken] = useState("");
  const [kind, setKind] = useState(runtimeTransportKind());

  async function connect() {
    try {
      configureRemoteTransport(endpoint, token);
      await desktopInvoke("runtime_info");
      localStorage.setItem("mcc.remoteEndpoint", endpoint);
      setToken("");
      setKind("remote");
      props.notify(
        "Authenticated remote runtime connected. The token remains memory-only.",
        "good",
      );
    } catch (reason) {
      configureNativeTransport();
      setKind("native");
      props.notify(
        reason instanceof Error ? reason.message : "Remote connection failed",
        "bad",
      );
    }
  }

  return (
    <section className="panel transport-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Execution transport</p>
          <h3>{kind === "native" ? "Native desktop" : "Remote runtime"}</h3>
        </div>
        {kind === "native" ? <Laptop /> : <Cable />}
      </div>
      <p className="field-help">
        Remote mode uses authenticated JSON-RPC over HTTPS. Tokens are never
        persisted. HTTP is accepted only for loopback development.
      </p>
      <div className="transport-form">
        <label>
          Endpoint
          <input
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            placeholder="https://agent-host.example/rpc"
          />
        </label>
        <label>
          One-time access token
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        <button
          className="primary-action"
          onClick={() => void connect()}
          disabled={!endpoint.trim() || !token.trim()}
          type="button"
        >
          <ShieldCheck />
          Connect and verify
        </button>
        <button
          className="icon-action"
          onClick={() => {
            configureNativeTransport();
            setKind("native");
            props.notify("Using the native desktop runtime.", "good");
          }}
          type="button"
        >
          <Laptop />
          Use native
        </button>
      </div>
    </section>
  );
}
