import { create } from "zustand";
import { storageKeys } from "../../lib/constants";
import { measurePerformance } from "../../lib/performance";
import type { SqliteDatabase } from "../../lib/types";
import {
  databaseValue,
  extractDatabases,
  readStoredJson,
} from "../../lib/utils";
import { withPagination } from "../../lib/workspace";
import { executeJson } from "../../stores/magent-actions";

type Json = Record<string, unknown> | null;

export type SqliteState = {
  databases: SqliteDatabase[];
  selectedDb: string;
  tables: Json;
  query: string;
  result: Json;
  exportFormat: "json" | "csv";
  page: number;
  savedQueries: string[];
};

export const useSqliteStore = create<
  SqliteState & { set: (partial: Partial<SqliteState>) => void }
>()((set) => ({
  databases: [],
  selectedDb: "",
  tables: null,
  query: "select name from sqlite_master where type = 'table' order by name;",
  result: null,
  exportFormat: "json",
  page: 0,
  savedQueries: readStoredJson<string[]>(storageKeys.sqliteSavedQueries, []),
  set: (partial) => set(partial),
}));

const sqlite = () => useSqliteStore.getState();

export async function loadSqliteDbs() {
  await executeJson<Record<string, unknown>>(
    ["data", "sqlite-list"],
    (data) => {
      const databases = extractDatabases(data);
      sqlite().set({
        databases,
        selectedDb: sqlite().selectedDb || databaseValue(databases[0]) || "",
      });
    },
  );
}

export async function loadSqliteTables() {
  const { selectedDb } = sqlite();
  if (!selectedDb) return;
  await executeJson<Record<string, unknown>>(
    ["data", "sqlite-tables", selectedDb],
    (data) => sqlite().set({ tables: data }),
  );
}

export async function runSqliteQuery() {
  const { selectedDb, query, page } = sqlite();
  if (!selectedDb || !query.trim()) return;
  const paged = withPagination(query.trim(), page);
  await measurePerformance("sqlite.query", () =>
    executeJson<Record<string, unknown>>(
      ["data", "sqlite-query", selectedDb, paged],
      (data) => sqlite().set({ result: data }),
    ),
  );
}

export function saveSqliteQuery() {
  const query = sqlite().query.trim();
  if (!query) return;
  sqlite().set({
    savedQueries: [
      query,
      ...sqlite().savedQueries.filter((item) => item !== query),
    ].slice(0, 20),
  });
}
