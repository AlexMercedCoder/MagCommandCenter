import type { AgentProfileSummary, ExecutionTask } from "../../../lib/types";
import { magentClient } from "../../../magent";
import {
  duplicateNodeLocal,
  removeNode,
  replaceNodeType,
  updateNode,
} from "../graph-model";
import { controlRun, type BoardContext } from "./actions";
import { DependencyMap } from "./dependency-map";
import { GraphKanban } from "./graph-kanban";
import { BulkBar, SourcePanel } from "./graph-panels";
import { NodeEditor } from "./node-editor";
import { useGraphBoard } from "./store";
import { message, parseSource, serializeSource, toggleSet } from "./utils";

/** Board, map, or source view of the loaded document, plus bulk edits. */
export function GraphEditorArea(props: {
  ctx: BoardContext;
  visible: Set<string>;
  profiles: AgentProfileSummary[];
  nodeStates: Map<string, ExecutionTask>;
}) {
  const state = useGraphBoard();
  const { document, selected, commit, set } = state;
  if (!document) return null;
  const selectedNode = document.nodes[selected];
  const select = (id: string) => set({ selected: id });
  const currentSource =
    state.sourceText || serializeSource(document, state.path);
  return (
    <>
      {state.view === "board" && (
        <div className="graph-editor-shell">
          <GraphKanban
            document={document}
            visible={props.visible}
            selected={selected}
            checked={state.multi}
            tasks={props.nodeStates}
            presentationOrder={state.presentationOrder}
            onSelect={select}
            onCheck={(id) => set({ multi: toggleSet(state.multi, id) })}
            onReorder={state.movePresentation}
            onRetry={(id) => void controlRun(props.ctx, "retry", [id])}
          />
          {selectedNode && (
            <NodeEditor
              id={selected}
              node={selectedNode}
              document={document}
              profiles={props.profiles}
              contract={state.contract}
              effective={state.effectiveProfile}
              onChange={(patch) =>
                commit(updateNode(document, selected, patch))
              }
              onType={(type) => {
                if (
                  window.confirm(
                    `Replace type-specific fields with a valid ${type} template?`,
                  )
                )
                  commit(
                    replaceNodeType(
                      document,
                      selected,
                      type,
                      state.contract?.node_templates?.[type],
                    ),
                  );
              }}
              onRename={async (next) => {
                const result = await magentClient.renameGraphNode(
                  document,
                  selected,
                  next,
                );
                commit(result.document);
                select(next);
              }}
              onDuplicate={async () => {
                const local = duplicateNodeLocal(document, selected);
                const result = await magentClient.duplicateGraphNode(
                  document,
                  selected,
                  local.id,
                );
                commit(result.document);
                select(local.id);
              }}
              onDelete={() => {
                commit(removeNode(document, selected));
                select("");
              }}
            />
          )}
        </div>
      )}
      {state.view === "map" && (
        <DependencyMap
          document={document}
          selected={selected}
          onSelect={select}
          onChange={commit}
        />
      )}
      {state.view === "source" && (
        <SourcePanel
          format={state.path.toLowerCase().endsWith(".json") ? "json" : "yaml"}
          document={document}
          baseline={state.baseline}
          text={currentSource}
          setText={(value) => set({ sourceText: value, sourceError: "" })}
          error={state.sourceError}
          onReset={() =>
            set({
              sourceText: serializeSource(document, state.path),
              sourceError: "",
            })
          }
          onApply={() => {
            try {
              commit(parseSource(currentSource, state.path));
              set({ sourceText: "" });
            } catch (error) {
              set({ sourceError: message(error, "Invalid graph source") });
            }
          }}
        />
      )}
      {state.multi.size > 0 && (
        <BulkBar
          count={state.multi.size}
          profiles={props.profiles}
          onProfile={(profile) => {
            let next = document;
            state.multi.forEach((id) => {
              next = updateNode(next, id, {
                "x-magagent-profile": profile || undefined,
              });
            });
            commit(next);
          }}
          onLabel={(label) => {
            let next = document;
            state.multi.forEach((id) => {
              const labels = new Set(next.nodes[id].labels ?? []);
              if (label.trim()) labels.add(label.trim());
              next = updateNode(next, id, { labels: [...labels] });
            });
            commit(next);
          }}
          onClear={() => set({ multi: new Set() })}
        />
      )}
    </>
  );
}
