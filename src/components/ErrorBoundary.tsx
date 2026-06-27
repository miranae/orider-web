import { Component, type ReactNode, type ErrorInfo } from "react";
import { captureError } from "../services/sentry";

/**
 * 로컬 React ErrorBoundary — Sentry.ErrorBoundary 대체.
 *
 * Sentry 가 entry chunk 에서 제외되도록 (dynamic import) 자체 boundary 사용.
 * Sentry 가 load 완료 후엔 captureError 가 즉시 전송, 미완료면 큐에 저장.
 *
 * @example
 * <ErrorBoundary fallback={({ error }) => <div>{error.message}</div>}>
 *   <App />
 * </ErrorBoundary>
 */
export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (info: { error: Error; reset: () => void }) => ReactNode;
  /** 기본 폴백 메시지 (훅 미사용 환경 대비). 미전달 시 "Something went wrong" 표시. */
  defaultFallbackMessage?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, {
      tags: { source: "react-error-boundary" },
      extra: { componentStack: info.componentStack ?? "" },
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback({ error: this.state.error, reset: this.reset });
      return (
        <div role="alert" aria-live="assertive" style={{ padding: 32, textAlign: "center" }}>
          {this.props.defaultFallbackMessage ?? "Something went wrong"}: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
