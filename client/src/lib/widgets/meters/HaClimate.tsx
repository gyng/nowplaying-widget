// Presentational HA meter (molecule): a read-only climate readout — current temperature
// → target setpoint, pulled from the entity's JSON attributes (binds: 'json'). Control
// (raising/lowering the setpoint) is a future enhancement; v1 displays only. Prop-only,
// token-themeable (AGENTS.md §6).
import './HaClimate.css';

type HaState = { state?: string; attributes?: Record<string, unknown> };

type Props = {
	value?: unknown;
	label?: string;
};

export default function HaClimate({ value = null, label }: Props) {
	const s = (value ?? null) as HaState | null;
	const attrs = s?.attributes ?? {};
	const name = label ?? (attrs.friendly_name as string | undefined) ?? 'Climate';
	const mode = s?.state ?? '—';
	const current = attrs.current_temperature as number | undefined;
	const target = attrs.temperature as number | undefined;
	const fmt = (n: number | undefined): string => (n === undefined ? '—' : `${n}°`);

	return (
		<div className="ha-climate np-ha-climate" data-part="root">
			<span className="label" data-part="label">
				{name}
			</span>
			<span className="temps" data-part="value">
				{fmt(current)} → {fmt(target)}
			</span>
			<span className="mode" data-part="mode">
				{mode}
			</span>
		</div>
	);
}
