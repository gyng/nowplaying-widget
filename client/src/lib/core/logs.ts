// Structured backend log entry — mirrors the Rust `LogRecord` / `LogLevel` in widgetsack/src/log.rs
// (AGENTS.md §5: keep both sides of the bridge in sync). Pure types only — the Tauri adapter that
// fetches the backlog / streams new entries lives in the outer ring (lib/logs.ts).

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export type LogRecord = {
	ts_ms: number; // unix epoch millis
	level: LogLevel;
	target: string; // subsystem: 'gsmtc' | 'sensors' | 'ha' | 'watch' | 'clickthrough' | 'bridge' | 'startup' | …
	message: string;
	fields?: Record<string, string>; // structured key/values (omitted when empty)
};

// Ascending severity — handy for "show this level and above" filters in a logs UI.
export const LOG_LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];

/** True when `level` is at least `min` in severity (e.g. atLeastLevel('warn', 'info') === true). */
export function atLeastLevel(level: LogLevel, min: LogLevel): boolean {
	return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(min);
}
