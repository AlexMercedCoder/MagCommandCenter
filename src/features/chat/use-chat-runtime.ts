import { useMemo } from "react";
import { useRuntimes } from "../../app/runtime-context";
import { useAppStore } from "../../stores/app-store";
import type { ChatRuntime } from "./chat-actions";
import { useChatStore } from "./chat-store";

/** Chat dependencies on the execution and profile runtimes, plus the active profile. */
export function useChatRuntime() {
  const { execution, profiles } = useRuntimes();
  const { createTask, registerStream, refreshTasks } = execution;
  const runtime: ChatRuntime = useMemo(
    () => ({
      createTask,
      registerStream,
      refreshTasks,
      profiles: profiles.profiles,
      defaultProfile: profiles.defaultProfile,
    }),
    [
      createTask,
      registerStream,
      refreshTasks,
      profiles.profiles,
      profiles.defaultProfile,
    ],
  );
  const sessions = useChatStore((state) => state.sessions);
  const session = useChatStore((state) => state.session);
  const coordinator = useAppStore(
    (state) => state.projectCrews[state.project]?.coordinator,
  );
  const activeSession = sessions.find((item) => item.id === session);
  const activeProfile =
    activeSession?.agentProfile ||
    coordinator ||
    profiles.defaultProfile ||
    "magagent";
  const summary = profiles.profiles.find((item) => item.name === activeProfile);
  const profileDrifted = Boolean(
    activeSession?.profileDigest &&
    summary?.profile_digest &&
    activeSession.profileDigest !== summary.profile_digest,
  );
  return { runtime, activeSession, activeProfile, profileDrifted };
}
