// The Canvas editor model (item 2): a useReducer holding {monitor, library, selection, theme,
// tokens, def-edit, undo/redo, manual-save baseline}. NEVER mutates state in place — the core
// layoutEdit ops already return new trees, so dirty-tracking + undo rely on reference equality
// (a snapshot is just the current references). Undo coalesces at the saveLayout COMMIT chokepoint:
// one undo step per drag, recorded only when monitor/library reference-changed since lastSnap.
//
// The whole Svelte `handleOp` switch + every op helper is ported VERBATIM here as pure
// transforms `(state) => Partial<EditorState>`. A commit (the old `saveLayout()`) runs the
// recordHistory logic inline on the post-edit state and bumps `saveSeq`; the persistence hook
// watches `saveSeq` to write to disk (debounced in the studio, immediate on an overlay).
import { useCallback, useMemo, useReducer } from 'react';
import { DEFAULT_MONITOR, type Rect, type WidgetInstance } from '../../core/layout';
import { createWidget, getMeta } from '../../core/widget';
import {
	container,
	emptyRoot,
	group,
	isContainer,
	isGroup,
	isLeaf,
	leaf,
	type Container,
	type Group,
	type Leaf,
	type LayoutNode,
	type Length,
	type Library,
	type MonitorLayout,
	type WidgetDef
} from '../../core/layoutTree';
import {
	collapseContainer,
	findNode,
	findParent,
	insertChild,
	moveNode,
	removeNode,
	ungroupNode,
	updateContainer,
	updateNode
} from '../../core/layoutEdit';
import { intrinsicSize, type Solved } from '../../core/solve';
import { getTemplate } from '../../core/templates';
import type { LayoutOp } from '../ops';
import { dropPlacement } from './dropPlacement';
import type { EditorState, Snap } from './types';

const rand = (): string => Math.random().toString(36).slice(2, 8);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const cfgNum = (c: Record<string, unknown> | undefined, k: string): number =>
	typeof c?.[k] === 'number' ? (c[k] as number) : 0;

// A patch the reducer applies. `commit` (the `op` action flag) = this was a `saveLayout()`
// chokepoint (record undo + bump saveSeq). Selection-only edits leave it false.
type Patch = Partial<EditorState>;

// --- snapshot / history helpers (operate on a state slice) ----------------------------------

function snap(s: EditorState): Snap {
	return { monitor: s.monitor, library: s.library };
}

// Re-baseline history to the current layout (no undo entries across this point).
function resetHistoryPatch(next: EditorState): Patch {
	return { undoStack: [], redoStack: [], lastSnap: snap(next), historyReady: true };
}

// The commit point. If the layout changed since the last snapshot, push the previous snapshot for
// undo and clear the redo branch, then advance lastSnap. A no-op when nothing changed.
function recordHistory(next: EditorState): Patch {
	if (!next.historyReady) return {};
	if (
		next.lastSnap &&
		next.monitor === next.lastSnap.monitor &&
		next.library === next.lastSnap.library
	)
		return {};
	return {
		undoStack: [...next.undoStack, next.lastSnap ?? snap(next)].slice(-100),
		redoStack: [],
		lastSnap: snap(next)
	};
}

function setBaselinePatch(s: EditorState): Patch {
	return {
		savedBaseline: {
			monitor: s.monitor,
			library: s.library,
			theme: s.selectedTheme,
			tokens: s.tokenOverrides
		},
		// While editing a def, re-anchor the def-edit baseline too, so a mid-def-edit Save clears the
		// dirty indicator (the next scoped edit re-dirties it). On load/normal save editingDefId is
		// null, so this is a no-op there.
		...(s.editingDefId != null ? { defEditBaseline: s.monitor } : {})
	};
}

// --- selection lookup (shared with the Canvas's derived state) ------------------------------

export function lookup(id: string, m: MonitorLayout): LayoutNode | null {
	return findNode(m.root, id) ?? m.floating.find((l) => l.id === id) ?? null;
}

// =============================================================================================
// The op helpers — ported VERBATIM from Canvas.svelte. Each takes the current state and returns
// a patch (the new monitor/library/selection). `solved` is needed by a few (float/move-to-monitor).
// =============================================================================================

function wrapLeafWith(
	root: Container,
	targetId: string,
	removeId: string,
	node: LayoutNode
): Container {
	const pruned = findNode(root, removeId) ? removeNode(root, removeId) : root;
	return updateNode(pruned, targetId, (n) =>
		container(`cell-${rand()}`, 'col', [n, node], { align: 'stretch', overlap: true })
	);
}

function floatingLeafFrom(node: Leaf, x: number, y: number, r?: Rect): Leaf {
	if (!isGroup(node.unit)) {
		const u = node.unit;
		return leaf({ ...u, rect: { x, y, w: r?.w ?? u.rect.w, h: r?.h ?? u.rect.h } });
	}
	const g = node.unit;
	return leaf({ ...g, config: { ...(g.config ?? {}), x, y } });
}

