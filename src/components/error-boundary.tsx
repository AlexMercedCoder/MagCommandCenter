import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

type State = { error: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "Mag Command Center render failure",
      error,
      info.componentStack,
    );
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fatal-error" role="alert">
        <AlertTriangle aria-hidden="true" />
        <h1>Command Center hit a recoverable display error</h1>
        <p>
          Your project files and MagAgent data were not changed. Reload the
          window to restore the last persisted workspace.
        </p>
        <details>
          <summary>Technical detail</summary>
          <pre>{this.state.error.message}</pre>
        </details>
        <button
          className="primary-action"
          onClick={() => window.location.reload()}
          type="button"
        >
          <RotateCcw aria-hidden="true" /> Reload workspace
        </button>
      </main>
    );
  }
}
