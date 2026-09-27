import { File, FileUp, Search, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceFile, WorkspaceFilePreview } from "../../lib/types";
import { fileToBase64, workspaceClient } from "../../lib/workspace-client";
import {
  formatBytes,
  MAX_CONTEXT_FILES,
  message,
  type Notify,
} from "./workspace-utils";

/** File explorer with search, upload, context selection, and preview. */
export function WorkspaceFiles(props: {
  project: string;
  sessionId: string;
  context: WorkspaceFile[];
  onContextChange: (files: WorkspaceFile[]) => void;
  notify: Notify;
  refreshToken: number;
}) {
  const { project, notify, refreshToken } = props;
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<WorkspaceFilePreview | null>(null);
  const [visibleFiles, setVisibleFiles] = useState(200);
  const uploadRef = useRef<HTMLInputElement>(null);
  // A submitted search; `run` changes on every submit so repeating a query reloads.
  const [search, setSearch] = useState({ query: "", run: 0 });

  const loadFiles = useCallback(
    async (filter: string) => {
      try {
        const result = await workspaceClient.files(project, filter);
        setFiles(result.files);
        if (result.truncated)
          notify("File results reached the 1,000-file safety limit.");
      } catch (reason) {
        notify(message(reason), "bad");
      }
    },
    [project, notify],
  );

  useEffect(() => {
    void loadFiles(search.query);
  }, [loadFiles, refreshToken, search]);

  const submitSearch = () =>
    setSearch((current) => ({ query, run: current.run + 1 }));

  function toggleContext(file: WorkspaceFile) {
    if (props.context.some((item) => item.path === file.path)) {
      props.onContextChange(
        props.context.filter((item) => item.path !== file.path),
      );
      return;
    }
    if (props.context.length >= MAX_CONTEXT_FILES) {
      notify(`Select no more than ${MAX_CONTEXT_FILES} context files.`, "bad");
      return;
    }
    props.onContextChange([...props.context, file]);
  }

  async function openPreview(path: string) {
    try {
      setPreview(await workspaceClient.preview(project, path));
    } catch (reason) {
      notify(message(reason), "bad");
    }
  }

  async function uploadFiles(list: FileList | null) {
    if (!list?.length) return;
    try {
      const nextContext = [...props.context];
      for (const file of Array.from(list).slice(0, MAX_CONTEXT_FILES)) {
        const uploaded = await workspaceClient.upload(
          project,
          file.name,
          await fileToBase64(file),
          props.sessionId,
        );
        if (nextContext.length < MAX_CONTEXT_FILES) nextContext.push(uploaded);
      }
      props.onContextChange(nextContext);
      await loadFiles(search.query);
      notify(
        "Files uploaded into the confined MagAgent attachment workspace.",
        "good",
      );
    } catch (reason) {
      notify(message(reason), "bad");
    } finally {
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  return (
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
              if (event.key === "Enter") submitSearch();
            }}
            placeholder="Find files by path"
          />
          <button onClick={submitSearch} type="button">
            Search
          </button>
        </label>
        <div className="workspace-file-list" role="list">
          {files.slice(0, visibleFiles).map((file) => (
            <div className="workspace-file-row" role="listitem" key={file.path}>
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
              <button onClick={() => void openPreview(file.path)} type="button">
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
              Preview a workspace file without exposing paths outside the active
              project.
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
  );
}
