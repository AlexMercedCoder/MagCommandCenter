import { RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CommandConsole,
  SourceHosting,
} from "../features/workspace/command-console";
import { SourceControl, Worktrees } from "../features/workspace/source-control";
import { WorkspaceFiles } from "../features/workspace/workspace-files";
import {
  formatBytes,
  MAX_CONTEXT_BYTES,
  MAX_CONTEXT_FILES,
  message,
} from "../features/workspace/workspace-utils";
import type { GitState, Toast, WorkspaceFile } from "../lib/types";
import { workspaceClient } from "../lib/workspace-client";

type AdjacentProject = {
  name: string;
  path: string;
  current: boolean;
  launch_command: string;
};

export function WorkspacePanel(props: {
  project: string;
  sessionId: string;
  context: WorkspaceFile[];
  onContextChange: (files: WorkspaceFile[]) => void;
  onProjectOpen: (path: string) => void;
  notify: (text: string, tone?: Toast["tone"]) => void;
}) {
  const { project, notify } = props;
  const [git, setGit] = useState<GitState | null>(null);
  const [adjacentProjects, setAdjacentProjects] = useState<AdjacentProject[]>(
    [],
  );
  const [remoteUrl, setRemoteUrl] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  const loadGit = useCallback(async () => {
    try {
      setGit(await workspaceClient.git(project));
    } catch (reason) {
      notify(message(reason), "bad");
    }
  }, [project, notify]);

  useEffect(() => {
    void loadGit();
  }, [loadGit, refreshToken]);

  useEffect(() => {
    void workspaceClient
      .adjacentProjects(project)
      .then(setAdjacentProjects)
      .catch(() => setAdjacentProjects([]));
    void workspaceClient
      .command(project, ["git", "remote", "get-url", "origin"], 10)
      .then((result) => setRemoteUrl(result.stdout.trim()))
      .catch(() => setRemoteUrl(""));
  }, [project]);

  const contextBytes = useMemo(
    () => props.context.reduce((total, item) => total + item.size, 0),
    [props.context],
  );

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
          onClick={() => setRefreshToken((value) => value + 1)}
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
                      .then(() => notify("Launch command copied.", "good"))
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

      <WorkspaceFiles
        project={project}
        sessionId={props.sessionId}
        context={props.context}
        onContextChange={props.onContextChange}
        notify={notify}
        refreshToken={refreshToken}
      />

      <div className="workspace-grid">
        <SourceControl
          project={project}
          git={git}
          reloadGit={loadGit}
          notify={notify}
        />
        <Worktrees
          project={project}
          git={git}
          reloadGit={loadGit}
          notify={notify}
        />
      </div>

      <CommandConsole project={project} notify={notify} />
      <SourceHosting project={project} remoteUrl={remoteUrl} notify={notify} />
    </section>
  );
}
