import { describe, it, expect } from 'vitest';
import { applyMeasured, contentLeafIds } from './measure';
import { container, leaf, type MonitorLayout, type WidgetInstance } from '../../core/layoutTree';

const w = (id: string, basis?: 'content'): ReturnType<typeof leaf> => {
	const unit: WidgetInstance = {
		id,
		type: 'clock',
		rect: { x: 0, y: 0, w: 100, h: 40 },
		config: {}
	};
	return basis ? leaf(unit, basis) : leaf(unit);
};

function mon(): MonitorLayout {
	return {
		root: container('root', 'row', [w('a', 'content'), w('b')]),
		floating: []
	};
}

describe('contentLeafIds', () => {
	it('collects flow leaves whose basis is "content"', () => {
		expect(contentLeafIds(mon())).toEqual(new Set(['a']));
	});
});

describe('applyMeasured', () => {
	it('substitutes a measured size into a "content" leaf rect (for solving only)', () => {
		const m = mon();
		const out = applyMeasured(m, { a: { w: 72, h: 18 } });
		const a = out.root.children[0];
		expect('unit' in a && (a.unit as WidgetInstance).rect).toMatchObject({ w: 72, h: 18 });
		// non-content leaf untouched
		const b = out.root.children[1];
		expect('unit' in b && (b.unit as WidgetInstance).rect).toMatchObject({ w: 100, h: 40 });
	});

	it('returns the SAME reference when there is no measurement to apply (no solve churn)', () => {
		const m = mon();
		expect(applyMeasured(m, {})).toBe(m);
		// a measurement equal to the existing rect is also a no-op
		expect(applyMeasured(m, { a: { w: 100, h: 40 } })).toBe(m);
	});

	it('ignores measurements for non-content leaves', () => {
		const m = mon();
		expect(applyMeasured(m, { b: { w: 5, h: 5 } })).toBe(m);
	});
});
