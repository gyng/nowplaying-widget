// Pure time-formatting for the Timer widget. Inner ring (AGENTS.md §5) — no React, no clock of its
// own; the widget's hook drives the tick and asks this to render a count. Unit-tested directly.

export type TimerFormat = 'auto' | 'mm:ss' | 'hh:mm:ss' | 'ss';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Format a non-negative duration in seconds. `auto` shows hours only when there's at least one;
 * `mm:ss` / `hh:mm:ss` force a width; `ss` is the raw second count. Negatives clamp to 0; fractional
 * seconds floor (pass `Math.ceil`-ed seconds for a countdown if you want it to show the ceiling). */
export function formatDuration(totalSeconds: number, format = 'auto'): string {
	const s = Math.max(0, Math.floor(totalSeconds));
	if (format === 'ss') return String(s);
	const ss = s % 60;
	const showHours = format === 'hh:mm:ss' || (format !== 'mm:ss' && s >= 3600);
	if (showHours) {
		const hh = Math.floor(s / 3600);
		const mm = Math.floor((s % 3600) / 60);
		return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
	}
	// No hours shown → minutes is the TOTAL minute count (so mm:ss can exceed 59:59).
	return `${pad(Math.floor(s / 60))}:${pad(ss)}`;
}
