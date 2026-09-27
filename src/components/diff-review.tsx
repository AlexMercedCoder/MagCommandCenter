import { ExternalLink, FileDiff } from "lucide-react";
import { useMemo, useState } from "react";
import { firstChangedLine, parseUnifiedDiff, type DiffFile } from "../lib/diff";
import { openInEditor } from "../lib/editor";
import { useAppStore } from "../stores/app-store";

const statusLabel: Record<DiffFile["status"], string> = {
  modified: "Modified",
  added: "Added",
  deleted: "Deleted",
  renamed: "Renamed",
};

/**
 * Reviewable diff: per-file summaries, hunks with line numbers, and an editor handoff
 * at the first changed line of each hunk. Falls back to the raw text when it is not a
 * unified diff (for example "No changes").
 */
export function DiffReview(props: {
  diff: string;
  project: string;
  empty: string;
  label: string;
}) {
  const files = useMemo(() => parseUnifiedDiff(props.diff), [props.diff]);
  const editor = useAppStore((state) => state.editor);
  const notify = useAppStore((state) => state.notify);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  async function handoff(path: string, line?: number) {
    try {
      const program = await openInEditor(props.project, path, line, editor);
      notify(`Opened ${path.split(/[\\/]/).pop()} in ${program}.`, "good");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : String(reason), "bad");
    }
  }

  if (!props.diff.trim())
    return <p className="empty-copy diff-empty">{props.empty}</p>;
  if (!files.length)
    return (
      <pre className="diff-view" aria-label={props.label}>
        {props.diff}
      </pre>
    );
  const additions = files.reduce((total, file) => total + file.additions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);
  return (
    <section className="diff-review" aria-label={props.label}>
      <p className="diff-summary">
        {files.length} file{files.length === 1 ? "" : "s"} changed ·{" "}
        <span className="diff-add-count">+{additions}</span>{" "}
        <span className="diff-del-count">−{deletions}</span>
      </p>
      {files.map((file) => {
        const key = `${file.oldPath}->${file.path}`;
        const expanded = open[key] ?? files.length <= 3;
        return (
          <article className="diff-file" key={key}>
            <header>
              <button
                type="button"
                className="diff-file-toggle"
                aria-expanded={expanded}
                onClick={() => setOpen({ ...open, [key]: !expanded })}
              >
                <FileDiff size={15} aria-hidden="true" />
                <span className="diff-path" title={file.path}>
                  {file.path}
                </span>
                <span className={`diff-status ${file.status}`}>
                  {statusLabel[file.status]}
                </span>
                <span className="diff-counts">
                  <span className="diff-add-count">+{file.additions}</span>{" "}
                  <span className="diff-del-count">−{file.deletions}</span>
                </span>
              </button>
              {file.status !== "deleted" && (
                <button
                  type="button"
                  className="icon-action"
                  onClick={() =>
                    void handoff(
                      file.path,
                      file.hunks[0]
                        ? firstChangedLine(file.hunks[0])
                        : undefined,
                    )
                  }
                >
                  <ExternalLink size={14} />
                  <span>Open in editor</span>
                </button>
              )}
            </header>
            {expanded &&
              (file.binary ? (
                <p className="empty-copy">Binary file; open it to review.</p>
              ) : (
                file.hunks.map((hunk) => (
                  <div className="diff-hunk" key={hunk.header}>
                    <div className="diff-hunk-header">
                      <code>{hunk.header}</code>
                      {file.status !== "deleted" && (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() =>
                            void handoff(file.path, firstChangedLine(hunk))
                          }
                        >
                          Open at line {firstChangedLine(hunk)}
                        </button>
                      )}
                    </div>
                    <table className="diff-lines">
                      <tbody>
                        {hunk.lines.map((line, index) => (
                          <tr className={`diff-line ${line.kind}`} key={index}>
                            <td className="diff-num">{line.oldLine ?? ""}</td>
                            <td className="diff-num">{line.newLine ?? ""}</td>
                            <td className="diff-sign" aria-hidden="true">
                              {line.kind === "add"
                                ? "+"
                                : line.kind === "del"
                                  ? "−"
                                  : " "}
                            </td>
                            <td className="diff-text">
                              <span className="visually-hidden">
                                {line.kind === "add"
                                  ? "Added: "
                                  : line.kind === "del"
                                    ? "Removed: "
                                    : ""}
                              </span>
                              {line.text}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              ))}
          </article>
        );
      })}
    </section>
  );
}
