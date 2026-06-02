// The HEART of the layout engine: a pure, recursive solver. Given a node and the
// absolute content rect it occupies, produce a flat Map<id, Rect> of every rendered
// primitive's ABSOLUTE rect (plus each placed group's own box). Containers distribute
// the main axis by basis/fr, place the cross axis by align, and apply gap/pad/justify.
// A group solves its child inside its own box (a leaf to the solver, a container-root
// internally); its descendant ids are namespaced by the group leaf id so many
// instances of one def never collide. The floating layer positions each leaf by its
// own absolute rect. ZERO Svelte/Tauri, no DOM, no text measurement — intrinsic size
// is a primitive's rect.{w,h} / a group's size. Results are EXACT floats (like
// align.ts); the render layer paints them verbatim, so adjacent flow children share an
// exact edge (no 1px snap seam). Co-located vitest tests in solve.test.ts.

import type { Rect, WidgetInstance } from './layout';
import {
	type Align,
	type Container,
	type Group,
	type Justify,
	type LayoutNode,
	type Leaf,
	type Length,
	type Library,
	type LayoutV2,
	type MonitorLayout,
	type WidgetDef,
	isContainer,
	isGroup,
	isLeaf,
	resolvePad
} from './layoutTree';

export type Solved = Map<string, Rect>;
export type ResolvedGroup = { child: LayoutNode; size: { w: number; h: number } };

// A primitive widget ready to render: its solved rect + the (possibly group-cloned,
// param-applied) instance, plus how the overlay should treat it.
export type Renderable = {
	id: string; // namespaced solved id (unique across group instances)
	selectId: string; // what to select on click (the group's id for group descendants)
	instance: WidgetInstance;
	rect: Rect;
	movable: boolean; // true only for top-level floating primitives (free drag/resize)
	groupId?: string; // the (outermost) group leaf id, for group descendants — css hook
	defId?: string; // the (outermost) group's def id, for group descendants — css hook
};

/**
 * Pair every rendered primitive (flow tree + floating layer + group descendants) with
 * its solved rect, mirroring the solver's id namespacing. Group descendants carry their
 * group's id as `selectId` (the group is the selectable unit) and are never movable.
 * Pure — `solved` comes from solveMonitor; this only walks + looks up.
 */
export function collectRenderables(
	monitor: MonitorLayout,
	solved: Solved,
	library?: Library
): Renderable[] {
	const out: Renderable[] = [];

	const walk = (
		node: LayoutNode,
		prefix: string,
		groupSel: string | null,
		defSel: string | null
	): void => {
		if (isContainer(node)) {
			for (const child of node.children) walk(child, prefix, groupSel, defSel);
			return;
		}
		const id = prefix + node.id;
		if (isGroup(node.unit)) {
			const { child } = resolveGroup(node.unit, library);
			walk(child, id + '/', groupSel ?? node.id, defSel ?? node.unit.def ?? null);
			return;
		}
		const rect = solved.get(id);
		if (rect) {
			out.push({
				id,
				selectId: groupSel ?? node.id,
				instance: node.unit,
				rect,
				movable: false,
				...(groupSel ? { groupId: groupSel } : {}),
				...(defSel ? { defId: defSel } : {})
			});
		}
	};

	walk(monitor.root, '', null, null);

	for (const lf of monitor.floating) {
		if (isGroup(lf.unit)) {
			const { child } = resolveGroup(lf.unit, library);
			walk(child, lf.id + '/', lf.id, lf.unit.def ?? null);
			continue;
		}
		const rect = solved.get(lf.id);
		if (rect) {
			out.push({ id: lf.id, selectId: lf.id, instance: lf.unit, rect, movable: true });
		}
	}

	return out;
}

// One container's solved box, for drawing pane boundaries in the editor.
export type ContainerBox = { id: string; rect: Rect; kind: Container['kind'] };

