import { describe, expect, it } from 'vitest';
import type { Rect, WidgetInstance } from './layout';
import {
	container,
	emptyRoot,
	group,
	leaf,
	type Library,
	type LayoutNode,
	type Leaf,
	type MonitorLayout
} from './layoutTree';
import {
	collectRenderables,
	intrinsicSize,
	resolveGroup,
	solveLayout,
	solveMonitor
} from './solve';

// A primitive sized w×h at the origin (only rect.{w,h} matter for in-flow intrinsics).
const prim = (
	id: string,
	w: number,
	h: number,
	extra: Partial<WidgetInstance> = {}
): WidgetInstance => ({
	id,
	type: 'gauge',
	rect: { x: 0, y: 0, w, h },
	config: {},
	...extra
});
// A primitive at an absolute position (for the floating layer).
const primAt = (id: string, x: number, y: number, w: number, h: number): WidgetInstance => ({
	id,
	type: 'gauge',
	rect: { x, y, w, h },
	config: {}
});

const get = (s: Map<string, Rect>, id: string): Rect => {
	const r = s.get(id);
	if (!r) throw new Error(`missing ${id}`);
	return r;
};

// ---- row / col flex ------------------------------------------------------

describe('row / col flex', () => {
	it('row, two auto leaves, no gap, align stretch', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 40, 20)), leaf(prim('B', 60, 20))], {
				align: 'stretch'
			}),
			{ x: 0, y: 0, w: 200, h: 100 }
		);
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 40, h: 100 });
		expect(get(s, 'B')).toEqual({ x: 40, y: 0, w: 60, h: 100 });
	});

	it('row, three auto leaves with gap, align start', () => {
		const s = solveLayout(
			container(
				'r',
				'row',
				[leaf(prim('A', 50, 40)), leaf(prim('B', 50, 40)), leaf(prim('C', 50, 40))],
				{
					gap: 10,
					align: 'start'
				}
			),
			{ x: 0, y: 0, w: 300, h: 100 }
		);
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 50, h: 40 });
		expect(get(s, 'B')).toEqual({ x: 60, y: 0, w: 50, h: 40 });
		expect(get(s, 'C')).toEqual({ x: 120, y: 0, w: 50, h: 40 });
	});

	it('col main axis is y; cross is x with align start', () => {
		const s = solveLayout(
			container('c', 'col', [leaf(prim('P', 120, 50)), leaf(prim('Q', 80, 70))], {
				gap: 8,
				align: 'start'
			}),
			{ x: 10, y: 20, w: 200, h: 300 }
		);
		expect(get(s, 'P')).toEqual({ x: 10, y: 20, w: 120, h: 50 });
		expect(get(s, 'Q')).toEqual({ x: 10, y: 78, w: 80, h: 70 });
	});

	it('overflow: fixed children exceed main, no shrink', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 80, 50)), leaf(prim('B', 80, 50))], { align: 'start' }),
			{ x: 0, y: 0, w: 100, h: 50 }
		);
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 80, h: 50 });
		expect(get(s, 'B')).toEqual({ x: 80, y: 0, w: 80, h: 50 });
	});

	it('empty container emits nothing', () => {
		const s = solveLayout(container('r', 'row', []), { x: 0, y: 0, w: 100, h: 100 });
		expect(s.size).toBe(0);
	});
});

// ---- fr distribution -----------------------------------------------------

