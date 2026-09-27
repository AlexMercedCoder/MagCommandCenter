import { desktopInvoke } from "./desktop";

export type EditorChoice =
  "auto" | "vscode" | "cursor" | "zed" | "environment" | "system";

export const editorLabels: Record<EditorChoice, string> = {
  auto: "Automatic (VS Code, Cursor, or Zed if installed)",
  vscode: "Visual Studio Code",
  cursor: "Cursor",
  zed: "Zed",
  environment: "$VISUAL / $EDITOR (graphical editors only)",
  system: "System default app",
};

/** Opens a project file in the chosen editor, at a line when the editor supports it. */
export function openInEditor(
  project: string,
  path: string,
  line: number | undefined,
  editor: EditorChoice,
) {
  return desktopInvoke<string>("open_in_editor", {
    project,
    path,
    line: line ?? null,
    editor,
  });
}
