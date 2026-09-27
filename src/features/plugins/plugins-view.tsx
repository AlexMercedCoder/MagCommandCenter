import { useMemo } from "react";
import { PluginsPanel } from "../../components/plugins-panel";
import { extractRows } from "../../lib/utils";
import { useAppStore } from "../../stores/app-store";
import {
  choosePluginSource,
  importPlugin,
  installPlugin,
  loadPlugins,
  reviewPlugin,
  updatePlugin,
  usePluginsStore,
} from "./plugins-store";

export function PluginsView() {
  const busy = useAppStore((state) => state.busy);
  const plugins = usePluginsStore();
  const rows = useMemo(() => extractRows(plugins.plugins), [plugins.plugins]);
  const set = plugins.set;
  return (
    <PluginsPanel
      busy={busy}
      plugins={plugins.plugins}
      pluginRows={rows}
      pluginName={plugins.name}
      pluginSource={plugins.source}
      pluginImportKind={plugins.importKind}
      pluginReview={plugins.review}
      setPluginName={(name) => set({ name })}
      setPluginSource={(source) => set({ source })}
      setPluginImportKind={(importKind) => set({ importKind })}
      choosePluginSource={choosePluginSource}
      onLoad={loadPlugins}
      onReview={reviewPlugin}
      onEnable={() => updatePlugin(true)}
      onDisable={() => updatePlugin(false)}
      onInstall={installPlugin}
      onImport={importPlugin}
    />
  );
}
