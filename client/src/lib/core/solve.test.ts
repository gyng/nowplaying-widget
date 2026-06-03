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
	collectContainerRects,
	collectGridPlaceholders,
	collectRenderables,
	gridCellRects,
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

	it('a container emits its own box even when empty (so new panes are visible)', () => {
		const s = solveLayout(container('r', 'row', []), { x: 0, y: 0, w: 100, h: 100 });
		expect(s.size).toBe(1);
		expect(get(s, 'r')).toEqual({ x: 0, y: 0, w: 100, h: 100 });
	});

	it('a non-empty container emits its own box (for pane outlines)', () => {
		const s = solveLayout(container('r', 'row', [leaf(prim('A', 40, 20))], { align: 'start' }), {
			x: 5,
			y: 6,
			w: 100,
			h: 80
		});
		expect(get(s, 'r')).toEqual({ x: 5, y: 6, w: 100, h: 80 });
	});
});

// ---- fr distribution -----------------------------------------------------

describe("basis 'content'", () => {
	it("sizes like 'auto' from the rect (the render layer has substituted the measured size)", () => {
		// Two leaves in a row: A is 'content' with a measured rect of 72px, B is fixed-auto at 100px.
		// They sit side-by-side at those widths — proving 'content' uses the rect as its main extent.
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 72, 18), 'content'), leaf(prim('B', 100, 18))], {
				align: 'start'
			}),
			{ x: 0, y: 0, w: 300, h: 40 }
		);
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 72, h: 18 });
		expect(get(s, 'B')).toEqual({ x: 72, y: 0, w: 100, h: 18 });
	});
});

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

// ---- per-leaf alignment (halign / valign) --------------------------------

