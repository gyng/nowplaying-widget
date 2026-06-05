import { describe, it, expect } from 'vitest';
import { emptyRoot } from '../lib/core/layoutTree';
import {
	applyOpsToFile,
	currentTheme,
	describeLayoutText,
	describeNowPlayingText,
	describeSensorsText,
	monitorKeys,
	sensorsText,
	setThemeInFile,
	widgetTypesText,
	type LayoutFile
} from './tools';

function counter(): (type: string) => string {
	let n = 0;
	return (type: string) => `${type}-${++n}`;
}

const fileWith = (key: string): LayoutFile => ({
	version: 2,
	monitors: { [key]: { root: emptyRoot(), floating: [] } },
	library: { version: 1, defs: [] },
	theme: 'neon',
	tokens: { '--accent': 'red' }
});

describe('mcp tools', () => {
	it('lists monitor keys (and tolerates null/empty)', () => {
		expect(monitorKeys(fileWith('DELL-1'))).toEqual(['DELL-1']);
		expect(monitorKeys(null)).toEqual([]);
		expect(monitorKeys({})).toEqual([]);
	});

	it('widgetTypesText + sensorsText expose the real catalog', () => {
		expect(widgetTypesText()).toContain('gauge');
		expect(widgetTypesText()).toContain('addWidget');
		expect(sensorsText()).toContain('cpu.total');
	});

	it('applies ops to the named monitor and preserves library/theme/tokens', () => {
		const before = fileWith('DELL-1');
		const { file, monitorKey, result } = applyOpsToFile(
			before,
			[{ op: 'addWidget', widgetType: 'gauge', sensor: 'cpu.total' }],
			counter(),
			'DELL-1'
		);
		expect(monitorKey).toBe('DELL-1');
		expect(result.applied).toBe(1);
		expect(file.theme).toBe('neon');
		expect(file.tokens).toEqual({ '--accent': 'red' });
		expect(file.library).toEqual({ version: 1, defs: [] });
		// the widget is described back
		expect(describeLayoutText(file, 'DELL-1')).toMatch(/gauge .*sensor=cpu\.total/);
		// input not mutated
		expect(describeLayoutText(before, 'DELL-1')).toContain('(empty)');
	});

	it('defaults to the first monitor when none is named', () => {
		const { monitorKey } = applyOpsToFile(fileWith('HDMI-2'), [{ op: 'clear' }], counter());
		expect(monitorKey).toBe('HDMI-2');
	});

	it('throws a helpful error when there is no monitor and none was requested', () => {
		expect(() => applyOpsToFile(null, [{ op: 'clear' }], counter())).toThrow(
			/no monitor to target/
		);
	});

	it('creates the requested monitor key if it does not exist yet', () => {
		const { file, monitorKey } = applyOpsToFile(
			null,
			[{ op: 'addWidget', widgetType: 'clock' }],
			counter(),
			'primary'
		);
		expect(monitorKey).toBe('primary');
		expect(monitorKeys(file)).toContain('primary');
	});

	it('describeLayoutText reports an absent layout', () => {
		expect(describeLayoutText(null)).toMatch(/No layout yet/);
	});

	it('sets and reads the active theme, preserving the rest of the file', () => {
		const before = fileWith('DELL-1'); // the helper seeds theme:'neon'
		expect(currentTheme(before)).toBe('neon');
		const themed = setThemeInFile(before, 'synthwave');
		expect(currentTheme(themed)).toBe('synthwave');
		expect(themed.monitors).toEqual(before.monitors); // layout preserved
		expect(themed.library).toEqual({ version: 1, defs: [] });
		// blank clears it
		expect(currentTheme(setThemeInFile(themed, '  '))).toBeNull();
		// works from a null file
		expect(currentTheme(setThemeInFile(null, 'cool'))).toBe('cool');
	});

	it('describeNowPlayingText formats entries or reports nothing playing', () => {
		expect(describeNowPlayingText(null)).toMatch(/Nothing is playing/);
		expect(describeNowPlayingText([])).toMatch(/Nothing is playing/);
		const out = describeNowPlayingText([
			{ title: 'Song', artist: 'Band', status: 'Playing', source: 'Spotify' }
		]);
		expect(out).toBe('Playing: Song — Band [Spotify]');
	});

	it('describeSensorsText lists live readings (sorted) or hints when absent', () => {
		expect(describeSensorsText(null)).toMatch(/is widgetsack running/);
		expect(describeSensorsText({ sensors: {} })).toMatch(/is widgetsack running/);
		const out = describeSensorsText({ ts_ms: 1, sensors: { 'mem.used': 60, 'cpu.total': 42 } });
		expect(out).toContain('cpu.total = 42');
		expect(out).toContain('mem.used = 60');
		// sorted: cpu before mem
		expect(out.indexOf('cpu.total')).toBeLessThan(out.indexOf('mem.used'));
	});
});