describe('fr distribution', () => {
	it('single fr child fills the main axis', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 30, 10), { fr: 1 })], { align: 'stretch' }),
			{
				x: 0,
				y: 0,
				w: 200,
				h: 40
			}
		);
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 200, h: 40 });
	});

	it('two fr split 1:2 over 300', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 0, 0), { fr: 1 }), leaf(prim('B', 0, 0), { fr: 2 })], {
				align: 'stretch'
			}),
			{ x: 0, y: 0, w: 300, h: 100 }
		);
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 100, h: 100 });
		expect(get(s, 'B')).toEqual({ x: 100, y: 0, w: 200, h: 100 });
	});

	it('fr after a fixed px sibling (gap 0)', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 999, 0), 50), leaf(prim('B', 0, 0), { fr: 1 })], {
				align: 'stretch'
			}),
			{ x: 0, y: 0, w: 200, h: 30 }
		);
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 50, h: 30 });
		expect(get(s, 'B')).toEqual({ x: 50, y: 0, w: 150, h: 30 });
	});

	it('fr after fixed + gap', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 0, 0), 40), leaf(prim('B', 0, 0), { fr: 1 })], {
				gap: 10,
				align: 'stretch'
			}),
			{ x: 0, y: 0, w: 200, h: 20 }
		);
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 40, h: 20 });
		expect(get(s, 'B')).toEqual({ x: 50, y: 0, w: 150, h: 20 });
	});

	it('mixed px + auto + fr', () => {
		const s = solveLayout(
			container(
				'r',
				'row',
				[leaf(prim('P', 0, 0), 100), leaf(prim('Q', 50, 0)), leaf(prim('R', 0, 0), { fr: 1 })],
				{ align: 'stretch' }
			),
			{ x: 0, y: 0, w: 400, h: 80 }
		);
		expect(get(s, 'P')).toEqual({ x: 0, y: 0, w: 100, h: 80 });
		expect(get(s, 'Q')).toEqual({ x: 100, y: 0, w: 50, h: 80 });
		expect(get(s, 'R')).toEqual({ x: 150, y: 0, w: 250, h: 80 });
	});

	it('two fr with gap', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 0, 0), { fr: 1 }), leaf(prim('B', 0, 0), { fr: 1 })], {
				gap: 20,
				align: 'stretch'
			}),
			{ x: 0, y: 0, w: 320, h: 60 }
		);
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 150, h: 60 });
		expect(get(s, 'B')).toEqual({ x: 170, y: 0, w: 150, h: 60 });
	});

	it('zero leftover → fr child gets 0', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 0, 0), 200), leaf(prim('B', 0, 0), { fr: 1 })], {
				align: 'stretch'
			}),
			{ x: 0, y: 0, w: 200, h: 20 }
		);
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 200, h: 20 });
		expect(get(s, 'B')).toEqual({ x: 200, y: 0, w: 0, h: 20 });
	});

	it('fr <= 0 collapses to 0; sibling takes all (fr 0 and fr -3)', () => {
		for (const bad of [{ fr: 0 }, { fr: -3 }]) {
			const s = solveLayout(
				container('r', 'row', [leaf(prim('A', 0, 0), bad), leaf(prim('B', 0, 0), { fr: 1 })], {
					align: 'stretch'
				}),
				{ x: 0, y: 0, w: 200, h: 20 }
			);
			expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 0, h: 20 });
			expect(get(s, 'B')).toEqual({ x: 0, y: 0, w: 200, h: 20 });
		}
	});

	it('fractional fr sums to the parent exactly (no pixel loss, no snap seam)', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 0, 0), { fr: 1 }), leaf(prim('B', 0, 0), { fr: 2 })], {
				align: 'stretch'
			}),
			{ x: 0, y: 0, w: 100, h: 20 }
		);
		const a = get(s, 'A');
		const b = get(s, 'B');
		expect(a.w).toBeCloseTo(100 / 3, 10);
		expect(b.w).toBeCloseTo(200 / 3, 10);
		expect(a.w + b.w).toBeCloseTo(100, 10); // exact total
		expect(b.x).toBeCloseTo(a.x + a.w, 10); // adjacency: B starts exactly where A ends
	});
});

// ---- justify -------------------------------------------------------------

