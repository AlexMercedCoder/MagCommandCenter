/** Unified-diff parsing for review (Git working/staged diffs and MagAgent checkpoints). */

export type DiffLine = {
  kind: "add" | "del" | "ctx";
  text: string;
  /** Line number in the new file (for additions and context). */
  newLine?: number;
  oldLine?: number;
};

export type DiffHunk = {
  header: string;
  newStart: number;
  lines: DiffLine[];
};

export type DiffFile = {
  /** Path to open: the new side, or the old side for deletions. */
  path: string;
  oldPath: string;
  status: "modified" | "added" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  binary: boolean;
};

function cleanPath(raw: string) {
  const value = raw
    .trim()
    .replace(/\t.*$/, "")
    .replace(/ \(checkpoint\)$/, "");
  if (value === "/dev/null") return "";
  return value.replace(/^[ab]\//, "");
}

export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  const start = (oldPath = "", path = "") => {
    file = {
      path,
      oldPath,
      status: "modified",
      additions: 0,
      deletions: 0,
      hunks: [],
      binary: false,
    };
    files.push(file);
    hunk = null;
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      start(match?.[1] ?? "", match?.[2] ?? "");
      continue;
    }
    if (line.startsWith("--- ") && (!file || (file as DiffFile).hunks.length)) {
      start(cleanPath(line.slice(4)), "");
    }
    const current = file as DiffFile | null;
    if (!current) continue;
    if (line.startsWith("--- ")) {
      current.oldPath = cleanPath(line.slice(4));
      if (!current.oldPath) current.status = "added";
    } else if (line.startsWith("+++ ")) {
      const next = cleanPath(line.slice(4));
      if (next) current.path = next;
      else {
        current.status = "deleted";
        current.path = current.oldPath;
      }
      if (
        current.status === "modified" &&
        current.oldPath &&
        current.oldPath !== current.path
      )
        current.status = "renamed";
    } else if (line.startsWith("new file mode")) current.status = "added";
    else if (line.startsWith("deleted file mode")) current.status = "deleted";
    else if (line.startsWith("Binary files")) current.binary = true;
    else if (line.startsWith("@@")) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      oldLine = Number(match?.[1] ?? 0);
      newLine = Number(match?.[2] ?? 0);
      hunk = { header: line, newStart: newLine, lines: [] };
      current.hunks.push(hunk);
    } else if (hunk) {
      const active = hunk as DiffHunk;
      if (line.startsWith("+")) {
        active.lines.push({
          kind: "add",
          text: line.slice(1),
          newLine: newLine++,
        });
        current.additions += 1;
      } else if (line.startsWith("-")) {
        active.lines.push({
          kind: "del",
          text: line.slice(1),
          oldLine: oldLine++,
        });
        current.deletions += 1;
      } else if (line.startsWith(" ")) {
        active.lines.push({
          kind: "ctx",
          text: line.slice(1),
          newLine: newLine++,
          oldLine: oldLine++,
        });
      }
    }
  }
  return files.filter((item) => item.path || item.oldPath);
}

/** First changed line of a hunk in the new file, for "open at line". */
export function firstChangedLine(hunk: DiffHunk): number {
  const added = hunk.lines.find((line) => line.kind === "add");
  return added?.newLine ?? hunk.newStart;
}