function dropWidgetInto(s: EditorState, containerId: string, widgetType: string): Patch {
	const id = `${widgetType}-${rand()}`;
	return {
		monitor: {
			...s.monitor,
			root: insertChild(s.monitor.root, containerId, leaf(createWidget(widgetType, id)))
		},
		selectedId: id
	};
}

function reparentNode(s: EditorState, id: string, containerId: string): Patch {
	if (id === containerId) return {};
	const node = findNode(s.monitor.root, id);
	if (node && isContainer(node) && findNode(node, containerId)) return {};
	const fl = s.monitor.floating.find((l) => l.id === id);
	if (fl) {
		return {
			monitor: {
				...s.monitor,
				floating: s.monitor.floating.filter((l) => l.id !== id),
				root: insertChild(s.monitor.root, containerId, fl)
			},
			selectedId: id
		};
	}
	return {
		monitor: { ...s.monitor, root: moveNode(s.monitor.root, id, containerId) },
		selectedId: id
	};
}

function addWidget(s: EditorState, type: string): Patch {
	const selectedContainer = currentContainer(s);
	const id = `${type}-${rand()}`;
	const w = leaf(createWidget(type, id));
	const monitor = selectedContainer
		? { ...s.monitor, root: insertChild(s.monitor.root, selectedContainer.id, w) }
		: { ...s.monitor, floating: [...s.monitor.floating, w] };
	return { monitor, selectedId: id };
}

// Drop a palette widget onto the stage: a new FLOATING widget centered on the drop point (item 7).
function addWidgetAt(s: EditorState, type: string, x: number, y: number): Patch {
	const id = `${type}-${rand()}`;
	const inst = createWidget(type, id);
	const at = dropPlacement(inst.rect, x, y);
	const w = leaf({ ...inst, rect: { ...inst.rect, x: at.x, y: at.y } });
	return {
		monitor: { ...s.monitor, floating: [...s.monitor.floating, w] },
		selectedId: id
	};
}

function addContainer(s: EditorState, kind: Container['kind']): Patch {
	const selectedContainer = currentContainer(s);
	const id = `${kind}-${rand()}`;
	let c: Container;
	if (kind === 'grid') {
		const cols = 2;
		const rows = 2;
		const cells = Array.from({ length: cols * rows }, () =>
			container(`cell-${rand()}`, 'col', [], { align: 'stretch' })
		);
		c = container(id, 'grid', cells, { cols, rows, basis: { fr: 1 }, align: 'stretch' });
	} else {
		c = container(id, kind, [], { basis: { fr: 1 }, align: 'stretch' });
	}
	const parentId = selectedContainer?.id ?? s.monitor.root.id;
	let root = insertChild(s.monitor.root, parentId, c);
	root = updateContainer(root, parentId, { align: 'stretch' });
	return { monitor: { ...s.monitor, root }, selectedId: id };
}

function splitNode(s: EditorState, id: string, dir: 'rows' | 'cols' | 'grid'): Patch {
	const node = findNode(s.monitor.root, id);
	if (!node || !isContainer(node)) return {};
	// Split cells carry basis fr:1 so they SHARE the box evenly — an empty cell with basis 'auto'
	// has ~0 intrinsic extent and (no fr) gets no leftover, collapsing to 0 height/width.
	const cell = () => container(`cell-${rand()}`, 'col', [], { align: 'stretch', basis: { fr: 1 } });
	const keep = node.children.length
		? container(`cell-${rand()}`, node.kind, node.children, {
				align: node.align ?? 'stretch',
				basis: { fr: 1 },
				cols: node.cols,
				rows: node.rows,
				gap: node.gap,
				pad: node.pad,
				justify: node.justify
		  })
		: null;
	let patch: Partial<Container>;
	if (dir === 'grid') {
		const cells = Array.from({ length: 4 }, () => cell());
		if (keep) cells[0] = keep;
		patch = { kind: 'grid', cols: 2, rows: 2, children: cells };
	} else {
		const k: Container['kind'] = dir === 'rows' ? 'col' : 'row';
		patch = {
			kind: k,
			cols: undefined,
			rows: undefined,
			children: keep ? [keep, cell()] : [cell(), cell()]
		};
	}
	const patched: Container = {
		...node,
		...patch,
		align: 'stretch',
		basis: node.basis ?? { fr: 1 }
	};
	const monitor = { ...s.monitor, root: updateNode(s.monitor.root, id, () => patched) };
	const kids = patched.children;
	return { monitor, selectedId: (keep ? kids[kids.length - 1] : kids[0]).id };
}

