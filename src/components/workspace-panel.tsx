import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Code2,
  File,
  FileUp,
  GitBranch,
  GitCompare,
  Play,
  RefreshCcw,
  Search,
  ShieldAlert,
  Trash2,
  Workflow,
} from "lucide-react";
import type {
  GitState,
  ProcessResult,
  Toast,
  WorkspaceFile,
  WorkspaceFilePreview,
} from "../lib/types";
import {
  fileToBase64,
  parseArgv,
  workspaceClient,
} from "../lib/workspace-client";

const MAX_CONTEXT_FILES = 20;
const MAX_CONTEXT_BYTES = 750 * 1024;

export function WorkspacePanel(props: {
  project: string;
  sessionId: string;
  context: WorkspaceFile[];
  onContextChange: (files: WorkspaceFile[]) => void;
  onProjectOpen: (path: string) => void;
  notify: (text: string, tone?: Toast["tone"]) => void;
}) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<WorkspaceFilePreview | null>(null);
  const [git, setGit] = useState<GitState | null>(null);
  const [diff, setDiff] = useState("");
  const [diffMode, setDiffMode] = useState<"unstaged" | "staged">("unstaged");
  const [command, setCommand] = useState("");
  const [commandResult, setCommandResult] = useState<ProcessResult | null>(
    null,
  );
  const [branch, setBranch] = useState("");
  const [worktreeDirectory, setWorktreeDirectory] = useState("");
  const [createBranch, setCreateBranch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [visibleFiles, setVisibleFiles] = useState(200);
  const [adjacentProjects, setAdjacentProjects] = useState<
    Array<{
      name: string;
      path: string;
      current: boolean;
      launch_command: string;
    }>
  >([]);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [hostingResult, setHostingResult] = useState<ProcessResult | null>(
    null,
  );
  const uploadRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    setBusy(true);
    try {
      const result = await workspaceClient.files(props.project, query);
      setFiles(result.files);
      if (result.truncated)
        props.notify("File results reached the 1,000-file safety limit.");
    } catch (reason) {
      props.notify(message(reason), "bad");
    } finally {
      setBusy(false);
    }
  }, [props.project, props.notify, query]);

  const loadGit = useCallback(async () => {
    try {
      setGit(await workspaceClient.git(props.project));
    } catch (reason) {
      props.notify(message(reason), "bad");
    }
  }, [props.project, props.notify]);

  useEffect(() => {
    void loadFiles();
    void loadGit();
    void workspaceClient
      .adjacentProjects(props.project)
      .then(setAdjacentProjects)
      .catch(() => setAdjacentProjects([]));
    void workspaceClient
      .command(props.project, ["git", "remote", "get-url", "origin"], 10)
      .then((result) => setRemoteUrl(result.stdout.trim()))
      .catch(() => setRemoteUrl(""));
  }, [props.project]);

  const contextBytes = useMemo(
    () => props.context.reduce((total, item) => total + item.size, 0),
    [props.context],
  );

  function toggleContext(file: WorkspaceFile) {
    if (props.context.some((item) => item.path === file.path)) {
      props.onContextChange(
        props.context.filter((item) => item.path !== file.path),
      );
      return;
    }
    if (props.context.length >= MAX_CONTEXT_FILES) {
      props.notify(
        `Select no more than ${MAX_CONTEXT_FILES} context files.`,
        "bad",
      );
      return;
    }
    props.onContextChange([...props.context, file]);
  }

  async function openPreview(path: string) {
    setBusy(true);
    try {
      setPreview(await workspaceClient.preview(props.project, path));
    } catch (reason) {
      props.notify(message(reason), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      const nextContext = [...props.context];
      for (const file of Array.from(list).slice(0, MAX_CONTEXT_FILES)) {
        const uploaded = await workspaceClient.upload(
          props.project,
          file.name,
          await fileToBase64(file),
          props.sessionId,
        );
        if (nextContext.length < MAX_CONTEXT_FILES) nextContext.push(uploaded);
      }
      props.onContextChange(nextContext);
      await loadFiles();
      props.notify(
        "Files uploaded into the confined MagAgent attachment workspace.",
        "good",
      );
    } catch (reason) {
      props.notify(message(reason), "bad");
    } finally {
      setBusy(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function loadDiff(staged: boolean) {
    setBusy(true);
    try {
      const result = await workspaceClient.diff(props.project, staged);
      setDiffMode(staged ? "staged" : "unstaged");
      setDiff(result.stdout || result.stderr || "No changes in this view.");
    } catch (reason) {
      props.notify(message(reason), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function mutateGit(
    action: "stage" | "unstage" | "discard",
    path: string,
  ) {
    if (
      action === "discard" &&
      !window.confirm(
        `Discard unstaged changes to ${path}? This cannot be undone by Command Center.`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await workspaceClient.gitAction(
        props.project,
        action,
        path,
      );
      props.notify(
        result.ok
          ? `${action} completed.`
          : result.stderr || `${action} failed.`,
        result.ok ? "good" : "bad",
      );
      await loadGit();
      await loadDiff(diffMode === "staged");
    } catch (reason) {
      props.notify(message(reason), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function createWorktreeNow() {
    if (!branch.trim() || !worktreeDirectory.trim()) return;
    setBusy(true);
    try {
      const result = await workspaceClient.createWorktree(
        props.project,
        branch.trim(),
        worktreeDirectory.trim(),
        createBranch,
      );
      props.notify(
        result.ok
          ? "Worktree created."
          : result.stderr || "Worktree creation failed.",
        result.ok ? "good" : "bad",
      );
      await loadGit();
    } catch (reason) {
      props.notify(message(reason), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function removeWorktree(path: string) {
    if (
      !window.confirm(
        `Remove worktree ${path}? Dirty worktrees are refused by Git.`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await workspaceClient.removeWorktree(props.project, path);
      props.notify(
        result.ok
          ? "Worktree removed."
          : result.stderr || "Worktree removal failed.",
        result.ok ? "good" : "bad",
      );
      await loadGit();
    } catch (reason) {
      props.notify(message(reason), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function runCommand() {
    setBusy(true);
    try {
      const result = await workspaceClient.command(
        props.project,
        parseArgv(command),
      );
      setCommandResult(result);
      props.notify(
        result.ok ? "Command completed." : "Command exited unsuccessfully.",
        result.ok ? "good" : "bad",
      );
    } catch (reason) {
      props.notify(message(reason), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function sourceHostAction(action: "view" | "create") {
    const github = /github\.com/i.test(remoteUrl);
    const gitlab = /gitlab/i.test(remoteUrl);
    if (!github && !gitlab) {
      props.notify(
        "GitHub and GitLab CLI review workflows require a recognized origin remote.",
        "bad",
      );
      return;
    }
    if (action === "create" && !reviewTitle.trim()) return;
    if (
      action === "create" &&
      !window.confirm(
        `Create a draft ${github ? "pull request" : "merge request"} on the configured origin?`,
      )
    )
      return;
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
            reviewTitle.trim(),
            "--body",
            reviewBody.trim() || "Created from Mag Command Center",
          ]
      : action === "view"
        ? ["glab", "mr", "view"]
        : [
            "glab",
            "mr",
            "create",
            "--draft",
            "--title",
            reviewTitle.trim(),
            "--description",
            reviewBody.trim() || "Created from Mag Command Center",
          ];
    setBusy(true);
    try {
      const result = await workspaceClient.command(props.project, argv, 120);
      setHostingResult(result);
      props.notify(
        result.ok
          ? "Source-host review action completed."
          : result.stderr || "Source-host action failed.",
        result.ok ? "good" : "bad",
      );
    } catch (reason) {
      props.notify(message(reason), "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace-surface">
      <header className="section-intro split-heading">
        <div>
          <p className="eyebrow">Project workspace</p>
          <h2>Files, changes, and commands</h2>
          <p>
            Context stays inside the selected project. Commands execute as an
            argument vector without a shell.
          </p>
        </div>
        <button
          className="icon-action"
          onClick={() => {
            void loadFiles();
            void loadGit();
          }}
          disabled={busy}
          type="button"
        >
          <RefreshCcw />
          Refresh
        </button>
      </header>

      <div className="context-budget" role="status">
        <strong>
          {props.context.length}/{MAX_CONTEXT_FILES} context files
        </strong>
        <span>
          {formatBytes(contextBytes)} selected · inline text budget{" "}
          {formatBytes(MAX_CONTEXT_BYTES)}
        </span>
        {props.context.length > 0 && (
          <button onClick={() => props.onContextChange([])} type="button">
            Clear
          </button>
        )}
      </div>
      {adjacentProjects.length > 1 && (
        <details className="panel adjacent-projects">
          <summary>Adjacent projects ({adjacentProjects.length})</summary>
          <div>
            {adjacentProjects.map((item) => (
              <article key={item.path}>
                <span>
                  <strong>
                    {item.name}
                    {item.current ? " · current" : ""}
                  </strong>
                  <small>{item.path}</small>
                </span>
                <button
                  onClick={() => props.onProjectOpen(item.path)}
                  type="button"
                >
                  Open
                </button>
                <button
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(item.launch_command)
                      .then(() =>
                        props.notify("Launch command copied.", "good"),
                      )
                  }
                  type="button"
                >
                  Copy launch
                </button>
              </article>
            ))}
          </div>
        </details>
      )}

      <div className="workspace-grid">
        <article className="panel workspace-browser">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Files</p>
              <h3>Workspace explorer</h3>
            </div>
            <button
              className="icon-action"
              onClick={() => uploadRef.current?.click()}
              type="button"
            >
              <FileUp />
              Upload
            </button>
          </div>
          <input
            ref={uploadRef}
            hidden
            multiple
            type="file"
            onChange={(event) => void uploadFiles(event.target.files)}
          />
          <label className="search-field">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadFiles();
              }}
              placeholder="Find files by path"
            />
            <button onClick={() => void loadFiles()} type="button">
              Search
            </button>
          </label>
          <div className="workspace-file-list" role="list">
            {files.slice(0, visibleFiles).map((file) => (
              <div
                className="workspace-file-row"
                role="listitem"
                key={file.path}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={props.context.some(
                      (item) => item.path === file.path,
                    )}
                    onChange={() => toggleContext(file)}
                  />
                  <File />
                  <span>
                    <strong>{file.name}</strong>
                    <small>
                      {file.path} · {formatBytes(file.size)}
                    </small>
                  </span>
                </label>
                <button
                  onClick={() => void openPreview(file.path)}
                  type="button"
                >
                  Preview
                </button>
              </div>
            ))}
            {visibleFiles < files.length && (
              <button
                className="load-more"
                onClick={() => setVisibleFiles((value) => value + 200)}
                type="button"
              >
                Load {Math.min(200, files.length - visibleFiles)} more
              </button>
            )}
            {!files.length && (
              <p className="empty-copy">No matching project files.</p>
            )}
          </div>
        </article>

        <article className="panel workspace-preview">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Preview</p>
              <h3>{preview?.name || "Select a file"}</h3>
            </div>
            {preview && (
              <small>
                {preview.mime} · {formatBytes(preview.size)}
              </small>
            )}
          </div>
          {!preview && (
            <div className="empty-state compact">
              <File />
              <p>
                Preview a workspace file without exposing paths outside the
                active project.
              </p>
            </div>
          )}
          {preview?.text && (
            <pre className="file-preview-text">{preview.content}</pre>
          )}
          {preview?.data_url && preview.mime.startsWith("image/") && (
            <img
              className="file-preview-image"
              src={preview.data_url}
              alt={preview.name}
            />
          )}
          {preview && !preview.text && !preview.mime.startsWith("image/") && (
            <div className="empty-state compact">
              <ShieldAlert />
              <p>
                Binary preview is intentionally unavailable. Attach the confined
                path to a run instead.
              </p>
            </div>
          )}
        </article>
      </div>

      <div className="workspace-grid">
        <article className="panel source-control">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Source control</p>
              <h3>{git?.current_branch || "Git changes"}</h3>
            </div>
            <div className="button-row">
              <button
                className={diffMode === "unstaged" ? "chip active" : "chip"}
                onClick={() => void loadDiff(false)}
                type="button"
              >
                Working
              </button>
              <button
                className={diffMode === "staged" ? "chip active" : "chip"}
                onClick={() => void loadDiff(true)}
                type="button"
              >
                Staged
              </button>
            </div>
          </div>
          <div className="git-status-list">
            {(git?.status || [])
              .filter((line) => !line.startsWith("##"))
              .map((line) => {
                const path = statusPath(line);
                const staged = line[0] !== " " && line[0] !== "?";
                const working = line[1] !== " ";
                return (
                  <div className="git-status-row" key={line}>
                    <code>{line.slice(0, 2)}</code>
                    <span title={path}>{path}</span>
                    <div>
                      {!staged && (
                        <button
                          onClick={() => void mutateGit("stage", path)}
                          type="button"
                        >
                          Stage
                        </button>
                      )}
                      {staged && (
                        <button
                          onClick={() => void mutateGit("unstage", path)}
                          type="button"
                        >
                          Unstage
                        </button>
                      )}
                      {working && !line.startsWith("??") && (
                        <button
                          className="danger-link"
                          onClick={() => void mutateGit("discard", path)}
                          type="button"
                        >
                          Discard
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            {git &&
              !git.status.filter((line) => !line.startsWith("##")).length && (
                <p className="empty-copy">Working tree is clean.</p>
              )}
          </div>
          <pre className="diff-view" aria-label={`${diffMode} diff`}>
            {diff || "Choose Working or Staged to load a bounded diff."}
          </pre>
        </article>

        <article className="panel worktrees-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Isolation</p>
              <h3>Branches and worktrees</h3>
            </div>
            <GitBranch />
          </div>
          <div className="worktree-list">
            {git?.worktrees.map((item) => (
              <div className="worktree-row" key={item.worktree}>
                <span>
                  <strong>
                    {item.branch || "Detached"}
                    {item.current ? " · current" : ""}
                  </strong>
                  <small>{item.worktree}</small>
                </span>
                {!item.current && (
                  <button
                    className="danger-link"
                    onClick={() => void removeWorktree(item.worktree)}
                    type="button"
                  >
                    <Trash2 />
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="worktree-form">
            <label>
              Branch
              <input
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                placeholder="feature/command-center"
                list="workspace-branches"
              />
            </label>
            <datalist id="workspace-branches">
              {git?.branches.map((item) => (
                <option value={item} key={item} />
              ))}
            </datalist>
            <label>
              Directory
              <input
                value={worktreeDirectory}
                onChange={(event) => setWorktreeDirectory(event.target.value)}
                placeholder="MagCommandCenter-feature"
              />
            </label>
            <label className="check-option">
              <input
                type="checkbox"
                checked={createBranch}
                onChange={(event) => setCreateBranch(event.target.checked)}
              />
              <span>Create a new branch</span>
            </label>
            <button
              className="primary-action"
              disabled={!branch.trim() || !worktreeDirectory.trim()}
              onClick={() => void createWorktreeNow()}
              type="button"
            >
              <Workflow />
              Create worktree
            </button>
          </div>
        </article>
      </div>

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
              if (event.key === "Enter" && command.trim()) void runCommand();
            }}
            placeholder="npm test  or  git status --short"
          />
          <button
            className="primary-action"
            onClick={() => void runCommand()}
            disabled={!command.trim() || busy}
            type="button"
          >
            <Play />
            Run
          </button>
        </div>
        <p className="field-help">
          Quotes and escapes group arguments; pipes, redirects, substitutions,
          and shell operators are never interpreted.
        </p>
        {commandResult && (
          <pre
            className={`command-output ${commandResult.ok ? "success" : "failure"}`}
          >
            {commandResult.stdout}
            {commandResult.stderr}
          </pre>
        )}
      </article>
      <article className="panel source-hosting">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Source hosting</p>
            <h3>
              {/github\.com/i.test(remoteUrl)
                ? "GitHub pull request"
                : /gitlab/i.test(remoteUrl)
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
            value={reviewTitle}
            onChange={(event) => setReviewTitle(event.target.value)}
            placeholder="Draft review title"
          />
          <textarea
            value={reviewBody}
            onChange={(event) => setReviewBody(event.target.value)}
            placeholder="Summary, test evidence, and reviewer guidance"
          />
          <div className="button-row">
            <button
              className="icon-action"
              onClick={() => void sourceHostAction("view")}
              disabled={!remoteUrl}
              type="button"
            >
              Inspect current review
            </button>
            <button
              className="primary-action"
              onClick={() => void sourceHostAction("create")}
              disabled={!remoteUrl || !reviewTitle.trim()}
              type="button"
            >
              Create draft review
            </button>
          </div>
        </div>
        {hostingResult && (
          <pre
            className={`command-output ${hostingResult.ok ? "success" : "failure"}`}
          >
            {hostingResult.stdout}
            {hostingResult.stderr}
          </pre>
        )}
      </article>
    </section>
  );
}

function statusPath(line: string) {
  const value = line.slice(3).trim();
  const renamed = value.split(" -> ");
  return value.includes(" -> ") ? renamed[renamed.length - 1] || value : value;
}

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
