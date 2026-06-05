import { describe, expect, it } from 'vitest';
import { filterThemes } from './ThemeList';

describe('filterThemes', () => {
	const themes = ['amber', 'mono', 'midnight-blue'];

	it('returns all for an empty/whitespace query', () => {
		expect(filterThemes(themes, '')).toEqual(themes);
		expect(filterThemes(themes, '  ')).toEqual(themes);
	});

	it('matches a case-insensitive substring', () => {
		expect(filterThemes(themes, 'm')).toEqual(['amber', 'mono', 'midnight-blue']); // all contain 'm'
		expect(filterThemes(themes, 'mo')).toEqual(['mono']);
		expect(filterThemes(themes, 'AMBER')).toEqual(['amber']);
		expect(filterThemes(themes, 'blue')).toEqual(['midnight-blue']);
	});

	it('returns [] when nothing matches', () => {
		expect(filterThemes(themes, 'zzz')).toEqual([]);
	});
});
