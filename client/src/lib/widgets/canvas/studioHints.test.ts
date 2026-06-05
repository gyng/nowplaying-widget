import { describe, expect, it } from 'vitest';
import { studioHints } from './studioHints';

const keys = (s: Parameters<typeof studioHints>[0]) => studioHints(s).map((h) => h.key);

describe('studioHints', () => {
	it('shows the base gestures with no selection — including middle-drag pan (the drift fix)', () => {
		expect(keys({ hasSelection: false, spaceDown: false, panning: false })).toEqual([
			'Click',
			'Drag',
			'Right-click',
			'Middle-drag',
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

	it('advertises Save (Ctrl+S) only when there are unsaved changes', () => {
		expect(keys({ hasSelection: false, spaceDown: false, panning: false })).not.toContain('Ctrl+S');
		expect(keys({ hasSelection: false, spaceDown: false, panning: false, dirty: true })).toContain(
			'Ctrl+S'
		);
	});

	it('advertises Undo (Ctrl+Z) only when there is history to undo', () => {
		expect(keys({ hasSelection: false, spaceDown: false, panning: false })).not.toContain('Ctrl+Z');
		expect(
			keys({ hasSelection: false, spaceDown: false, panning: false, canUndo: true })
		).toContain('Ctrl+Z');
	});

	it('shows the selection count in the remove / nudge labels', () => {
		const labels = studioHints({
			hasSelection: true,
			spaceDown: false,
			panning: false,
			selectionCount: 3
		}).map((h) => h.label);
		expect(labels).toContain('remove (3)');
		expect(labels).toContain('nudge (3)');
	});
});