describe('justify (main axis)', () => {
	const threeRow = (justify: 'center' | 'between' | 'around') =>
		solveLayout(
			container(
				'r',
				'row',
				[leaf(prim('A', 50, 40)), leaf(prim('B', 50, 40)), leaf(prim('C', 50, 40))],
				{
					justify,
					align: 'start'
				}
			),
			{ x: 0, y: 0, w: 300, h: 100 }
		);

	it('center', () => {
		const s = threeRow('center');
		expect(get(s, 'A').x).toBe(75);
		expect(get(s, 'B').x).toBe(125);
		expect(get(s, 'C').x).toBe(175);
	});

	it('between (n=3): ends flush', () => {
		const s = threeRow('between');
		expect(get(s, 'A').x).toBe(0);
		expect(get(s, 'B').x).toBe(125);
		expect(get(s, 'C').x).toBe(250);
	});

	it('around (n=3): symmetric gutters', () => {
		const s = threeRow('around');
		expect(get(s, 'A').x).toBe(25);
		expect(get(s, 'B').x).toBe(125);
		expect(get(s, 'C').x).toBe(225);
	});

	it('end (n=1)', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 50, 40))], { justify: 'end', align: 'start' }),
			{ x: 0, y: 0, w: 300, h: 100 }
		);
		expect(get(s, 'A')).toEqual({ x: 250, y: 0, w: 50, h: 40 });
	});

	it('between (n=2): A flush left, B flush right', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 50, 40)), leaf(prim('B', 50, 40))], {
				justify: 'between',
				align: 'start'
			}),
			{ x: 0, y: 0, w: 300, h: 100 }
		);
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 50, h: 40 });
		expect(get(s, 'B')).toEqual({ x: 250, y: 0, w: 50, h: 40 });
	});

	it('between (n=1) falls back to start (no divide-by-zero)', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 50, 40))], { justify: 'between', align: 'start' }),
			{ x: 0, y: 0, w: 300, h: 100 }
		);
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 50, h: 40 });
	});

	it('around (n=1) centers (does NOT fall back to start)', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 50, 40))], { justify: 'around', align: 'start' }),
			{ x: 0, y: 0, w: 300, h: 100 }
		);
		expect(get(s, 'A')).toEqual({ x: 125, y: 0, w: 50, h: 40 });
	});

	it('ignored when an fr child consumes the leftover', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 0, 0), { fr: 1 }), leaf(prim('B', 0, 0), { fr: 1 })], {
				justify: 'center',
				align: 'stretch'
			}),
			{ x: 0, y: 0, w: 200, h: 20 }
		);
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 100, h: 20 });
		expect(get(s, 'B')).toEqual({ x: 100, y: 0, w: 100, h: 20 });
	});
});

// ---- align (cross axis) --------------------------------------------------

describe('align (cross axis)', () => {
	const rowOne = (align: 'start' | 'center' | 'end') =>
		solveLayout(container('r', 'row', [leaf(prim('A', 40, 20))], { align }), {
			x: 0,
			y: 0,
			w: 100,
			h: 80
		});

	it('start', () => expect(get(rowOne('start'), 'A')).toEqual({ x: 0, y: 0, w: 40, h: 20 }));
	it('center', () => expect(get(rowOne('center'), 'A')).toEqual({ x: 0, y: 30, w: 40, h: 20 }));
	it('end', () => expect(get(rowOne('end'), 'A')).toEqual({ x: 0, y: 60, w: 40, h: 20 }));

	it('stretch in a col fills the width', () => {
		const s = solveLayout(container('c', 'col', [leaf(prim('A', 40, 20))], { align: 'stretch' }), {
			x: 0,
			y: 0,
			w: 100,
			h: 80
		});
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 100, h: 20 });
	});
});

// ---- pad -----------------------------------------------------------------

describe('pad', () => {
	it('number insets the content box', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 50, 30))], {
				pad: 10,
				align: 'start',
				justify: 'start'
			}),
			{ x: 0, y: 0, w: 200, h: 200 }
		);
		expect(get(s, 'A')).toEqual({ x: 10, y: 10, w: 50, h: 30 });
	});

	it('per-side object', () => {
		const s = solveLayout(
			container('c', 'col', [leaf(prim('A', 0, 0), { fr: 1 })], {
				pad: { t: 5, r: 10, b: 15, l: 20 },
				align: 'stretch'
			}),
			{ x: 0, y: 0, w: 200, h: 200 }
		);
		expect(get(s, 'A')).toEqual({ x: 20, y: 5, w: 170, h: 180 });
	});

	it('larger than the box clamps content to zero (never negative)', () => {
		const s = solveLayout(
			container('c', 'col', [leaf(prim('A', 0, 0), { fr: 1 })], { pad: 20, align: 'stretch' }),
			{ x: 0, y: 0, w: 30, h: 30 }
		);
		expect(get(s, 'A')).toEqual({ x: 20, y: 20, w: 0, h: 0 });
	});
});

