<script lang="ts">
	// Canvas (organism): owns the telemetry hub, wires the backend source, and lays out
	// this monitor's widgets. Holds the versioned v2 `MonitorLayout` (an in-flow `root`
	// tree + a `floating` layer); persists/loads `widgets.json` as v2 via parseLayoutAny
	// (v1 files migrate to all-floating, so existing layouts render identically). The
	// solver (solveMonitor) positions the flow tree; floating widgets are free-moved. Edit
	// mode shows the Outline (structure) + Inspector (props) which funnel every change
	// through `handleOp` → core/layoutEdit. (Panels relocate to the studio window in 5s.)
	import { onDestroy, onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
	import { createTelemetryHub } from '../core/telemetry';
	import { startAllSources, sourceCatalogIds } from '../core/plugin';
	import '../telemetry/source'; // side-effect: registers the built-in `system` source
	import './plugins/home-assistant'; // side-effect: registers the Home Assistant plugin
	import { DEFAULT_MONITOR, type Rect, type WidgetInstance } from '../core/layout';
	import { createWidget, getMeta } from '../core/widget';
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
		type LayoutV2,
		type Library,
		type MonitorLayout,
		type WidgetDef
	} from '../core/layoutTree';
	import { parseLayoutAny } from '../core/migration';
	import { collectRenderables, intrinsicSize, solveMonitor } from '../core/solve';
	import { assembleStyles } from '../core/style';
	import { tokensToCss } from '../core/tokens';
	import {
		dropTarget,
		findNode,
		findParent,
		flowLeaves,
		insertChild,
		moveNode,
		removeNode,
		ungroupNode,
		updateContainer,
		updateNode,
		type Drop
	} from '../core/layoutEdit';
	import WidgetHost from './WidgetHost.svelte';
	import Inspector from './Inspector.svelte';
	import Outline from './Outline.svelte';
	import StyleLayer from './StyleLayer.svelte';
	import { paletteItems } from './registry';
	import type { LayoutOp } from './ops';
	import { snapRectToPeers } from '../core/align';
	import { sensorCatalog } from '../core/sensors';
	import {
		fillCurrentMonitor,
		listThemes,
		loadThemeCss,
		monitorParam,
		monitorWorkArea,
		openStudio,
		setClickThrough,
		spawnSecondaryOverlays,
		studioMonitorOptions,
		syncInteractiveRects
	} from '../overlay';

	// The widget palette (built-ins + any registered plugin widgets), with labels (8a).
	const widgetTypes = paletteItems();

	// Studio mode (5s): a normal window that edits the primary monitor's layout (opaque,
	// always in edit mode, no overlay fill/click-through). Set by the /studio route.
	export let studio = false;

	// This window's monitor key: ?monitor=<i> on secondary overlays, else the primary
	// key on main. Widgets are filtered/saved per monitor so windows don't clobber each
	// other. In the studio this is switchable (edit any monitor from the one window).
	let myMonitor = monitorParam() ?? DEFAULT_MONITOR;
	// Studio monitor switcher options (5s multi-monitor).
	let monitorOptions: { key: string; label: string }[] = [];

	// A small row of per-core CPU sparklines (the System skin's centrepiece). A full
	// configurable grid arrives with the Phase 5 editor; this proves the per-core pipe.
	const cores: WidgetInstance[] = Array.from({ length: 4 }, (_, i) => ({
		id: `core-${i}`,
		type: 'sparkline',
		sensor: `cpu.core.${i}`,
		rect: { x: 16 + i * 40, y: 280, w: 36, h: 26 },
		config: { min: 0, max: 100 }
	}));

	const DEMO_WIDGETS: WidgetInstance[] = [
		{
			id: 'clock',
			type: 'clock',
			rect: { x: 16, y: 16, w: 160, h: 40 },
			config: { format: 'HH:mm:ss' }
		},
		{
			id: 'date',
			type: 'clock',
			rect: { x: 16, y: 58, w: 180, h: 22 },
			config: { format: 'dddd D MMMM', color: 'rgb(218, 237, 226)' }
		},
		{
			id: 'swap-bar',
			type: 'bar',
			sensor: 'swap.used',
			rect: { x: 16, y: 100, w: 150, h: 16 },
			config: { min: 0, max: 100, label: 'SWAP' }
		},
		{
			id: 'cpu-1',
			type: 'gauge',
			sensor: 'cpu.total',
			rect: { x: 170, y: 16, w: 110, h: 110 },
			config: { label: 'CPU', unit: '%', min: 0, max: 100 }
		},
		{
			id: 'ram-1',
			type: 'gauge',
			sensor: 'mem.used',
			rect: { x: 170, y: 140, w: 110, h: 110 },
			config: { label: 'RAM', unit: '%', min: 0, max: 100 }
		},
		{
			id: 'gpu-1',
			type: 'gauge',
			sensor: 'gpu.util',
			rect: { x: 170, y: 262, w: 110, h: 100 },
			config: { label: 'GPU', unit: '%', min: 0, max: 100 }
		},
		{
			id: 'vram-bar',
			type: 'bar',
			sensor: 'gpu.vram',
			rect: { x: 16, y: 124, w: 140, h: 12 },
			config: { min: 0, max: 100, label: 'VRAM', color: 'rgb(119, 196, 211)' }
		},
		{
			id: 'net-down-txt',
			type: 'text',
			sensor: 'net.down',
			rect: { x: 16, y: 206, w: 90, h: 18 },
			config: { format: 'rate', label: '↓', color: 'rgb(218, 237, 226)' }
		},
		{
			id: 'net-up-txt',
			type: 'text',
			sensor: 'net.up',
			rect: { x: 96, y: 206, w: 90, h: 18 },
			config: { format: 'rate', label: '↑', color: 'rgb(119, 196, 211)' }
		},
		{
			id: 'net-down',
			type: 'sparkline',
			sensor: 'net.down',
			rect: { x: 16, y: 228, w: 140, h: 30 },
			config: { color: 'rgb(218, 237, 226)' }
		},
		{
			id: 'btn-1',
			type: 'button',
			rect: { x: 170, y: 372, w: 90, h: 44 },
			config: { label: 'tap' },
			interactive: true
		},
		...cores
	];

	// The v2 layout for THIS monitor: an in-flow root + a floating layer. The demo seeds
	// the primary monitor's floating layer only; secondaries start empty.
	const seedFloating: Leaf[] = (monitorParam() ? [] : DEMO_WIDGETS).map((w) => leaf(w));
	let monitor: MonitorLayout = { root: emptyRoot(), floating: seedFloating };
	// The reusable widget library (Phase 6). Shared across monitors, embedded in
	// widgets.json under a `library` key; loaded/saved alongside the layout.
	let library: Library | undefined;
	// Theming (Phase 7c): the selected theme name (global, in the layout file) + its loaded
	// CSS + the list of available themes. Empty name = the default look (token fallbacks).
	let selectedTheme = '';
	let themeCss = '';
	let themeList: string[] = [];
	// Global token overrides (Phase 7d): set in the inspector, injected after the theme so
	// they win; persisted in the layout under `tokens`.
	let tokenOverrides: Record<string, string> = {};

	// Def editor (6b): while editing a def, `monitor` is swapped for a scoped tree built
	// from the def's child, and the real monitor is stashed. Edits propagate to the def
	// (and thus every instance) on each save.
	let editingDefId: string | null = null;
	let savedMonitor: MonitorLayout | null = null;

	const hub = createTelemetryHub();
	let unlisten: UnlistenFn | undefined;
	let unlistenLayout: UnlistenFn | undefined;
	let unlistenEdit: UnlistenFn | undefined;
	let unlistenStudio: UnlistenFn | undefined;
	let unlistenThemes: UnlistenFn | undefined;

	// The work area this overlay lays its flow tree into (logical px; the full monitor
	// until 5b insets the taskbar). Set on mount + window resize.
	let workArea: Rect = { x: 0, y: 0, w: 0, h: 0 };

	async function updateWorkArea() {
		if (studio) {
			// A normal window: lay the layout into the whole window (no taskbar inset).
			workArea = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
			return;
		}
		const wa = await monitorWorkArea();
		workArea = wa ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
	}

	// Solve the whole monitor (flow root + floating), then pair every rendered primitive
	// (incl. group descendants) with its rect via the pure collectRenderables.
	$: solved = solveMonitor(monitor, workArea, library);
	$: renderables = collectRenderables(monitor, solved, library);
	// The assembled stylesheet for this monitor (Phase 7): theme → token overrides →
	// def → instance css, in cascade order.
	$: tokenCss = Object.keys(tokenOverrides).length ? tokensToCss(tokenOverrides) : '';
	$: styleCss = assembleStyles({
		themeCss: [themeCss, tokenCss].filter(Boolean).join('\n'),
		library,
		monitor
	});

	// The selected node can be a container (incl. root) or a primitive leaf, in either
	// the flow tree or the floating layer.
	function lookup(id: string): LayoutNode | null {
		return findNode(monitor.root, id) ?? monitor.floating.find((l) => l.id === id) ?? null;
	}
	$: selectedNode = selectedId ? lookup(selectedId) : null;
	$: selectedContainer = selectedNode && isContainer(selectedNode) ? selectedNode : null;
	$: selectedWidget =
		selectedNode && isLeaf(selectedNode) && !isGroup(selectedNode.unit)
			? (selectedNode.unit as WidgetInstance)
			: null;
	$: selectedGroup =
		selectedNode && isLeaf(selectedNode) && isGroup(selectedNode.unit)
			? (selectedNode.unit as Group)
			: null;
	$: selectedDef = ((): WidgetDef | null => {
		const dId = selectedGroup?.def;
		if (!dId || !library) return null;
		return library.defs.find((d) => d.id === dId) ?? null;
	})();
	$: editingDefName =
		editingDefId && library
			? library.defs.find((d) => d.id === editingDefId)?.name ?? editingDefId
			: '';

	// Context-menu target (the canvas/root, a container, a primitive, or a group).
	$: menuNode = menu ? (menu.id === '__canvas__' ? monitor.root : lookup(menu.id)) : null;
	$: menuLeaf = menuNode && isLeaf(menuNode) ? menuNode : null;
	$: menuGroup = menuLeaf && isGroup(menuLeaf.unit) ? (menuLeaf.unit as Group) : null;
	$: menuId = menu?.id ?? null;
	$: menuFloating = menuId !== null && monitor.floating.some((l) => l.id === menuId);
	$: placement = (
		selectedId === null
			? null
			: monitor.floating.some((l) => l.id === selectedId)
			? 'floating'
			: findNode(monitor.root, selectedId)
			? 'flow'
			: null
	) as 'flow' | 'floating' | null;
	$: sensors = sensorCatalog(selectedWidget ? [...hub.sensorIds(), ...sourceCatalogIds()] : []);
	// The selected widget's typed config schema (8a); the raw-JSON box stays as the fallback.
	$: configFields = selectedWidget ? getMeta(selectedWidget.type)?.configFields ?? [] : [];

	// Interactive hit rects use the SOLVED position (flow widgets aren't at unit.rect).
	function interactiveItems(): { rect: Rect; interactive?: boolean }[] {
		return renderables.map((r) => ({ rect: r.rect, interactive: r.instance.interactive }));
	}

	async function reloadLayout() {
		try {
			const raw = await invoke<string | null>('load_layout');
			const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
			const saved = obj ? parseLayoutAny(obj) : null;
			const mon = saved?.monitors[myMonitor];
			if (mon) monitor = mon;
			const lib = obj?.library;
			if (lib && typeof lib === 'object' && Array.isArray((lib as { defs?: unknown }).defs)) {
				library = lib as Library;
			}
			const t = obj?.theme;
			if (typeof t === 'string' && t !== selectedTheme) {
				selectedTheme = t;
				await applyTheme();
			}
			const tk = obj?.tokens;
			if (tk && typeof tk === 'object' && !Array.isArray(tk)) {
				tokenOverrides = tk as Record<string, string>;
			}
		} catch (err) {
			console.warn('load_layout failed; using default layout', err);
		}
	}

	async function applyTheme() {
		themeCss = await loadThemeCss(selectedTheme);
	}

	function setTheme(name: string) {
		selectedTheme = name;
		applyTheme();
		saveLayout();
	}

	// Studio: switch which monitor's layout is being edited (reload its saved layout).
	async function switchMonitor(key: string) {
		if (key === myMonitor) return;
		myMonitor = key;
		selectedId = null;
		menu = null;
		monitor = { root: emptyRoot(), floating: [] };
		await reloadLayout();
	}

	onMount(async () => {
		await updateWorkArea();
		unlisten = await startAllSources(hub); // built-in `system` + any plugin sources
		await reloadLayout();
		// Live-reload external edits to widgets.json (ignored while actively editing).
		unlistenLayout = await listen('layout_changed', () => {
			if (!editMode) reloadLayout().then(syncRects);
		});
		// Themes (Phase 7c): list them + live-reload the active theme when the folder changes.
		themeList = await listThemes();
		unlistenThemes = await listen('themes_changed', () => {
			applyTheme();
			listThemes().then((t) => (themeList = t));
		});
		if (studio) {
			editMode = true; // the studio is always an editor; no overlay fill/click-through
			monitorOptions = await studioMonitorOptions();
			return;
		}
		// The primary window fills its monitor and opens overlays on the others.
		if (!monitorParam()) {
			await fillCurrentMonitor();
			await spawnSecondaryOverlays();
			// The tray "Open designer" item asks the primary to open the studio window.
			unlistenStudio = await listen('open_studio', () => openStudio());
		}
		await setClickThrough(true);
		syncRects();
		unlistenEdit = await listen('toggle_edit', () => setEdit(!editMode));
	});

	onDestroy(() => {
		unlisten?.();
		unlistenLayout?.();
		unlistenEdit?.();
		unlistenStudio?.();
		unlistenThemes?.();
	});

	// Edit mode: tray "Edit layout" toggles it (or Ctrl+E while the window is focused).
	// Entering edit mode disables click-through so you can drag/resize/use the inspector.
	let editMode = false;
	let selectedId: string | null = null;
	const GRID = 8;
	const ALIGN_THRESHOLD = 6;
	let guideXs: number[] = [];
	let guideYs: number[] = [];
	// Drag-and-drop (5e): the pending flow drop slot + a thin insertion bar + the dragged id.
	let dropIndicator: Drop | null = null;
	let dropBar: Rect | null = null;
	let draggingId: string | null = null;
	// Right-click context menu (5d, in-editor): position + the targeted node id.
	let menu: { x: number; y: number; id: string } | null = null;

	async function setEdit(value: boolean) {
		editMode = value;
		try {
			await setClickThrough(!value);
		} catch (err) {
			console.warn('setIgnoreCursorEvents failed', err);
		}
		syncRects();
	}

	// Tell the backend which widgets catch clicks in passive mode (per-widget click-through).
	function syncRects() {
		syncInteractiveRects(interactiveItems(), editMode).catch((err) =>
			console.warn('set_interactive_rects failed', err)
		);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && menu) {
			menu = null;
			return;
		}
		if (event.ctrlKey && event.key.toLowerCase() === 'e') {
			event.preventDefault();
			// Broadcast so every monitor's overlay toggles together, not just this one.
			emit('toggle_edit');
		}
	}

	// Patch one floating primitive leaf (by id) and re-publish `monitor` reactively.
	function patchFloating(id: string, patch: Partial<WidgetInstance>) {
		monitor = {
			...monitor,
			floating: monitor.floating.map((l) =>
				l.id === id && !isGroup(l.unit)
					? { ...l, unit: { ...(l.unit as WidgetInstance), ...patch } }
					: l
			)
		};
	}

	// Patch a primitive in whichever layer holds it (floating layer or the flow tree).
	function patchUnit(id: string, patch: Partial<WidgetInstance>) {
		if (monitor.floating.some((l) => l.id === id)) {
			patchFloating(id, patch);
			return;
		}
		monitor = {
			...monitor,
			root: updateNode(monitor.root, id, (n) =>
				isLeaf(n) && !isGroup(n.unit)
					? { ...n, unit: { ...(n.unit as WidgetInstance), ...patch } }
					: n
			)
		};
	}

	function onChange(event: CustomEvent<{ id: string; rect: WidgetInstance['rect'] }>) {
		const { id, rect } = event.detail;
		const peers = renderables.filter((r) => r.movable && r.id !== id).map((r) => r.rect);
		const snapped = snapRectToPeers(rect, peers, ALIGN_THRESHOLD);
		guideXs = snapped.guideXs;
		guideYs = snapped.guideYs;
		patchFloating(id, { rect: snapped.rect });
	}

	function onCommit() {
		guideXs = [];
		guideYs = [];
		// A floating widget released over the flow tree docks into that slot.
		if (dropIndicator && draggingId) {
			const id = draggingId;
			const lf = monitor.floating.find((l) => l.id === id);
			if (lf) {
				monitor = {
					...monitor,
					floating: monitor.floating.filter((l) => l.id !== id),
					root: insertChild(monitor.root, dropIndicator.parentId, lf, dropIndicator.index)
				};
				selectedId = id;
			}
		}
		dropIndicator = null;
		dropBar = null;
		draggingId = null;
		saveLayout();
	}

	// A thin teal bar on the near edge of the hovered flow leaf — the insertion preview.
	function computeDropBar(p: { x: number; y: number }, dragging: string): Rect | null {
		for (const lf of flowLeaves(monitor.root)) {
			if (lf.id === dragging) continue;
			const r = solved.get(lf.id);
			if (!r) continue;
			if (p.x < r.x || p.x >= r.x + r.w || p.y < r.y || p.y >= r.y + r.h) continue;
			const parent = findParent(monitor.root, lf.id);
			if (!parent) continue;
			if (parent.kind === 'col') {
				const after = p.y >= r.y + r.h / 2;
				return { x: r.x, y: (after ? r.y + r.h : r.y) - 1, w: r.w, h: 2 };
			}
			const after = p.x >= r.x + r.w / 2;
			return { x: (after ? r.x + r.w : r.x) - 1, y: r.y, w: 2, h: r.h };
		}
		return null;
	}

	function onDragOver(event: CustomEvent<{ id: string; x: number; y: number }>) {
		const { id, x, y } = event.detail;
		draggingId = id;
		dropIndicator = dropTarget(monitor.root, solved, { x, y }, id);
		dropBar = computeDropBar({ x, y }, id);
	}

	// Flow widget released: into a flow slot if over one, else float at the cursor.
	function onDrop(event: CustomEvent<{ id: string; x: number; y: number }>) {
		const { id, x, y } = event.detail;
		const drop = dropTarget(monitor.root, solved, { x, y }, id);
		dropIndicator = null;
		dropBar = null;
		draggingId = null;
		if (drop) {
			monitor = { ...monitor, root: moveNode(monitor.root, id, drop.parentId, drop.index) };
		} else {
			floatNode(id, { x, y });
		}
		selectedId = id;
		saveLayout();
	}

	async function saveLayout() {
		let monitors: LayoutV2['monitors'] = {};
		let fileLib: Library | undefined;
		let fileTheme: string | undefined;
		let fileTokens: Record<string, string> | undefined;
		try {
			const raw = await invoke<string | null>('load_layout');
			const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
			monitors = (obj ? parseLayoutAny(obj) : null)?.monitors ?? {};
			fileLib = obj?.library as Library | undefined;
			fileTheme = typeof obj?.theme === 'string' ? (obj.theme as string) : undefined;
			fileTokens =
				obj?.tokens && typeof obj.tokens === 'object'
					? (obj.tokens as Record<string, string>)
					: undefined;
		} catch {
			monitors = {};
		}
		// Update only this monitor so other monitors aren't clobbered; keep the library
		// (ours if we have one, else whatever is already on disk).
		// While editing a def, persist the REAL monitor (not the scoped editing tree) and
		// fold the in-progress def back into the library so instances stay in sync.
		if (editingDefId) syncEditingDef();
		monitors[myMonitor] = editingDefId && savedMonitor ? savedMonitor : monitor;
		const lib = library ?? fileLib;
		const theme = selectedTheme || fileTheme;
		const tokens = Object.keys(tokenOverrides).length ? tokenOverrides : fileTokens;
		const out: Record<string, unknown> = { version: 2, monitors };
		if (lib) out.library = lib;
		if (theme) out.theme = theme;
		if (tokens && Object.keys(tokens).length) out.tokens = tokens;
		try {
			await invoke('save_layout', { contents: JSON.stringify(out, null, 2) });
		} catch (err) {
			console.warn('save_layout failed', err);
		}
	}

	function onSelect(event: CustomEvent<{ id: string }>) {
		selectedId = event.detail.id;
	}

	// --- right-click context menu (5d, in-editor) ---
	function onWidgetContextMenu(event: CustomEvent<{ id: string; x: number; y: number }>) {
		menu = { x: event.detail.x, y: event.detail.y, id: event.detail.id };
	}
	function onCanvasContextMenu(event: MouseEvent) {
		if (!editMode) return;
		event.preventDefault();
		menu = { x: event.clientX, y: event.clientY, id: '__canvas__' };
	}
	// A plugin widget asked to actuate (e.g. an HA light toggle). The target entity is the
	// widget's sensor minus the `ha.` prefix; the token stays server-side (Phase 8c). Ignored
	// in edit mode — the drag overlay swallows clicks there, so this only fires when passive.
	async function onWidgetControl(
		event: CustomEvent<{ id: string; sensor?: string; domain: string; service: string }>
	) {
		const { sensor, domain, service } = event.detail;
		if (!sensor || !sensor.startsWith('ha.')) return;
		const entity_id = sensor.slice('ha.'.length);
		try {
			await invoke('ha_call_service', { domain, service, data: { entity_id } });
		} catch {
			// Non-fatal: the next state_changed telemetry tick reconciles the widget anyway.
		}
	}
	const closeMenu = () => (menu = null);
	function menuAct(op: LayoutOp) {
		handleOp(op);
		menu = null;
	}
	const mMakeWidget = () => menu && menuAct({ op: 'makeWidget', id: menu.id });
	const mRemove = () => menu && menuAct({ op: 'remove', id: menu.id });
	const mFloat = () => menu && menuAct({ op: 'float', id: menu.id });
	const mDock = () => menu && menuAct({ op: 'dock', id: menu.id });
	const mUngroup = () => menu && menuAct({ op: 'ungroup', id: menu.id });
	const mAdd = (kind: Container['kind']) => menuAct({ op: 'addContainer', kind });
	function mEditDef() {
		const d = menuGroup?.def;
		if (d) menuAct({ op: 'editDef', defId: d });
	}

	const rand = () => Math.random().toString(36).slice(2, 8);

	// All editor operations from the Inspector / Outline funnel through here, then persist.
	function handleOp(op: LayoutOp) {
		switch (op.op) {
			case 'select':
				selectedId = op.id;
				return; // no save (selection isn't persisted)
			case 'addWidget':
				addWidget(op.widgetType);
				break;
			case 'addContainer':
				addContainer(op.kind);
				break;
			case 'remove':
				removeById(op.id);
				break;
			case 'moveUp':
				reorder(op.id, -1);
				break;
			case 'moveDown':
				reorder(op.id, 1);
				break;
			case 'outdent':
				outdent(op.id);
				break;
			case 'indent':
				indent(op.id);
				break;
			case 'dock':
				dock(op.id);
				break;
			case 'float':
				floatNode(op.id);
				break;
			case 'makeWidget':
				makeWidget(op.id);
				break;
			case 'ungroup':
				ungroupSelected(op.id);
				break;
			case 'insertWidget':
				insertWidget(op.defId);
				break;
			case 'renameDef':
				renameDef(op.defId, op.name);
				break;
			case 'deleteDef':
				deleteDef(op.defId);
				break;
			case 'addDefParam':
				addDefParam(op.defId, op.key, op.target);
				break;
			case 'editDef':
				enterDefEdit(op.defId);
				return; // no save (just a mode switch)
			case 'endDefEdit':
				endDefEdit();
				return;
			case 'setDefSize':
				setDefSize(op.defId, op.w, op.h);
				break;
			case 'patchGroup':
				patchGroup(op.id, op.patch);
				break;
			case 'setDefCss':
				if (library) {
					library = {
						...library,
						defs: library.defs.map((d) =>
							d.id === op.defId ? { ...d, css: op.css || undefined } : d
						)
					};
				}
				break;
			case 'setToken': {
				const next = { ...tokenOverrides };
				if (op.value) next[op.key] = op.value;
				else delete next[op.key];
				tokenOverrides = next;
				break;
			}
			case 'patchWidget':
				patchUnit(op.id, op.patch);
				break;
			case 'patchContainer':
				monitor = { ...monitor, root: updateContainer(monitor.root, op.id, op.patch) };
				break;
		}
		saveLayout();
	}

	// A new widget goes into the selected container (flow), else the floating layer.
	function addWidget(type: string) {
		const id = `${type}-${rand()}`;
		const w = leaf(createWidget(type, id));
		monitor = selectedContainer
			? { ...monitor, root: insertChild(monitor.root, selectedContainer.id, w) }
			: { ...monitor, floating: [...monitor.floating, w] };
		selectedId = id;
	}

	// A new container goes into the selected container (or the root) — always in the flow.
	function addContainer(kind: Container['kind']) {
		const id = `${kind}-${rand()}`;
		const c = container(id, kind, [], kind === 'grid' ? { cols: 2 } : {});
		const parentId = selectedContainer?.id ?? monitor.root.id;
		monitor = { ...monitor, root: insertChild(monitor.root, parentId, c) };
		selectedId = id;
	}

	function removeById(id: string) {
		monitor = monitor.floating.some((l) => l.id === id)
			? { ...monitor, floating: monitor.floating.filter((l) => l.id !== id) }
			: { ...monitor, root: removeNode(monitor.root, id) };
		if (selectedId === id) selectedId = null;
	}

	function reorder(id: string, delta: number) {
		const parent = findParent(monitor.root, id);
		if (!parent) return;
		const idx = parent.children.findIndex((c) => c.id === id);
		const ni = idx + delta;
		if (ni < 0 || ni >= parent.children.length) return;
		monitor = { ...monitor, root: moveNode(monitor.root, id, parent.id, ni) };
	}

	function outdent(id: string) {
		const parent = findParent(monitor.root, id);
		if (!parent || parent.id === monitor.root.id) return;
		const grand = findParent(monitor.root, parent.id);
		if (!grand) return;
		const pidx = grand.children.findIndex((c) => c.id === parent.id);
		monitor = { ...monitor, root: moveNode(monitor.root, id, grand.id, pidx + 1) };
	}

	function indent(id: string) {
		const parent = findParent(monitor.root, id);
		if (!parent) return;
		const idx = parent.children.findIndex((c) => c.id === id);
		const prev = parent.children[idx - 1];
		if (!prev || !isContainer(prev)) return;
		monitor = { ...monitor, root: moveNode(monitor.root, id, prev.id) };
	}

	// Floating leaf → flow (docked into root, at the end).
	function dock(id: string) {
		const lf = monitor.floating.find((l) => l.id === id);
		if (!lf) return;
		monitor = {
			...monitor,
			floating: monitor.floating.filter((l) => l.id !== id),
			root: insertChild(monitor.root, monitor.root.id, lf)
		};
		selectedId = id;
	}

	const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
	const cfgNum = (c: Record<string, unknown> | undefined, k: string) =>
		typeof c?.[k] === 'number' ? (c[k] as number) : 0;

	// Wrap a node (a flow container/widget or a floating widget) into a reusable WidgetDef
	// + a group instance referencing it. The def lands in the library; the node is replaced
	// in place by the group. (Phase 6a — the widget designer's core move.)
	function makeWidget(id: string) {
		const node = lookup(id);
		if (!node) return;
		const s = intrinsicSize(node, library);
		const size = {
			w: Math.max(40, Math.round(s.w) || 120),
			h: Math.max(24, Math.round(s.h) || 80)
		};
		const defId = `def-${rand()}`;
		const name = isContainer(node) ? `widget-${node.kind}` : (node.unit as WidgetInstance).type;
		const def: WidgetDef = { id: defId, name, size, child: clone(node) };
		library = { version: library?.version ?? 1, defs: [...(library?.defs ?? []), def] };

		const grpId = `grp-${rand()}`;
		const floatingLeaf = monitor.floating.find((l) => l.id === id);
		if (floatingLeaf && isLeaf(floatingLeaf) && !isGroup(floatingLeaf.unit)) {
			const r = (floatingLeaf.unit as WidgetInstance).rect;
			const g = group(grpId, size, clone(node), { def: defId, name, config: { x: r.x, y: r.y } });
			monitor = { ...monitor, floating: monitor.floating.map((l) => (l.id === id ? leaf(g) : l)) };
		} else {
			const g = group(grpId, size, clone(node), { def: defId, name });
			monitor = { ...monitor, root: updateNode(monitor.root, id, () => leaf(g)) };
		}
		selectedId = grpId;
	}

	// Inline a group back to its subtree. Flow groups expand to the def/inline child;
	// a floating group of a single primitive becomes a floating widget at its anchor.
	function ungroupSelected(id: string) {
		const fl = monitor.floating.find((l) => l.id === id);
		if (fl) {
			if (!isGroup(fl.unit)) return;
			const g = fl.unit;
			const def = g.def && library ? library.defs.find((d) => d.id === g.def) : undefined;
			const base = def ? def.child : g.child;
			if (base && isLeaf(base) && !isGroup(base.unit)) {
				const u = clone(base.unit) as WidgetInstance;
				u.rect = { ...u.rect, x: cfgNum(g.config, 'x'), y: cfgNum(g.config, 'y') };
				monitor = {
					...monitor,
					floating: monitor.floating.map((l) => (l.id === id ? leaf(u) : l))
				};
				selectedId = u.id;
			} else {
				console.warn('ungroup: dock this composite group into the flow first');
			}
			return;
		}
		monitor = { ...monitor, root: ungroupNode(monitor.root, id, library) };
		selectedId = null;
	}

	// Instantiate a library def as a new group (into the selected container, else floating).
	function insertWidget(defId: string) {
		const def = library?.defs.find((d) => d.id === defId);
		if (!def) return;
		const grpId = `grp-${rand()}`;
		if (selectedContainer) {
			const g = group(grpId, def.size, clone(def.child), { def: defId, name: def.name });
			monitor = { ...monitor, root: insertChild(monitor.root, selectedContainer.id, leaf(g)) };
		} else {
			const g = group(grpId, def.size, clone(def.child), {
				def: defId,
				name: def.name,
				config: { x: 24, y: 24 }
			});
			monitor = { ...monitor, floating: [...monitor.floating, leaf(g)] };
		}
		selectedId = grpId;
	}

	// Is any group instance (flow or floating) still referencing `defId`?
	function defInUse(defId: string): boolean {
		let used = false;
		const visit = (n: LayoutNode): void => {
			if (isLeaf(n)) {
				if (isGroup(n.unit) && n.unit.def === defId) used = true;
			} else {
				n.children.forEach(visit);
			}
		};
		visit(monitor.root);
		monitor.floating.forEach(visit);
		return used;
	}

	function renameDef(defId: string, name: string) {
		if (!library) return;
		library = { ...library, defs: library.defs.map((d) => (d.id === defId ? { ...d, name } : d)) };
	}

	function deleteDef(defId: string) {
		if (!library) return;
		if (defInUse(defId)) {
			console.warn(`def ${defId} is in use; not deleted`);
			return;
		}
		library = { ...library, defs: library.defs.filter((d) => d.id !== defId) };
	}

	// Declare a param on a def (key + optional dotted target into the cloned child).
	function addDefParam(defId: string, key: string, target?: string) {
		if (!library || !key) return;
		library = {
			...library,
			defs: library.defs.map((d) =>
				d.id === defId
					? { ...d, params: [...(d.params ?? []), { key, target: target || undefined }] }
					: d
			)
		};
	}

	// Patch a group leaf (name / params) in whichever layer holds it.
	function patchGroup(id: string, patch: Partial<Group>) {
		const merge = (g: Group): Group => ({ ...g, ...patch });
		if (monitor.floating.some((l) => l.id === id)) {
			monitor = {
				...monitor,
				floating: monitor.floating.map((l) =>
					l.id === id && isGroup(l.unit) ? { ...l, unit: merge(l.unit) } : l
				)
			};
		} else {
			monitor = {
				...monitor,
				root: updateNode(monitor.root, id, (n) =>
					isLeaf(n) && isGroup(n.unit) ? { ...n, unit: merge(n.unit) } : n
				)
			};
		}
	}

	// --- def editor (6b): edit a def's internal tree full-screen, scoped ---

	function enterDefEdit(defId: string) {
		const def = library?.defs.find((d) => d.id === defId);
		if (!def) return;
		savedMonitor = monitor;
		const scopedRoot: Container = isContainer(def.child)
			? (clone(def.child) as Container)
			: container(`${defId}__root`, 'col', [clone(def.child)], { align: 'stretch' });
		monitor = { root: scopedRoot, floating: [] };
		editingDefId = defId;
		selectedId = null;
	}

	// Write the scoped editing tree back onto its def (propagates to every instance).
	function syncEditingDef() {
		if (!editingDefId || !library) return;
		const child = monitor.root;
		library = {
			...library,
			defs: library.defs.map((d) => (d.id === editingDefId ? { ...d, child } : d))
		};
	}

	function endDefEdit() {
		if (!editingDefId || !savedMonitor) return;
		syncEditingDef();
		monitor = savedMonitor;
		savedMonitor = null;
		editingDefId = null;
		selectedId = null;
		saveLayout();
	}

	function setDefSize(defId: string, w: number, h: number) {
		if (!library) return;
		const size = { w: Math.max(8, w), h: Math.max(8, h) };
		library = {
			...library,
			defs: library.defs.map((d) => (d.id === defId ? { ...d, size } : d))
		};
	}

	// Flow leaf → floating, anchored at `at` (the drop point) or its current solved position.
	function floatNode(id: string, at?: { x: number; y: number }) {
		const node = findNode(monitor.root, id);
		if (!node || !isLeaf(node)) return;
		const r = solved.get(id);
		const x = at?.x ?? r?.x ?? 0;
		const y = at?.y ?? r?.y ?? 0;
		let lf: Leaf;
		if (!isGroup(node.unit)) {
			const u = node.unit;
			lf = leaf({ ...u, rect: { x, y, w: r?.w ?? u.rect.w, h: r?.h ?? u.rect.h } });
		} else {
			const g = node.unit;
			lf = leaf({ ...g, config: { ...(g.config ?? {}), x, y } });
		}
		monitor = {
			...monitor,
			root: removeNode(monitor.root, id),
			floating: [...monitor.floating, lf]
		};
		selectedId = id;
	}
