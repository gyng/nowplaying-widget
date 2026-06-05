// Self-sourcing AI Briefing widget (binds:'none'): generates its own text from a configurable prompt
// on a configurable schedule (interval or cron), using the live sensor hub + the AI provider. The
// generation lives in the useAssistant hook (the documented self-sourcing exception — like Cpu reads
// the hub); the presentation is the pure `AssistantView` below, so it stays trivially testable.
import { useAssistant } from './useAssistant';
import './Assistant.css';

export type AssistantViewProps = {
	text?: string;
	busy?: boolean;
	error?: string;
	label?: string;
	color?: string;
	onRefresh?: () => void;
};

/** Pure presentation: what the widget looks like for a given text/state. */
export function AssistantView({
	text = '',
	busy = false,
	error = '',
	label = '',
	color,
	onRefresh
}: AssistantViewProps) {
	// `||` (not `??`) so a blank config color falls back to the theme variable.
	const colorCss = color || 'var(--np-fg, rgb(255, 255, 255))';
	const body = error ? `⚠ ${error}` : text || (busy ? 'Thinking…' : 'Waiting for the AI…');

	return (
		<div className="assistant np-assistant" data-part="root" style={{ color: colorCss }}>
			{label && (
				<span className="assistant-label" data-part="label">
					{label}
				</span>
			)}
			<span className="assistant-text" data-part="value">
				{body}
			</span>
			{onRefresh && (
				<button
					type="button"
					className="assistant-refresh"
					data-part="refresh"
					onClick={onRefresh}
					title="Generate now"
					aria-label="Generate now"
				>
					↻
				</button>
			)}
		</div>
	);
}

type Props = {
	prompt?: string;
	schedule?: string;
	sensors?: string;
	speak?: boolean;
	label?: string;
	color?: string;
};

export default function Assistant({
	prompt = '',
	schedule = '10m',
	sensors = 'auto',
	speak = false,
	label = '',
	color
}: Props) {
	const { text, busy, error, refresh } = useAssistant({ prompt, schedule, sensors, speak });
	return (
		<AssistantView
			text={text}
			busy={busy}
			error={error}
			label={label}
			color={color}
			onRefresh={refresh}
		/>
	);
}