// ---- grid ----------------------------------------------------------------

describe('grid', () => {
	it('2 cols, 4 children, gap', () => {
		const s = solveLayout(
			container(
				'g',
				'grid',
				[0, 1, 2, 3].map((i) => leaf(prim('c' + i, 10, 10))),
				{
					cols: 2,
					gap: 10,
					align: 'stretch'
				}
			),
			{ x: 0, y: 0, w: 210, h: 210 }
		);
		expect(get(s, 'c0')).toEqual({ x: 0, y: 0, w: 100, h: 100 });
		expect(get(s, 'c1')).toEqual({ x: 110, y: 0, w: 100, h: 100 });
		expect(get(s, 'c2')).toEqual({ x: 0, y: 110, w: 100, h: 100 });
		expect(get(s, 'c3')).toEqual({ x: 110, y: 110, w: 100, h: 100 });
	});

	it('8 cols, 32 children (the System core-graph case)', () => {
		const s = solveLayout(
			container(
				'g',
				'grid',
				Array.from({ length: 32 }, (_, i) => leaf(prim('c' + i, 10, 10))),
				{ cols: 8, align: 'stretch' }
			),
			{ x: 0, y: 0, w: 800, h: 200 }
		);
		expect(get(s, 'c0')).toEqual({ x: 0, y: 0, w: 100, h: 50 });
		expect(get(s, 'c7')).toEqual({ x: 700, y: 0, w: 100, h: 50 });
		expect(get(s, 'c8')).toEqual({ x: 0, y: 50, w: 100, h: 50 });
		expect(get(s, 'c31')).toEqual({ x: 700, y: 150, w: 100, h: 50 });
	});

	it('partial last row (5 children, 3 cols) has no phantom 6th cell', () => {
		const s = solveLayout(
			container(
				'g',
				'grid',
				[0, 1, 2, 3, 4].map((i) => leaf(prim('c' + i, 10, 10))),
				{
					cols: 3,
					align: 'stretch'
				}
			),
			{ x: 0, y: 0, w: 300, h: 200 }
		);
		expect(get(s, 'c3')).toEqual({ x: 0, y: 100, w: 100, h: 100 });
		expect(get(s, 'c4')).toEqual({ x: 100, y: 100, w: 100, h: 100 });
		expect(s.has('c5')).toBe(false);
	});

	it('cols undefined defaults to a single column', () => {
		const s = solveLayout(
			container('g', 'grid', [leaf(prim('c0', 10, 10)), leaf(prim('c1', 10, 10))], {
				align: 'stretch'
			}),
			{ x: 0, y: 0, w: 40, h: 80 }
		);
		expect(get(s, 'c0')).toEqual({ x: 0, y: 0, w: 40, h: 40 });
		expect(get(s, 'c1')).toEqual({ x: 0, y: 40, w: 40, h: 40 });
	});

	it('a single child in an over-wide grid takes only 1/cols (sized by declared cols)', () => {
		const s = solveLayout(
			container('g', 'grid', [leaf(prim('A', 30, 30))], { cols: 4, align: 'stretch' }),
			{ x: 0, y: 0, w: 400, h: 100 }
		);
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 100, h: 100 });
	});

	it('align center places an intrinsic-sized child inside its cell', () => {
		const s = solveLayout(
			container('g', 'grid', [leaf(prim('A', 40, 40))], { cols: 1, align: 'center' }),
			{ x: 0, y: 0, w: 100, h: 100 }
		);
		expect(get(s, 'A')).toEqual({ x: 30, y: 30, w: 40, h: 40 });
	});

	it('oversized gap clamps cells to >= 0 (no negative boxes cascade)', () => {
		const s = solveLayout(
			container(
				'g',
				'grid',
				[0, 1, 2].map((i) => leaf(prim('c' + i, 20, 20))),
				{
					cols: 3,
					gap: 60,
					align: 'stretch'
				}
			),
			{ x: 0, y: 0, w: 100, h: 100 }
		);
		expect(get(s, 'c0').w).toBe(0);
		expect(get(s, 'c1').w).toBe(0);
		expect(get(s, 'c2').w).toBe(0);
	});
});

