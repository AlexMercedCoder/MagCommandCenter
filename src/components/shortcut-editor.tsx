import { Keyboard, RotateCcw } from "lucide-react";
import {
  defaultShortcuts,
  shortcutConflicts,
  type ShortcutAction,
  type ShortcutMap,
} from "../lib/keybindings";

const labels: Record<ShortcutAction, string> = {
  palette: "Command palette",
  newSession: "New session",
  workspace: "Open workspace",
  runs: "Open runs",
  graphs: "Open graphs",
  tools: "Open tools",
  help: "Shortcut help",
};

export function ShortcutEditor(props: {
  shortcuts: ShortcutMap;
  onChange: (value: ShortcutMap) => void;
}) {
  const conflicts = shortcutConflicts(props.shortcuts);
  return (
    <section className="panel shortcut-editor">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Keyboard</p>
          <h3>Command shortcuts</h3>
        </div>
        <Keyboard />
      </div>
      <p className="field-help">
        Use Mod for Command on macOS and Ctrl elsewhere. Shortcuts do not fire
        from a text field, except the command palette.
      </p>
      <div className="shortcut-grid">
        {(Object.keys(labels) as ShortcutAction[]).map((action) => (
          <label key={action}>
            <span>{labels[action]}</span>
            <input
              value={props.shortcuts[action]}
              onChange={(event) =>
                props.onChange({
                  ...props.shortcuts,
                  [action]: event.target.value,
                })
              }
            />
          </label>
        ))}
      </div>
      {conflicts.length > 0 && (
        <div className="inline-notice error" role="alert">
          <span>
            <strong>Shortcut conflicts</strong>
            <small>
              {conflicts
                .map(([key, actions]) => `${key}: ${actions.join(", ")}`)
                .join(" · ")}
            </small>
          </span>
        </div>
      )}
      <button
        className="icon-action"
        onClick={() => props.onChange(defaultShortcuts)}
        type="button"
      >
        <RotateCcw />
        Restore defaults
      </button>
    </section>
  );
}
