import { SquarePen } from "lucide-react";
import { editorLabels, type EditorChoice } from "../lib/editor";
import { useAppStore } from "../stores/app-store";

export function EditorPanel() {
  const editor = useAppStore((state) => state.editor);
  const set = useAppStore((state) => state.set);
  return (
    <section className="panel editor-panel" aria-labelledby="editor-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Review</p>
          <h3 id="editor-title">Editor</h3>
        </div>
        <SquarePen aria-hidden="true" />
      </div>
      <p className="field-help">
        Where “Open in editor” sends files from diffs and checkpoints. Only
        files inside the active project open.
      </p>
      <label htmlFor="editor-choice">Open files with</label>
      <select
        id="editor-choice"
        value={editor}
        onChange={(event) =>
          set({ editor: event.target.value as EditorChoice })
        }
      >
        {(Object.keys(editorLabels) as EditorChoice[]).map((choice) => (
          <option key={choice} value={choice}>
            {editorLabels[choice]}
          </option>
        ))}
      </select>
    </section>
  );
}
