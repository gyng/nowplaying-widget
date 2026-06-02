import { describe, expect, it } from 'vitest';
import { formatBytes, formatClock, formatPercent, formatRate, formatScalar } from './format';

describe('formatBytes', () => {
	it('scales with binary units', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(1536)).toBe('1.5 KiB');
		expect(formatBytes(1048576)).toBe('1.0 MiB');
	});

	it('handles zero and non-finite input', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(Number.NaN)).toBe('0 B');
	});
});

describe('formatRate / formatPercent', () => {
	it('formats a byte rate', () => {
		expect(formatRate(1048576)).toBe('1.0 MiB/s');
	});

	it('formats percentages with fixed decimals', () => {
		expect(formatPercent(42.7)).toBe('43%');
		expect(formatPercent(42.7, 1)).toBe('42.7%');
	});
});

describe('formatScalar', () => {
	it('routes by named format', () => {
		expect(formatScalar(50, 'percent')).toBe('50%');
		expect(formatScalar(2048, 'rate')).toBe('2.0 KiB/s');
		expect(formatScalar(3.6, 'integer')).toBe('4');
	});

	it('shows a placeholder for null', () => {
		expect(formatScalar(null, 'percent')).toBe('–');
	});
});

describe('formatClock', () => {
	// 2026-06-01 09:05:03 local — a Monday
	const d = new Date(2026, 5, 1, 9, 5, 3);

	it('formats time tokens', () => {
		expect(formatClock(d, 'HH:mm:ss')).toBe('09:05:03');
		expect(formatClock(d, 'h:mm A')).toBe('9:05 AM');
	});

	it('formats date tokens', () => {
		expect(formatClock(d, 'dddd')).toBe('Monday');
		expect(formatClock(d, 'ddd D MMMM YYYY')).toBe('Mon 1 June 2026');
	});

	it('preserves bracketed literals', () => {
		expect(formatClock(d, '[on] dddd')).toBe('on Monday');
	});

	it('renders Japanese weekday/month names for locale ja', () => {
		// Monday → 月 (ddd) / 月曜日 (dddd); June → 6月
		expect(formatClock(d, 'ddd', 'ja')).toBe('月');
		expect(formatClock(d, 'dddd', 'ja')).toBe('月曜日');
		expect(formatClock(d, 'MMMM', 'ja')).toBe('6月');
		// time tokens are locale-independent
		expect(formatClock(d, 'HH:mm ddd', 'ja')).toBe('09:05 月');
	});

	it('falls back to English for an unknown locale', () => {
		expect(formatClock(d, 'ddd', 'xx')).toBe('Mon');
	});
});
