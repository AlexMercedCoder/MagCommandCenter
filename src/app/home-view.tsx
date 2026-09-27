import { Dashboard } from "../components/dashboard-panel";
import { magentCompatibility } from "../lib/compatibility";
import { useAppStore } from "../stores/app-store";
import {
  chooseProjectFolder,
  detectMagent,
  refreshProjectHealth,
  runEcosystemReadiness,
  runEnvironmentDiagnostics,
  runReadiness,
} from "../stores/magent-actions";
import { useAllProjects } from "./use-all-projects";

export function projectHealthLabel(readiness: { ok?: boolean } | null) {
  return readiness?.ok ? "Ready" : readiness ? "Needs attention" : "Unchecked";
}

export function HomeView() {
  const state = useAppStore();
  const allProjects = useAllProjects();
  return (
    <Dashboard
      busy={state.busy}
      project={state.project}
      setProject={(project) => state.set({ project })}
      recentProjects={state.recentProjects}
      pinnedProjects={state.pinnedProjects}
      allProjects={allProjects}
      projectHealth={projectHealthLabel(state.readiness)}
      rememberProject={state.rememberProject}
      togglePinnedProject={state.togglePinnedProject}
      chooseProjectFolder={chooseProjectFolder}
      system={state.system}
      magentOk={magentCompatibility(state.system).ok}
      readiness={state.readiness}
      ecosystemReadiness={state.ecosystemReadiness}
      toolReadiness={state.toolReadiness}
      providerDetection={state.providerDetection}
      cacheReadiness={state.cacheReadiness}
      projectInspection={state.projectInspection}
      commandHistory={state.commandHistory}
      lastCommand={state.lastCommand}
      onSystem={detectMagent}
      onReadiness={runReadiness}
      onEcosystemReadiness={runEcosystemReadiness}
      onEnvironment={runEnvironmentDiagnostics}
      onInspectProject={refreshProjectHealth}
    />
  );
}
