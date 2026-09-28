import { GraphPlanView } from "../../../components/workbench-panel";
import {
  applyProposal,
  applyTemplateDocument,
  controlRun,
  gatesOf,
  generate,
  propose,
  type BoardContext,
} from "./actions";
import {
  AssistantPanel,
  ExecutionCockpit,
  RunReview,
  TemplateGallery,
} from "./graph-panels";
import { useGraphBoard } from "./store";
import type { WorkspacePanel } from "./utils";
import { sentenceCase } from "../../../lib/text";

const panels: WorkspacePanel[] = [
  "assistant",
  "templates",
  "review",
  "execution",
];

/** Assistant, templates, plan review, and execution cockpit tabs under the board. */
export function GraphDrawer(props: { ctx: BoardContext; stalePlan: boolean }) {
  const state = useGraphBoard();
  const { ctx, stalePlan } = props;
  const { plan, runTask, set } = state;
  return (
    <section className="graph-workspace-drawer panel">
      <nav aria-label="Graph workspace panels">
        {panels.map((item) => (
          <button
            className={state.workspacePanel === item ? "active" : ""}
            onClick={() => set({ workspacePanel: item })}
            disabled={
              (item === "review" && !plan) || (item === "execution" && !runTask)
            }
            type="button"
            key={item}
          >
            {sentenceCase(item)}
            {item === "review" && stalePlan ? (
              <span>stale</span>
            ) : item === "execution" && runTask ? (
              <span>{runTask.state}</span>
            ) : null}
          </button>
        ))}
      </nav>
      {state.workspacePanel === "assistant" && (
        <AssistantPanel
          prompt={state.assistantPrompt}
          setPrompt={(assistantPrompt) => set({ assistantPrompt })}
          busy={state.busy}
          onPropose={() => void propose(ctx)}
          proposal={state.proposal}
          selection={state.proposalSelection}
          setSelection={(proposalSelection) => set({ proposalSelection })}
          onApply={applyProposal}
          onReject={() => set({ proposal: null })}
        />
      )}
      {state.workspacePanel === "templates" && (
        <TemplateGallery
          busy={state.busy}
          contributed={state.contract?.graph_templates ?? []}
          onUse={(preset, model) => generate(ctx, model, preset)}
          onDocument={applyTemplateDocument}
        />
      )}
      {state.workspacePanel === "review" && plan && (
        <div className={stalePlan ? "stale-plan" : ""}>
          <GraphPlanView value={plan} />
          <RunReview
            plan={plan}
            gates={gatesOf(plan)}
            approved={state.approvedGates}
            setApproved={(approvedGates) => set({ approvedGates })}
          />
        </div>
      )}
      {state.workspacePanel === "execution" && runTask && (
        <ExecutionCockpit
          root={runTask}
          children={state.childTasks}
          activity={state.activity}
          onAction={(action) => void controlRun(ctx, action)}
        />
      )}
    </section>
  );
}