function removeById(s: EditorState, id: string): Patch {
	const monitor = s.monitor.floating.some((l) => l.id === id)
		? { ...s.monitor, floating: s.monitor.floating.filter((l) => l.id !== id) }
		: { ...s.monitor, root: removeNode(s.monitor.root, id) };
	const patch: Patch = { monitor };
	// Match Svelte's net selection result: removing the PRIMARY collapsed the whole marquee (the
	// `$: syncSelectionPrimary(selectedId)` reactive set selectedIds=[] when selectedId went null);
	// removing a non-primary member just filters it out.
	if (s.selectedId === id) {
		patch.selectedId = null;
		patch.selectedIds = [];
	} else if (s.selectedIds.includes(id)) {
		patch.selectedIds = s.selectedIds.filter((x) => x !== id);
	}
	return patch;
}

function reorder(s: EditorState, id: string, delta: number): Patch {
	const parent = findParent(s.monitor.root, id);
	if (!parent) return {};
	const idx = parent.children.findIndex((c) => c.id === id);
	const ni = idx + delta;
	if (ni < 0 || ni >= parent.children.length) return {};
	return { monitor: { ...s.monitor, root: moveNode(s.monitor.root, id, parent.id, ni) } };
}

function outdent(s: EditorState, id: string): Patch {
	const parent = findParent(s.monitor.root, id);
	if (!parent || parent.id === s.monitor.root.id) return {};
	const grand = findParent(s.monitor.root, parent.id);
	if (!grand) return {};
	const pidx = grand.children.findIndex((c) => c.id === parent.id);
	return { monitor: { ...s.monitor, root: moveNode(s.monitor.root, id, grand.id, pidx + 1) } };
}

function indent(s: EditorState, id: string): Patch {
	const parent = findParent(s.monitor.root, id);
	if (!parent) return {};
	const idx = parent.children.findIndex((c) => c.id === id);
	const prev = parent.children[idx - 1];
	if (!prev || !isContainer(prev)) return {};
	return { monitor: { ...s.monitor, root: moveNode(s.monitor.root, id, prev.id) } };
}

function dock(s: EditorState, id: string): Patch {
	const lf = s.monitor.floating.find((l) => l.id === id);
	if (!lf) return {};
	return {
		monitor: {
			...s.monitor,
			floating: s.monitor.floating.filter((l) => l.id !== id),
			root: insertChild(s.monitor.root, s.monitor.root.id, lf)
		},
		selectedId: id
	};
}

function makeWidget(s: EditorState, id: string): Patch {
	const node = lookup(id, s.monitor);
	if (!node) return {};
	const sz = intrinsicSize(node, s.library);
	const size = {
		w: Math.max(40, Math.round(sz.w) || 120),
		h: Math.max(24, Math.round(sz.h) || 80)
	};
	const defId = `def-${rand()}`;
	const name = isContainer(node) ? `widget-${node.kind}` : (node.unit as WidgetInstance).type;
	const def: WidgetDef = { id: defId, name, size, child: clone(node) };
	const library: Library = {
		version: s.library?.version ?? 1,
		defs: [...(s.library?.defs ?? []), def]
	};

	const grpId = `grp-${rand()}`;
	const floatingLeaf = s.monitor.floating.find((l) => l.id === id);
	if (floatingLeaf && isLeaf(floatingLeaf) && !isGroup(floatingLeaf.unit)) {
		const r = (floatingLeaf.unit as WidgetInstance).rect;
		const g = group(grpId, size, clone(node), { def: defId, name, config: { x: r.x, y: r.y } });
		return {
			library,
			monitor: {
				...s.monitor,
				floating: s.monitor.floating.map((l) => (l.id === id ? leaf(g) : l))
			},
			selectedId: grpId
		};
	}
	const g = group(grpId, size, clone(node), { def: defId, name });
	return {
		library,
		monitor: { ...s.monitor, root: updateNode(s.monitor.root, id, () => leaf(g)) },
		selectedId: grpId
	};
}

function ungroupSelected(s: EditorState, id: string): Patch {
	const fl = s.monitor.floating.find((l) => l.id === id);
	if (fl) {
		if (!isGroup(fl.unit)) return {};
		const g = fl.unit;
		const def = g.def && s.library ? s.library.defs.find((d) => d.id === g.def) : undefined;
		const base = def ? def.child : g.child;
		if (base && isLeaf(base) && !isGroup(base.unit)) {
			const u = clone(base.unit) as WidgetInstance;
			u.rect = { ...u.rect, x: cfgNum(g.config, 'x'), y: cfgNum(g.config, 'y') };
			return {
				monitor: {
					...s.monitor,
					floating: s.monitor.floating.map((l) => (l.id === id ? leaf(u) : l))
				},
				selectedId: u.id
			};
		}
		console.warn('ungroup: dock this composite group into the flow first');
		return {};
	}
	return {
		monitor: { ...s.monitor, root: ungroupNode(s.monitor.root, id, s.library) },
		selectedId: null
	};
}

