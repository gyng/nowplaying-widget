import { describe, expect, it } from 'vitest';
import { curate, isExposed, normalizeExposed, toggleExposed } from './haExposed';

describe('haExposed', () => {
	it('normalizes: trims, drops empties, dedupes, sorts', () => {
		expect(normalizeExposed([' ha.b ', 'ha.a', 'ha.a', '', '  '])).toEqual(['ha.a', 'ha.b']);
	});

	it('toggles membership and keeps the list normalized', () => {
		expect(toggleExposed([], 'ha.x')).toEqual(['ha.x']);
		expect(toggleExposed(['ha.x'], 'ha.x')).toEqual([]);
		expect(toggleExposed(['ha.x'], 'ha.y')).toEqual(['ha.x', 'ha.y']);
	});

	it('isExposed reports membership', () => {
		expect(isExposed(['ha.x'], 'ha.x')).toBe(true);
		expect(isExposed(['ha.x'], 'ha.y')).toBe(false);
	});

	it('curate: empty allowlist passes everything through (opt-in curation)', () => {
		const items = [{ id: 'a' }, { id: 'b' }];
		expect(curate(items, (i) => i.id, [])).toEqual(items);
	});

	it('curate: a non-empty allowlist filters to exposed ids only', () => {
		const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
		expect(curate(items, (i) => i.id, ['a', 'c'])).toEqual([{ id: 'a' }, { id: 'c' }]);
	});

	it('curate works on bare string ids too', () => {
		expect(curate(['a', 'b', 'c'], (s) => s, ['b'])).toEqual(['b']);
	});
});
