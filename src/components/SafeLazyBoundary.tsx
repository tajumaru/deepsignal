import { Component, type ErrorInfo, type ReactNode } from "react";

type SafeLazyBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  onError?: (error: unknown, errorInfo: ErrorInfo) => void;
  resetKey: string;
};

type SafeLazyBoundaryState = {
  hasError: boolean;
};

export class SafeLazyBoundary extends Component<SafeLazyBoundaryProps, SafeLazyBoundaryState> {
  state: SafeLazyBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(previousProps: Readonly<SafeLazyBoundaryProps>) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