function insertWidget(s: EditorState, defId: string): Patch {
	const def = s.library?.defs.find((d) => d.id === defId);
	if (!def) return {};
	const selectedContainer = currentContainer(s);
	const grpId = `grp-${rand()}`;
	if (selectedContainer) {
		const g = group(grpId, def.size, clone(def.child), { def: defId, name: def.name });
		return {
			monitor: { ...s.monitor, root: insertChild(s.monitor.root, selectedContainer.id, leaf(g)) },
			selectedId: grpId
		};
	}
	const g = group(grpId, def.size, clone(def.child), {
		def: defId,
		name: def.name,
		config: { x: 24, y: 24 }
	});
	return {
		monitor: { ...s.monitor, floating: [...s.monitor.floating, leaf(g)] },
		selectedId: grpId
	};
}

function defInUse(s: EditorState, defId: string): boolean {
	let used = false;
	const visit = (n: LayoutNode): void => {
		if (isLeaf(n)) {
			if (isGroup(n.unit) && n.unit.def === defId) used = true;
		} else {
			n.children.forEach(visit);
		}
	};
	const scan = (mon: MonitorLayout): void => {
		visit(mon.root);
		mon.floating.forEach(visit);
	};
	// Check the REAL monitor (stashed in savedMonitor while designing another def) plus, if designing,
	// the scoped editing tree (a composite def could embed this one) — never just the scoped tree.
	scan(s.editingDefId != null && s.savedMonitor ? s.savedMonitor : s.monitor);
	if (s.editingDefId != null) scan(s.monitor);
	return used;
}

function renameDef(s: EditorState, defId: string, name: string): Patch {
	if (!s.library) return {};
	return {
		library: {
			...s.library,
			defs: s.library.defs.map((d) => (d.id === defId ? { ...d, name } : d))
		}
	};
}

function deleteDef(s: EditorState, defId: string): Patch {
	if (!s.library) return {};
	if (s.editingDefId === defId) {
		console.warn(`def ${defId} is being edited; not deleted`);
		return {};
	}
	if (defInUse(s, defId)) {
		console.warn(`def ${defId} is in use; not deleted`);
		return {};
	}
	return { library: { ...s.library, defs: s.library.defs.filter((d) => d.id !== defId) } };
}

function addDefParam(s: EditorState, defId: string, key: string, target?: string): Patch {
	if (!s.library || !key) return {};
	return {
		library: {
			...s.library,
			defs: s.library.defs.map((d) =>
				d.id === defId
					? { ...d, params: [...(d.params ?? []), { key, target: target || undefined }] }
					: d
			)
		}
	};
}

function patchGroup(s: EditorState, id: string, patch: Partial<Group>): Patch {
	const merge = (g: Group): Group => ({ ...g, ...patch });
	if (s.monitor.floating.some((l) => l.id === id)) {
		return {
			monitor: {
				...s.monitor,
				floating: s.monitor.floating.map((l) =>
					l.id === id && isGroup(l.unit) ? { ...l, unit: merge(l.unit) } : l
				)
			}
		};
	}
	return {
		monitor: {
			...s.monitor,
			root: updateNode(s.monitor.root, id, (n) =>
				isLeaf(n) && isGroup(n.unit) ? { ...n, unit: merge(n.unit) } : n
			)
		}
	};
}

function setDefSize(s: EditorState, defId: string, w: number, h: number): Patch {
	if (!s.library) return {};
	const size = { w: Math.max(8, w), h: Math.max(8, h) };
	return {
		library: {
			...s.library,
			defs: s.library.defs.map((d) => (d.id === defId ? { ...d, size } : d))
		}
	};
}

function setDefCss(s: EditorState, defId: string, css: string): Patch {
	if (!s.library) return {};
	return {
		library: {
			...s.library,
			defs: s.library.defs.map((d) => (d.id === defId ? { ...d, css: css || undefined } : d))
		}
	};
}

function setToken(s: EditorState, key: string, value: string): Patch {
	const next = { ...s.tokenOverrides };
	if (value) next[key] = value;
	else delete next[key];
	return { tokenOverrides: next };
}

function patchFloating(s: EditorState, id: string, patch: Partial<WidgetInstance>): Patch {
	return {
		monitor: {
			...s.monitor,
			floating: s.monitor.floating.map((l) =>
				l.id === id && !isGroup(l.unit)
					? { ...l, unit: { ...(l.unit as WidgetInstance), ...patch } }
					: l
			)
		}
	};
}

function patchUnit(s: EditorState, id: string, patch: Partial<WidgetInstance>): Patch {
	if (s.monitor.floating.some((l) => l.id === id)) return patchFloating(s, id, patch);
	return {
		monitor: {
			...s.monitor,
			root: updateNode(s.monitor.root, id, (n) =>
				isLeaf(n) && !isGroup(n.unit)
					? { ...n, unit: { ...(n.unit as WidgetInstance), ...patch } }
					: n
			)
		}
	};
}

