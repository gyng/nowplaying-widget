import { describe, it, expect } from 'vitest';
import { buildCalendar, weekdayOrder, type CalDay } from './calendar';

const cell = (w: CalDay) => ({ y: w.y, m: w.m, d: w.d, inMonth: w.inMonth });

describe('weekdayOrder', () => {
	const SUN_FIRST = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	it('rotates a Sunday-first array to start at the given first day', () => {
		expect(weekdayOrder(SUN_FIRST, 0)).toEqual(SUN_FIRST);
		expect(weekdayOrder(SUN_FIRST, 1)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
		expect(weekdayOrder(SUN_FIRST, 6)).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
	});
});

// Jan 2024 is a convenient anchor: Jan 1 2024 is a MONDAY, and 2024 is a leap year (Feb has 29 days,
// Feb 29 2024 is a Thursday) — so the month/continuous boundaries are easy to reason about.
describe('buildCalendar (month mode)', () => {
	it('pads the focus month out to whole weeks (Sunday-first)', () => {
		const weeks = buildCalendar({ year: 2024, month: 0, firstDay: 0, mode: 'month' });
		// Every row is exactly 7 cells.
		expect(weeks.every((w) => w.length === 7)).toBe(true);
		// Jan starts Monday, so a Sunday-first grid leads with Dec 31 (dimmed), then Jan 1.
		expect(cell(weeks[0][0])).toEqual({ y: 2023, m: 11, d: 31, inMonth: false });
		expect(cell(weeks[0][1])).toEqual({ y: 2024, m: 0, d: 1, inMonth: true });
		// Jan 31 is a Wednesday → the last week trails into Feb up to Saturday Feb 3 (dimmed). 5 weeks.
		expect(weeks).toHaveLength(5);
		expect(cell(weeks[4][6])).toEqual({ y: 2024, m: 1, d: 3, inMonth: false });
	});

	it('honors first day of week = Monday (no leading days when the 1st is a Monday)', () => {
		const weeks = buildCalendar({ year: 2024, month: 0, firstDay: 1, mode: 'month' });
		expect(cell(weeks[0][0])).toEqual({ y: 2024, m: 0, d: 1, inMonth: true });
	});

	it('flags exactly one isToday cell, weekends, and inMonth correctly', () => {
		const weeks = buildCalendar({
			year: 2024,
			month: 0,
			firstDay: 0,
			mode: 'month',
			today: { y: 2024, m: 0, d: 15 }
		});
		const flat = weeks.flat();
		const todays = flat.filter((c) => c.isToday);
		expect(todays).toHaveLength(1);
		expect(cell(todays[0])).toEqual({ y: 2024, m: 0, d: 15, inMonth: true });
		// Column 0 is Sunday and column 6 is Saturday (firstDay=0) → both weekends.
		expect(weeks[0][0].isWeekend).toBe(true);
		expect(weeks[0][6].isWeekend).toBe(true);
		expect(weeks[0][1].isWeekend).toBe(false); // Monday
	});

	it('flags nothing as today when the focus month does not contain it', () => {
		const weeks = buildCalendar({
			year: 2024,
			month: 0,
			firstDay: 0,
			mode: 'month',
			today: { y: 2025, m: 5, d: 1 }
		});
		expect(weeks.flat().some((c) => c.isToday)).toBe(false);
	});
});

describe('buildCalendar (continuous mode)', () => {
	it('keeps going through the end of next month, dimmed, and is longer than month mode', () => {
		const month = buildCalendar({ year: 2024, month: 0, firstDay: 0, mode: 'month' });
		const cont = buildCalendar({ year: 2024, month: 0, firstDay: 0, mode: 'continuous' });
		expect(cont.length).toBeGreaterThan(month.length);
		// Ends on the week completing Feb 29 (a Thursday) → Saturday Mar 2 2024.
		expect(cell(cont[cont.length - 1][6])).toEqual({ y: 2024, m: 2, d: 2, inMonth: false });
		// All February days are dimmed (the focus month is January).
		expect(
			cont
				.flat()
				.filter((c) => c.m === 1)
				.every((c) => !c.inMonth)
		).toBe(true);
		// January days stay in-month.
		expect(
			cont
				.flat()
				.filter((c) => c.m === 0 && c.y === 2024)
				.every((c) => c.inMonth)
		).toBe(true);
		expect(cont.every((w) => w.length === 7)).toBe(true);
	});
});
