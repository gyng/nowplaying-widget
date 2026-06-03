// Interactive HA meter (molecule): a light toggle. Reads on/off from the entity's JSON state
// (binds: 'json'); a click calls the `onControl` callback (domain/service) that WidgetHost bubbles
// to Canvas, which makes the Tauri `ha_call_service` call. The meter itself stays prop-only and
// Tauri-free (AGENTS.md §6). Catches clicks in passive mode via `interactive: true` on its meta.
import './HaLight.css';

type HaState = { state?: string; attributes?: Record<string, unknown> };

type Props = {
	value?: unknown;
	label?: string;
	onControl?: (e: { domain: string; service: string }) => void;
};

export default function HaLight({ value = null, label, onControl }: Props) {
	const s = (value ?? null) as HaState | null;
	const on = s?.state === 'on';
	const name = label ?? (s?.attributes?.friendly_name as string | undefined) ?? 'Light';

	const toggle = () => onControl?.({ domain: 'light', service: 'toggle' });

	return (
		<button className={`ha-light np-ha-light${on ? ' on' : ''}`} data-part="root" onClick={toggle}>
			<span className="label" data-part="label">
				{name}
			</span>
			<span className="state" data-part="state">
				{on ? 'ON' : 'OFF'}
			</span>
		</button>
	);
}