function resetWidget(s: EditorState, id: string): Patch {
	const node = lookup(id, s.monitor);
	if (!node || !isLeaf(node) || isGroup(node.unit)) return {};
	const meta = getMeta((node.unit as WidgetInstance).type);
	return patchUnit(s, id, {
		config: { ...(meta?.defaultConfig ?? {}) },
		css: meta?.defaultCss,
		sensor: meta?.defaultSensor
	});
}

function patchContainerOp(s: EditorState, id: string, patch: Partial<Container>): Patch {
	return { monitor: { ...s.monitor, root: updateContainer(s.monitor.root, id, patch) } };
}

// Set (or clear, when undefined) a flow node's main-axis basis: 'auto'/px = fixed, {fr} = grow.
// Works on any node in the flow tree (a widget leaf or a container); floating leaves ignore basis.
function setNodeBasis(s: EditorState, id: string, basis: Length | undefined): Patch {
	const root = updateNode(s.monitor.root, id, (n) => {
		const next = { ...n } as LayoutNode & { basis?: Length };
		if (basis === undefined) delete next.basis;
		else next.basis = basis;
		return next;
	});
	return { monitor: { ...s.monitor, root } };
}

// The selected container (incl. root) in the live tree — used by addWidget/addContainer/insert.
function currentContainer(s: EditorState): Container | null {
	if (!s.selectedId) return null;
	const node = lookup(s.selectedId, s.monitor);
	return node && isContainer(node) ? node : null;
}

// =============================================================================================
// The reducer. Mutating ops dispatch `{ type: 'op', run, commit }` where `run(state)` returns a
// patch; commit runs recordHistory + bumps saveSeq (the persistence chokepoint). Dedicated
// actions cover selection, undo/redo, def-edit, history reset, baseline, and load.
// =============================================================================================

type Action =
	| { type: 'op'; run: (s: EditorState) => Patch; commit: boolean }
	| { type: 'undo' }
	| { type: 'redo' }
	| { type: 'select'; id: string }
	| { type: 'selectClick'; id: string } // a plain click: collapses any marquee selection
	| { type: 'setSelectedIds'; ids: string[]; primary: string | null }
	| { type: 'enterDefEdit'; defId: string }
	| { type: 'newWidget' } // item 4: create an empty def + floating instance, then enter def-edit
	| { type: 'cloneDef'; defId: string } // duplicate a widget def + enter def-edit on the copy
	| { type: 'newFromTemplate'; templateId: string } // a new widget def seeded from a template
	| { type: 'endDefEdit' }
	| { type: 'resetHistory' }
	| { type: 'setBaseline' }
	| { type: 'load'; patch: Patch } // bulk set after reloadLayout (then resetHistory + setBaseline)
	| { type: 'setTheme'; name: string } // mirror selectedTheme (applyTheme is a side-effect)
	| { type: 'setMonitorKey' } // switch-monitor reset (clear selection/menu handled outside)
	| { type: 'replaceMonitor'; monitor: MonitorLayout } // raw set (switchMonitor placeholder)
	| { type: 'revertToBaseline' } // Cancel / discard-on-switch: restore the saved baseline
	| { type: 'patch'; patch: Patch }; // a plain non-committing patch (selectedIds, etc.)

function commitPatch(next: EditorState): Patch {
	// next is the post-edit state; record undo then advance saveSeq so the persistence effect fires.
	const hist = recordHistory(next);
	return { ...hist, saveSeq: next.saveSeq + 1 };
}

// Port of Svelte's `$: syncSelectionPrimary(selectedId)` reactive: when an op changes selectedId
// without itself setting the multi-select set, collapse selectedIds to just the new primary (so a
// single-target op clears any marquee selection). If the patch SET selectedIds (marquee / template /
// group move / multi-delete), the set is authoritative and we only advance lastPrimary.
function syncPrimary(next: EditorState, patchSetSelectedIds: boolean): EditorState {
	if (next.selectedId === next.lastPrimary) return next;
	const lastPrimary = next.selectedId;
	if (patchSetSelectedIds) return { ...next, lastPrimary };
	return { ...next, lastPrimary, selectedIds: next.selectedId ? [next.selectedId] : [] };
}

