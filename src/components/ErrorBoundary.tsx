import React from "react";

interface State {
  hasError: boolean;
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
  label?: string;
  /** 에러 시 대체 UI. 미제공 시 기본 fallback 사용 */
  fallback?: React.ReactNode;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error, info.componentStack);
  }

  private reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0d1117] text-white/40 gap-3 p-6 select-none">
        <span className="text-3xl">⚠</span>
        <p className="text-xs font-semibold">
          {this.props.label ? `${this.props.label} ` : ""}렌더링 오류
        </p>
        {this.state.error?.message && (
          <pre className="text-[10px] text-white/20 font-mono text-center max-w-xs break-all whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
        )}
        <button
          onClick={this.reset}
          className="text-[11px] px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }
}
