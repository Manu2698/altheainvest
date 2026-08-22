import { Component, type ErrorInfo, type ReactNode } from "react";
import { logErroreRuntime } from "@/lib/runtime-monitor";

type Props = { children: ReactNode; area: string };
type State = { error: Error | null; suggerimento?: string | undefined };

/** Isola un'area della UI: se un componente crasha, il resto della pagina resta usabile. */
export class RuntimeErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    const voce = logErroreRuntime(error, `boundary:${this.props.area}`, {
      componentStack: info.componentStack,
    });
    this.setState({ suggerimento: voce.suggerimento });
  }

  override render() {
    const { error, suggerimento } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="panel border-bear/40 p-5">
        <h3 className="text-sm font-semibold text-bear">
          Errore nel modulo «{this.props.area}»
        </h3>
        <p className="numeric mt-2 text-xs text-muted-foreground">
          {error.name}: {error.message}
        </p>
        {suggerimento && (
          <p className="mt-2 text-xs text-muted-foreground">→ {suggerimento}</p>
        )}
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] text-muted-foreground">
            Stack trace
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-surface-2 p-3 text-[10px] leading-relaxed text-muted-foreground">
            {error.stack}
          </pre>
        </details>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-4 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          Riprova
        </button>
      </div>
    );
  }
}
