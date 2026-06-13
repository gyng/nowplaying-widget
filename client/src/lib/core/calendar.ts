// Pure month-grid builder for the Calendar widget. No React/Tauri/DOM — data in, data out, so it's
// unit-tested directly (calendar.test.ts); the meter (meters/Calendar.tsx) self-sources the current
// date and renders what this returns. Dates are handled as local `new Date(y, m, d)` triples (m is
// 0-based, matching Date.getMonth()), which roll month/year over correctly.

/** One cell of the grid. `m` is 0-based. `inMonth` = belongs to the focus month (others are the
 * leading/trailing days that fill complete weeks — rendered dimmed). */
export type CalDay = {
	y: number;
	m: number;
	d: number;
	inMonth: boolean;
	isToday: boolean;
	isWeekend: boolean;
};

/** 'month' = just the focus month, padded out to whole weeks. 'continuous' = keep going (dimmed)
 * through the END of the week that contains the last day of the NEXT month — a continuous strip. */
export type CalMode = 'month' | 'continuous';

export type CalSpec = {
	/** Focus month: full year + 0-based month. */
	year: number;
	month: number;
	/** Which weekday starts a row: 0 = Sunday … 6 = Saturday. */
	firstDay: number;
	mode: CalMode;
	/** Today, for the `isToday` flag. Omit to flag nothing. */
	today?: { y: number; m: number; d: number };
};

/** Rotate a Sunday-first array of 7 (weekday names) so it starts at `firstDay`. Pure — used for both
 * the header labels and to reason about column order. */
export function weekdayOrder<T>(sundayFirst: T[], firstDay: number): T[] {
	const f = ((firstDay % 7) + 7) % 7;
	return Array.from({ length: 7 }, (_, i) => sundayFirst[(f + i) % 7]);
}

const next = (date: Date): Date =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

/**
 * The calendar as rows of 7 days. The first row starts on `firstDay` on/before the 1st of the focus
 * month; the last row completes the week containing the focus month's last day ('month') or the NEXT
 * month's last day ('continuous'). Every row is exactly 7 cells.
 */
export function buildCalendar(spec: CalSpec): CalDay[][] {
	const { year, month, mode, today } = spec;
	const firstDay = ((spec.firstDay % 7) + 7) % 7;

	// Start: roll the 1st of the month back to the most recent `firstDay` weekday.
	const first = new Date(year, month, 1);
	const startBack = (first.getDay() - firstDay + 7) % 7;
	const start = new Date(year, month, 1 - startBack);

	// Last day to include before completing the final week: this month's, or next month's (continuous).
	// `new Date(y, m + 1, 0)` is the last day of month `m`.
	const lastDay = new Date(year, month + (mode === 'continuous' ? 2 : 1), 0);
	const lastCol = (firstDay + 6) % 7; // weekday in the rightmost column
	const endFwd = (lastCol - lastDay.getDay() + 7) % 7;
	const end = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + endFwd);

	const weeks: CalDay[][] = [];
	let week: CalDay[] = [];
	for (let cur = start; cur <= end; cur = next(cur)) {
		const dow = cur.getDay();
		const y = cur.getFullYear();
		const m = cur.getMonth();
		const d = cur.getDate();
		week.push({
			y,
			m,
			d,
			inMonth: m === month && y === year,
			isToday: !!today && y === today.y && m === today.m && d === today.d,
			isWeekend: dow === 0 || dow === 6
		});
		if (week.length === 7) {
			weeks.push(week);
			week = [];
		}
	}
	return weeks;
}
