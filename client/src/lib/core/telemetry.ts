// Framework-agnostic telemetry core. No Svelte and no Tauri imports — this is the
// inner domain ring (AGENTS.md §5) and is meant to be reused verbatim by a future
// React port. Mirrors the Rust `SensorValue` / `SensorSample` in np/src/sensors.rs
// (snake_case across the bridge — keep both sides in sync).

export type SensorValue =
	| { kind: 'scalar'; value: number }
	| { kind: 'text'; value: string }
	| { kind: 'series'; value: number[] }
	| { kind: 'json'; value: unknown };

export type SensorSample = { sensor: string; ts_ms: number; value: SensorValue };
export type TelemetryBatch = SensorSample[];

export type SensorState = { value: SensorValue | null; history: number[] };

// A single frozen empty state, shared so `getSnapshot()` is referentially stable
// before any sample arrives (required for React's useSyncExternalStore).
const EMPTY: SensorState = Object.freeze({ value: null, history: [] }) as SensorState;

export const emptySensorState = (): SensorState => ({ value: null, history: [] });

/** The numeric component of a sample for history/sparklines, or null if non-numeric. */
function numericOf(value: SensorValue): number | null {
	if (value.kind === 'scalar') return value.value;
	if (value.kind === 'series') return value.value.at(-1) ?? null;
	return null;
}

/** Pure reducer: apply a sample to a sensor's state, capping history at `historyLen`. */
export function appendSample(
	state: SensorState,
	sample: SensorSample,
	historyLen: number
): SensorState {
	const n = numericOf(sample.value);
	if (n === null) return { value: sample.value, history: state.history };
	const next = [...state.history, n];
	const history = historyLen > 0 ? next.slice(-historyLen) : [];
	return { value: sample.value, history };
}

/** A minimal notify-based observable — consumable by Svelte stores and React alike. */
export interface SensorObservable {
	subscribe(cb: () => void): () => void;
	getSnapshot(): SensorState;
}

export interface TelemetryHub {
	ingest(sample: SensorSample): void;
	ingestBatch(batch: TelemetryBatch): void;
	sensor(id: string): SensorObservable;
	/** Ids of sensors seen so far (i.e. that have emitted at least one sample). */
	sensorIds(): string[];
}

/** Create a hub that routes samples to per-sensor state and notifies subscribers. */
export function createTelemetryHub(historyLen = 120): TelemetryHub {
	const states = new Map<string, SensorState>();
	const listeners = new Map<string, Set<() => void>>();

	const stateOf = (id: string): SensorState => states.get(id) ?? EMPTY;

	const ingest = (sample: SensorSample): void => {
		states.set(sample.sensor, appendSample(stateOf(sample.sensor), sample, historyLen));
		listeners.get(sample.sensor)?.forEach((cb) => cb());
	};

	return {
		ingest,
		ingestBatch: (batch) => batch.forEach(ingest),
		sensorIds: () => Array.from(states.keys()),
		sensor: (id) => ({
			subscribe(cb) {
				let set = listeners.get(id);
				if (!set) {
					set = new Set();
					listeners.set(id, set);
				}
				set.add(cb);
				return () => {
					set?.delete(cb);
				};
			},
			getSnapshot: () => stateOf(id)
		})
	};
}
