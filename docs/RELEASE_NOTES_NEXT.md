# Next Mag Command Center release

- Adds a first-class WebMCP console with exact-origin management, live schema discovery,
  revision-bound calls, mutating-call confirmation, structured results, and setup guidance.

## Chat responsiveness and clarity

- Long-running MagAgent and setup processes now wait on Tauri's blocking worker pool, keeping the desktop renderer, navigation, timers, approval dialogs, and cancellation responsive.
- Streamed runs emit a two-second lifecycle heartbeat so a quiet provider call remains visibly alive without exposing private chain-of-thought.
- Active durable tasks are automatically selected and polled after restart, with elapsed time restored from the task timestamp.
- Chat uses labeled project, session, agent, and permission controls; familiar conversation bubbles; automatic transcript following; and a visible Stop action while work is active.
- The composer clears after dispatch and restores the prompt if startup fails.
- Light and dark native form controls now receive explicit foreground, background, placeholder, disabled, and option colors to avoid operating-system color-scheme contrast mismatches.
- The control bar wraps at the actual desktop content width, keeping Open and New horizontal instead of collapsing their labels into vertical text.
- The transcript now separates conversation from telemetry: streamed/final assistant messages render as MagAgent bubbles, stable activity metadata renders as concise progress summaries, and verbose tool evidence stays in compact expandable rows.
- Progress summaries intentionally describe lifecycle and intent without exposing private chain-of-thought.

## Graph authoring parity

- Graph generation is now a permanent, prominent entry point even when a board is already loaded, with **Generate with AI**, **Blank graph**, and **Open file** actions matching the MagAgent web UI's core authoring flow.
- Deterministic drafting remains available under **More options** for fast, quota-free scaffolding.
- Existing graph editing, strict validation, safe save, plan review, execution status, cancellation, retry, and durable recovery remain available below the generator.

## Validation

- TypeScript typecheck, ESLint, production Vite build, and the complete front-end test suite.
- Recovery regression coverage for active and completed durable tasks.
- Rust formatting, native compilation, and native unit tests with GTK 3/WebKitGTK 4.1.
- A deterministic Playwright visual fixture verifies real control colors and dimensions, timer/heartbeat progress, typing during active work, and cancellation without a model call.
