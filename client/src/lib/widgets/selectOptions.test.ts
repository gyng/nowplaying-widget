import { describe, it, expect } from 'vitest';
import { displayValue, filterOptions, optionFor, type SelectOption } from './selectOptions';

const OPTS: SelectOption[] = [
	{ value: 'cpu.total', label: 'CPU total', hint: 'cpu.total' },
	{ value: 'mem.used', label: 'Memory used', hint: 'mem.used' },
	{ value: 'ha.light.kitchen', label: 'Kitchen Light' }
];

describe('filterOptions', () => {
	it('returns every option (in order) for a blank query', () => {
		expect(filterOptions(OPTS, '')).toEqual(OPTS);
		expect(filterOptions(OPTS, '   ')).toEqual(OPTS);
	});

	it('matches the label case-insensitively', () => {
		expect(filterOptions(OPTS, 'kitchen').map((o) => o.value)).toEqual(['ha.light.kitchen']);
	});

	it('matches the value/id', () => {
		expect(filterOptions(OPTS, 'mem.').map((o) => o.value)).toEqual(['mem.used']);
	});

	it('matches the hint', () => {
		expect(filterOptions(OPTS, 'CPU').map((o) => o.value)).toEqual(['cpu.total']);
	});

	it('returns [] when nothing matches', () => {
		expect(filterOptions(OPTS, 'zzz')).toEqual([]);
	});
});

describe('optionFor', () => {
	it('finds the option by value, else null', () => {
		expect(optionFor(OPTS, 'mem.used')?.label).toBe('Memory used');
		expect(optionFor(OPTS, 'nope')).toBeNull();
	});
});

describe('displayValue', () => {
	it('shows the raw value in free-text (allowCustom) mode', () => {
		expect(displayValue(OPTS, 'cpu.total', true)).toBe('cpu.total');
		expect(displayValue(OPTS, 'typed.custom.id', true)).toBe('typed.custom.id');
	});

	it('shows the matched label otherwise (empty when unmatched)', () => {
		expect(displayValue(OPTS, 'cpu.total', false)).toBe('CPU total');
		expect(displayValue(OPTS, 'nope', false)).toBe('');
	});
});
