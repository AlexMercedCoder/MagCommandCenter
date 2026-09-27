import { GitBranch, Trash2, Workflow } from "lucide-react";
import { useState } from "react";
import type { GitState } from "../../lib/types";
import { workspaceClient } from "../../lib/workspace-client";
import { message, statusPath, type Notify } from "./workspace-utils";

/** Git status with stage, unstage, discard, and a bounded diff. */
export function SourceControl(props: {
  project: string;
  git: GitState | null;
  reloadGit: () => Promise<void>;
  notify: Notify;
}) {
  const { project, git, notify } = props;
  const [diff, setDiff] = useState("");
  const [diffMode, setDiffMode] = useState<"unstaged" | "staged">("unstaged");

  async function loadDiff(staged: boolean) {
    try {
      const result = await workspaceClient.diff(project, staged);
      setDiffMode(staged ? "staged" : "unstaged");
      setDiff(result.stdout || result.stderr || "No changes in this view.");
    } catch (reason) {
      notify(message(reason), "bad");
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
    try {
      const result = await workspaceClient.gitAction(project, action, path);
      notify(
        result.ok
          ? `${action} completed.`
          : result.stderr || `${action} failed.`,
        result.ok ? "good" : "bad",
      );
      await props.reloadGit();
      await loadDiff(diffMode === "staged");
    } catch (reason) {
      notify(message(reason), "bad");
    }
  }

  const changes = (git?.status || []).filter((line) => !line.startsWith("##"));
  return (
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
        {changes.map((line) => {
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
        {git && !changes.length && (
          <p className="empty-copy">Working tree is clean.</p>
        )}
      </div>
      <pre className="diff-view" aria-label={`${diffMode} diff`}>
        {diff || "Choose Working or Staged to load a bounded diff."}
      </pre>
    </article>
  );
}

export function Worktrees(props: {
  project: string;
  git: GitState | null;
  reloadGit: () => Promise<void>;
  notify: Notify;
}) {
  const { project, git, notify } = props;
  const [branch, setBranch] = useState("");
  const [directory, setDirectory] = useState("");
  const [createBranch, setCreateBranch] = useState(true);

  async function create() {
    if (!branch.trim() || !directory.trim()) return;
    try {
      const result = await workspaceClient.createWorktree(
        project,
        branch.trim(),
        directory.trim(),
        createBranch,
      );
      notify(
        result.ok
          ? "Worktree created."
          : result.stderr || "Worktree creation failed.",
        result.ok ? "good" : "bad",
      );
      await props.reloadGit();
    } catch (reason) {
      notify(message(reason), "bad");
    }
  }

  async function remove(path: string) {
    if (
      !window.confirm(
        `Remove worktree ${path}? Dirty worktrees are refused by Git.`,
      )
    )
      return;
    try {
      const result = await workspaceClient.removeWorktree(project, path);
      notify(
        result.ok
          ? "Worktree removed."
          : result.stderr || "Worktree removal failed.",
        result.ok ? "good" : "bad",
      );
      await props.reloadGit();
    } catch (reason) {
      notify(message(reason), "bad");
    }
  }

  return (
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
                onClick={() => void remove(item.worktree)}
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
            value={directory}
            onChange={(event) => setDirectory(event.target.value)}
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
          disabled={!branch.trim() || !directory.trim()}
          onClick={() => void create()}
          type="button"
        >
          <Workflow />
          Create worktree
        </button>
      </div>
    </article>
  );
}
