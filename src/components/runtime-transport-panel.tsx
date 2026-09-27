import { useCallback, useEffect, useState } from "react";
import { Cable, KeyRound, Laptop, ShieldCheck } from "lucide-react";
import {
  configureNativeTransport,
  configureRemoteTransport,
  desktopInvoke,
  forgetRemoteToken,
  remoteTokenSaved,
  runtimeTransportKind,
} from "../lib/desktop";
import type { Toast } from "../lib/types";

type GatewayInfo = { version?: string; protocol?: string; roots?: string[] };

function message(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : typeof reason === "string"
      ? reason
      : "Remote connection failed";
}

export function RuntimeTransportPanel(props: {
  notify: (text: string, tone?: Toast["tone"]) => void;
}) {
  const { notify } = props;
  const [endpoint, setEndpoint] = useState(
    () =>
      localStorage.getItem("mcc.remoteEndpoint") || "http://127.0.0.1:7850/rpc",
  );
  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState(runtimeTransportKind());
  const [info, setInfo] = useState<GatewayInfo | null>(null);

  const checkSaved = useCallback(async () => {
    setSaved(await remoteTokenSaved(endpoint));
  }, [endpoint]);

  useEffect(() => {
    void checkSaved();
  }, [checkSaved]);

  async function connect(useSaved: boolean) {
    setBusy(true);
    try {
      await configureRemoteTransport(endpoint, token, { remember, useSaved });
      const gateway = await desktopInvoke<GatewayInfo>("runtime_info");
      if (gateway?.protocol !== "magent.rpc.v1")
        throw new Error(
          "That endpoint is not a MagAgent gateway (expected protocol magent.rpc.v1 from `magent serve --rpc`).",
        );
      localStorage.setItem("mcc.remoteEndpoint", endpoint);
      setToken("");
      setInfo(gateway);
      setKind("remote");
      notify(
        `Connected to MagAgent ${gateway.version ?? ""} on the gateway.`,
        "good",
      );
      await checkSaved();
    } catch (reason) {
      configureNativeTransport();
      setKind("native");
      setInfo(null);
      notify(message(reason), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function forget() {
    try {
      await forgetRemoteToken(endpoint);
      notify("Saved token removed from the system keychain.", "good");
    } catch (reason) {
      notify(message(reason), "bad");
    }
    await checkSaved();
  }

  return (
    <section className="transport-panel" aria-label="Remote runtime connection">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Execution transport</p>
          <h3>{kind === "native" ? "Native desktop" : "Remote runtime"}</h3>
        </div>
        {kind === "native" ? <Laptop /> : <Cable />}
      </div>
      <p className="field-help">
        Connects to MagAgent 1.4&apos;s <code>magent serve --rpc</code> gateway
        (experimental). Chat, graph runs, approvals, and Stop work over it;
        file, Git, and other project views still need the native runtime. Plain
        HTTP is accepted only on loopback, so put HTTPS in front of a gateway on
        another machine.
      </p>
      {kind === "remote" && info && (
        <p className="transport-connected" role="status">
          Connected: MagAgent {info.version}
          {info.roots?.length
            ? ` · projects under ${info.roots.join(", ")}`
            : ""}
        </p>
      )}
      <div className="transport-form">
        <label>
          Gateway endpoint
          <input
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            placeholder="https://agent-host.example/rpc"
          />
        </label>
        <label>
          Access token
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={
              saved ? "Saved in keychain" : "Printed by magent serve --rpc"
            }
          />
        </label>
        <button
          className="primary-action"
          onClick={() => void connect(!token.trim() && saved)}
          disabled={busy || !endpoint.trim() || (!token.trim() && !saved)}
          type="button"
        >
          <ShieldCheck />
          {!token.trim() && saved
            ? "Connect with saved token"
            : "Connect and verify"}
        </button>
        <button
          className="icon-action"
          onClick={() => {
            configureNativeTransport();
            setKind("native");
            setInfo(null);
            notify("Using the native desktop runtime.", "good");
          }}
          type="button"
        >
          <Laptop />
          Use native
        </button>
      </div>
      <div className="transport-options">
        <label className="check-option">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <span>Remember the token in the system keychain</span>
        </label>
        {saved && (
          <button
            className="link-button"
            type="button"
            onClick={() => void forget()}
          >
            <KeyRound size={14} /> Forget saved token
          </button>
        )}
      </div>
    </section>
  );
}
