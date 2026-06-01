import { describe, expect, it } from 'vitest';
import { appendSample, createTelemetryHub, emptySensorState } from './telemetry';

describe('appendSample', () => {
	it('appends scalar values to history and caps the length', () => {
		let s = emptySensorState();
		for (let i = 0; i < 5; i++) {
			s = appendSample(
				s,
				{ sensor: 'cpu.total', ts_ms: i, value: { kind: 'scalar', value: i } },
				3
			);
		}
		expect(s.history).toEqual([2, 3, 4]);
		expect(s.value).toEqual({ kind: 'scalar', value: 4 });
	});

	it('keeps the latest value but not history for non-numeric samples', () => {
		const s = appendSample(
			emptySensorState(),
			{ sensor: 'clock', ts_ms: 1, value: { kind: 'text', value: 'hi' } },
			10
		);
		expect(s.history).toEqual([]);
		expect(s.value).toEqual({ kind: 'text', value: 'hi' });
	});

	it('tracks the last point of a series', () => {
		const s = appendSample(
			emptySensorState(),
			{ sensor: 'cpu.cores', ts_ms: 1, value: { kind: 'series', value: [1, 2, 3] } },
			10
		);
		expect(s.history).toEqual([3]);
	});
});

describe('createTelemetryHub', () => {
	it('notifies subscribers and exposes per-sensor snapshots', () => {
		const hub = createTelemetryHub(10);
		const obs = hub.sensor('cpu.total');
		let notified = 0;
		const unsub = obs.subscribe(() => notified++);

		hub.ingest({ sensor: 'cpu.total', ts_ms: 1, value: { kind: 'scalar', value: 42 } });
		expect(notified).toBe(1);
		expect(obs.getSnapshot().value).toEqual({ kind: 'scalar', value: 42 });
		expect(obs.getSnapshot().history).toEqual([42]);

		unsub();
		hub.ingest({ sensor: 'cpu.total', ts_ms: 2, value: { kind: 'scalar', value: 7 } });
		expect(notified).toBe(1);
	});

	it('routes a batch and isolates sensors from each other', () => {
		const hub = createTelemetryHub();
		hub.ingestBatch([
			{ sensor: 'a', ts_ms: 1, value: { kind: 'scalar', value: 1 } },
			{ sensor: 'b', ts_ms: 1, value: { kind: 'scalar', value: 2 } }
		]);
		expect(hub.sensor('a').getSnapshot().history).toEqual([1]);
		expect(hub.sensor('b').getSnapshot().history).toEqual([2]);
	});

	it('returns a referentially stable empty snapshot before any sample', () => {
		const obs = createTelemetryHub().sensor('missing');
		expect(obs.getSnapshot()).toBe(obs.getSnapshot());
	});
});
