// Action button (presentational): pressing it emits a single `macro` ControlEvent carrying its
// configured action list; Canvas.onWidgetControl runs the sequence (HA service calls / media
// transport). Prop-only and Tauri-free (AGENTS.md §6) — the meter just normalizes its config and
// bubbles intent. With no actions it's an inert label (and the per-widget click-through canary:
// `interactive: true` lets it catch clicks in passive mode). Themeable via --np-accent / -bg / -fg.
import type { ControlEvent } from '../meterProps';
import { normalizeMacro } from '../../core/macro';
import './Button.css';

type Props = {
	label?: string;
	// The macro config (MacroAction[]); arbitrary JSON until normalized, so typed as unknown.
	actions?: unknown;
	onControl?: (e: ControlEvent) => void;
};

export default function Button({ label = 'tap', actions, onControl }: Props) {
	const macro = normalizeMacro(actions);
	const run = () => {
		if (macro.length === 0) return; // inert until actions are configured
		onControl?.({ domain: 'macro', service: 'run', data: { actions: macro } });
	};

	return (
		<button
			type="button"
			className="np-button"
			data-actions={macro.length || undefined}
			onClick={run}
		>
			<span className="label" data-part="label">
				{label}
			</span>
		</button>
	);
}