/**
 * Collect every flow-tree container's solved box (the root and its nested row/col/grid
 * panes), so the designer can outline the layout structure. Group internals (def subtrees)
 * are intentionally NOT descended into — only the monitor's own containers are surfaced.
 * Pure; `solved` must come from solveMonitor/solveLayout (which now emit container boxes).
 */
export function collectContainerRects(monitor: MonitorLayout, solved: Solved): ContainerBox[] {
	const out: ContainerBox[] = [];
	const walk = (node: LayoutNode): void => {
		if (!isContainer(node)) return;
		const rect = solved.get(node.id);
		if (rect) out.push({ id: node.id, rect, kind: node.kind });
		for (const child of node.children) walk(child);
	};
	walk(monitor.root);
	return out;
}

// Grid row count: the explicit `rows` (a minimum) grown to fit the children, at least 1 (so an
// EMPTY grid still shows one row of columns).
function gridRows(c: Container): number {
	const cols = Math.max(1, c.cols ?? 1);
	return Math.max(c.rows ?? 1, Math.ceil(c.children.length / cols), 1);
}

// Every cell rect of a grid container (cols × rows, row-major), mirroring solveGrid. Exported
// so the designer can outline empty cells and highlight the drop-target cell.
export function gridCellRects(c: Container, box: Rect): Rect[] {
	const content = insetPad(box, c.pad);
	const cols = Math.max(1, c.cols ?? 1);
	const rows = gridRows(c);
	const gap = c.gap ?? 0;
	const cellW = Math.max(0, (content.w - gap * (cols - 1)) / cols);
	const cellH = Math.max(0, (content.h - gap * (rows - 1)) / rows);
	const cells: Rect[] = [];
	for (let i = 0; i < cols * rows; i++) {
		const col = i % cols;
		const row = Math.floor(i / cols);
		cells.push({
			x: content.x + col * (cellW + gap),
			y: content.y + row * (cellH + gap),
			w: cellW,
			h: cellH
		});
	}
	return cells;
}

/**
 * Empty grid cells across the flow tree (the trailing cells a grid has no child for), so the
 * designer can outline where the next widgets land — including showing the columns of a grid
 * that's still empty. Pure; needs container boxes from solveMonitor.
 */
export function collectGridPlaceholders(monitor: MonitorLayout, solved: Solved): Rect[] {
	const out: Rect[] = [];
	const walk = (node: LayoutNode): void => {
		if (!isContainer(node)) return;
		if (node.kind === 'grid') {
			const box = solved.get(node.id);
			if (box) {
				const cells = gridCellRects(node, box);
				for (let i = node.children.length; i < cells.length; i++) out.push(cells[i]);
			}
		}
		for (const child of node.children) walk(child);
	};
	walk(monitor.root);
	return out;
}

type Size = { w: number; h: number };

// ---- public entry points -------------------------------------------------

/**
 * Solve `node` inside the absolute `contentRect`, returning a Map from id → absolute
 * Rect for every primitive (and every placed group box) reachable below it. Pure and
 * deterministic. A container's own `bounds` is ignored here in favour of the
 * caller-supplied `contentRect` (the monitor caller passes `root.bounds ?? workArea`).
 * `library` is needed only when the tree contains group instances that reference a def.
 */
export function solveLayout(node: LayoutNode, contentRect: Rect, library?: Library): Solved {
	const out: Solved = new Map();
	solveNode(node, contentRect, '', library, out);
	return out;
}

/**
 * Solve a whole monitor: the in-flow `root` inside its bounds (defaulting to
 * `workArea`), then the floating layer (each leaf positioned by its own absolute rect).
 * Floating is solved last, so it wins on id collisions — ids are expected unique across
 * both layers.
 */
export function solveMonitor(monitor: MonitorLayout, workArea: Rect, library?: Library): Solved {
	const out: Solved = new Map();
	const rootBounds = monitor.root.bounds ?? workArea;
	solveNode(monitor.root, rootBounds, '', library, out);
	for (const f of monitor.floating) solveFloating(f, library, out);
	return out;
}

