import { describe, expect, it } from 'vitest';
// Importing the defaults registers the built-in inventory as a side-effect.
import './controls.defaults';
import { detectConflicts, getControl, listControls } from './controls';

describe('built-in controls', () => {
	it('registers the full inventory with no two controls sharing a trigger', () => {
		const all = listControls();
		expect(all.length).toBeGreaterThan(10);
		expect(detectConflicts(all)).toEqual([]);
	});

	it('pan binds both middle-drag and Space+left-drag', () => {
		const pan = getControl('studio.panDrag');
		expect(pan).toBeDefined();
		const ptrs = (pan?.triggers ?? []).filter((t) => t.type === 'pointer');
		expect(ptrs.some((t) => t.type === 'pointer' && t.button === 'middle')).toBe(true);
		expect(ptrs.some((t) => t.type === 'pointer' && t.spaceHeld)).toBe(true);
	});

	it('undo and redo are distinguished by Shift (no collision)', () => {
		expect(getControl('studio.undo')).toBeDefined();
		expect(getControl('studio.redo')).toBeDefined();
		expect(detectConflicts(listControls())).toEqual([]);
	});
});
