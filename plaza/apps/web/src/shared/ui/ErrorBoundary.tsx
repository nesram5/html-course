import { Component, type ErrorInfo, type ReactNode } from 'react';

import { reportError } from '../lib/sentry';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Rendered instead of the children after an error; `reset` renders them again. */
  fallback: (reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches render errors and reports them. React only supports error boundaries as class
 * components, hence the exception to the "function components" rule.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(Object.assign(error, { componentStack: info.componentStack }));
  }

  reset = (): void => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (this.state.hasError) return this.props.fallback(this.reset);
    return this.props.children;
  }
}