/** Solve every monitor in a v2 layout. `workAreas[id]` is that monitor's work area. */
export function solveLayoutV2(
	layout: LayoutV2,
	workAreas: Record<string, Rect>,
	library?: Library
): Record<string, Solved> {
	const result: Record<string, Solved> = {};
	for (const [id, mon] of Object.entries(layout.monitors)) {
		const wa = workAreas[id] ?? mon.root.bounds ?? { x: 0, y: 0, w: 0, h: 0 };
		result[id] = solveMonitor(mon, wa, library);
	}
	return result;
}

/**
 * Resolve a group instance to the concrete child subtree + box to solve inside. Looks
 * up `def` in the library (falling back to the group's inline `child`/`size` when the
 * def is missing/unresolved), then applies the instance's `params` as overrides onto a
 * CLONED child (the def/inline tree is never mutated). Pure.
 */
export function resolveGroup(grp: Group, library?: Library): ResolvedGroup {
	const def: WidgetDef | undefined =
		grp.def && library ? library.defs.find((d) => d.id === grp.def) : undefined;

	const baseChild: LayoutNode | undefined = def ? def.child : grp.child;
	const size: Size = def ? def.size : grp.size ?? { w: 0, h: 0 };

	if (!baseChild) return { child: emptyContainer(grp.id + ':empty'), size };

	const child = cloneNode(baseChild);
	if (grp.params) applyParams(child, def?.params, grp.params);
	return { child, size };
}

/** A node's intrinsic box ({w,h}) — used to seed a new WidgetDef's `size` when a subtree
 * is turned into a reusable widget (Phase 6a). Pure. */
export function intrinsicSize(node: LayoutNode, library?: Library): { w: number; h: number } {
	return { w: intrinsicMain(node, true, library), h: intrinsicMain(node, false, library) };
}

// ---- recursion core ------------------------------------------------------

// `prefix` namespaces every id emitted below it (empty at the monitor root). A group
// leaf appends `${leaf.id}/` before solving its child so the same def instantiated many
// times never overwrites itself in the Map.
function solveNode(
	node: LayoutNode,
	box: Rect,
	prefix: string,
	library: Library | undefined,
	out: Solved
): void {
	if (isContainer(node)) {
		solveContainer(node, box, prefix, library, out);
		return;
	}
	if (isLeaf(node)) {
		solveLeaf(node, box, prefix, library, out);
	}
}

/**
 * Solve a leaf occupying `box`. A primitive emits its id → box. A group emits its own
 * box (for selection/hit-testing) then recurses, solving its child inside the same box
 * with the descendant ids namespaced by the group leaf id.
 */
function solveLeaf(
	lf: Leaf,
	box: Rect,
	prefix: string,
	library: Library | undefined,
	out: Solved
): void {
	const unit = lf.unit;
	out.set(prefix + lf.id, { ...box });
	if (isGroup(unit)) {
		const { child } = resolveGroup(unit, library);
		solveNode(child, box, prefix + lf.id + '/', library, out);
	}
}

/** A floating leaf is positioned absolutely: a primitive by its own rect, a group by
 * its `config.x`/`config.y` anchor (default 0,0) and its resolved size. */
function solveFloating(lf: Leaf, library: Library | undefined, out: Solved): void {
	const unit = lf.unit;
	if (isGroup(unit)) {
		const { child, size } = resolveGroup(unit, library);
		const x = numCfg(unit.config, 'x', 0);
		const y = numCfg(unit.config, 'y', 0);
		const box: Rect = { x, y, w: size.w, h: size.h };
		out.set(lf.id, box);
		solveNode(child, box, lf.id + '/', library, out);
		return;
	}
	out.set(lf.id, { ...unit.rect });
}

