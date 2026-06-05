// Framework-agnostic diagnostics core (AGENTS.md §5): pure shapes + reducers for the studio's
// Diagnostics panel. No Tauri, no DOM, no React — the live gathering and the cross-window event bridge
// live in the outer-ring adapter lib/diag.ts; this module only models and folds the data.

/** A window's JS heap usage (from Chromium's non-standard `performance.memory`), or null where the
 * runtime doesn't expose it. Bytes, not MB — the UI formats with core/format.ts formatBytes. */
export type HeapStats = { usedBytes: number; totalBytes: number; limitBytes: number } | null;

/** The non-standard `performance.memory` shape (Chromium / WebView2 only). */
export type DiagMemory = {
	usedJSHeapSize: number;
	totalJSHeapSize: number;
	jsHeapSizeLimit: number;
};

export type WindowRole = 'studio' | 'main' | 'overlay';

/** Per-widget-TYPE DOM weight: how many instances of a widget type are mounted and how many DOM nodes
 * they own in total. The closest thing to "per-widget memory" available live (true per-component heap
 * bytes aren't exposed by any web API) — a type whose `nodes` climbs over time is a DOM leak. */
export type WidgetBreakdown = { type: string; count: number; nodes: number };

/** One window's diagnostics snapshot, reported back to the studio over the event bridge. */
export type WindowDiag = {
	label: string; // Tauri window label ('studio', 'main', 'overlay-2', …)
	role: WindowRole;
	monitor: string | null; // the ?monitor= key for overlays (null for studio/main)
	heap: HeapStats;
	sessions: number; // mediaStore session count
	artBytes: number; // total album-art bytes retained across sessions (the leak fingerprint)
	sensors: number; // distinct sensor ids seen by the hub
	activeSensors: number; // sensors with ≥1 live UI subscriber
	domNodes: number; // element count in the document
	widgets: WidgetBreakdown[]; // per-widget-type DOM weight (heaviest first)
	at: number; // performance.now() when sampled (freshness)
};

/** Parse Chromium's `performance.memory` into HeapStats, or null if unavailable/malformed. Pure. */
export function heapFromMemory(mem: DiagMemory | undefined | null): HeapStats {
	if (!mem || typeof mem.usedJSHeapSize !== 'number') return null;
	return {
		usedBytes: mem.usedJSHeapSize,
		totalBytes: mem.totalJSHeapSize,
		limitBytes: mem.jsHeapSizeLimit
	};
}

/** Fraction (0..1) of the heap limit in use, or null when heap stats / a positive limit are absent. */
export function heapUsedFraction(heap: HeapStats): number | null {
	if (!heap || heap.limitBytes <= 0) return null;
	return Math.min(1, Math.max(0, heap.usedBytes / heap.limitBytes));
}

/** Fold a freshly-arrived report into the by-label set, newest wins. Pure (returns a new map). */
export function mergeReport(
	reports: Record<string, WindowDiag>,
	report: WindowDiag
): Record<string, WindowDiag> {
	return { ...reports, [report.label]: report };
}

/** Drop reports not seen since `cutoff` (a window that closed stops answering) — keeps the panel from
 * showing stale/ghost windows. `now`/`at` share the reporter's clock domain only loosely, so the panel
 * passes the freshest local `at` it has observed; callers that can't, pass 0 to disable pruning. Pure. */
export function pruneStale(
	reports: Record<string, WindowDiag>,
	newestAt: number,
	maxAgeMs: number
): Record<string, WindowDiag> {
	if (maxAgeMs <= 0) return reports;
	const kept: Record<string, WindowDiag> = {};
	for (const [label, r] of Object.entries(reports)) {
		if (newestAt - r.at <= maxAgeMs) kept[label] = r;
	}
	return kept;
}

/** Fold raw per-widget node counts (one entry per mounted widget) into a per-TYPE breakdown, heaviest
 * DOM-weight first (ties broken by type name for a stable order). Pure — the DOM walk that produces the
 * raw entries lives in the lib/diag.ts adapter. */
export function aggregateWidgets(widgets: { type: string; nodes: number }[]): WidgetBreakdown[] {
	const byType = new Map<string, WidgetBreakdown>();
	for (const w of widgets) {
		const e = byType.get(w.type) ?? { type: w.type, count: 0, nodes: 0 };
		e.count += 1;
		e.nodes += w.nodes;
		byType.set(w.type, e);
	}
	return [...byType.values()].sort((a, b) => b.nodes - a.nodes || a.type.localeCompare(b.type));
}

/** Derive a window's role from its Tauri label, mirroring overlay.ts conventions. Pure. */
export function roleFromLabel(label: string): WindowRole {
	if (label === 'studio') return 'studio';
	if (label === 'main') return 'main';
	return 'overlay';
}
