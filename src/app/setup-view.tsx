import { ManagedInstallPanel } from "../components/managed-install-panel";
import { ProviderSetupPanel } from "../components/provider-setup-panel";
import { SetupPanel } from "../components/setup-panel";
import { magentCompatibility } from "../lib/compatibility";
import { useAppStore } from "../stores/app-store";
import { detectMagent, installMagent } from "../stores/magent-actions";

export function SetupView() {
  const busy = useAppStore((state) => state.busy);
  const system = useAppStore((state) => state.system);
  const setupMethod = useAppStore((state) => state.setupMethod);
  const setupDismissed = useAppStore((state) => state.setupDismissed);
  const lastCommand = useAppStore((state) => state.lastCommand);
  const notify = useAppStore((state) => state.notify);
  const set = useAppStore((state) => state.set);
  return (
    <SetupPanel
      busy={busy}
      system={system}
      magentOk={magentCompatibility(system).ok}
      setupMethod={setupMethod}
      setSetupMethod={(value) => set({ setupMethod: value })}
      setupDismissed={setupDismissed}
      setSetupDismissed={(value) => set({ setupDismissed: value })}
      onDetect={detectMagent}
      onInstall={installMagent}
      lastCommand={lastCommand}
      managedInstall={
        <ManagedInstallPanel
          notify={notify}
          onInstalled={() => void detectMagent()}
        />
      }
      providerSetup={
        <ProviderSetupPanel
          notify={notify}
          onChanged={() => void detectMagent()}
        />
      }
    />
  );
}