// ---- containers ----------------------------------------------------------

function solveContainer(
	c: Container,
	box: Rect,
	prefix: string,
	library: Library | undefined,
	out: Solved
): void {
	// Record the container's own (outer) box — like a group leaf does — so the editor can
	// outline + select panes, INCLUDING empty ones: a freshly added pane has no children yet
	// and must still be visible/selectable to drop into (collectContainerRects).
	out.set(prefix + c.id, { ...box });
	const content = insetPad(box, c.pad);
	if (c.children.length === 0) return;
	// Overlap (layer) mode: every child occupies the SAME content box (z-ordered by array order),
	// so widgets can share a grid cell / pane. `align` controls each child within the box
	// (stretch = fill the cell, else intrinsic-sized + positioned). Item: same-cell overlap.
	if (c.overlap) {
		for (const child of c.children) {
			solveNode(
				child,
				alignInCell(child, c.align ?? 'stretch', content, library),
				prefix,
				library,
				out
			);
		}
		return;
	}
	if (c.kind === 'grid') {
		solveGrid(c, content, prefix, library, out);
	} else {
		solveFlex(c, content, prefix, library, out);
	}
}

// row/col single-line flex.
function solveFlex(
	c: Container,
	content: Rect,
	prefix: string,
	library: Library | undefined,
	out: Solved
): void {
	const horizontal = c.kind === 'row';
	const mainSize = horizontal ? content.w : content.h;
	const crossSize = horizontal ? content.h : content.w;
	const gap = c.gap ?? 0;
	const n = c.children.length;
	const totalGap = gap * (n - 1);

	// 1. Measure each child's main extent: fixed/auto resolve now; fr deferred.
	const mains = new Array<number>(n).fill(0);
	const frShares = new Array<number>(n).fill(0);
	let fixedSum = 0;
	let frSum = 0;
	for (let i = 0; i < n; i++) {
		const basis = leafBasis(c.children[i]);
		if (isFr(basis)) {
			frShares[i] = Math.max(0, basis.fr);
			frSum += frShares[i];
		} else {
			const m = resolveMain(c.children[i], basis, horizontal, library);
			mains[i] = m;
			fixedSum += m;
		}
	}

	// 2. Distribute leftover main space to fr children by share.
	const leftover = Math.max(0, mainSize - totalGap - fixedSum);
	if (frSum > 0) {
		for (let i = 0; i < n; i++) {
			if (frShares[i] > 0) mains[i] = (leftover * frShares[i]) / frSum;
		}
	}

	// 3. justify → leading offset + extra inter-child spacing. Only meaningful when
	//    there is free space AND no fr child consumed the leftover.
	const usedMain = sum(mains) + totalGap;
	const free = frSum > 0 ? 0 : Math.max(0, mainSize - usedMain);
	const { lead, between } = justifyOffsets(c.justify ?? 'start', free, n);

	// 4. Walk, placing each child on the main axis; align on the cross axis.
	let cursor = (horizontal ? content.x : content.y) + lead;
	for (let i = 0; i < n; i++) {
		const main = mains[i];
		const cross = resolveCross(c.children[i], c.align ?? 'start', crossSize, horizontal, library);
		const childBox: Rect = horizontal
			? { x: cursor, y: content.y + cross.offset, w: main, h: cross.size }
			: { x: content.x + cross.offset, y: cursor, w: cross.size, h: main };
		solveNode(c.children[i], childBox, prefix, library, out);
		cursor += main + gap + between;
	}
}