// Add a freshly-built def to the library, then enter the def editor scoped to it. Shared by
// newWidget / cloneDef / newFromTemplate. Does NOT drop an instance onto the live monitor —
// designing a widget shouldn't place it on the layout; the whole library is persisted regardless
// (usePersistence writes every def), and the user instantiates it via the Inspector library
// palette. Assumes the caller already refused re-entry while another def is open (would orphan
// savedMonitor).
function enterNewDef(state: EditorState, def: WidgetDef): EditorState {
	const library: Library = {
		version: state.library?.version ?? 1,
		defs: [...(state.library?.defs ?? []), def]
	};
	const scopedRoot: Container = isContainer(def.child)
		? (clone(def.child) as Container)
		: container(`${def.id}__root`, 'col', [clone(def.child)], { align: 'stretch' });
	const scopedMonitor: MonitorLayout = { root: scopedRoot, floating: [] };
	const next: EditorState = {
		...state,
		library,
		savedMonitor: state.monitor, // preserve the REAL monitor untouched (no instance dropped)
		monitor: scopedMonitor,
		defEditBaseline: scopedMonitor,
		editingDefId: def.id,
		selectedId: null
	};
	return syncPrimary({ ...next, ...resetHistoryPatch(next) }, false);
}

function editorReducer(state: EditorState, action: Action): EditorState {
	switch (action.type) {
		case 'op': {
			const patch = action.run(state);
			const setSelectedIds = 'selectedIds' in patch;
			let next = { ...state, ...patch };
			next = syncPrimary(next, setSelectedIds); // collapse the marquee unless the op set the set
			if (action.commit) next = { ...next, ...commitPatch(next) };
			return next;
		}
		case 'patch': {
			const setSelectedIds = 'selectedIds' in action.patch;
			return syncPrimary({ ...state, ...action.patch }, setSelectedIds);
		}
		case 'select':
			// A bare select (Outline/Inspector/menu) sets selectedId only → collapse the marquee.
			return syncPrimary({ ...state, selectedId: action.id }, false);
		case 'selectClick':
			// A plain canvas click: set both + mark synced so syncPrimary is a no-op.
			return { ...state, selectedId: action.id, selectedIds: [action.id], lastPrimary: action.id };
		case 'setSelectedIds':
			// Authoritative multi-select (marquee): set the set + primary, mark synced.
			return {
				...state,
				selectedIds: action.ids,
				selectedId: action.primary,
				lastPrimary: action.primary
			};
		case 'undo': {
			if (!state.undoStack.length) return state;
			const redoStack = [...state.redoStack, snap(state)];
			const prev = state.undoStack[state.undoStack.length - 1];
			const undoStack = state.undoStack.slice(0, -1);
			// monitor/library revert; lastSnap=prev so the commit records nothing; then commit (save).
			let next: EditorState = {
				...state,
				monitor: prev.monitor,
				library: prev.library,
				undoStack,
				redoStack,
				lastSnap: prev
			};
			next = { ...next, ...commitPatch(next) };
			return next;
		}
		case 'redo': {
			if (!state.redoStack.length) return state;
			const undoStack = [...state.undoStack, snap(state)];
			const next0 = state.redoStack[state.redoStack.length - 1];
			const redoStack = state.redoStack.slice(0, -1);
			let next: EditorState = {
				...state,
				monitor: next0.monitor,
				library: next0.library,
				undoStack,
				redoStack,
				lastSnap: next0
			};
			next = { ...next, ...commitPatch(next) };
			return next;
		}
		case 'newWidget': {
			// Refuse to start a new def while already editing one (would orphan savedMonitor). The UI
			// folds the open def (endDefEdit) before starting a new one.
			if (state.editingDefId != null) return state;
			const defId = `def-${rand()}`;
			const def: WidgetDef = {
				id: defId,
				name: `widget-${rand()}`,
				size: { w: 200, h: 120 },
				child: container(`${defId}__root`, 'col', [], { align: 'stretch' })
			};
			return enterNewDef(state, def);
		}
		case 'cloneDef': {
			if (state.editingDefId != null) return state;
			const src = state.library?.defs.find((d) => d.id === action.defId);
			if (!src) return state;
			const defId = `def-${rand()}`;
			const def: WidgetDef = {
				id: defId,
				name: `${src.name}-copy`,
				size: { ...src.size },
				child: clone(src.child),
				...(src.css ? { css: src.css } : {}),
				...(src.params ? { params: src.params.map((p) => ({ ...p })) } : {})
			};
			return enterNewDef(state, def);
		}
		case 'newFromTemplate': {
			if (state.editingDefId != null) return state;
			const t = getTemplate(action.templateId);
			if (!t) return state;
			const ws = t.widgets();
			const kids = ws.map((u) => leaf({ ...u, id: `${u.type}-${rand()}` }));
			// Size the new def to the template's content bounding box (its widgets are flowed in a col,
			// so this is approximate — but it stops a tall template from being crushed into 120px).
			const w = Math.max(40, ...ws.map((u) => Math.round(u.rect.x + u.rect.w)));
			const h = Math.max(24, ...ws.map((u) => Math.round(u.rect.y + u.rect.h)));
			const defId = `def-${rand()}`;
			const def: WidgetDef = {
				id: defId,
				name: t.name,
				size: { w, h },
				child: container(`${defId}__root`, 'col', kids, { align: 'stretch' })
			};
			return enterNewDef(state, def);
		}
		case 'enterDefEdit': {
			// Never re-enter while already designing — a nested enter would overwrite savedMonitor with
			// the scoped tree and lose the real monitor layout (the UI folds the open def first).
			if (state.editingDefId != null) return state;
			const def = state.library?.defs.find((d) => d.id === action.defId);
			if (!def) return state;
			const scopedRoot: Container = isContainer(def.child)
				? (clone(def.child) as Container)
				: container(`${action.defId}__root`, 'col', [clone(def.child)], { align: 'stretch' });
			const scopedMonitor: MonitorLayout = { root: scopedRoot, floating: [] };
			const next: EditorState = {
				...state,
				savedMonitor: state.monitor,
				monitor: scopedMonitor,
				defEditBaseline: scopedMonitor,
				editingDefId: action.defId,
				selectedId: null
			};
			return syncPrimary({ ...next, ...resetHistoryPatch(next) }, false);
		}
		case 'endDefEdit': {
			if (!state.editingDefId || !state.savedMonitor) return state;
			// syncEditingDef: write the scoped editing tree back onto its def.
			const child = state.monitor.root;
			const editingDefId = state.editingDefId;
			const library: Library | undefined = state.library
				? {
						...state.library,
						defs: state.library.defs.map((d) => (d.id === editingDefId ? { ...d, child } : d))
				  }
				: state.library;
			let next: EditorState = {
				...state,
				library,
				monitor: state.savedMonitor,
				savedMonitor: null,
				defEditBaseline: null,
				editingDefId: null,
				selectedId: null
			};
			next = syncPrimary({ ...next, ...resetHistoryPatch(next) }, false);
			next = { ...next, ...commitPatch(next) }; // saveLayout()
			return next;
		}
		case 'resetHistory':
			return { ...state, ...resetHistoryPatch(state) };
		case 'setBaseline':
			return { ...state, ...setBaselinePatch(state) };
		case 'load':
			return { ...state, ...action.patch };
		case 'setTheme':
			return { ...state, selectedTheme: action.name };
		case 'replaceMonitor':
			return { ...state, monitor: action.monitor };
		case 'revertToBaseline': {
			if (!state.savedBaseline) return state;
			const b = state.savedBaseline;
			return {
				...state,
				monitor: b.monitor,
				library: b.library,
				selectedTheme: b.theme,
				tokenOverrides: b.tokens,
				pendingExtras: []
			};
		}
		case 'setMonitorKey':
			return state;
		default:
			return state;
	}
}

