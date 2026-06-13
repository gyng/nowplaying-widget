import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import Calendar from './Calendar';

afterEach(cleanup);

// The meter self-sources the real date, so these assert STRUCTURE (the grid math is exhaustively
// covered in core/calendar.test.ts) — which holds whatever today happens to be.
describe('Calendar meter', () => {
	it('renders a 7-column weekday header and highlights today by default', () => {
		const { container } = render(<Calendar />);
		expect(container.querySelectorAll('.cal-head .cal-wd')).toHaveLength(7);
		expect(container.querySelectorAll('.cal-today')).toHaveLength(1); // today is in the month grid
		const rows = container.querySelectorAll('.cal-row:not(.cal-head)');
		expect(rows.length).toBeGreaterThanOrEqual(4);
		rows.forEach((r) => expect(r.querySelectorAll('.cal-day')).toHaveLength(7));
	});

	it('omits the header and today highlight when those options are off', () => {
		const { container } = render(<Calendar weekdayHeader={false} highlightToday={false} />);
		expect(container.querySelector('.cal-head')).toBeNull();
		expect(container.querySelector('.cal-today')).toBeNull();
	});

	it('starts the week on Monday when configured', () => {
		const { container } = render(<Calendar firstDay="Monday" />);
		const heads = container.querySelectorAll('.cal-head .cal-wd');
		expect(heads[0].textContent).toBe('Mon');
		expect(heads[6].textContent).toBe('Sun');
	});

	it('continuous mode renders more weeks than the default month view', () => {
		const monthRows = render(<Calendar />).container.querySelectorAll(
			'.cal-row:not(.cal-head)'
		).length;
		cleanup();
		const contRows = render(<Calendar continuous />).container.querySelectorAll(
			'.cal-row:not(.cal-head)'
		).length;
		expect(contRows).toBeGreaterThan(monthRows);
	});
});
