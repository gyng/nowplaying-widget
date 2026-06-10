// Resolve a NAMED sensor-id map (WidgetMeta.sensors, derived from the instance config) into a live
// { name → SensorState } snapshot — the wiring half of config-driven multi-sensor binding. Unlike
// useSensors.ts (flat id → latest value, for formulas), meters need the full SensorState (value
// kind + history, e.g. the ticker's series/sparkline). One useSyncExternalStore fans out to each
// id's observable, so the hook count stays fixed however many ids the config produces; the snapshot
// is cached and only rebuilt when a subscribed sensor emits or the id map changes (no tearing).
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import type { SensorState, TelemetryHub } from '../core/telemetry';

export type SensorStateMap = Record<string, SensorState>;

const EMPTY: SensorStateMap = Object.freeze({});

export function useSensorMap(
	hub: TelemetryHub,
	ids: Record<string, string> | undefined
): SensorStateMap {
	// A by-value identity for the id map (configs are tiny), so subscribe/getSnapshot only rebind
	// when the contents change — a fresh-but-equal object per render must not resubscribe.
	const key = ids && Object.keys(ids).length ? JSON.stringify(ids) : '';
	const entries = useMemo(
		() => (key ? (Object.entries(JSON.parse(key)) as [string, string][]) : []),
		[key]
	);
	const cache = useRef<{ key: string; map: SensorStateMap } | null>(null);

	const subscribe = useCallback(
		(cb: () => void) => {
			const unsubs = entries.map(([, id]) =>
				hub.sensor(id).subscribe(() => {
					cache.current = null; // a sample landed → next getSnapshot rebuilds the map
					cb();
				})
			);
			return () => unsubs.forEach((u) => u());
		},
		[hub, entries]
	);

	const getSnapshot = useCallback((): SensorStateMap => {
		if (entries.length === 0) return EMPTY;
		const c = cache.current;
		if (c && c.key === key) return c.map;
		const map: SensorStateMap = {};
		for (const [name, id] of entries) map[name] = hub.sensor(id).getSnapshot();
		cache.current = { key, map };
		return map;
	}, [hub, entries, key]);

	return useSyncExternalStore(subscribe, getSnapshot);
}