export type EditorModel = {
	state: EditorState;
	dispatch: React.Dispatch<Action>;
	// The Inspector/Outline/context-menu funnel: ports the Svelte handleOp switch verbatim.
	handleOp: (op: LayoutOp) => void;
	// Convenience wrappers the Canvas calls directly (drag/drop/marquee/keyboard paths).
	commitOp: (run: (s: EditorState) => Patch) => void; // mutate + saveLayout
	mutateNoSave: (run: (s: EditorState) => Patch) => void; // mutate, no save (transient onChange)
};

// Stable, module-level pure helpers the Canvas's drag/drop/menu closures call directly (they take
// the current state via the commitOp/mutateNoSave run argument, so no React identity churn).
export const editHelpers = {
	rand,
	clone,
	cfgNum,
	wrapLeafWith,
	floatingLeafFrom,
	removeById,
	makeWidget,
	getTemplate
};

const initial = (studio: boolean, seedMonitor: MonitorLayout): EditorState => ({
	monitor: seedMonitor,
	library: undefined,
	selectedId: null,
	selectedIds: [],
	lastPrimary: null,
	selectedTheme: '',
	tokenOverrides: {},
	editingDefId: null,
	savedMonitor: null,
	defEditBaseline: null,
	undoStack: [],
	redoStack: [],
	lastSnap: null,
	historyReady: false,
	savedBaseline: null,
	pendingExtras: [],
	saveSeq: 0,
	studio
});

