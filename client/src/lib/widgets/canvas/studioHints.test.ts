import { describe, expect, it } from 'vitest';
import { studioHints } from './studioHints';

const keys = (s: Parameters<typeof studioHints>[0]) => studioHints(s).map((h) => h.key);

describe('studioHints', () => {
	it('shows the base gestures with no selection', () => {
		expect(keys({ hasSelection: false, spaceDown: false, panning: false })).toEqual([
			'Click',
			'Drag',
			'Right-click',
			'Shift+Drag',
			'Scroll'
		]);
	});

	it('adds nudge + remove when something is selected', () => {
		const k = keys({ hasSelection: true, spaceDown: false, panning: false });
		expect(k).toContain('Arrows');
		expect(k).toContain('Del');
	});

	it('swaps the marquee hint for a pan hint while Space is held', () => {
		const k = keys({ hasSelection: false, spaceDown: true, panning: false });
		expect(k).toContain('Space+Drag');
		expect(k).not.toContain('Shift+Drag');
	});

	it('takes over the bar while panning', () => {
		expect(keys({ hasSelection: true, spaceDown: false, panning: true })).toEqual([
			'Drag',
			'Release'
		]);
	});
});
