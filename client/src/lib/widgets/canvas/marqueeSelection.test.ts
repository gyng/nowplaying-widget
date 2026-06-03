import { describe, it, expect } from 'vitest';
import { marqueeSelection } from './useCanvasPointer';
import type { Renderable } from '../../core/solve';
import type { WidgetInstance } from '../../core/layout';

const unit: WidgetInstance = {
	id: 'x',
	type: 'clock',
	rect: { x: 0, y: 0, w: 0, h: 0 },
	config: {}
};
// A renderable at a rect, flagged flow (movable:false) or floating (movable:true).
const r = (
	id: string,
	rect: { x: number; y: number; w: number; h: number },
	movable: boolean
): Renderable => ({
	id,
	selectId: id,
	instance: unit,
	rect,
	movable
});

const flow = r('flow', { x: 10, y: 10, w: 20, h: 20 }, false);
const floating = r('float', { x: 50, y: 10, w: 20, h: 20 }, true);
const outside = r('out', { x: 500, y: 500, w: 10, h: 10 }, true);
const all = [flow, floating, outside];

describe('marqueeSelection', () => {
	it('selects in-flow widgets too (not just movable/floating ones)', () => {
		const box = { x: 0, y: 0, w: 100, h: 100 };
		const { ids } = marqueeSelection(all, box, false, []);
		expect(ids).toContain('flow'); // the fix: a flow widget IS selectable
		expect(ids).toContain('float');
		expect(ids).not.toContain('out');
	});

	it('replaces the selection when not additive', () => {
		const box = { x: 40, y: 0, w: 60, h: 100 }; // only `float`
		const { ids, primary } = marqueeSelection(all, box, false, ['flow']);
		expect(ids).toEqual(['float']);
		expect(primary).toBe('float');
	});

	it('merges into the current selection when additive (Shift), de-duping', () => {
		const box = { x: 40, y: 0, w: 60, h: 100 }; // only `float`
		const { ids } = marqueeSelection(all, box, true, ['flow', 'float']);
		expect(new Set(ids)).toEqual(new Set(['flow', 'float']));
	});

	it('is empty (null primary) when the box hits nothing', () => {
		const { ids, primary } = marqueeSelection(all, { x: 200, y: 200, w: 10, h: 10 }, false, []);
		expect(ids).toEqual([]);
		expect(primary).toBeNull();
	});
});
