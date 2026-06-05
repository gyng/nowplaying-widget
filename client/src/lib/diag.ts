// Outer-ring adapter (AGENTS.md §5): the cross-window diagnostics bridge behind the studio's
// Diagnostics panel. EVERY window runs a responder that answers the studio's poll with its own
// heap/counts (collectLocalDiagnostics) and obeys debug commands targeted at it (open devtools / toggle
// click-through). The studio polls, collects the reports, and drives the commands. Pure shapes + folds
// live in core/diagnostics.ts; Tauri lives only here.

import { emit, emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
	aggregateWidgets,
	heapFromMemory,
	roleFromLabel,
	type DiagMemory,
	type WidgetBreakdown,
	type WindowDiag
} from './core/diagnostics';
import type { TelemetryHub } from './core/telemetry';
import { mediaStore } from '../stores/stores';
import { sumArtBytes } from './components/NowPlaying/priority';
import { monitorParam, openDevtools, setClickThrough } from './overlay';

const DIAG_REQUEST = 'diag:request'; // studio → all windows: report your stats
const DIAG_REPORT = 'diag:report'; // window → studio: a WindowDiag
const DIAG_CMD = 'diag:cmd'; // studio → one window (by label): a debug command

/** A debug action the studio can drive on a target window. */
export type DiagCommand = { action: 'devtools' } | { action: 'interactive'; value: boolean };

/** The native (Rust HOST) process's perf snapshot. Mirrors `ProcessDiag` in
 * `widgetsack/src/process_diag.rs`. On Windows the WebView2 renderers are SEPARATE processes (their JS
 * heap is the per-window rows), so this is the Tauri host process alone. */
export type ProcessDiag = {
	pid: number;
	/** CPU usage as a percent of the whole machine (like `cpu.total`). */
	cpuPercent: number;
	/** Resident set size (physical memory) in bytes. */
	memBytes: number;
	/** Virtual memory size in bytes. */
	virtualBytes: number;
	/** Seconds the process has been running. */
	uptimeSecs: number;
	/** Logical CPU count. */
	cpus: number;
};

/** Poll the native process's CPU% + memory (studio only). Resolves `null` outside Tauri (tests) or if
 * the command fails, so the panel just omits the row rather than erroring. */
export async function getProcessDiagnostics(): Promise<ProcessDiag | null> {
	try {
		return await invoke<ProcessDiag>('process_diagnostics');
	} catch {
		return null;
	}
}

/** Read this window's heap (Chromium / WebView2 only `performance.memory`) past the type checker. */
function readMemory(): DiagMemory | undefined {
	const perf = performance as Performance & { memory?: DiagMemory };
	return perf.memory;
}

/** Per-widget-type DOM weight for THIS window: attribute every element under a widget to its NEAREST
 * `[data-w]` ancestor (so a group and its children partition the DOM rather than double-counting), then
 * fold by `data-type`. A type whose node total climbs over time is a DOM leak — the live, per-widget
 * proxy for "which widget is eating memory" (true per-component heap bytes aren't exposed by any API). */
function collectWidgetBreakdown(): WidgetBreakdown[] {
	if (typeof document === 'undefined') return [];
	const own = new Map<Element, { type: string; nodes: number }>();
	const widgetEls = document.querySelectorAll<HTMLElement>('[data-w]');
	widgetEls.forEach((el) => own.set(el, { type: el.dataset.type || '?', nodes: 0 }));
	// Count widget roots + every descendant once, charging each to its nearest widget ancestor.
	document.querySelectorAll('[data-w], [data-w] *').forEach((el) => {
		const owner = el.closest('[data-w]');
		const entry = owner ? own.get(owner) : undefined;
		if (entry) entry.nodes += 1;
	});
	return aggregateWidgets([...own.values()]);
}

/** Gather THIS window's diagnostics snapshot. `hub` may be null before the telemetry hub mounts. */
export function collectLocalDiagnostics(hub: TelemetryHub | null): WindowDiag {
	let label = 'unknown';
	try {
		label = getCurrentWindow().label;
	} catch {
		/* outside Tauri (tests) — keep the placeholder */
	}
	const sessions = mediaStore.getSnapshot().sessions;
	return {
		label,
		role: roleFromLabel(label),
		monitor: monitorParam(),
		heap: heapFromMemory(readMemory()),
		sessions: Object.keys(sessions).length,
		artBytes: sumArtBytes(sessions),
		sensors: hub ? hub.sensorIds().length : 0,
		activeSensors: hub ? hub.activeSensorIds().length : 0,
		domNodes: typeof document !== 'undefined' ? document.getElementsByTagName('*').length : 0,
		widgets: collectWidgetBreakdown(),
		at: typeof performance !== 'undefined' ? performance.now() : 0
	};
}

/** Run the per-window responder: answer the studio's poll and obey debug commands targeted at this
 * window. Mount ONCE per window (both roles). `getHub` is read lazily so the freshest hub is used.
 * Resolves to a teardown that removes both listeners. */
export async function startDiagResponder(getHub: () => TelemetryHub | null): Promise<UnlistenFn> {
	const offRequest = await listen(DIAG_REQUEST, () => {
		void emitTo('studio', DIAG_REPORT, collectLocalDiagnostics(getHub())).catch(() => undefined);
	});
	const offCmd = await listen<DiagCommand>(DIAG_CMD, (ev) => {
		const cmd = ev.payload;
		// `emitTo(label, …)` already targets one window, so no self-check is needed.
		if (cmd.action === 'devtools') void openDevtools();
		else if (cmd.action === 'interactive') void setClickThrough(!cmd.value);
	});
	return () => {
		offRequest();
		offCmd();
	};
}

/** Studio side: poll every window for a fresh report (broadcast — the studio answers itself too). */
export function requestDiagnostics(): void {
	void emit(DIAG_REQUEST).catch(() => undefined);
}

/** Studio side: subscribe to incoming reports. Resolves to the unlisten fn. */
export function listenDiagReports(cb: (report: WindowDiag) => void): Promise<UnlistenFn> {
	return listen<WindowDiag>(DIAG_REPORT, (ev) => cb(ev.payload));
}

/** Studio side: send a debug command to one window by label (devtools / interactive toggle). */
export function sendDiagCommand(label: string, cmd: DiagCommand): void {
	void emitTo(label, DIAG_CMD, cmd).catch(() => undefined);
}
