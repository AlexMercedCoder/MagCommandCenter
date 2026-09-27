import { Code2, GitCompare, Play } from "lucide-react";
import { useState } from "react";
import type { ProcessResult } from "../../lib/types";
import { parseArgv, workspaceClient } from "../../lib/workspace-client";
import { message, type Notify } from "./workspace-utils";

/** Runs one argument vector in the project without a shell. */
export function CommandConsole(props: { project: string; notify: Notify }) {
  const [command, setCommand] = useState("");
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const next = await workspaceClient.command(
        props.project,
        parseArgv(command),
      );
      setResult(next);
      props.notify(
        next.ok ? "Command completed." : "Command exited unsuccessfully.",
        next.ok ? "good" : "bad",
      );
    } catch (reason) {
      props.notify(message(reason), "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel command-console">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Bounded console</p>
          <h3>Run without a shell</h3>
        </div>
        <Code2 />
      </div>
      <div className="command-line">
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && command.trim()) void run();
          }}
          placeholder="npm test  or  git status --short"
        />
        <button
          className="primary-action"
          onClick={() => void run()}
          disabled={!command.trim() || busy}
          type="button"
        >
          <Play />
          Run
        </button>
      </div>
      <p className="field-help">
        Quotes and escapes group arguments; pipes, redirects, substitutions, and
        shell operators are never interpreted.
      </p>
      {result && (
        <pre className={`command-output ${result.ok ? "success" : "failure"}`}>
          {result.stdout}
          {result.stderr}
        </pre>
      )}
    </article>
  );
}

/** Draft pull/merge request handoff through the authenticated gh or glab CLI. */
export function SourceHosting(props: {
  project: string;
  remoteUrl: string;
  notify: Notify;
}) {
  const { remoteUrl, notify } = props;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<ProcessResult | null>(null);
  const github = /github\.com/i.test(remoteUrl);
  const gitlab = /gitlab/i.test(remoteUrl);

  async function act(action: "view" | "create") {
    if (!github && !gitlab) {
      notify(
        "GitHub and GitLab CLI review workflows require a recognized origin remote.",
        "bad",
      );
      return;
    }
    if (action === "create" && !title.trim()) return;
    if (
      action === "create" &&
      !window.confirm(
        `Create a draft ${github ? "pull request" : "merge request"} on the configured origin?`,
      )
    )
      return;
    const description = body.trim() || "Created from Mag Command Center";
    const argv = github
      ? action === "view"
        ? [
            "gh",
            "pr",
            "view",
            "--json",
            "number,title,state,url,reviewDecision,statusCheckRollup",
          ]
        : [
            "gh",
            "pr",
            "create",
            "--draft",
            "--title",
            title.trim(),
            "--body",
            description,
          ]
      : action === "view"
        ? ["glab", "mr", "view"]
        : [
            "glab",
            "mr",
            "create",
            "--draft",
            "--title",
            title.trim(),
            "--description",
            description,
          ];
    try {
      const next = await workspaceClient.command(props.project, argv, 120);
      setResult(next);
      notify(
        next.ok
          ? "Source-host review action completed."
          : next.stderr || "Source-host action failed.",
        next.ok ? "good" : "bad",
      );
    } catch (reason) {
      notify(message(reason), "bad");
    }
  }

  return (
    <article className="panel source-hosting">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Source hosting</p>
          <h3>
            {github
              ? "GitHub pull request"
              : gitlab
                ? "GitLab merge request"
                : "Repository review"}
          </h3>
        </div>
        <GitCompare />
      </div>
      <p className="field-help">
        {remoteUrl || "No origin remote detected."} Authentication remains in
        the official gh or glab CLI.
      </p>
      <div className="review-form">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Draft review title"
        />
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Summary, test evidence, and reviewer guidance"
        />
        <div className="button-row">
          <button
            className="icon-action"
            onClick={() => void act("view")}
            disabled={!remoteUrl}
            type="button"
          >
            Inspect current review
          </button>
          <button
            className="primary-action"
            onClick={() => void act("create")}
            disabled={!remoteUrl || !title.trim()}
            type="button"
          >
            Create draft review
          </button>
        </div>
      </div>
      {result && (
        <pre className={`command-output ${result.ok ? "success" : "failure"}`}>
          {result.stdout}
          {result.stderr}
        </pre>
      )}
    </article>
  );
}
