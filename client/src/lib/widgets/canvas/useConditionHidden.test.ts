import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createTelemetryHub } from '../../core/telemetry';
import { container } from '../../core/layoutTree';
import { WINDOWS_SENSOR } from '../../core/condition';
import { useConditionHidden } from './useConditionHidden';

const root = () =>
	container('root', 'col', [
		container('spotify', 'row', [], { condition: { kind: 'appOpen', matchExe: 'spotify.exe' } }),
		container('busy', 'row', [], {
			condition: { kind: 'sensor', sensorId: 'cpu.total', op: '>', value: '80' }
		})
	]);

const spotifyWin = {
	hwnd: 1,
	exe: 'C:/x/Spotify.exe',
	className: 'C',
	title: 'T',
	rect: { x: 0, y: 0, w: 1, h: 1 }
};

describe('useConditionHidden', () => {
	it('returns empty when inactive (studio / edit mode), even with conditions', () => {
		const hub = createTelemetryHub();
		const { result } = renderHook(() => useConditionHidden(hub, root(), false));
		expect(result.current.size).toBe(0);
	});

	it('hides unmet conditions when active and reacts to live changes', () => {
		const hub = createTelemetryHub();
		const r = root();
		const { result } = renderHook(() => useConditionHidden(hub, r, true));
		// No window list / sensor yet → both conditions unmet → both hidden.
		expect([...result.current].sort()).toEqual(['busy', 'spotify']);

		act(() => {
			hub.ingest({
				sensor: WINDOWS_SENSOR,
				ts_ms: 1,
				value: { kind: 'json', value: [spotifyWin] }
			});
		});
		expect([...result.current]).toEqual(['busy']); // spotify open → shown; cpu still low → hidden

		act(() => {
			hub.ingest({ sensor: 'cpu.total', ts_ms: 2, value: { kind: 'scalar', value: 95 } });
		});
		expect(result.current.size).toBe(0); // cpu > 80 → busy shown too
	});
});
