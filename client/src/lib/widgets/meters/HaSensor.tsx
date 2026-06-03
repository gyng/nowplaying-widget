// Presentational HA meter (molecule): renders one Home Assistant entity's state. The
// `value` prop is the raw HA state object (binds: 'json'), forwarded by WidgetHost from
// the `ha.<entity_id>` sensor the Rust proxy feeds over telemetry. Prop-only, themeable
// via tokens — no store, no Tauri (AGENTS.md §6).
import './HaSensor.css';

type HaState = { state?: string; attributes?: Record<string, unknown> };

type Props = {
	value?: unknown;
	label?: string;
};

export default function HaSensor({ value = null, label }: Props) {
	const s = (value ?? null) as HaState | null;
	const name = label ?? (s?.attributes?.friendly_name as string | undefined) ?? '—';
	const state = s?.state ?? '—';
	const unit = (s?.attributes?.unit_of_measurement as string | undefined) ?? '';

	return (
		<div className="ha-sensor np-ha-sensor" data-part="root">
			<span className="label" data-part="label">
				{name}
			</span>
			<span className="value" data-part="value">
				{state}
				{unit ? ` ${unit}` : ''}
			</span>
		</div>
	);
}
