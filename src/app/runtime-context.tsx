import { createContext, useContext, type ReactNode } from "react";
import type { useExecutionRuntime } from "../hooks/use-execution-runtime";
import type { useSchedules } from "../hooks/use-schedules";
import type { useWorkbenchRuntime } from "../hooks/use-workbench-runtime";
import type { ProfileRuntime } from "../features/profiles/use-profile-runtime";

/**
 * Long-lived runtimes that poll or run timers (tasks, profiles, schedules, workbench
 * checkpoints). App owns one instance of each; views read them from this context.
 */
export type Runtimes = {
  execution: ReturnType<typeof useExecutionRuntime>;
  profiles: ProfileRuntime;
  schedules: ReturnType<typeof useSchedules>;
  workbench: ReturnType<typeof useWorkbenchRuntime>;
};

const RuntimeContext = createContext<Runtimes | null>(null);

export function RuntimeProvider(props: {
  value: Runtimes;
  children: ReactNode;
}) {
  return (
    <RuntimeContext.Provider value={props.value}>
      {props.children}
    </RuntimeContext.Provider>
  );
}

export function useRuntimes(): Runtimes {
  const value = useContext(RuntimeContext);
  if (!value)
    throw new Error("useRuntimes must be used inside RuntimeProvider");
  return value;
}
