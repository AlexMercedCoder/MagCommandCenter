import { AppearancePanel } from "../../components/appearance-panel";
import { ConfigPanel } from "../../components/config-panel";
import { ExperimentalPanel } from "../../components/experimental-panel";
import { KeepAwakePanel } from "../../components/keep-awake-panel";
import { NotificationsPanel } from "../../components/notifications-panel";
import { UpdatesPanel } from "../../components/updates-panel";
import { EditorPanel } from "../../components/editor-panel";
import { ProviderSetupPanel } from "../../components/provider-setup-panel";
import { ShortcutEditor } from "../../components/shortcut-editor";
import { useAppStore } from "../../stores/app-store";
import { loadConfig, saveConfigValue, useConfigStore } from "./config-store";

export function SettingsView() {
  const busy = useAppStore((state) => state.busy);
  const notify = useAppStore((state) => state.notify);
  const providers = useAppStore((state) => state.providerDetection);
  const theme = useAppStore((state) => state.theme);
  const accent = useAppStore((state) => state.accent);
  const shortcuts = useAppStore((state) => state.shortcuts);
  const setApp = useAppStore((state) => state.set);
  const config = useConfigStore();
  return (
    <>
      <ConfigPanel
        busy={busy}
        config={config.config}
        fields={config.schema}
        values={config.values}
        setValues={(values) => config.set({ values })}
        configPath={config.path}
        configValue={config.value}
        setConfigPath={(path) => config.set({ path })}
        setConfigValue={(value) => config.set({ value })}
        onLoad={loadConfig}
        onSave={saveConfigValue}
        providers={providers}
      />
      <ProviderSetupPanel notify={notify} />
      <div className="settings-extensions">
        <ExperimentalPanel notify={notify} />
        <KeepAwakePanel notify={notify} />
      </div>
      <div className="settings-extensions">
        <NotificationsPanel />
        <UpdatesPanel />
      </div>
      <div className="settings-extensions">
        <EditorPanel />
      </div>
      <div className="settings-extensions">
        <AppearancePanel
          theme={theme}
          accent={accent}
          onTheme={(next) => setApp({ theme: next })}
          onAccent={(next) => setApp({ accent: next })}
        />
        <ShortcutEditor
          shortcuts={shortcuts}
          onChange={(next) => setApp({ shortcuts: next })}
        />
      </div>
    </>
  );
}
