// A small error boundary (class component — React has no hook equivalent) so one throwing
// subtree (e.g. a plugin's settings panel) degrades to a compact inline error instead of
// unmounting the whole studio rail. Key it by the wrapped content's identity so switching
// to a healthy panel remounts a fresh boundary.

import { Component, type ReactNode } from 'react';
import './ErrorBoundary.css';

type Props = { label?: string; children: ReactNode };
type State = { error: string | null };

export default class ErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(err: unknown): State {
		return { error: err instanceof Error ? err.message : String(err) };
	}

	componentDidCatch(err: unknown): void {
		console.error(`${this.props.label ?? 'panel'} crashed`, err);
	}

	render(): ReactNode {
		if (this.state.error !== null) {
			return (
				<div className="error-boundary" role="alert">
					⚠ {this.props.label ?? 'This panel'} failed to render: {this.state.error}
				</div>
			);
		}
		return this.props.children;
	}
}
