'use client';
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // Optionally log
    console.error('UI error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-10">
          <div className="mb-2">⚠️ Something went wrong.</div>
          <button className="border rounded-xl px-3 py-2" onClick={()=>location.reload()}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}