// ---- nesting -------------------------------------------------------------

describe('nesting', () => {
	it('fr inner row beside a fixed bottom leaf in a col', () => {
		const inner = container(
			'inner',
			'row',
			[leaf(prim('CPU', 100, 0)), leaf(prim('RAM', 100, 0))],
			{
				align: 'stretch'
			}
		);
		inner.basis = { fr: 1 };
		const s = solveLayout(
			container('c', 'col', [inner, leaf(prim('bottom', 0, 50), 50)], { align: 'stretch' }),
			{ x: 0, y: 0, w: 300, h: 200 }
		);
		expect(get(s, 'CPU')).toEqual({ x: 0, y: 0, w: 100, h: 150 });
		expect(get(s, 'RAM')).toEqual({ x: 100, y: 0, w: 100, h: 150 });
		expect(get(s, 'bottom')).toEqual({ x: 0, y: 150, w: 300, h: 50 });
	});

	it('a bounds-less nested grid sizes from its children (does not collapse to 0)', () => {
		const grid = container('g', 'grid', [leaf(prim('gc0', 50, 50)), leaf(prim('gc1', 50, 50))], {
			cols: 2,
			align: 'stretch'
		});
		const s = solveLayout(
			container('r', 'row', [grid, leaf(prim('B', 0, 0), { fr: 1 })], { align: 'stretch' }),
			{ x: 0, y: 0, w: 300, h: 100 }
		);
		// grid intrinsic width = 2 * 50 = 100, so B gets the remaining 200 (not 300).
		expect(get(s, 'gc0')).toEqual({ x: 0, y: 0, w: 50, h: 100 });
		expect(get(s, 'gc1')).toEqual({ x: 50, y: 0, w: 50, h: 100 });
		expect(get(s, 'B')).toEqual({ x: 100, y: 0, w: 200, h: 100 });
	});
});

// ---- groups --------------------------------------------------------------

