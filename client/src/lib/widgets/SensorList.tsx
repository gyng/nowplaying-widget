// A live list of sensors and their current values (the studio's full-screen Sensors section). Each
// row subscribes to one sensor via useSensor, so values tick in place. Ids come from the union of
// the hub's seen sensors + every source's catalog (so not-yet-emitted sensors still show as "—").
import { useSensor } from './useSensor';
import type { SensorValue, TelemetryHub } from '../core/telemetry';

/** A short, human display of a sensor's current value (pure — unit-tested). */
export function formatSensorValue(v: SensorValue | null): string {
	if (!v) return '—';
	if (v.kind === 'scalar') return Number.isInteger(v.value) ? String(v.value) : v.value.toFixed(2);
	if (v.kind === 'text') return v.value;
	if (v.kind === 'series') {
		const last = v.value.at(-1);
		return last == null ? '[ ]' : `${Number.isInteger(last) ? last : last.toFixed(1)} ⋯`;
	}
	return JSON.stringify(v.value).slice(0, 48);
}

function SensorRow({ hub, id }: { hub: TelemetryHub; id: string }) {
	const state = useSensor(hub, id);
	return (
		<div className="rp-row">
			<span>{id}</span>
			<span className="dim">{formatSensorValue(state.value)}</span>
		</div>
	);
}

export default function SensorList({ hub, ids }: { hub: TelemetryHub; ids: string[] }) {
	if (!ids.length) return <div className="rp-stub">No sensors yet.</div>;
	return (
		<div className="rp-sensors">
			{ids.map((id) => (
				<SensorRow key={id} hub={hub} id={id} />
			))}
		</div>
	);
}
