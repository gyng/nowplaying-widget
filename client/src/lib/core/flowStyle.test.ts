import { describe, it, expect } from 'vitest';
import { container, leaf, type WidgetInstance, type Leaf } from './layoutTree';
import { containerStyle, itemStyle, overlapChildStyle } from './flowStyle';

const prim = (id: string, w = 10, h = 10): WidgetInstance => ({
	id,
	type: 'gauge',
	rect: { x: 0, y: 0, w, h },
	config: {}
});

describe('containerStyle', () => {
	it('row → flex row, default align stretch', () => {
		expect(containerStyle(container('r', 'row', []))).toMatchObject({
			display: 'flex',
			flexDirection: 'row',
			alignItems: 'stretch'
		});
	});

	it('col → flex column', () => {
		expect(containerStyle(container('c', 'col', []))).toMatchObject({
			display: 'flex',
			flexDirection: 'column'
		});
	});

	it('align/justify map to align-items / justify-content', () => {
		const s = containerStyle(container('r', 'row', [], { align: 'center', justify: 'between' }));
		expect(s.alignItems).toBe('center');
		expect(s.justifyContent).toBe('space-between');
	});

	it('gap + pad emit px', () => {
		const s = containerStyle(container('c', 'col', [], { gap: 8, pad: 6 }));
		expect(s.gap).toBe('8px');
		expect(s.padding).toBe('6px 6px 6px 6px');
	});

	it('per-side pad', () => {
		const s = containerStyle(container('c', 'col', [], { pad: { t: 1, r: 2, b: 3, l: 4 } }));
		expect(s.padding).toBe('1px 2px 3px 4px');
	});

	it('grid → grid with N columns and cell alignment', () => {
		const s = containerStyle(container('g', 'grid', [], { cols: 3, align: 'center' }));
		expect(s.display).toBe('grid');
		expect(s.gridTemplateColumns).toBe('repeat(3, 1fr)');
		expect(s.justifyItems).toBe('center');
		expect(s.alignItems).toBe('center');
	});

	it('grid with a fixed-width cell emits explicit tracks (px for fixed, 1fr splits the rest)', () => {
		const c0 = container('c0', 'col', [], { cellW: 150 });
		const s = containerStyle(
			container('g', 'grid', [c0, leaf(prim('B')), leaf(prim('C'))], { cols: 3 })
		);
		expect(s.gridTemplateColumns).toBe('150px 1fr 1fr');
	});

	it('grid with a fixed-height cell emits explicit rows', () => {
		const c0 = container('c0', 'col', [], { cellH: 50 });
		// 2 children in 1 col → 2 rows; row 0 fixed 50px, row 1 flexible.
		const s = containerStyle(container('g', 'grid', [c0, leaf(prim('B'))], { cols: 1 }));
		expect(s.gridTemplateRows).toBe('50px 1fr');
	});

	it('overlap → single-cell grid stack', () => {
		const s = containerStyle(container('o', 'col', [], { overlap: true }));
		expect(s.display).toBe('grid');
		expect(s.gridTemplate).toContain('stack');
		expect(overlapChildStyle().gridArea).toBe('stack');
	});

	it('no gap / no pad / no justify → those keys are omitted', () => {
		const s = containerStyle(container('r', 'row', []));
		expect('gap' in s).toBe(false);
		expect('padding' in s).toBe(false);
		expect('justifyContent' in s).toBe(false);
	});
});

describe('itemStyle (sizing)', () => {
	it('basis {fr} → grow proportionally from a 0 basis (can shrink past content)', () => {
		const s = itemStyle({ ...leaf(prim('A'), { fr: 2 }) }, 'row');
		expect(s).toMatchObject({
			flexGrow: 2,
			flexShrink: 1,
			flexBasis: 0,
			minWidth: 0,
			minHeight: 0
		});
	});

	it('basis number → fixed px basis, no grow/shrink', () => {
		const s = itemStyle({ ...leaf(prim('A'), 120) }, 'row');
		expect(s).toMatchObject({ flexGrow: 0, flexShrink: 0, flexBasis: '120px' });
	});

	it("basis 'auto' / unset → a LEAF keeps its stored size (no collapse); axis-aware", () => {
		// prim default size is 10x10. In a col the main axis is height; in a row it's width.
		expect(itemStyle({ ...leaf(prim('A', 40, 20)) }, 'col')).toMatchObject({
			flexGrow: 0,
			flexShrink: 0,
			flexBasis: '20px'
		});
		expect(itemStyle({ ...leaf(prim('A', 40, 20)) }, 'row').flexBasis).toBe('40px');
		// 'content' also falls back to the stored size (true measure-fit isn't available in pure CSS).
		expect(itemStyle({ ...leaf(prim('A', 40, 20), 'content') }, 'row').flexBasis).toBe('40px');
	});

	it('a CONTAINER with auto basis shrink-wraps (flex-basis:auto)', () => {
		expect(itemStyle(container('c', 'col', []), 'row').flexBasis).toBe('auto');
	});
});

describe('itemStyle (per-leaf alignment)', () => {
	it('row parent: valign → align-self (cross), halign → auto margins (main)', () => {
		const node: Leaf = { ...leaf(prim('A')), halign: 'right', valign: 'middle' };
		const s = itemStyle(node, 'row');
		expect(s.alignSelf).toBe('center'); // valign middle on the vertical cross axis
		expect(s.marginLeft).toBe('auto'); // halign right pushes it along the horizontal main axis
		expect('marginRight' in s).toBe(false);
	});

	it('col parent: halign → align-self (cross), valign → auto margins (main)', () => {
		const node: Leaf = { ...leaf(prim('A')), halign: 'center', valign: 'bottom' };
		const s = itemStyle(node, 'col');
		expect(s.alignSelf).toBe('center'); // halign center on the horizontal cross axis
		expect(s.marginTop).toBe('auto'); // valign bottom pushes it down the vertical main axis
	});

	it('row parent: halign center → centered via dual auto margins', () => {
		const s = itemStyle({ ...leaf(prim('A')), halign: 'center' }, 'row');
		expect(s.marginLeft).toBe('auto');
		expect(s.marginRight).toBe('auto');
	});

	it('grid parent: halign/valign → justify-self / align-self (independent 2D)', () => {
		const node: Leaf = { ...leaf(prim('A')), halign: 'right', valign: 'top' };
		const s = itemStyle(node, 'grid');
		expect(s.justifySelf).toBe('end');
		expect(s.alignSelf).toBe('start');
	});

	it('fill alignment → stretch', () => {
		const s = itemStyle({ ...leaf(prim('A')), halign: 'fill', valign: 'fill' }, 'grid');
		expect(s.justifySelf).toBe('stretch');
		expect(s.alignSelf).toBe('stretch');
	});
});