describe('groups', () => {
	it('a group leaf emits its own box AND recurses (ids namespaced, child rebased)', () => {
		const inner = container(
			'gc',
			'col',
			[leaf(prim('X', 60, 20), { fr: 1 }), leaf(prim('Y', 60, 20), { fr: 1 })],
			{
				align: 'stretch'
			}
		);
		const s = solveLayout(leaf(group('g', { w: 60, h: 50 }, inner)), {
			x: 10,
			y: 10,
			w: 60,
			h: 50
		});
		expect(get(s, 'g')).toEqual({ x: 10, y: 10, w: 60, h: 50 });
		expect(get(s, 'g/X')).toEqual({ x: 10, y: 10, w: 60, h: 25 });
		expect(get(s, 'g/Y')).toEqual({ x: 10, y: 35, w: 60, h: 25 });
	});

	it('group-in-group namespaces by the full prefix chain', () => {
		const tree = leaf(
			group(
				'outer',
				{ w: 60, h: 60 },
				leaf(group('inner', { w: 60, h: 60 }, leaf(prim('P', 60, 60))))
			)
		);
		const s = solveLayout(tree, { x: 0, y: 0, w: 60, h: 60 });
		expect(get(s, 'outer')).toEqual({ x: 0, y: 0, w: 60, h: 60 });
		expect(get(s, 'outer/inner')).toEqual({ x: 0, y: 0, w: 60, h: 60 });
		expect(get(s, 'outer/inner/P')).toEqual({ x: 0, y: 0, w: 60, h: 60 });
	});

	it('32 instances of one def do not collide (namespacing)', () => {
		const def = {
			id: 'cg',
			name: 'core-graph',
			size: { w: 10, h: 10 },
			child: leaf(prim('spk', 10, 10))
		};
		const lib: Library = { version: 1, defs: [def] };
		const grid = container(
			'g',
			'grid',
			Array.from({ length: 32 }, (_, i) =>
				leaf(group('g' + i, { w: 10, h: 10 }, leaf(prim('fallback', 10, 10)), { def: 'cg' }))
			),
			{ cols: 8, align: 'stretch' }
		);
		const s = solveLayout(grid, { x: 0, y: 0, w: 800, h: 200 }, lib);
		const spkKeys = [...s.keys()].filter((k) => k.endsWith('/spk'));
		expect(spkKeys).toHaveLength(32);
		expect(get(s, 'g5/spk')).toEqual({ x: 500, y: 0, w: 100, h: 50 });
		expect(get(s, 'g31/spk')).toEqual({ x: 700, y: 150, w: 100, h: 50 });
	});

	it('resolveGroup: def overrides inline size + child', () => {
		const childC = leaf(prim('C', 1, 1));
		const lib: Library = {
			version: 1,
			defs: [{ id: 'core-graph', name: 'cg', size: { w: 40, h: 26 }, child: childC }]
		};
		const r = resolveGroup(
			group('inst', { w: 999, h: 999 }, leaf(prim('dummy', 1, 1)), { def: 'core-graph' }),
			lib
		);
		expect(r.size).toEqual({ w: 40, h: 26 });
		expect((r.child as Leaf).id).toBe('C');
	});

	it('resolveGroup: missing def falls back to inline child + size (no throw)', () => {
		const inline = leaf(prim('inl', 1, 1));
		const r = resolveGroup(group('inst', { w: 40, h: 26 }, inline, { def: 'nope' }), {
			version: 1,
			defs: []
		});
		expect(r.size).toEqual({ w: 40, h: 26 });
		expect((r.child as Leaf).id).toBe('inl');
	});

	it('group with neither def nor child resolves to an empty no-op', () => {
		const g = group('g', { w: 0, h: 0 }, undefined as unknown as LayoutNode);
		const s = solveLayout(leaf(g), { x: 0, y: 0, w: 10, h: 10 });
		expect(get(s, 'g')).toEqual({ x: 0, y: 0, w: 10, h: 10 });
		expect(s.size).toBe(1); // only the group box; the empty child contributes nothing
	});

	it('resolveGroup params clone the child and never mutate the def', () => {
		const defChild = leaf(prim('spk', 10, 10, { type: 'sparkline', sensor: 'cpu.core.0' }));
		const def = {
			id: 'cg',
			name: 'core-graph',
			size: { w: 40, h: 26 },
			child: defChild,
			params: [{ key: 'core', target: 'unit.sensor' }]
		};
		const lib: Library = { version: 1, defs: [def] };
		const a = resolveGroup(
			group('A', { w: 40, h: 26 }, leaf(prim('x', 1, 1)), {
				def: 'cg',
				params: { core: 'cpu.core.5' }
			}),
			lib
		);
		const b = resolveGroup(
			group('B', { w: 40, h: 26 }, leaf(prim('x', 1, 1)), {
				def: 'cg',
				params: { core: 'cpu.core.9' }
			}),
			lib
		);
		expect((a.child as Leaf).unit).toMatchObject({ sensor: 'cpu.core.5' });
		expect((b.child as Leaf).unit).toMatchObject({ sensor: 'cpu.core.9' });
		// the def's own child is untouched
		expect((defChild.unit as WidgetInstance).sensor).toBe('cpu.core.0');
	});

	it('default param target is fail-closed on a container-rooted child (no bogus unit grafted)', () => {
		const containerChild = container('inner', 'col', []);
		const def = {
			id: 'd',
			name: 'd',
			size: { w: 40, h: 40 },
			child: containerChild,
			params: [{ key: 'core' }] // no explicit target → default 'unit.config.core'
		};
		const lib: Library = { version: 1, defs: [def] };
		const r = resolveGroup(
			group('g', { w: 40, h: 40 }, leaf(prim('x', 1, 1)), { def: 'd', params: { core: 'cpu.5' } }),
			lib
		);
		expect('unit' in (r.child as Record<string, unknown>)).toBe(false);
	});
});

// ---- floating + monitor --------------------------------------------------

