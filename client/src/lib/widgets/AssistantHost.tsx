// Container for the `assistant` (AI Briefing) widget type (AGENTS.md §6): owns the generation
// wiring — useAssistant snapshots the telemetry hub, calls the LLM provider on the configured
// schedule and optionally speaks the result — then renders the pure meters/Assistant meter with
// plain props. Registered as the type's component in plugins/llm.ts.
import { useAssistant } from './useAssistant';
import Assistant from './meters/Assistant';

type Props = {
	prompt?: string;
	schedule?: string;
	sensors?: string;
	speak?: boolean;
	label?: string;
	color?: string;
};

export default function AssistantHost({
	prompt = '',
	schedule = '10m',
	sensors = 'auto',
	speak = false,
	label = '',
	color
}: Props) {
	const { text, busy, error, refresh } = useAssistant({ prompt, schedule, sensors, speak });
	return (
		<Assistant
			text={text}
			busy={busy}
			error={error}
			label={label}
			color={color}
			onRefresh={refresh}
		/>
	);
}