describe('per-leaf alignment (halign / valign within the box)', () => {
	it('default (unset) fills the box — no regression', () => {
		const s = solveLayout(
			container('r', 'row', [leaf(prim('A', 40, 20), { fr: 1 })], { align: 'stretch' }),
			{ x: 0, y: 0, w: 200, h: 100 }
		);
		expect(get(s, 'A')).toEqual({ x: 0, y: 0, w: 200, h: 100 });
	});

	it("halign 'right' on a grown leaf pins it to the right at its intrinsic width", () => {
		const s = solveLayout(
			container('r', 'row', [{ ...leaf(prim('A', 40, 20), { fr: 1 }), halign: 'right' as const }], {
				align: 'stretch'
			}),
			{ x: 0, y: 0, w: 200, h: 100 }
		);
		// fr fills 200 wide, stretch fills 100 tall; halign right shrinks to w=40 pinned to x=160.
		expect(get(s, 'A')).toEqual({ x: 160, y: 0, w: 40, h: 100 });
	});

	it("valign 'middle' centers a leaf vertically in its (stretched) grid cell", () => {
		const s = solveLayout(
			container('g', 'grid', [{ ...leaf(prim('A', 40, 40)), valign: 'middle' as const }], {
				cols: 1,
				align: 'stretch'
			}),
			{ x: 0, y: 0, w: 100, h: 100 }
		);
		// cell is the full 100×100; valign middle → h=40 at y=30, width still fills.
		expect(get(s, 'A')).toEqual({ x: 0, y: 30, w: 100, h: 40 });
	});

	it('halign + valign center positions the leaf in both axes', () => {
		const s = solveLayout(
			container(
				'g',
				'grid',
				[{ ...leaf(prim('A', 40, 40)), halign: 'center' as const, valign: 'middle' as const }],
				{ cols: 1, align: 'stretch' }
			),
			{ x: 0, y: 0, w: 100, h: 100 }
		);
		expect(get(s, 'A')).toEqual({ x: 30, y: 30, w: 40, h: 40 });
	});

	it('no slack on an axis → that axis is a no-op (auto width, full-height valign still works)', () => {
		const s = solveLayout(
			container(
				'r',
				'row',
				[{ ...leaf(prim('A', 40, 20)), halign: 'center' as const, valign: 'bottom' as const }],
				{ align: 'stretch' }
			),
			{ x: 0, y: 0, w: 200, h: 100 }
		);
		// auto basis → main box = intrinsic 40 (no horizontal slack, stays at x=0);
		// stretch cross → full 100 tall, valign bottom pins h=20 to y=80.
		expect(get(s, 'A')).toEqual({ x: 0, y: 80, w: 40, h: 20 });
	});

	it('a group leaf is positioned by its intrinsic size; its child solves in the placed box', () => {
		const inner = container('gc', 'col', [leaf(prim('X', 60, 50), { fr: 1 })], {
			align: 'stretch'
		});
		const g = {
			...leaf(group('g', { w: 60, h: 50 }, inner), { fr: 1 }),
			halign: 'center' as const
		};
		const s = solveLayout(container('r', 'row', [g], { align: 'stretch' }), {
			x: 0,
			y: 0,
			w: 200,
			h: 50
		});
		expect(get(s, 'g')).toEqual({ x: 70, y: 0, w: 60, h: 50 });
		expect(get(s, 'g/X')).toEqual({ x: 70, y: 0, w: 60, h: 50 });
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

	it('a pad exceeding the box keeps the content ORIGIN inside the bounds', () => {
		// pad (111) > the box height (98): the leading inset must clamp to the edge, not push the
		// content origin (and every child) below the box. Regression for the widget-designer bug where
		// splitting an over-padded def canvas flung the new cells outside it.
		const s = solveLayout(
			container('c', 'col', [leaf(prim('A', 0, 0), { fr: 1 })], { pad: 111, align: 'stretch' }),
			{ x: 0, y: 0, w: 166, h: 98 }
		);
		// x: pad (111) < width (166) → 111; y: pad (111) > height (98) → clamps to 98 (bottom edge).
		expect(get(s, 'A')).toEqual({ x: 111, y: 98, w: 0, h: 0 });
	});
});

describe('oversized pad + gap keep split cells inside the canvas (designer regression)', () => {
	it('two fr cells in an over-padded, over-gapped col stay within the box bounds', () => {
		// The exact saved shape that broke: a 166×98 widget def whose root col carried pad:111, gap:15
		// (so the available space collapses to nothing). Both split cells must remain inside [0,166]×
		// [0,98] instead of solving to (111,111)/(111,126) below-right of the canvas.
		const box = { x: 0, y: 0, w: 166, h: 98 };
		const s = solveLayout(
			container(
				'root',
				'col',
				[
					container('cell-a', 'col', [], { align: 'stretch', basis: { fr: 1 } }),
					container('cell-b', 'col', [], { align: 'stretch', basis: { fr: 1 } })
				],
				{ pad: 111, gap: 15, align: 'stretch', basis: { fr: 1 } }
			),
			box
		);
		for (const id of ['cell-a', 'cell-b']) {
			const r = get(s, id);
			expect(r.x).toBeGreaterThanOrEqual(box.x);
			expect(r.y).toBeGreaterThanOrEqual(box.y);
			expect(r.x + r.w).toBeLessThanOrEqual(box.x + box.w);
			expect(r.y + r.h).toBeLessThanOrEqual(box.y + box.h);
		}
	});

	it('a 2×2 grid split in an over-padded canvas keeps every cell inside the box', () => {
		const box = { x: 0, y: 0, w: 166, h: 98 };
		const cells = ['a', 'b', 'c', 'd'].map((k) =>
			container(`cell-${k}`, 'col', [], { align: 'stretch' })
		);
		const s = solveLayout(
			container('root', 'grid', cells, { cols: 2, rows: 2, pad: 111, gap: 15, align: 'stretch' }),
			box
		);
		for (const c of cells) {
			const r = get(s, c.id);
			expect(r.x).toBeGreaterThanOrEqual(box.x);
			expect(r.y).toBeGreaterThanOrEqual(box.y);
			expect(r.x + r.w).toBeLessThanOrEqual(box.x + box.w);
			expect(r.y + r.h).toBeLessThanOrEqual(box.y + box.h);
		}
	});

	it('a gap larger than the main axis does not walk children past the box', () => {
		// Two zero-size fr cells, gap (200) far exceeds the 100px main axis: the gap clamps so the
		// second cell can't escape below the box.
		const s = solveLayout(
			container(
				'c',
				'col',
				[
					container('p', 'col', [], { basis: { fr: 1 } }),
					container('q', 'col', [], { basis: { fr: 1 } })
				],
				{ gap: 200, align: 'stretch' }
			),
			{ x: 0, y: 0, w: 100, h: 100 }
		);
		expect(get(s, 'q').y).toBeLessThanOrEqual(100);
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
		// The group box + its synthetic empty container child's box (containers always emit
		// their own box now, so an empty pane is visible/selectable).
		expect(s.size).toBe(2);
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

	it('floating primitive placed verbatim; empty root still emits its own box', () => {
		const mon: MonitorLayout = {
			root: emptyRoot(),
			floating: [leaf(primAt('W', 300, 50, 160, 40))]
		};
		const s = solveMonitor(mon, wa);
		expect(get(s, 'W')).toEqual({ x: 300, y: 50, w: 160, h: 40 });
		// The floating primitive + the (empty) root container's own box.
		expect(s.size).toBe(2);
		expect(get(s, 'root')).toEqual(wa);
	});

	it('floating leaf basis is ignored', () => {
		const mon: MonitorLayout = {
			root: emptyRoot(),
			floating: [leaf(primAt('W', 10, 10, 60, 40), 200)]
		};
		const s = solveMonitor(mon, wa);
		expect(get(s, 'W')).toEqual({ x: 10, y: 10, w: 60, h: 40 });
	});

	it('floating group size defaults to the def size but config.w/config.h override it', () => {
		const mk = (cfg: Record<string, number>) =>
			group(
				'fg',
				{ w: 60, h: 40 },
				container('r', 'row', [leaf(prim('P', 60, 40), { fr: 1 })], { align: 'stretch' }),
				{ config: cfg }
			);
		// No override → def size 60×40 at the anchor.
		let s = solveMonitor({ root: emptyRoot(), floating: [leaf(mk({ x: 10, y: 20 }))] }, wa);
		expect(get(s, 'fg')).toEqual({ x: 10, y: 20, w: 60, h: 40 });
		// config.w/h override → the box (and its fr child) grow to the given size.
		s = solveMonitor(
			{ root: emptyRoot(), floating: [leaf(mk({ x: 10, y: 20, w: 300, h: 200 }))] },
			wa
		);
		expect(get(s, 'fg')).toEqual({ x: 10, y: 20, w: 300, h: 200 });
		expect(get(s, 'fg/P')).toEqual({ x: 10, y: 20, w: 300, h: 200 });
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

// ---- collectContainerRects -----------------------------------------------

describe('collectContainerRects', () => {
	it('returns the root and every nested container box, with kind', () => {
		const root = container(
			'root',
			'col',
			[
				container('row1', 'row', [leaf(prim('A', 40, 20)), leaf(prim('B', 40, 20))], {
					align: 'stretch'
				})
			],
			{ align: 'stretch' }
		);
		const mon: MonitorLayout = { root, floating: [] };
		const boxes = collectContainerRects(mon, solveMonitor(mon, { x: 0, y: 0, w: 200, h: 100 }));
		const byId = Object.fromEntries(boxes.map((b) => [b.id, b]));
		expect(byId['root']).toMatchObject({ kind: 'col', rect: { x: 0, y: 0, w: 200, h: 100 } });
		expect(byId['row1']?.kind).toBe('row');
		expect(boxes).toHaveLength(2);
	});

	it('does not descend into group internals (only flow-tree containers)', () => {
		const def = {
			id: 'cg',
			name: 'cg',
			size: { w: 40, h: 26 },
			child: container('innerDef', 'row', [leaf(prim('spk', 40, 26))], { align: 'stretch' })
		};
		const lib: Library = { version: 1, defs: [def] };
		const root = container(
			'root',
			'col',
			[leaf(group('g0', { w: 40, h: 26 }, leaf(prim('fb', 1, 1)), { def: 'cg' }))],
			{
				align: 'stretch'
			}
		);
		const mon: MonitorLayout = { root, floating: [] };
		const boxes = collectContainerRects(
			mon,
			solveMonitor(mon, { x: 0, y: 0, w: 100, h: 100 }, lib)
		);
		// Only the flow root is a container here; the group's internal 'innerDef' is not surfaced.
		expect(boxes.map((b) => b.id)).toEqual(['root']);
	});

	it('surfaces a freshly added empty pane (fr basis) so it is visible', () => {
		// Mirrors addContainer: an empty fr:1 grid added to the root fills the work area.
		const grid = container('grid-x', 'grid', [], { cols: 2, basis: { fr: 1 } });
		const root = container('root', 'col', [grid], { align: 'stretch' });
		const mon: MonitorLayout = { root, floating: [] };
		const boxes = collectContainerRects(mon, solveMonitor(mon, { x: 0, y: 0, w: 200, h: 120 }));
		const gridBox = boxes.find((b) => b.id === 'grid-x');
		expect(gridBox?.kind).toBe('grid');
		expect(gridBox?.rect).toEqual({ x: 0, y: 0, w: 200, h: 120 }); // fills the root
	});
});

describe('collectGridPlaceholders', () => {
	it('an empty grid outlines one row of `cols` cells', () => {
		const grid = container('g', 'grid', [], { cols: 2, basis: { fr: 1 } });
		const root = container('root', 'col', [grid], { align: 'stretch' });
		const mon: MonitorLayout = { root, floating: [] };
		const cells = collectGridPlaceholders(mon, solveMonitor(mon, { x: 0, y: 0, w: 200, h: 100 }));
		expect(cells).toHaveLength(2);
		expect(cells[0]).toEqual({ x: 0, y: 0, w: 100, h: 100 });
		expect(cells[1]).toEqual({ x: 100, y: 0, w: 100, h: 100 });
	});

	it('a partial grid outlines only the empty trailing cells', () => {
		const grid = container('g', 'grid', [leaf(prim('A', 10, 10))], { cols: 2, basis: { fr: 1 } });
		const root = container('root', 'col', [grid], { align: 'stretch' });
		const mon: MonitorLayout = { root, floating: [] };
		const cells = collectGridPlaceholders(mon, solveMonitor(mon, { x: 0, y: 0, w: 200, h: 100 }));
		expect(cells).toHaveLength(1); // cell 0 filled by A, cell 1 is the placeholder
		expect(cells[0]).toEqual({ x: 100, y: 0, w: 100, h: 100 });
	});
});

describe('overlap container', () => {
	it('places every child in the same content box (stretch = fill, layered by order)', () => {
		const cell = container('cell', 'col', [leaf(prim('A', 10, 10)), leaf(prim('B', 20, 20))], {
			overlap: true,
			align: 'stretch'
		});
		const solved = solveLayout(cell, { x: 0, y: 0, w: 100, h: 50 });
		expect(solved.get('A')).toEqual({ x: 0, y: 0, w: 100, h: 50 });
		expect(solved.get('B')).toEqual({ x: 0, y: 0, w: 100, h: 50 }); // overlaps A exactly
	});

	it("an overlap container's intrinsic size is its largest child, not the sum", () => {
		const cell = container('cell', 'col', [leaf(prim('A', 10, 40)), leaf(prim('B', 30, 20))], {
			overlap: true,
			align: 'center'
		});
		// inside a fitting root so the cell takes its intrinsic box
		const root = container('root', 'col', [cell], {});
		const mon: MonitorLayout = { root, floating: [] };
		const solved = solveMonitor(mon, { x: 0, y: 0, w: 200, h: 200 });
		// max width 30, max height 40 (not 10+30 / 40+20)
		expect(solved.get('cell')).toMatchObject({ w: 30, h: 40 });
	});
});

describe('non-uniform grid (fixed cell width/height + aspect)', () => {
	it('uniform when no cell fixes a size (unchanged behaviour)', () => {
		const grid = container('g', 'grid', [leaf(prim('A', 10, 10)), leaf(prim('B', 10, 10))], {
			cols: 2
		});
		const cells = gridCellRects(grid, { x: 0, y: 0, w: 200, h: 100 });
		expect(cells[0]).toEqual({ x: 0, y: 0, w: 100, h: 100 });
		expect(cells[1]).toEqual({ x: 100, y: 0, w: 100, h: 100 });
	});

	it('a fixed-width cell takes that column width; the rest split the remainder', () => {
		const c0 = container('c0', 'col', [leaf(prim('A', 10, 10))], { cellW: 100 });
		const grid = container('g', 'grid', [c0, leaf(prim('B', 10, 10)), leaf(prim('C', 10, 10))], {
			cols: 3
		});
		const cells = gridCellRects(grid, { x: 0, y: 0, w: 300, h: 100 });
		expect(cells[0]).toEqual({ x: 0, y: 0, w: 100, h: 100 }); // fixed column
		expect(cells[1]).toEqual({ x: 100, y: 0, w: 100, h: 100 }); // (300-100)/2
		expect(cells[2]).toEqual({ x: 200, y: 0, w: 100, h: 100 });
	});

	it('a fixed-height cell sets its row height; aspect shapes the cell within its box', () => {
		// 1 col × 2 rows over 100×200; row 0 fixed 50 → row 1 = 150. cell 0 aspect 1 → 50×50, centred.
		const c0 = container('c0', 'col', [leaf(prim('A', 10, 10))], { cellH: 50, aspect: 1 });
		const grid = container('g', 'grid', [c0, leaf(prim('B', 10, 10))], {
			cols: 1,
			align: 'center'
		});
		const solved = solveLayout(grid, { x: 0, y: 0, w: 100, h: 200 });
		expect(solved.get('c0')).toEqual({ x: 25, y: 0, w: 50, h: 50 });
	});
});

describe('empty split cells (split-cell collapse fix)', () => {
	it('empty fr:1 cells in a col share the height evenly', () => {
		const root = container(
			'r',
			'col',
			[
				container('a', 'col', [], { basis: { fr: 1 }, align: 'stretch' }),
				container('b', 'col', [], { basis: { fr: 1 }, align: 'stretch' })
			],
			{ align: 'stretch' }
		);
		const solved = solveLayout(root, { x: 0, y: 0, w: 200, h: 120 });
		expect(get(solved, 'a')).toEqual({ x: 0, y: 0, w: 200, h: 60 });
		expect(get(solved, 'b')).toEqual({ x: 0, y: 60, w: 200, h: 60 });
	});

	it('empty basis-auto cells collapse to 0 main extent (what split now avoids by using fr)', () => {
		const root = container(
			'r',
			'col',
			[
				container('a', 'col', [], { align: 'stretch' }),
				container('b', 'col', [], { align: 'stretch' })
			],
			{ align: 'stretch' }
		);
		const solved = solveLayout(root, { x: 0, y: 0, w: 200, h: 120 });
		expect(get(solved, 'a').h).toBe(0);
		expect(get(solved, 'b').h).toBe(0);
	});
});
