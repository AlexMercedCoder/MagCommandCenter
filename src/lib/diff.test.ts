import { describe, expect, it } from "vitest";
import { firstChangedLine, parseUnifiedDiff } from "./diff";

const git = `diff --git a/src/app.ts b/src/app.ts
index 1..2 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,3 +10,4 @@ export function app() {
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 return a;
diff --git a/new.md b/new.md
new file mode 100644
--- /dev/null
+++ b/new.md
@@ -0,0 +1 @@
+hello
diff --git a/old.md b/old.md
deleted file mode 100644
--- a/old.md
+++ /dev/null
@@ -1 +0,0 @@
-bye
diff --git a/logo.png b/logo.png
Binary files a/logo.png and b/logo.png differ
`;

const checkpoint = `--- /work/p/notes.md (checkpoint)
+++ /work/p/notes.md
@@ -1,2 +1,2 @@
 title
-old line
+new line
`;

describe("parseUnifiedDiff", () => {
  it("reads Git diffs with statuses, counts, and new-file line numbers", () => {
    const files = parseUnifiedDiff(git);
    expect(files.map((file) => [file.path, file.status])).toEqual([
      ["src/app.ts", "modified"],
      ["new.md", "added"],
      ["old.md", "deleted"],
      ["logo.png", "modified"],
    ]);
    const app = files[0];
    expect([app.additions, app.deletions]).toEqual([2, 1]);
    expect(app.hunks[0].newStart).toBe(10);
    expect(firstChangedLine(app.hunks[0])).toBe(11);
    expect(files[3].binary).toBe(true);
  });

  it("reads MagAgent checkpoint diffs with absolute paths", () => {
    const [file] = parseUnifiedDiff(checkpoint);
    expect(file.path).toBe("/work/p/notes.md");
    expect(file.status).toBe("modified");
    expect(firstChangedLine(file.hunks[0])).toBe(2);
  });

  it("returns nothing for empty input", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
    expect(parseUnifiedDiff("No changes in this view.")).toEqual([]);
  });
});