describe('solveMonitor / floating', () => {
	const wa: Rect = { x: 0, y: 0, w: 1920, h: 1080 };

	it('floating primitive placed verbatim; empty root contributes nothing', () => {
		const mon: MonitorLayout = {
			root: emptyRoot(),
			floating: [leaf(primAt('W', 300, 50, 160, 40))]
		};
		const s = solveMonitor(mon, wa);
		expect(get(s, 'W')).toEqual({ x: 300, y: 50, w: 160, h: 40 });
		expect(s.size).toBe(1);
	});

	it('floating leaf basis is ignored', () => {
		const mon: MonitorLayout = {
			root: emptyRoot(),
			floating: [leaf(primAt('W', 10, 10, 60, 40), 200)]
		};
		const s = solveMonitor(mon, wa);
		expect(get(s, 'W')).toEqual({ x: 10, y: 10, w: 60, h: 40 });
	});

	it('floating group anchored by config.x/config.y', () => {
		const g = group(
			'fg',
			{ w: 60, h: 40 },
			container('r', 'row', [leaf(prim('P', 60, 40))], { align: 'stretch' }),
			{
				config: { x: 200, y: 100 }
			}
		);
		const mon: MonitorLayout = { root: emptyRoot(), floating: [leaf(g)] };
		const s = solveMonitor(mon, wa);
		expect(get(s, 'fg')).toEqual({ x: 200, y: 100, w: 60, h: 40 });
		expect(get(s, 'fg/P')).toEqual({ x: 200, y: 100, w: 60, h: 40 });
	});

	it('root.bounds overrides the work area', () => {
		const root = container('root', 'col', [leaf(prim('L', 10, 10), { fr: 1 })], {
			align: 'stretch',
			bounds: { x: 100, y: 100, w: 200, h: 200 }
		});
		const s = solveMonitor({ root, floating: [] }, wa);
		expect(get(s, 'L')).toEqual({ x: 100, y: 100, w: 200, h: 200 });
	});
});

// ---- intrinsicSize -------------------------------------------------------

describe('intrinsicSize', () => {
	it('a row of two 50×40 auto leaves is 100×40', () => {
		const c = container('r', 'row', [leaf(prim('A', 50, 40)), leaf(prim('B', 50, 40))]);
		expect(intrinsicSize(c)).toEqual({ w: 100, h: 40 });
	});

	it('a col of two leaves stacks height, takes max width', () => {
		const c = container('c', 'col', [leaf(prim('A', 50, 40)), leaf(prim('B', 80, 20))]);
		expect(intrinsicSize(c)).toEqual({ w: 80, h: 60 });
	});
});

// ---- collectRenderables --------------------------------------------------

describe('collectRenderables', () => {
	const wa: Rect = { x: 0, y: 0, w: 1000, h: 200 };

	it('pairs flow (select self, not movable) and floating (movable) primitives', () => {
		const mon: MonitorLayout = {
			root: container('root', 'col', [leaf(prim('F', 100, 20), { fr: 1 })], { align: 'stretch' }),
			floating: [leaf(primAt('W', 300, 50, 160, 40))]
		};
		const rs = collectRenderables(mon, solveMonitor(mon, wa));
		const f = rs.find((r) => r.id === 'F');
		const w = rs.find((r) => r.id === 'W');
		expect(f).toMatchObject({
			selectId: 'F',
			movable: false,
			rect: { x: 0, y: 0, w: 1000, h: 200 }
		});
		expect(w).toMatchObject({
			selectId: 'W',
			movable: true,
			rect: { x: 300, y: 50, w: 160, h: 40 }
		});
	});

	it('emits group descendants (namespaced, selecting the group, not movable); not the group box', () => {
		const def = {
			id: 'cg',
			name: 'core-graph',
			size: { w: 40, h: 26 },
			child: leaf(prim('spk', 40, 26, { type: 'sparkline' }))
		};
		const lib: Library = { version: 1, defs: [def] };
		const g = group('g0', { w: 40, h: 26 }, leaf(prim('fb', 1, 1)), {
			def: 'cg',
			config: { x: 10, y: 20 }
		});
		const mon: MonitorLayout = { root: emptyRoot(), floating: [leaf(g)] };
		const rs = collectRenderables(mon, solveMonitor(mon, wa, lib), lib);
		const spk = rs.find((r) => r.id === 'g0/spk');
		expect(spk).toMatchObject({
			selectId: 'g0',
			movable: false,
			rect: { x: 10, y: 20, w: 40, h: 26 }
		});
		expect(spk?.instance.type).toBe('sparkline');
		expect(rs.find((r) => r.id === 'g0')).toBeUndefined();
	});
});
