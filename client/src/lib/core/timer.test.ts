import { describe, it, expect } from 'vitest';
import { formatDuration } from './timer';

describe('formatDuration', () => {
	it('mm:ss by default for under an hour', () => {
		expect(formatDuration(0)).toBe('00:00');
		expect(formatDuration(5)).toBe('00:05');
		expect(formatDuration(65)).toBe('01:05');
		expect(formatDuration(599)).toBe('09:59');
	});

	it('auto shows hours once present', () => {
		expect(formatDuration(3661)).toBe('01:01:01');
		expect(formatDuration(3600)).toBe('01:00:00');
	});

	it('forced formats', () => {
		expect(formatDuration(65, 'hh:mm:ss')).toBe('00:01:05');
		expect(formatDuration(3661, 'mm:ss')).toBe('61:01'); // mm:ss never rolls into hours
		expect(formatDuration(125, 'ss')).toBe('125');
	});

	it('clamps negatives and floors fractions', () => {
		expect(formatDuration(-5)).toBe('00:00');
		expect(formatDuration(59.9)).toBe('00:59');
	});
});
