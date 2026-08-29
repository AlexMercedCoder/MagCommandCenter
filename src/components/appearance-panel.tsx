import { Monitor, Moon, Palette, Sun } from "lucide-react";
import type { Accent, Theme } from "../lib/types";

const themes: Array<{ id: Theme; label: string; icon: typeof Sun }> = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

const accents: Array<{ id: Accent; label: string }> = [
  { id: "yellow", label: "Signal yellow" },
  { id: "blue", label: "Electric blue" },
  { id: "violet", label: "Agent violet" },
];

export function AppearancePanel(props: {
  theme: Theme;
  accent: Accent;
  onTheme: (theme: Theme) => void;
  onAccent: (accent: Accent) => void;
}) {
  return (
    <section className="panel appearance-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Appearance</p>
          <h3>Workspace theme</h3>
        </div>
        <Palette />
      </div>
      <p className="field-help">
        System mode follows the operating-system preference. Reduced-motion
        preferences are respected automatically.
      </p>
      <div className="appearance-options" role="group" aria-label="Theme">
        {themes.map(({ id, label, icon: Icon }) => (
          <button
            className={props.theme === id ? "active" : ""}
            onClick={() => props.onTheme(id)}
            aria-pressed={props.theme === id}
            type="button"
            key={id}
          >
            <Icon />
            {label}
          </button>
        ))}
      </div>
      <label>
        Accent
        <select
          value={props.accent}
          onChange={(event) => props.onAccent(event.target.value as Accent)}
        >
          {accents.map((item) => (
            <option value={item.id} key={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
