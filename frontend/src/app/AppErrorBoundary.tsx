import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("App render error", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <section className="gate">
          <h1>Something went wrong</h1>
          <p>This page could not be displayed.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
