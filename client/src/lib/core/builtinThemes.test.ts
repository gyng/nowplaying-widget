import { describe, it, expect } from 'vitest';
import {
	BUILTIN_THEMES,
	BUILTIN_GROUP_ORDER,
	BUILTIN_PREFIX,
	builtinById,
	builtinCss,
	builtinGroups,
	builtinIdOf,
	builtinName,
	hexToRgb,
	isBuiltinName
} from './builtinThemes';

describe('hexToRgb', () => {
	it('expands #rrggbb and #rgb to an "r, g, b" triple', () => {
		expect(hexToRgb('#77c4d3')).toBe('119, 196, 211');
		expect(hexToRgb('#000000')).toBe('0, 0, 0');
		expect(hexToRgb('#fff')).toBe('255, 255, 255');
		expect(hexToRgb('  #FFA05A  ')).toBe('255, 160, 90');
	});
});

describe('BUILTIN_THEMES catalog', () => {
	it('ships a large grouped library (24+) across all four groups', () => {
		expect(BUILTIN_THEMES.length).toBeGreaterThanOrEqual(24);
		for (const g of BUILTIN_GROUP_ORDER) {
			expect(BUILTIN_THEMES.some((t) => t.group === g)).toBe(true);
		}
	});

	it('starts with the canonical "app" preset', () => {
		expect(BUILTIN_THEMES[0].id).toBe('app');
		expect(BUILTIN_THEMES[0].group).toBe('classic');
	});

	it('has unique kebab-case ids and unique display names', () => {
		const ids = BUILTIN_THEMES.map((t) => t.id);
		const names = BUILTIN_THEMES.map((t) => t.name);
		expect(new Set(ids).size).toBe(ids.length);
		expect(new Set(names).size).toBe(names.length);
		for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
	});

	it('every theme sets at least the widget accent and chrome background, with no @import/url', () => {
		for (const t of BUILTIN_THEMES) {
			expect(BUILTIN_GROUP_ORDER).toContain(t.group);
			expect(t.css).toContain('--np-accent:');
			expect(t.css).toContain('--ui-bg:');
			// Built-ins are authored, but keep them inert: no remote fetches / imports.
			expect(t.css).not.toMatch(/@import|url\(/i);
			// A complete chrome + widget token set (sanity: both vocabularies present).
			expect(t.css).toContain('--ui-accent-rgb:');
			expect(t.css).toContain('--np-font:');
		}
	});
});

describe('built-in name helpers', () => {
	it('round-trips id ⇄ selection string', () => {
		expect(builtinName('nord')).toBe(`${BUILTIN_PREFIX}nord`);
		expect(builtinIdOf('builtin:nord')).toBe('nord');
		expect(isBuiltinName('builtin:nord')).toBe(true);
		// A user theme filename is NOT a built-in.
		expect(isBuiltinName('my-theme')).toBe(false);
		expect(builtinIdOf('my-theme')).toBeNull();
	});

	it('resolves built-in css by selection string and null for non/unknown built-ins', () => {
		const nord = builtinById('nord');
		expect(nord).toBeDefined();
		expect(builtinCss('builtin:nord')).toBe(nord?.css);
		expect(builtinCss('builtin:does-not-exist')).toBeNull();
		expect(builtinCss('my-theme')).toBeNull(); // a user file → resolved from disk elsewhere
	});
});

describe('builtinGroups', () => {
	it('groups themes in the declared order and accounts for every theme', () => {
		const groups = builtinGroups();
		expect(groups.map((g) => g.group)).toEqual(BUILTIN_GROUP_ORDER);
		expect(groups.reduce((n, g) => n + g.themes.length, 0)).toBe(BUILTIN_THEMES.length);
	});
});
