import { describe, it, expect } from 'vitest';
import { clampPane, applyDelta, PANE_DEFAULTS } from './usePaneSizes';

describe('clampPane', () => {
	it('clamps each edge to its limits and rounds', () => {
		expect(clampPane('left', 10)).toBe(180); // below min
		expect(clampPane('left', 9999)).toBe(520); // above max
		expect(clampPane('tree', 200.4)).toBe(200); // rounds
		expect(clampPane('right', 300)).toBe(300); // within range
	});
});

describe('applyDelta', () => {
	it('widens the left rail as its divider moves right (+dx)', () => {
		expect(applyDelta(PANE_DEFAULTS, 'left', 250, 40).railL).toBe(290);
		expect(applyDelta(PANE_DEFAULTS, 'left', 250, -40).railL).toBe(210);
	});

	it('widens the tree column with +dx', () => {
		expect(applyDelta(PANE_DEFAULTS, 'tree', 200, 30).treeW).toBe(230);
	});

	it('widens the RIGHT rail as its divider moves LEFT (-dx grows it)', () => {
		expect(applyDelta(PANE_DEFAULTS, 'right', 264, -50).railR).toBe(314);
		expect(applyDelta(PANE_DEFAULTS, 'right', 264, 50).railR).toBe(214);
	});

	it('only touches the dragged edge', () => {
		const out = applyDelta(PANE_DEFAULTS, 'left', 250, 40);
		expect(out.railR).toBe(PANE_DEFAULTS.railR);
		expect(out.treeW).toBe(PANE_DEFAULTS.treeW);
	});

	it('respects the clamp at the extremes', () => {
		expect(applyDelta(PANE_DEFAULTS, 'left', 500, 999).railL).toBe(520);
	});
});
