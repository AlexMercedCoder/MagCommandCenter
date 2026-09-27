import { create } from "zustand";
import type { ConfigField } from "../../lib/types";
import { stringifyConfigValue } from "../../lib/utils";
import { executeJson } from "../../stores/magent-actions";

export type ConfigState = {
  config: Record<string, unknown> | null;
  schema: ConfigField[];
  values: Record<string, string>;
  path: string;
  value: string;
};

export const useConfigStore = create<
  ConfigState & { set: (partial: Partial<ConfigState>) => void }
>()((set) => ({
  config: null,
  schema: [],
  values: {},
  path: "defaults.provider",
  value: "",
  set: (partial) => set(partial),
}));

const config = () => useConfigStore.getState();

export async function loadConfig() {
  await executeJson<Record<string, unknown>>(["config", "get"], (data) =>
    config().set({ config: data }),
  );
  await executeJson<Record<string, unknown>>(["config", "schema"], (data) => {
    const fields = Array.isArray(data?.fields)
      ? (data.fields as ConfigField[])
      : [];
    config().set({
      schema: fields,
      values: Object.fromEntries(
        fields.map((field) => [field.path, stringifyConfigValue(field.value)]),
      ),
    });
  });
}

export async function saveConfigValue(
  path = config().path,
  value = config().value,
) {
  await executeJson<Record<string, unknown>>(
    ["config", "set", path, value],
    (data) => config().set({ config: data }),
  );
  await loadConfig();
}
