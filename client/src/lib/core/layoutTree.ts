// Framework-agnostic v2 layout-tree types: the recursive model BOTH designers share
// (Phase 5 layout designer + Phase 6 widget designer). One node grammar, one pure
// solver (see ./solve.ts). ZERO Svelte/Tauri imports — reused verbatim by a future
// React port. Co-located vitest tests in layoutTree.test.ts.
//
// `Rect`, `WidgetInstance`, and the v1 `Layout` live in ./layout.ts (the single source
// of truth); this file re-exports the v1 names v2 consumers need and owns the v2
// grammar + small constructors. When a struct here crosses the Tauri bridge, keep the
// Rust side in sync (see AGENTS.md §5).

import type { Rect, WidgetInstance } from './layout';

export type { Rect, WidgetInstance } from './layout';

// A child's main-axis sizing inside a container.
//   number    → fixed px
//   'auto'    → intrinsic size (a primitive's rect.{w,h} / a group's size.{w,h})
//   { fr: n } → share `n` of the leftover main-axis space after fixed/auto children
export type Length = number | 'auto' | { fr: number };

export type Align = 'start' | 'center' | 'end' | 'stretch'; // cross axis
export type Justify = 'start' | 'center' | 'end' | 'between' | 'around'; // main axis
export type Pad = number | { t: number; r: number; b: number; l: number };

// The layout designer's panes/splits. hsplit = row, vsplit = col, multi-pane = grid.
export type Container = {
	id: string;
	kind: 'row' | 'col' | 'grid';
	basis?: Length; // this container's OWN main-axis sizing inside its parent (default 'auto')
	cols?: number; // grid only: 2 | 3 | 4 (ignored by row/col)
	rows?: number; // grid only: minimum rows (more are added as children overflow)
	gap?: number; // px between children (and between grid cells)
	pad?: Pad; // content-box inset
	align?: Align; // cross axis (row → vertical, col → horizontal)
	justify?: Justify; // main axis (ignored when an `fr` child consumes the leftover)
	bounds?: Rect; // explicit box; default = the contentRect passed to the solver
	overlap?: boolean; // stack children in the SAME box (overlapping/layered) instead of flowing
	children: LayoutNode[];
};

// Built in the widget designer; ONE unit to the layout designer (a solver leaf).
// `def` references a reusable WidgetDef in the library; if absent/unresolved, the
// inline `child` is used. `size` is the group's own (intrinsic) box; `child` is in
// LOCAL coords (origin 0,0) and gets rebased to the group's absolute box when solved.
export type Group = {
	id: string;
	kind: 'group';
	name?: string;
	def?: string; // WidgetDef id; inline `child` used when absent/unresolved
	size: { w: number; h: number };
	child: LayoutNode;
	params?: Record<string, unknown>; // instance-side param overrides (Phase 6c)
	config?: Record<string, unknown>; // floating anchor lives here (config.x / config.y)
	css?: string;
};

// A placed unit: either a primitive widget or a group, with an optional main-axis basis.
export type Leaf = {
	id: string;
	unit: WidgetInstance | Group;
	basis?: Length; // default 'auto'
};

export type LayoutNode = Container | Leaf;

// Per monitor: the in-flow tree + an escape-the-grid floating layer (absolute coords).
export type MonitorLayout = {
	root: Container; // solved against the monitor work area (or root.bounds)
	floating: Leaf[]; // each placed by its own absolute rect (or group anchor)
};

export type LayoutV2 = {
	version: 2;
	monitors: Record<string, MonitorLayout>;
};

// Reusable library entry (Phase 6). Instantiate one def many times, rebinding params.
export type ParamSpec = {
	key: string; // e.g. 'core'
	label?: string;
	default?: unknown;
	target?: string; // dotted path into the cloned child, e.g. 'unit.sensor'
};

export type WidgetDef = {
	id: string;
	name: string;
	size: { w: number; h: number };
	child: LayoutNode;
	params?: ParamSpec[];
	css?: string; // restyles every instance of this def (scoped to [data-def], Phase 7)
};

export type Library = { version: number; defs: WidgetDef[] };

export const LAYOUT_VERSION_V2 = 2;

// ---- type guards (used by the solver + parse/migrate) ----

export function isContainer(node: LayoutNode): node is Container {
	const k = (node as Container).kind;
	return k === 'row' || k === 'col' || k === 'grid';
}

export function isLeaf(node: LayoutNode): node is Leaf {
	return (node as Leaf).unit !== undefined;
}

/** Whether a monitor's layout holds any actual widget (a leaf) — in the floating layer or
 * anywhere in the flow tree. Empty containers (panes/cells with no widget) don't count. Used to
 * skip spawning an overlay on a monitor that would render nothing. */
export function monitorHasWidgets(mon: MonitorLayout): boolean {
	if (mon.floating.length > 0) return true;
	const anyLeaf = (n: LayoutNode): boolean =>
		isLeaf(n) || (isContainer(n) && n.children.some(anyLeaf));
	return anyLeaf(mon.root);
}

export function isGroup(unit: WidgetInstance | Group): unit is Group {
	return (unit as Group).kind === 'group';
}

// ---- small constructors (keep call sites and tests terse, like createWidget) ----

/** An empty in-flow root: a column with no children (the v2 migration target). Stretches
 * its children to full width by default (like flexbox's own `align-items: stretch`), so a
 * pane added to the root fills the available width rather than collapsing to 0. */
export function emptyRoot(): Container {
	return { id: 'root', kind: 'col', children: [], align: 'stretch' };
}

export function emptyMonitorLayout(): MonitorLayout {
	return { root: emptyRoot(), floating: [] };
}

export function container(
	id: string,
	kind: Container['kind'],
	children: LayoutNode[],
	opts: Partial<Omit<Container, 'id' | 'kind' | 'children'>> = {}
): Container {
	return { id, kind, children, ...opts };
}

/** Wrap a primitive instance or a group as a leaf (id taken from the unit). */
export function leaf(unit: WidgetInstance | Group, basis?: Length): Leaf {
	return basis === undefined ? { id: unit.id, unit } : { id: unit.id, unit, basis };
}

export function group(
	id: string,
	size: { w: number; h: number },
	child: LayoutNode,
	opts: Partial<Omit<Group, 'id' | 'kind' | 'size' | 'child'>> = {}
): Group {
	return { id, kind: 'group', size, child, ...opts };
}

/** Normalize `pad` (number | object | undefined) into explicit per-side insets. */
export function resolvePad(pad: Pad | undefined): { t: number; r: number; b: number; l: number } {
	if (pad === undefined) return { t: 0, r: 0, b: 0, l: 0 };
	if (typeof pad === 'number') return { t: pad, r: pad, b: pad, l: pad };
	return pad;
}
