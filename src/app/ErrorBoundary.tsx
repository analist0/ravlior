import { Component, type ReactNode } from 'react';
import { ErrorState } from '../components/ui.tsx';

interface State { error: Error | null }
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  override componentDidCatch(error: Error) {
    // A lazy chunk can fail after a new deploy; a reload fetches the fresh build.
    if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(error.message)) {
      this.setState({ error: new Error('גרסה חדשה של האתר זמינה או שהרשת התנתקה. רעננו את העמוד.') });
    }
  }
  override render() {
    if (this.state.error)
      return (
        <div className="container section">
          <ErrorState error={this.state.error} onRetry={() => location.reload()} />
        </div>
      );
    return this.props.children;
  }
}
