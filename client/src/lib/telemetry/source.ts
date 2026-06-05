// Outer-ring adapter: pipes the Tauri `telemetry` event into the framework-agnostic
// hub. The Tauri dependency lives here, not in core/ (AGENTS.md §5). A React port
// reuses this file unchanged (Tauri is infra, not a UI framework).

import * as tauriEvent from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type { TelemetryBatch, TelemetryHub } from '../core/telemetry';
import { registerSource, type SensorSource } from '../core/plugin';
import { isStudioWindow } from '../overlay';

export const TELEMETRY_EVENT = 'telemetry';

/** Wildcard sentinel: this window wants every sensor sampled (GPU included). */
const ALL_SENSORS = '*';
/** Coalesce active-set churn (a layout re-render can subscribe many sensors at once). */
const REPORT_DEBOUNCE_MS = 250;

const reportActive = (ids: string[]): void => {
	void invoke('set_active_sensors', { ids }).catch((err) => {
		console.error('set_active_sensors failed', err);
	});
};

/** Subscribe the hub to backend telemetry, and report which sensors have live UI
 * subscribers so the backend can demand-gate expensive sensors (AGENTS.md #9).
 * Resolves to an unlisten function that tears down the listen, the active-set
 * subscription, and any pending debounce timer. */
export async function startTelemetrySource(hub: TelemetryHub): Promise<tauriEvent.UnlistenFn> {
	const unlisten = await tauriEvent.listen<TelemetryBatch>(TELEMETRY_EVENT, (ev) => {
		hub.ingestBatch(ev.payload);
	});

	// The studio wants EVERYTHING (so the sensor picker can discover gpu.* etc) — it reports the `*`
	// wildcard. But `*` can't enumerate an unbounded symbol space, so demand-derived sources (stocks)
	// also need the concrete `stocks.<SYM>.*` ids a previewed widget subscribes to in order to know
	// WHICH symbols to fetch; hence the studio reports the wildcard PLUS its live active set, not just
	// once. The overlay reports only the sensors actually bound to its widgets. Both are debounced (a
	// layout re-render can churn the active set).
	const studio = isStudioWindow();
	const idsToReport = (): string[] =>
		studio ? [ALL_SENSORS, ...hub.activeSensorIds()] : hub.activeSensorIds();

	let timer: ReturnType<typeof setTimeout> | null = null;
	const scheduleReport = (): void => {
		if (timer !== null) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			reportActive(idsToReport());
		}, REPORT_DEBOUNCE_MS);
	};
	const offActive = hub.onActiveChange(scheduleReport);
	reportActive(idsToReport()); // initial report (studio: the wildcard; overlay: typically empty)

	return () => {
		if (timer !== null) clearTimeout(timer);
		offActive();
		unlisten();
	};
}

/** The built-in `system` source: the Rust `telemetry` feed as a SensorSource (Phase 8b).
 * Importing this module registers it; plugins (e.g. Home Assistant) register their own. */
export const systemSource: SensorSource = {
	id: 'system',
	start: (hub) => startTelemetrySource(hub)
};

registerSource(systemSource);
