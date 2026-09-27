import { Bell } from "lucide-react";
import { useAppStore } from "../stores/app-store";
import { enableNotifications } from "../stores/magent-actions";

/** Settings for OS notifications and the tray (C-8). */
export function NotificationsPanel() {
  const notifications = useAppStore((state) => state.notifications);
  const set = useAppStore((state) => state.set);
  const update = (patch: Partial<typeof notifications>) =>
    set({ notifications: { ...notifications, ...patch } });
  return (
    <section
      className="panel notifications-panel"
      aria-labelledby="notifications-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">While you are elsewhere</p>
          <h3 id="notifications-title">Notifications</h3>
        </div>
        <Bell aria-hidden="true" />
      </div>
      <p className="field-help">
        Only sent while the Command Center window is in the background. The tray
        icon always shows how many approvals are waiting; click it to come back.
      </p>
      <label className="check-option">
        <input
          type="checkbox"
          checked={notifications.approvals}
          onChange={(event) => update({ approvals: event.target.checked })}
        />
        <span>
          <strong>Approval requests</strong>
          <small>When MagAgent asks for permission to act.</small>
        </span>
      </label>
      <label className="check-option">
        <input
          type="checkbox"
          checked={notifications.runs}
          onChange={(event) => update({ runs: event.target.checked })}
        />
        <span>
          <strong>Finished runs</strong>
          <small>
            When a chat or graph run you started ends. Runs you stop are not
            announced.
          </small>
        </span>
      </label>
      <button
        className="icon-action"
        type="button"
        onClick={() => void enableNotifications()}
      >
        <Bell size={16} />
        <span>Allow notifications</span>
      </button>
    </section>
  );
}