// uniform-cell, row-major grid. cols default 1; rows derived from child count. align
// applies inside each cell (stretch = fill the cell). Cells are clamped to >= 0 so an
// oversized gap can never produce a negative box that cascades into nested solves.
function solveGrid(
	c: Container,
	content: Rect,
	prefix: string,
	library: Library | undefined,
	out: Solved
): void {
	const cols = Math.max(1, c.cols ?? 1);
	const n = c.children.length;
	const rows = gridRows(c);
	const gap = c.gap ?? 0;

	const cellW = Math.max(0, (content.w - gap * (cols - 1)) / cols);
	const cellH = Math.max(0, (content.h - gap * (rows - 1)) / rows);

	for (let i = 0; i < n; i++) {
		const r = Math.floor(i / cols);
		const col = i % cols;
		const cell: Rect = {
			x: content.x + col * (cellW + gap),
			y: content.y + r * (cellH + gap),
			w: cellW,
			h: cellH
		};
		const childBox = alignInCell(c.children[i], c.align ?? 'stretch', cell, library);
		solveNode(c.children[i], childBox, prefix, library, out);
	}
}

// ---- sizing helpers ------------------------------------------------------

function leafBasis(node: LayoutNode): Length {
	// Both Leaf and Container carry an optional `basis` (a container can be an `fr`/px
	// pane that itself holds widgets). Unspecified → 'auto' (the node's intrinsic extent).
	const b = (node as { basis?: Length }).basis;
	return b !== undefined ? b : 'auto';
}

function isFr(b: Length): b is { fr: number } {
	return typeof b === 'object' && b !== null && typeof (b as { fr: number }).fr === 'number';
}

function resolveMain(
	node: LayoutNode,
	basis: Length,
	horizontal: boolean,
	library: Library | undefined
): number {
	if (typeof basis === 'number') return Math.max(0, basis);
	if (basis === 'auto') return intrinsicMain(node, horizontal, library);
	return 0; // fr handled by the caller
}

// Intrinsic main extent of a node (used for basis 'auto' and cross-axis clamping).
function intrinsicMain(
	node: LayoutNode,
	horizontal: boolean,
	library: Library | undefined
): number {
	if (isLeaf(node)) {
		const unit = node.unit;
		if (isGroup(unit)) {
			const { size } = resolveGroup(unit, library);
			return horizontal ? size.w : size.h;
		}
		return horizontal ? unit.rect.w : unit.rect.h;
	}
	return intrinsicContainer(node, horizontal, library);
}

// A nested container's intrinsic extent along `horizontal`: explicit bounds if set,
// else derived from children. row/col: sum of child extents (+ gaps) along the child
// main axis, max child extent along the cross axis. grid: cols × max-child-width
// (+ gaps) horizontally, rows × max-child-height (+ gaps) vertically — so a bounds-less
// grid (e.g. the 8-col/32 core-graph case) reports a real size instead of collapsing.
function intrinsicContainer(
	c: Container,
	horizontal: boolean,
	library: Library | undefined
): number {
	if (c.bounds) return horizontal ? c.bounds.w : c.bounds.h;
	const pad = resolvePad(c.pad);
	const padAlong = horizontal ? pad.l + pad.r : pad.t + pad.b;
	const n = c.children.length;
	if (n === 0) return padAlong;

	const gap = c.gap ?? 0;
	const extents = c.children.map((ch) => intrinsicMain(ch, horizontal, library));

	// Overlapping children share one box, so the container is only as big as its largest child.
	if (c.overlap) return padAlong + Math.max(...extents);

	if (c.kind === 'grid') {
		const cols = Math.max(1, c.cols ?? 1);
		const rows = gridRows(c);
		const count = horizontal ? cols : rows;
		return padAlong + Math.max(...extents) * count + gap * (count - 1);
	}

	const along = (c.kind === 'row') === horizontal; // is the queried axis the child main axis?
	if (along) return padAlong + sum(extents) + gap * (n - 1);
	return padAlong + Math.max(...extents);
}

