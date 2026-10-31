import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";

interface Props {
  /** Label for the boundary — shown in the fallback UI. */
  label?: string;
  /** Content the boundary wraps. */
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-phase errors inside the wrapped subtree and shows a friendly
 * fallback instead of a blank page. Critical for game-night reliability — a
 * single bad render in the runbook or HUD must not unmount the rest of the UI.
 *
 * React error boundaries are still class-only as of React 19.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to the browser console so the DM can screenshot in a pinch.
    // eslint-disable-next-line no-console
    console.error(
      `[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ""}]`,
      error,
      info,
    );
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          className="card"
          role="alert"
          style={{
            margin: "1.5rem auto",
            maxWidth: 540,
            textAlign: "center",
            borderColor: "var(--danger-line)",
          }}
        >
          <h3
            style={{
              marginTop: 0,
              color: "var(--danger-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.45rem",
              flexWrap: "wrap",
            }}
          >
            <TriangleAlert size={18} aria-hidden />
            Something broke
            {this.props.label ? (
              <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {this.props.label}</span>
            ) : null}
          </h3>
          <p className="text-sm" style={{ marginBottom: "0.75rem", color: "var(--text2)" }}>
            {this.state.error.message || "Unknown render error."}
          </p>
          <p className="text-muted text-sm" style={{ marginBottom: "1rem" }}>
            The rest of the app is still working. Try again, or reload the page if it keeps
            happening. Nothing you saved is lost.
          </p>
          <div className="flex" style={{ justifyContent: "center", gap: "0.5rem" }}>
            <button className="btn btn-secondary" onClick={this.reset}>
              <RotateCcw size={16} aria-hidden /> Try again
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={16} aria-hidden /> Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
