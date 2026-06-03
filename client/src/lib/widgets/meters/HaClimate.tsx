// Interactive HA meter (molecule): a climate readout (current → target setpoint + mode) with
// ± setpoint nudge buttons for single-setpoint thermostats. Reads from the entity's JSON
// attributes (binds: 'json'); a nudge calls `onControl` (climate.set_temperature) that WidgetHost
// bubbles to Canvas. Range (high/low) thermostats display read-only. Prop-only, token-themeable
// (AGENTS.md §6); the service_data is built by the pure core/haControls helpers.
import { climateNudge, climateUsesRange, type ClimateAttrs } from '../../core/haControls';
import type { ControlEvent } from '../meterProps';
import './HaClimate.css';

type HaState = { state?: string; attributes?: Record<string, unknown> };

type Props = {
	value?: unknown;
	label?: string;
	onControl?: (e: ControlEvent) => void;
};

export default function HaClimate({ value = null, label, onControl }: Props) {
	const s = (value ?? null) as HaState | null;
	const attrs = (s?.attributes ?? {}) as ClimateAttrs & Record<string, unknown>;
	const name = label ?? (attrs.friendly_name as string | undefined) ?? 'Climate';
	const mode = s?.state ?? '—';
	const current = attrs.current_temperature as number | undefined;
	const target = attrs.temperature as number | undefined;
	const fmt = (n: number | undefined): string => (n === undefined ? '—' : `${n}°`);

	// Single-setpoint, controllable thermostats get nudge buttons; range/off/unavailable display only.
	const controllable =
		!!onControl && mode !== 'off' && mode !== 'unavailable' && !climateUsesRange(attrs);
	const nudge = (dir: 1 | -1) => {
		const call = climateNudge(attrs, dir);
		onControl?.({ domain: 'climate', service: call.service, data: call.data });
	};

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
			{controllable && (
				<div className="ha-climate-set" data-part="controls">
					<button
						type="button"
						className="ha-climate-btn"
						aria-label={`Lower ${name} setpoint`}
						onClick={() => nudge(-1)}
					>
						−
					</button>
					<button
						type="button"
						className="ha-climate-btn"
						aria-label={`Raise ${name} setpoint`}
						onClick={() => nudge(1)}
					>
						＋
					</button>
				</div>
			)}
		</div>
	);
}