// Cross-axis size + offset for one child given the container's align.
function resolveCross(
	node: LayoutNode,
	align: Align,
	crossSize: number,
	horizontal: boolean,
	library: Library | undefined
): { offset: number; size: number } {
	if (align === 'stretch') return { offset: 0, size: crossSize };
	const intrinsic = intrinsicMain(node, !horizontal, library);
	const size = Math.min(intrinsic, crossSize);
	let offset = 0;
	if (align === 'center') offset = (crossSize - size) / 2;
	else if (align === 'end') offset = crossSize - size;
	return { offset, size };
}

// Align an intrinsic-sized child inside a uniform grid cell (stretch = fill the cell).
function alignInCell(
	node: LayoutNode,
	align: Align,
	cell: Rect,
	library: Library | undefined
): Rect {
	if (align === 'stretch') return { ...cell };
	const w = Math.min(intrinsicMain(node, true, library), cell.w);
	const h = Math.min(intrinsicMain(node, false, library), cell.h);
	let x = cell.x;
	let y = cell.y;
	if (align === 'center') {
		x = cell.x + (cell.w - w) / 2;
		y = cell.y + (cell.h - h) / 2;
	} else if (align === 'end') {
		x = cell.x + (cell.w - w);
		y = cell.y + (cell.h - h);
	}
	return { x, y, w, h };
}

// ---- justify / pad -------------------------------------------------------

function justifyOffsets(
	justify: Justify,
	free: number,
	n: number
): { lead: number; between: number } {
	if (free <= 0) return { lead: 0, between: 0 };
	switch (justify) {
		case 'center':
			return { lead: free / 2, between: 0 };
		case 'end':
			return { lead: free, between: 0 };
		case 'between':
			return n > 1 ? { lead: 0, between: free / (n - 1) } : { lead: 0, between: 0 };
		case 'around': {
			const slot = free / n;
			return { lead: slot / 2, between: slot };
		}
		case 'start':
		default:
			return { lead: 0, between: 0 };
	}
}

function insetPad(box: Rect, pad: Container['pad']): Rect {
	const p = resolvePad(pad);
	return {
		x: box.x + p.l,
		y: box.y + p.t,
		w: Math.max(0, box.w - p.l - p.r),
		h: Math.max(0, box.h - p.t - p.b)
	};
}

// ---- group params / clone (Phase 6c) -------------------------------------

function applyParams(
	child: LayoutNode,
	specs: { key: string; target?: string }[] | undefined,
	params: Record<string, unknown>
): void {
	if (!specs) return;
	for (const spec of specs) {
		if (!(spec.key in params)) continue;
		const target = spec.target ?? 'unit.config.' + spec.key;
		setPath(child as unknown as Record<string, unknown>, target, params[spec.key]);
	}
}

// Fail-closed dotted-path setter: writes the final segment only if every intermediate
// already exists as an object. So a default target 'unit.config.<key>' resolves on a
// Leaf-rooted child (unit + config exist) but is a NO-OP on a container-rooted child
// (no `unit`) — never auto-vivifying a bogus `unit` object onto a container.
function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
	const parts = path.split('.');
	let cur: Record<string, unknown> = root;
	for (let i = 0; i < parts.length - 1; i++) {
		const next = cur[parts[i]];
		if (typeof next !== 'object' || next === null) return;
		cur = next as Record<string, unknown>;
	}
	cur[parts[parts.length - 1]] = value;
}

// ---- misc ----------------------------------------------------------------

function emptyContainer(id: string): Container {
	return { id, kind: 'col', children: [] };
}

function numCfg(config: Record<string, unknown> | undefined, key: string, dflt: number): number {
	const v = config?.[key];
	return typeof v === 'number' ? v : dflt;
}

// Structural deep clone — nodes are plain JSON-shaped data (no functions/cycles), so
// keeping resolveGroup free of aliasing between instances is a JSON round-trip.
function cloneNode<T extends LayoutNode>(node: T): T {
	return JSON.parse(JSON.stringify(node)) as T;
}

function sum(xs: number[]): number {
	let s = 0;
	for (const x of xs) s += x;
	return s;
}