export function useEditorModel(studio: boolean, seedFloating: Leaf[]): EditorModel {
	const seedMonitor = useMemo<MonitorLayout>(
		() => ({ root: emptyRoot(), floating: seedFloating }),
		// seedFloating is computed once by the caller (demo seed); freeze it.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	);
	const [state, dispatch] = useReducer(editorReducer, undefined, () =>
		initial(studio, seedMonitor)
	);

	const commitOp = useCallback(
		(run: (s: EditorState) => Patch) => dispatch({ type: 'op', run, commit: true }),
		[]
	);
	const mutateNoSave = useCallback(
		(run: (s: EditorState) => Patch) => dispatch({ type: 'op', run, commit: false }),
		[]
	);

	// The handleOp switch — ported VERBATIM. `break` cases mutate + saveLayout (commit:true);
	// `return` cases (select / editDef / endDefEdit) dispatch dedicated, non-saving actions.
	const handleOp = useCallback(
		(op: LayoutOp): void => {
			switch (op.op) {
				case 'select':
					dispatch({ type: 'select', id: op.id });
					return; // no save (selection isn't persisted)
				case 'addWidget':
					commitOp((s) => addWidget(s, op.widgetType));
					return;
				case 'addWidgetAt':
					commitOp((s) => addWidgetAt(s, op.widgetType, op.x, op.y));
					return;
				case 'addContainer':
					commitOp((s) => addContainer(s, op.kind));
					return;
				case 'split':
					commitOp((s) => splitNode(s, op.id, op.dir));
					return;
				case 'collapse':
					commitOp((s) => ({
						monitor: { ...s.monitor, root: collapseContainer(s.monitor.root, op.id) },
						selectedId: op.id
					}));
					return;
				case 'remove':
					commitOp((s) => removeById(s, op.id));
					return;
				case 'moveUp':
					commitOp((s) => reorder(s, op.id, -1));
					return;
				case 'moveDown':
					commitOp((s) => reorder(s, op.id, 1));
					return;
				case 'outdent':
					commitOp((s) => outdent(s, op.id));
					return;
				case 'indent':
					commitOp((s) => indent(s, op.id));
					return;
				case 'dock':
					commitOp((s) => dock(s, op.id));
					return;
				case 'float':
					commitOp((s) => floatNode(s, op.id));
					return;
				case 'makeWidget':
					commitOp((s) => makeWidget(s, op.id));
					return;
				case 'ungroup':
					commitOp((s) => ungroupSelected(s, op.id));
					return;
				case 'insertWidget':
					commitOp((s) => insertWidget(s, op.defId));
					return;
				case 'renameDef':
					commitOp((s) => renameDef(s, op.defId, op.name));
					return;
				case 'deleteDef':
					commitOp((s) => deleteDef(s, op.defId));
					return;
				case 'addDefParam':
					commitOp((s) => addDefParam(s, op.defId, op.key, op.target));
					return;
				case 'editDef':
					dispatch({ type: 'enterDefEdit', defId: op.defId });
					return; // no save (just a mode switch)
				case 'endDefEdit':
					dispatch({ type: 'endDefEdit' });
					return;
				case 'setDefSize':
					commitOp((s) => setDefSize(s, op.defId, op.w, op.h));
					return;
				case 'patchGroup':
					commitOp((s) => patchGroup(s, op.id, op.patch));
					return;
				case 'setDefCss':
					commitOp((s) => setDefCss(s, op.defId, op.css));
					return;
				case 'setToken':
					commitOp((s) => setToken(s, op.key, op.value));
					return;
				case 'patchWidget':
					commitOp((s) => patchUnit(s, op.id, op.patch));
					return;
				case 'setBasis':
					commitOp((s) => setNodeBasis(s, op.id, op.basis));
					return;
				case 'resetWidget':
					commitOp((s) => resetWidget(s, op.id));
					return;
				case 'patchContainer':
					commitOp((s) => patchContainerOp(s, op.id, op.patch));
					return;
				case 'dropWidget':
					commitOp((s) => dropWidgetInto(s, op.containerId, op.widgetType));
					return;
				case 'reparent':
					commitOp((s) => reparentNode(s, op.id, op.containerId));
					return;
			}
		},
		[commitOp]
	);

	return useMemo<EditorModel>(
		() => ({ state, dispatch, handleOp, commitOp, mutateNoSave }),
		[state, handleOp, commitOp, mutateNoSave]
	);
}

// floatNode needs `solved` at call time; the Canvas drag paths pass the solved map in, but the
// handleOp `float` case (from Inspector/Outline/menu) has no point arg. Mirror the Svelte version:
// it reads the live `solved` (a Canvas reactive). Here we recompute from monitor+workArea would be
// wrong (no workArea here), so the Canvas injects `solved` via a module-level ref before dispatch.
let solvedRef: Solved = new Map();
export function setSolvedForFloat(s: Solved): void {
	solvedRef = s;
}
function floatNode(s: EditorState, id: string, at?: { x: number; y: number }): Patch {
	const node = findNode(s.monitor.root, id);
	if (!node || !isLeaf(node)) return {};
	const r = solvedRef.get(id);
	const lf = floatingLeafFrom(node, at?.x ?? r?.x ?? 0, at?.y ?? r?.y ?? 0, r);
	return {
		monitor: {
			...s.monitor,
			root: removeNode(s.monitor.root, id),
			floating: [...s.monitor.floating, lf]
		},
		selectedId: id
	};
}

export { addWidget, splitNode, floatNode, DEFAULT_MONITOR };
