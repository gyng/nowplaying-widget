// Outer-ring adapter for the backend's structured log stream (widgetsack/src/log.rs). A future
// in-app logs UI uses `getLogs()` for the backlog (the in-memory ring buffer) and `subscribeLogs()`
// for live entries (the `log` Tauri event). Tauri stays at this edge; the LogRecord type is pure
// (core/logs.ts).
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { LogRecord } from './core/logs';

/** The buffered log backlog (oldest first) for a UI that opens after entries were produced. */
export function getLogs(): Promise<LogRecord[]> {
	return invoke<LogRecord[]>('get_logs').catch(() => []);
}

/** Stream new log entries as the backend emits them. Returns an unlisten function. */
export function subscribeLogs(cb: (record: LogRecord) => void): Promise<UnlistenFn> {
	return listen<LogRecord>('log', (ev) => cb(ev.payload));
}
