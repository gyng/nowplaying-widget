// flowStyle.ts — map the layout grammar to NATIVE CSS, so the browser lays out the flow tree
// instead of the pure solver (solve.ts). This is the keystone of the CSS-layout pivot: the same
// row/col/grid + basis + align/justify grammar that the solver interpreted into rects is here
// interpreted into `display:flex`/`grid` + flex/grid item properties, and the browser does the
// rest. The render layer then reads back rects (ResizeObserver) for hit-testing + the editor.
//
// Two pure functions, framework-agnostic (plain camelCase style objects, no React/DOM), so they
// stay unit-testable WITHOUT a layout engine — co-located tests in flowStyle.test.ts assert the
// emitted CSS. `containerStyle` styles a node AS a flex/grid container (for its children);
// `itemStyle` styles it AS a child of its parent's flow (sizing + self-alignment).

import {
	resolvePad,
	type Align,
	type AlignH,
	type AlignV,
	type Container,
	type Justify,
	type LayoutNode,
	type Length
} from './layoutTree';

// A plain inline-style map (camelCase keys, React-applies verbatim). Kept framework-agnostic.
export type Style = Record<string, string | number>;

// Cross-axis align (align-items) — the container's `align`.
const ALIGN_ITEMS: Record<Align, string> = {
	start: 'flex-start',
	center: 'center',
	end: 'flex-end',
	stretch: 'stretch'
};
// Main-axis distribute (justify-content) — the container's `justify`.
const JUSTIFY_CONTENT: Record<Justify, string> = {
	start: 'flex-start',
	center: 'center',
	end: 'flex-end',
	between: 'space-between',
	around: 'space-around'
};
// Grid cell alignment (justify-items / align-items) — the grid's `align`, applied to every cell.
const GRID_ITEMS: Record<Align, string> = {
	start: 'start',
	center: 'center',
	end: 'end',
	stretch: 'stretch'
};

// A leaf's halign/valign → a self-alignment keyword. Flex `align-self` wants flex-* on the cross
// axis; grid justify-self/align-self want plain start/end. 'fill' = stretch on both.
const FLEX_SELF: Record<AlignH | AlignV, string> = {
	left: 'flex-start',
	right: 'flex-end',
	top: 'flex-start',
	bottom: 'flex-end',
	center: 'center',
	middle: 'center',
	fill: 'stretch'
};
const GRID_SELF: Record<AlignH | AlignV, string> = {
	left: 'start',
	right: 'end',
	top: 'start',
	bottom: 'end',
	center: 'center',
	middle: 'center',
	fill: 'stretch'
};

function isFr(b: Length | undefined): b is { fr: number } {
	return typeof b === 'object' && b !== null && 'fr' in b;
}

/**
 * Style a node AS a flow CHILD of its parent (`parentKind`): how it sizes on the main axis (its
 * `basis`) plus, for a leaf, its own placement (`halign`/`valign`). Mirrors the solver's basis +
 * placeLeafInBox, expressed as flex/grid item properties:
 *   - basis {fr:n} → flex-grow:n, flex-basis:0 (proportional share of the leftover; min-*:0 so it
 *     can shrink past content like the solver's fr).
 *   - basis number → a fixed px flex-basis (no grow/shrink).
 *   - basis 'auto'/'content'/unset → content-sized (flex:0 0 auto).
 * Per-leaf alignment maps to align-self on the cross axis and auto-margins on the main axis (flex),
 * or justify-self/align-self in a grid cell (independent 2D).
 */
export function itemStyle(node: LayoutNode, parentKind: Container['kind']): Style {
	const s: Style = {};
	const basis = (node as { basis?: Length }).basis;
	if (isFr(basis)) {
		s.flexGrow = Math.max(0, basis.fr);
		s.flexShrink = 1;
		s.flexBasis = 0;
		s.minWidth = 0;
		s.minHeight = 0;
	} else if (typeof basis === 'number') {
		s.flexGrow = 0;
		s.flexShrink = 0;
		s.flexBasis = `${Math.max(0, basis)}px`;
	} else {
		s.flexGrow = 0;
		s.flexShrink = 0;
		s.flexBasis = 'auto';
	}

	const ha = (node as { halign?: AlignH }).halign;
	const va = (node as { valign?: AlignV }).valign;
	if (parentKind === 'grid') {
		if (ha) s.justifySelf = GRID_SELF[ha];
		if (va) s.alignSelf = GRID_SELF[va];
	} else if (parentKind === 'row') {
		// row: cross axis is vertical → valign = align-self; main axis horizontal → auto margins.
		if (va) s.alignSelf = FLEX_SELF[va];
		if (ha === 'center') {
			s.marginLeft = 'auto';
			s.marginRight = 'auto';
		} else if (ha === 'right') {
			s.marginLeft = 'auto';
		}
	} else {
		// col: cross axis is horizontal → halign = align-self; main axis vertical → auto margins.
		if (ha) s.alignSelf = FLEX_SELF[ha];
		if (va === 'middle') {
			s.marginTop = 'auto';
			s.marginBottom = 'auto';
		} else if (va === 'bottom') {
			s.marginTop = 'auto';
		}
	}
	return s;
}

/**
 * Style a container AS a flex/grid CONTAINER for its children: display + direction + gap + padding
 * + align/justify (or grid tracks). `overlap` stacks every child in one grid cell (the children
 * each take `gridArea:'1 / 1'` — the renderer applies that). Mirrors the solver's solveFlex/solveGrid
 * arrangement, expressed as CSS.
 */
export function containerStyle(c: Container): Style {
	const s: Style = {};
	const pad = resolvePad(c.pad);
	if (pad.t || pad.r || pad.b || pad.l) s.padding = `${pad.t}px ${pad.r}px ${pad.b}px ${pad.l}px`;
	if (c.gap) s.gap = `${c.gap}px`;

	if (c.overlap) {
		// Layered stack: one cell, every child placed at 1/1 (see overlapChildStyle).
		s.display = 'grid';
		s.gridTemplate = '"stack" 1fr / 1fr';
		return s;
	}
	if (c.kind === 'grid') {
		s.display = 'grid';
		const cols = Math.max(1, c.cols ?? 1);
		s.gridTemplateColumns = `repeat(${cols}, 1fr)`;
		s.gridAutoRows = '1fr';
		const a = GRID_ITEMS[c.align ?? 'stretch'];
		s.justifyItems = a;
		s.alignItems = a;
		return s;
	}
	s.display = 'flex';
	s.flexDirection = c.kind === 'row' ? 'row' : 'column';
	s.alignItems = ALIGN_ITEMS[c.align ?? 'stretch'];
	if (c.justify) s.justifyContent = JUSTIFY_CONTENT[c.justify];
	return s;
}

// A child of an `overlap` container occupies the single shared cell (layered by DOM order).
export function overlapChildStyle(): Style {
	return { gridArea: 'stack' };
}