</script>

<svelte:window on:keydown={onKeydown} on:resize={updateWorkArea} />

<div class="canvas" class:edit={editMode} class:studio on:contextmenu={onCanvasContextMenu}>
	<StyleLayer css={styleCss} />
	{#each renderables as r (r.id)}
		<WidgetHost
			{hub}
			instance={r.instance}
			rect={r.rect}
			movable={r.movable}
			selectId={r.selectId}
			domId={r.id}
			defId={r.defId}
			groupId={r.groupId}
			{editMode}
			selected={r.selectId === selectedId}
			grid={GRID}
			on:change={onChange}
			on:commit={onCommit}
			on:select={onSelect}
			on:dragover={onDragOver}
			on:drop={onDrop}
			on:contextmenu={onWidgetContextMenu}
			on:control={onWidgetControl}
		/>
	{/each}
	{#if editMode}
		{#if studio}
			<div class="studio-bar">
				<span class="lbl">Studio</span>
				<select on:change={(e) => switchMonitor(e.currentTarget.value)}>
					{#each monitorOptions as o (o.key)}
						<option value={o.key} selected={o.key === myMonitor}>{o.label}</option>
					{/each}
				</select>
				<span class="lbl">Theme</span>
				<select on:change={(e) => setTheme(e.currentTarget.value)}>
					<option value="" selected={selectedTheme === ''}>(default)</option>
					{#each themeList as t (t)}
						<option value={t} selected={t === selectedTheme}>{t}</option>
					{/each}
				</select>
			</div>
		{/if}
		{#each guideXs as gx (gx)}
			<div class="guide v" style="left: {gx}px" />
		{/each}
		{#each guideYs as gy (gy)}
			<div class="guide h" style="top: {gy}px" />
		{/each}
		{#if dropBar}
			<div
				class="dropbar"
				style="left: {dropBar.x}px; top: {dropBar.y}px; width: {dropBar.w}px; height: {dropBar.h}px"
			/>
		{/if}
		{#if editingDefId}
			<div class="def-banner">
				Editing widget: {editingDefName}
				<button type="button" on:click={() => handleOp({ op: 'endDefEdit' })}>Done</button>
			</div>
		{/if}
		<div class="edit-badge">EDIT — Ctrl+E to exit</div>
		<Outline
			root={monitor.root}
			floating={monitor.floating}
			{selectedId}
			on:op={(e) => handleOp(e.detail)}
		/>
		<Inspector
			widget={selectedWidget}
			container={selectedContainer}
			groupUnit={selectedGroup}
			def={selectedDef}
			defs={library?.defs ?? []}
			tokens={tokenOverrides}
			{placement}
			{widgetTypes}
			{configFields}
			{sensors}
			on:op={(e) => handleOp(e.detail)}
		/>
		{#if menu && menuNode}
			<button type="button" class="ctx-backdrop" aria-label="Close menu" on:click={closeMenu} />
			<div class="ctx" style="left: {menu.x}px; top: {menu.y}px">
				{#if menuGroup}
					{#if menuGroup.def}
						<button type="button" on:click={mEditDef}>Edit def…</button>
					{/if}
					<button type="button" on:click={mUngroup}>Ungroup</button>
					<button type="button" class="rm" on:click={mRemove}>Remove</button>
				{:else if menuLeaf}
					<button type="button" on:click={mMakeWidget}>Make widget</button>
					{#if menuFloating}
						<button type="button" on:click={mDock}>Dock →flow</button>
					{:else}
						<button type="button" on:click={mFloat}>Float</button>
					{/if}
					<button type="button" class="rm" on:click={mRemove}>Remove</button>
				{:else}
					<button type="button" on:click={() => mAdd('row')}>+ Row</button>
					<button type="button" on:click={() => mAdd('col')}>+ Column</button>
					<button type="button" on:click={() => mAdd('grid')}>+ Grid</button>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.canvas {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.canvas.edit {
		pointer-events: auto;
	}

	/* Studio: a normal opaque window (not a transparent desktop overlay). */
	.canvas.studio {
		background: #0b0b0e;
	}

	.guide {
		position: absolute;
		background: rgba(119, 196, 211, 0.9);
		pointer-events: none;
		z-index: 2;
	}

	.guide.v {
		top: 0;
		bottom: 0;
		width: 1px;
	}

	.guide.h {
		left: 0;
		right: 0;
		height: 1px;
	}

	.dropbar {
		position: absolute;
		background: rgb(119, 196, 211);
		box-shadow: 0 0 4px rgba(119, 196, 211, 0.9);
		pointer-events: none;
		z-index: 3;
	}

	.ctx-backdrop {
		position: fixed;
		inset: 0;
		margin: 0;
		padding: 0;
		border: none;
		background: transparent;
		cursor: default;
		z-index: 9;
	}

	.ctx {
		position: fixed;
		display: flex;
		flex-direction: column;
		min-width: 132px;
		padding: 3px;
		background: rgba(10, 10, 12, 0.97);
		border: 1px solid rgba(119, 196, 211, 0.6);
		border-radius: 4px;
		z-index: 10;
		pointer-events: auto;
	}

	.ctx button {
		background: transparent;
		border: none;
		color: #eee;
		font-family: monospace;
		font-size: 12px;
		text-align: left;
		padding: 4px 8px;
		border-radius: 2px;
		cursor: pointer;
	}

	.ctx button:hover {
		background: rgba(119, 196, 211, 0.25);
	}

	.ctx button.rm {
		color: rgb(230, 160, 160);
	}

	.def-banner {
		position: absolute;
		top: 4px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 8px;
		align-items: center;
		padding: 4px 10px;
		font-family: monospace;
		font-size: 12px;
		color: #0b0b0b;
		background: rgb(218, 237, 226);
		border-radius: 3px;
		pointer-events: auto;
		z-index: 4;
	}

	.def-banner button {
		background: #0b0b0b;
		color: rgb(218, 237, 226);
		border: none;
		border-radius: 2px;
		padding: 1px 8px;
		cursor: pointer;
		font-family: monospace;
	}

	.studio-bar {
		position: absolute;
		top: 4px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 8px;
		align-items: center;
		padding: 4px 8px;
		background: rgba(10, 10, 12, 0.92);
		border: 1px solid rgba(119, 196, 211, 0.5);
		border-radius: 4px;
		color: #eee;
		font-family: monospace;
		font-size: 11px;
		pointer-events: auto;
		z-index: 5;
	}

	.studio-bar .lbl {
		color: rgb(119, 196, 211);
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.studio-bar select {
		background: #1a1a1e;
		color: #eee;
		border: 1px solid #333;
		font-family: monospace;
		font-size: 11px;
		padding: 2px 4px;
	}

	.edit-badge {
		position: absolute;
		top: 4px;
		right: 4px;
		padding: 2px 6px;
		font-family: monospace;
		font-size: 10px;
		color: #fff;
		background: rgba(119, 196, 211, 0.85);
		border-radius: 3px;
		pointer-events: none;
	}
</style>
