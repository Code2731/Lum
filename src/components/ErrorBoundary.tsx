import React from "react";
import { Copy } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

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
          <div className="w-full max-w-xs space-y-1">
            <pre className="text-xs text-white/20 font-mono text-center break-all whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
            <div className="w-full flex justify-center">
              <IconButton
                tooltip="오류 텍스트 복사"
                onClick={() => navigator.clipboard?.writeText?.(this.state.error?.message ?? "").catch(() => {})}
                className="p-1 rounded text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
              >
                <Copy size={12} />
              </IconButton>
            </div>
          </div>
        )}
        <button
          onClick={this.reset}
          className="text-sm px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }
}
