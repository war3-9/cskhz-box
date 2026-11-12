import { Component, type ErrorInfo, type ReactNode } from "react";
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("界面渲染失败", error, info); }
  render() { return this.state.error ? <div className="loading-screen"><div><strong>界面打开失败</strong><p>{this.state.error.message}</p><button onClick={() => window.location.reload()}>重新打开</button></div></div> : this.props.children; }
}
