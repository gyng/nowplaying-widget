// Svelte adapter over the framework-agnostic SensorObservable. A React port replaces
// this one file with a useSyncExternalStore hook over the same observable; nothing in
// core/ changes.

import { readable, type Readable } from 'svelte/store';
import type { SensorState, TelemetryHub } from '../core/telemetry';

export function sensorStore(hub: TelemetryHub, id: string): Readable<SensorState> {
	const obs = hub.sensor(id);
	return readable(obs.getSnapshot(), (set) => obs.subscribe(() => set(obs.getSnapshot())));
}
