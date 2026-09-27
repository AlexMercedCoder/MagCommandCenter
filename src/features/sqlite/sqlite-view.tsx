import { useMemo } from "react";
import { SQLitePanel } from "../../components/sqlite-panel";
import { extractTable } from "../../lib/utils";
import { useAppStore } from "../../stores/app-store";
import {
  loadSqliteDbs,
  loadSqliteTables,
  runSqliteQuery,
  saveSqliteQuery,
  useSqliteStore,
} from "./sqlite-store";

export function SqliteView() {
  const busy = useAppStore((state) => state.busy);
  const sqlite = useSqliteStore();
  const tableRows = useMemo(() => extractTable(sqlite.tables), [sqlite.tables]);
  const resultRows = useMemo(
    () => extractTable(sqlite.result),
    [sqlite.result],
  );
  const set = sqlite.set;
  return (
    <SQLitePanel
      busy={busy}
      databases={sqlite.databases}
      selectedDb={sqlite.selectedDb}
      setSelectedDb={(selectedDb) => set({ selectedDb })}
      tables={sqlite.tables}
      tableRows={tableRows}
      query={sqlite.query}
      setQuery={(query) => set({ query })}
      page={sqlite.page}
      setPage={(page) => set({ page })}
      savedQueries={sqlite.savedQueries}
      onSaveQuery={saveSqliteQuery}
      result={sqlite.result}
      resultRows={resultRows}
      exportFormat={sqlite.exportFormat}
      setExportFormat={(exportFormat) => set({ exportFormat })}
      onLoadDbs={loadSqliteDbs}
      onLoadTables={loadSqliteTables}
      onRunQuery={runSqliteQuery}
    />
  );
}
