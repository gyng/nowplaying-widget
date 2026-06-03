// The data-source half of the plugin API (Phase 8b). A `SensorSource` feeds the
// telemetry hub (the built-in `system` source pipes the Rust `telemetry` event; a plugin
// like Home Assistant adds another). Sources are framework-agnostic — they only touch the
// hub — so this lives in core/. The full `Plugin` (widgets need Svelte components) is
// assembled in widgets/plugin.ts. Co-located vitest tests in plugin.test.ts.

import type { TelemetryHub } from './telemetry';

export type SensorSource = {
	id: string;
	/** Connect + start ingesting into `hub`; resolve to an unsubscribe/stop function. */
	start(hub: TelemetryHub): Promise<() => void>;
	/** Sensor ids this source provides, for the inspector's sensor dropdown (optional). */
	catalog?: () => string[];
};

const sources = new Map<string, SensorSource>();

/** Register (or replace) a sensor source by id. */
export function registerSource(source: SensorSource): void {
	sources.set(source.id, source);
}

export function listSources(): SensorSource[] {
	return Array.from(sources.values());
}

/** Start every registered source against `hub`; returns a single stop-all function.
 * Each source starts independently: one source that fails to start (e.g. an unreachable
 * Home Assistant) is logged and skipped rather than rejecting — a failed data source must
 * not abort app init, which now gates the (born-hidden) overlay's first reveal. */
export async function startAllSources(hub: TelemetryHub): Promise<() => void> {
	const results = await Promise.all(
		listSources().map((s) =>
			s.start(hub).catch((err): (() => void) => {
				console.warn(`source "${s.id}" failed to start`, err);
				return () => undefined;
			})
		)
	);
	return () => results.forEach((u) => u());
}

/** The union of every source's catalog ids (deduped), for the sensor dropdown. */
export function sourceCatalogIds(): string[] {
	const out = new Set<string>();
	for (const s of listSources()) for (const id of s.catalog?.() ?? []) out.add(id);
	return Array.from(out);
}
