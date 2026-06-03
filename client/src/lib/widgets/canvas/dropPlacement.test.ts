import { describe, expect, it } from 'vitest';
import { dropPlacement } from './dropPlacement';

describe('dropPlacement', () => {
	it('centers the widget on the drop point and snaps to the grid', () => {
		// center of a 160×80 widget on (200,200) → top-left (120,160), already grid-aligned
		expect(dropPlacement({ w: 160, h: 80 }, 200, 200)).toEqual({ x: 120, y: 160 });
	});

	it('snaps the centered top-left to the nearest grid multiple', () => {
		// 100×40 centered on (133,67) → (83,47) → snapped to (80,48)
		expect(dropPlacement({ w: 100, h: 40 }, 133, 67)).toEqual({ x: 80, y: 48 });
	});

	it('honours a custom grid', () => {
		expect(dropPlacement({ w: 20, h: 20 }, 55, 55, 10)).toEqual({ x: 50, y: 50 });
	});
});
