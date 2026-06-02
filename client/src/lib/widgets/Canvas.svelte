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
	import {
		collectContainerRects,
		collectGridPlaceholders,
		collectRenderables,
		gridCellRects,
		intrinsicSize,
		solveMonitor
	} from '../core/solve';
	import { assembleStyles } from '../core/style';
	import { tokensToCss } from '../core/tokens';
	import { TEMPLATES, getTemplate } from '../core/templates';
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
	import { rectsIntersect } from '../core/geometry';
	import { sensorCatalog } from '../core/sensors';
	import {
		fillPrimaryMonitor,
		listThemes,
		loadThemeCss,
		saveThemeCss,
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
	// Studio monitor switcher options (5s multi-monitor): device name + logical size per key.
	let monitorOptions: { key: string; label: string; name: string; w: number; h: number }[] = [];

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

	// Undo/redo (item 2): a snapshot history of the editable {monitor, library} pair. Every
	// edit reassigns these to NEW objects (the tree ops are immutable — old nodes are never
	// mutated), so a snapshot is just the current references; no deep clone needed. History is
	// recorded at the COMMIT chokepoint (saveLayout) — transient drag `onChange` mutations don't
	// save, so a whole drag coalesces into a single undo step instead of one per mouse move.
	type Snap = { monitor: MonitorLayout; library: Library | undefined };
	let undoStack: Snap[] = [];
	let redoStack: Snap[] = [];
	// The last committed snapshot; saveLayout pushes THIS to the undo stack when the layout has
	// changed since, then advances it. Reset on load / monitor switch / def-edit boundary so undo
	// never crosses those (you can't undo into another monitor's or another window's tree).
	let lastSnap: Snap | null = null;
	let historyReady = false;
	$: canUndo = undoStack.length > 0;
	$: canRedo = redoStack.length > 0;

	function snap(): Snap {
		return { monitor, library };
	}

	// Re-baseline history to the current layout (no undo entries across this point).
	function resetHistory() {
		undoStack = [];
		redoStack = [];
		lastSnap = snap();
		historyReady = true;
	}

	// Commit point: if the layout changed since the last snapshot, push the previous snapshot
	// for undo and clear the redo branch. Called at the top of saveLayout (monitor/library are
	// already the post-edit values there). A no-op when nothing changed (e.g. a theme-only save).
	function recordHistory() {
		if (!historyReady) return;
		if (lastSnap && monitor === lastSnap.monitor && library === lastSnap.library) return;
		undoStack = [...undoStack, lastSnap ?? snap()].slice(-100);
		redoStack = [];
		lastSnap = snap();
	}

	function undo() {
		if (!undoStack.length) return;
		redoStack = [...redoStack, snap()];
		const prev = undoStack[undoStack.length - 1];
		undoStack = undoStack.slice(0, -1);
		monitor = prev.monitor;
		library = prev.library;
		lastSnap = prev; // so the saveLayout below records nothing
		saveLayout();
	}

	function redo() {
		if (!redoStack.length) return;
		undoStack = [...undoStack, snap()];
		const next = redoStack[redoStack.length - 1];
		redoStack = redoStack.slice(0, -1);
		monitor = next.monitor;
		library = next.library;
		lastSnap = next;
		saveLayout();
	}

	const hub = createTelemetryHub();
	let unlisten: UnlistenFn | undefined;
	let unlistenLayout: UnlistenFn | undefined;
	let unlistenEdit: UnlistenFn | undefined;
	let unlistenStudio: UnlistenFn | undefined;
	let unlistenThemes: UnlistenFn | undefined;

	// The work area this overlay lays its flow tree into (logical px; the full monitor
	// until 5b insets the taskbar). Set on mount + window resize.
	let workArea: Rect = { x: 0, y: 0, w: 0, h: 0 };
	// The editor stage's measured size (the canvas inset between the tool rails).
	let stageW = 0;
	let stageH = 0;

	// Studio zoom-to-fit (item 1): the flow tree is solved into the REAL monitor work area,
	// then a "world" layer of that size is scaled + panned to fit the stage. `zoom`/`panX`/
	// `panY` drive the world transform AND the drag-coordinate math; in the overlay they stay
	// 1/0/0 (no transform), so nothing there changes.
	let zoom = 1;
	let panX = 0;
	let panY = 0;
	let lastFitKey = '';
	// The selected monitor's logical size (the world dimensions); falls back until loaded.
	$: monSel = monitorOptions.find((o) => o.key === myMonitor);
	$: monSize = monSel ? { w: monSel.w, h: monSel.h } : { w: 1920, h: 1080 };
	$: monName = monSel?.name ?? '';
	$: worldStyle = studio
		? `width:${monSize.w}px;height:${monSize.h}px;transform:translate(${panX}px,${panY}px) scale(${zoom})`
		: '';

	// Fit the whole monitor into the stage (with a little breathing room) and centre it.
	function fit() {
		if (!monSize.w || !monSize.h || !stageW || !stageH) return;
		zoom = Math.min(stageW / monSize.w, stageH / monSize.h) * 0.95;
		panX = (stageW - monSize.w * zoom) / 2;
		panY = (stageH - monSize.h * zoom) / 2;
	}

	// Auto-fit on first measure and whenever the edited monitor changes (not on manual zoom).
	$: if (studio && stageW > 0 && stageH > 0 && monSize.w > 0) {
		const key = `${myMonitor}:${monSize.w}x${monSize.h}`;
		if (key !== lastFitKey) {
			lastFitKey = key;
			fit();
		}
	}

	// Zoom toward the cursor on wheel (studio only).
	function onWheel(event: WheelEvent) {
		if (!studio || !canvasEl) return;
		event.preventDefault();
		const r = canvasEl.getBoundingClientRect();
		const cx = event.clientX - r.left;
		const cy = event.clientY - r.top;
		const wx = (cx - panX) / zoom;
		const wy = (cy - panY) / zoom;
		const next = Math.min(4, Math.max(0.05, zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
		panX = cx - wx * next;
		panY = cy - wy * next;
		zoom = next;
	}

	// Studio lays out into the real monitor work area; the overlay uses the actual work area.
	$: if (studio) workArea = { x: 0, y: 0, w: monSize.w, h: monSize.h };

	async function updateWorkArea() {
		if (studio) return; // the reactive above owns the studio work area
		const wa = await monitorWorkArea();
		workArea = wa ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
	}

	// Solve the whole monitor (flow root + floating), then pair every rendered primitive
	// (incl. group descendants) with its rect via the pure collectRenderables.
	$: solved = solveMonitor(monitor, workArea, library);
	$: renderables = collectRenderables(monitor, solved, library);
	// Pane boundaries for the designer (root + nested containers), drawn behind the widgets.
	$: containerRects = studio ? collectContainerRects(monitor, solved) : [];
	// Empty grid cells (incl. the columns of a still-empty grid) outlined as drop targets.
	$: gridPlaceholders = studio ? collectGridPlaceholders(monitor, solved) : [];
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
	// `m` is taken as a parameter (not closed over) so Svelte sees `monitor` as a syntactic
	// dependency of the reactive below — otherwise selectedNode wouldn't recompute when the
	// model changes mid-drag, and the inspector's rect fields would freeze (item 7).
	function lookup(id: string, m: MonitorLayout): LayoutNode | null {
		return findNode(m.root, id) ?? m.floating.find((l) => l.id === id) ?? null;
	}
	$: selectedNode = selectedId ? lookup(selectedId, monitor) : null;
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
	// The same node as it was at the last save (manual-save baseline), so the inspector can mark
	// changed fields (item 2). Null when nothing is saved yet, or the node is new since the save
	// (then every field reads as dirty — the whole node is unsaved).
	$: baseNode =
		studio && savedBaseline && selectedId ? lookup(selectedId, savedBaseline.monitor) : null;
	$: baseWidget =
		baseNode && isLeaf(baseNode) && !isGroup(baseNode.unit)
			? (baseNode.unit as WidgetInstance)
			: null;
	$: baseContainer = baseNode && isContainer(baseNode) ? baseNode : null;
	$: baseGroup =
		baseNode && isLeaf(baseNode) && isGroup(baseNode.unit) ? (baseNode.unit as Group) : null;
	// Whether the selected node is new since the last save (no baseline counterpart) — then all
	// its fields are dirty. Only meaningful in the studio with a selection.
	$: nodeIsNew = !!(studio && savedBaseline && selectedId && selectedNode && !baseNode);
	$: editingDefName =
		editingDefId && library
			? library.defs.find((d) => d.id === editingDefId)?.name ?? editingDefId
			: '';

	// Context-menu target (the canvas/root, a container, a primitive, or a group).
	$: menuNode = menu ? (menu.id === '__canvas__' ? monitor.root : lookup(menu.id, monitor)) : null;
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
		historyReady = false; // don't record the load itself (or its interim awaits) as edits
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
		pendingExtras = []; // a fresh monitor/session drops any queued cross-monitor moves
		resetHistory(); // re-baseline: undo starts fresh from the loaded layout
		setBaseline(); // the loaded layout IS the saved state (manual-save dirty tracking)
	}

	async function applyTheme() {
		themeCss = await loadThemeCss(selectedTheme);
	}

	function setTheme(name: string) {
		selectedTheme = name;
		applyTheme();
		saveLayout();
	}

	// Item 5: a lightweight theme editor — edit the active theme's CSS (or start a new one)
	// and save it to the themes/ folder, then apply it. Token-level editing also lives in the
	// inspector (Phase 7d); this is the raw-CSS surface for fuller themes.
	let themeEditorOpen = false;
	let themeDraft = '';
	let themeDraftName = '';

	async function openThemeEditor() {
		themeDraftName = selectedTheme || 'custom';
		themeDraft = selectedTheme
			? await loadThemeCss(selectedTheme)
			: ':root {\n\t--np-accent: #77c4d3;\n\t--np-fg: #ffffff;\n}\n';
		themeEditorOpen = true;
	}

	async function saveThemeEditor() {
		const name = themeDraftName.trim();
		if (!name) return;
		await saveThemeCss(name, themeDraft);
		themeList = await listThemes();
		selectedTheme = name;
		await applyTheme();
		saveLayout();
		themeEditorOpen = false;
	}

	// Studio: switch which monitor's layout is being edited (reload its saved layout).
	async function switchMonitor(key: string) {
		if (key === myMonitor) return;
		// Prompt before abandoning an unsaved draft for this monitor (manual-save model).
		if (dirty && !window.confirm('Discard unsaved changes to this monitor and switch?')) return;
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
		// The main window covers the PRIMARY monitor (rendering the `default` key) and opens
		// overlays on every other monitor — so `default` always renders on the primary, matching
		// the studio's primary→`default` mapping (otherwise its layout lands on the wrong screen).
		if (!monitorParam()) {
			await fillPrimaryMonitor();
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
	// `selectedId` is the PRIMARY selection (drives the inspector); `selectedIds` is the full
	// set (selectId values) for marquee multi-select (item 3). A single click keeps both in
	// sync ([id]); the marquee adds the rest. `selectedSet` is the membership lookup for the
	// per-widget highlight in the markup.
	let selectedId: string | null = null;
	let selectedIds: string[] = [];
	$: selectedSet = new Set(selectedIds);
	// Keep the marquee set consistent with the many ops that set `selectedId` directly (group,
	// add, reorder, click…) WITHOUT a reactive cycle: collapse the set to just the new primary.
	// A marquee selection updates `lastPrimary` itself (in onMarqueeUp) so this no-ops and the
	// multi-selection survives. The reactive references ONLY selectedId — selectedIds is written
	// inside the function, never read in the `$:` line — so there's no selectedSet↔selectedIds loop.
	let lastPrimary: string | null = null;
	$: syncSelectionPrimary(selectedId);
	function syncSelectionPrimary(id: string | null) {
		if (id === lastPrimary) return;
		lastPrimary = id;
		selectedIds = id ? [id] : [];
	}
	// Rubber-band selection rectangle in CANVAS-space px (crisp, un-zoomed) while dragging on
	// empty canvas; null when idle. `marqueeStart` is the canvas-space anchor.
	let marquee: Rect | null = null;
	let marqueeStart: { x: number; y: number } | null = null;
	let marqueeAdditive = false;
	const GRID = 8;
	const ALIGN_THRESHOLD = 6;
	let guideXs: number[] = [];
	let guideYs: number[] = [];
	// Drag-and-drop (5e): the pending flow drop slot + a thin insertion bar + the dragged id.
	let dropIndicator: Drop | null = null;
	let dropBar: Rect | null = null;
	// When the drop lands INSIDE a container (e.g. an empty grid) rather than beside a leaf,
	// highlight that container's box instead of a thin bar.
	let dropZone: Rect | null = null;
	let draggingId: string | null = null;
	// A floating hint that follows the cursor mid-drag (item 2): whether the drop lands in a
	// flow container or floats, with coordinates. Positioned in canvas-relative coords.
	let dragHint: { x: number; y: number; text: string } | null = null;
	// The canvas element, to convert WidgetHost's viewport drag coords into canvas-relative
	// coords. Needed because the studio canvas is INSET behind the tool rails, so the canvas
	// origin is no longer the viewport origin (and `solved` rects are canvas-relative).
	let canvasEl: HTMLDivElement | undefined;

	function toCanvas(x: number, y: number): { x: number; y: number } {
		if (!canvasEl) return { x, y };
		const r = canvasEl.getBoundingClientRect();
		return { x: x - r.left, y: y - r.top };
	}

	// Viewport → world coords (undo the rail inset, the pan, and the zoom), for hit-testing
	// against `solved` rects which live in world space. In the overlay (pan 0, zoom 1) this
	// equals toCanvas.
	function toWorld(x: number, y: number): { x: number; y: number } {
		if (!canvasEl) return { x, y };
		const r = canvasEl.getBoundingClientRect();
		return { x: (x - r.left - panX) / zoom, y: (y - r.top - panY) / zoom };
	}
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
		// Undo/redo (item 2): only while editing this window's layout. Ctrl+Z undoes;
		// Ctrl+Y or Ctrl+Shift+Z redoes. Ignored when a text field has focus so typing in the
		// inspector/theme editor isn't hijacked.
		if (!(studio || editMode)) return;
		const k = event.key.toLowerCase();
		// Ctrl+S saves the draft — allowed even while a field has focus (you save mid-edit).
		if (event.ctrlKey && k === 's') {
			event.preventDefault(); // never the browser's save dialog
			if (studio && dirty) commitSave();
			return;
		}
		// The rest are ignored when a text field has focus so typing in the inspector / theme
		// editor isn't hijacked (undo/redo there should be the field's own).
		const target = event.target as HTMLElement | null;
		if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
		if (event.ctrlKey && k === 'z' && !event.shiftKey) {
			event.preventDefault();
			undo();
			return;
		} else if (event.ctrlKey && (k === 'y' || (k === 'z' && event.shiftKey))) {
			event.preventDefault();
			redo();
			return;
		}
		// Multi-select editing (item 3): Delete removes the whole selection; arrow keys nudge
		// every selected floating widget (Shift = a coarser, grid-sized step).
		const hasSel = selectedIds.length > 0 || selectedId !== null;
		if (!hasSel) return;
		if (k === 'delete' || k === 'backspace') {
			event.preventDefault();
			deleteSelected();
			return;
		}
		const step = event.shiftKey ? GRID : 1;
		const nudge: Record<string, [number, number]> = {
			arrowleft: [-step, 0],
			arrowright: [step, 0],
			arrowup: [0, -step],
			arrowdown: [0, step]
		};
		const d = nudge[k];
		if (d) {
			event.preventDefault();
			if (translateSelectedFloating(d[0], d[1])) saveLayout();
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
		// Group move (item 3): when the dragged widget is part of a multi-selection, translate the
		// whole set by its per-frame delta (and skip snapping — snapping a group to peers is odd).
		// Strictly gated on >1 selected so the single-drag path is byte-identical to before.
		if (selectedIds.length > 1 && selectedIds.includes(id)) {
			const cur = monitor.floating.find((l) => l.id === id);
			const curRect = cur && !isGroup(cur.unit) ? (cur.unit as WidgetInstance).rect : null;
			if (curRect) {
				guideXs = [];
				guideYs = [];
				translateSelectedFloating(rect.x - curRect.x, rect.y - curRect.y);
				return;
			}
		}
		const peers = renderables.filter((r) => r.movable && r.id !== id).map((r) => r.rect);
		const snapped = snapRectToPeers(rect, peers, ALIGN_THRESHOLD);
		guideXs = snapped.guideXs;
		guideYs = snapped.guideYs;
		patchFloating(id, { rect: snapped.rect });
	}

	function onCommit() {
		guideXs = [];
		guideYs = [];
		dragHint = null;
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
		dropZone = null;
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

	// The highlight box for a drop that lands inside a container: the specific grid cell the
	// widget will fill, or the whole pane for a row/col. Null when docking beside a leaf (a
	// thin bar is shown instead) or floating.
	function computeDropZone(drop: Drop | null, bar: Rect | null): Rect | null {
		if (!drop || bar) return null;
		const box = solved.get(drop.parentId);
		if (!box) return null;
		const parent = findNode(monitor.root, drop.parentId);
		if (parent && isContainer(parent) && parent.kind === 'grid') {
			return gridCellRects(parent, box)[drop.index] ?? box;
		}
		return box;
	}

	function onDragOver(event: CustomEvent<{ id: string; x: number; y: number }>) {
		const { id } = event.detail;
		const w = toWorld(event.detail.x, event.detail.y); // world coords for hit-testing
		const c = toCanvas(event.detail.x, event.detail.y); // canvas coords for the (unscaled) hint
		draggingId = id;
		dropIndicator = dropTarget(monitor.root, solved, w, id);
		dropBar = computeDropBar(w, id);
		// Beside a leaf → thin bar; into a container's open area → highlight the target grid
		// CELL (or the whole row/col pane).
		dropZone = computeDropZone(dropIndicator, dropBar);
		// Hint: docking into a flow container, or floating at (world) coordinates.
		if (dropIndicator) {
			const parent = findNode(monitor.root, dropIndicator.parentId);
			const kind = parent && isContainer(parent) ? parent.kind : 'flow';
			dragHint = { x: c.x, y: c.y, text: `▦ into ${kind}` };
		} else {
			const lf = monitor.floating.find((l) => l.id === id);
			const pos = lf && !isGroup(lf.unit) ? lf.unit.rect : null;
			const px = Math.round(pos ? pos.x : w.x);
			const py = Math.round(pos ? pos.y : w.y);
			dragHint = { x: c.x, y: c.y, text: `⊕ float · ${px}, ${py}` };
		}
	}

	// Flow widget released: into a flow slot if over one, else float at the cursor.
	function onDrop(event: CustomEvent<{ id: string; x: number; y: number }>) {
		const { id } = event.detail;
		const { x, y } = toWorld(event.detail.x, event.detail.y);
		const drop = dropTarget(monitor.root, solved, { x, y }, id);
		dropIndicator = null;
		dropBar = null;
		dropZone = null;
		draggingId = null;
		dragHint = null;
		if (drop) {
			monitor = { ...monitor, root: moveNode(monitor.root, id, drop.parentId, drop.index) };
		} else {
			floatNode(id, { x, y });
		}
		selectedId = id;
		saveLayout();
	}

	// `extra` (move-to-monitor) appends a floating leaf to ANOTHER monitor's saved layout in
	// the same write — used to relocate a widget to a different display from the studio.
	// Commit an edit. Always records undo history. In the STUDIO this is a draft: it updates the
	// live preview (the reactive `monitor`) but defers the disk write — and so the desktop
	// overlays — until Save (manual-save model). Cross-monitor moves (`extra`) are queued for the
	// next Save. On an overlay it persists immediately (the original auto-save behaviour).
	function saveLayout(extra?: { key: string; leaf: Leaf }) {
		recordHistory(); // snapshot this committed edit for undo (no-op if nothing changed)
		if (studio) {
			if (extra) pendingExtras = [...pendingExtras, extra];
			return; // `dirty` is derived from the baseline; persistence waits for commitSave()
		}
		return persistToDisk(extra ? [extra] : []);
	}

	// Write the current layout to widgets.json (the only place that touches disk). `extras` append
	// floating leaves to OTHER monitors' saved layouts (cross-monitor moves), merged in one write.
	async function persistToDisk(extras: { key: string; leaf: Leaf }[] = []) {
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
		for (const extra of extras) {
			if (extra.key === myMonitor) continue;
			const t = monitors[extra.key] ?? { root: emptyRoot(), floating: [] };
			monitors[extra.key] = { root: t.root, floating: [...(t.floating ?? []), extra.leaf] };
		}
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

	// --- manual save (studio, item 3): draft / live-preview with explicit Save + Cancel ---

	// The last-persisted snapshot. `dirty` is derived by comparing the live editor state to it;
	// Cancel reverts to it. Captured on load and after every Save. (Studio-only; overlays auto-save.)
	type Baseline = {
		monitor: MonitorLayout;
		library: Library | undefined;
		theme: string;
		tokens: Record<string, string>;
	};
	let savedBaseline: Baseline | null = null;
	let pendingExtras: { key: string; leaf: Leaf }[] = [];
	// Immutable edits reassign these to new objects, so reference inequality = unsaved change.
	// `monitor` is skipped while editing a def (it's swapped for the scoped tree); def changes
	// still surface as a `library` difference.
	$: dirty =
		studio &&
		savedBaseline != null &&
		((!editingDefId && monitor !== savedBaseline.monitor) ||
			library !== savedBaseline.library ||
			selectedTheme !== savedBaseline.theme ||
			tokenOverrides !== savedBaseline.tokens ||
			pendingExtras.length > 0);

	function setBaseline() {
		savedBaseline = { monitor, library, theme: selectedTheme, tokens: tokenOverrides };
	}

	async function commitSave() {
		if (!studio) return;
		await persistToDisk(pendingExtras);
		pendingExtras = [];
		setBaseline(); // the live state is now the saved state → dirty clears
	}

	function cancelEdits() {
		if (!studio || !dirty || !savedBaseline) return;
		if (!window.confirm('Discard all unsaved changes since the last save?')) return;
		monitor = savedBaseline.monitor;
		library = savedBaseline.library;
		selectedTheme = savedBaseline.theme;
		tokenOverrides = savedBaseline.tokens;
		pendingExtras = [];
		editingDefId = null; // drop out of any def edit too
		savedMonitor = null;
		selectedId = null;
		selectedIds = [];
		applyTheme();
		resetHistory();
	}

	function onSelect(event: CustomEvent<{ id: string }>) {
		selectedId = event.detail.id;
		selectedIds = [event.detail.id]; // a plain click collapses any marquee selection
	}

	// --- marquee multi-select (item 3): drag on empty canvas to rubber-band a selection ---

	// A canvas-space point → world-space (undo pan + zoom); world is where `solved`/renderable
	// rects live. Mirrors toWorld() but starts from already-canvas-relative coords.
	function canvasToWorld(cx: number, cy: number): { x: number; y: number } {
		return { x: (cx - panX) / zoom, y: (cy - panY) / zoom };
	}

	function onCanvasMouseDown(event: MouseEvent) {
		if (!editMode || event.button !== 0) return;
		// Start a marquee only on the empty background. The `.canvas` and `.world` layers are the
		// only background elements with pointer events; widgets (.widget), the tool bars/rails and
		// menus all have their own pointer-events, and the frame/bounds/cells are pointer-events:none
		// (clicks pass through them to `.world`). So a positive whitelist cleanly excludes the chrome.
		const t = event.target as HTMLElement | null;
		if (!t || !(t.classList.contains('canvas') || t.classList.contains('world'))) return;
		const p = toCanvas(event.clientX, event.clientY);
		marqueeStart = p;
		marquee = { x: p.x, y: p.y, w: 0, h: 0 };
		marqueeAdditive = event.shiftKey;
		if (!marqueeAdditive) {
			selectedId = null;
			selectedIds = [];
		}
		window.addEventListener('mousemove', onMarqueeMove);
		window.addEventListener('mouseup', onMarqueeUp);
	}

	function onMarqueeMove(event: MouseEvent) {
		if (!marqueeStart) return;
		const p = toCanvas(event.clientX, event.clientY);
		marquee = {
			x: Math.min(p.x, marqueeStart.x),
			y: Math.min(p.y, marqueeStart.y),
			w: Math.abs(p.x - marqueeStart.x),
			h: Math.abs(p.y - marqueeStart.y)
		};
	}

	function onMarqueeUp() {
		window.removeEventListener('mousemove', onMarqueeMove);
		window.removeEventListener('mouseup', onMarqueeUp);
		const m = marquee;
		marquee = null;
		marqueeStart = null;
		if (!m || (m.w < 3 && m.h < 3)) return; // a click, not a drag → leave selection as cleared
		// Convert the canvas-space band to world space and collect every movable widget it covers
		// (by selectId, so a group counts once even though it renders several primitives).
		const a = canvasToWorld(m.x, m.y);
		const b = canvasToWorld(m.x + m.w, m.y + m.h);
		const box: Rect = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
		const hits = renderables.filter((r) => r.movable && rectsIntersect(r.rect, box));
		const ids = new Set(marqueeAdditive ? selectedIds : []);
		for (const r of hits) ids.add(r.selectId);
		selectedIds = [...ids];
		selectedId = selectedIds[selectedIds.length - 1] ?? null;
		lastPrimary = selectedId; // mark as already-synced so the reactive keeps the multi-selection
	}

	// Translate every selected FLOATING widget by (dx, dy) in world px (flow widgets are placed
	// by the solver and can't be freely moved). Primitives carry x/y in their rect; group leaves
	// carry it in config.x/y (see floatingLeafFrom). Does NOT save — callers decide when to commit.
	function translateSelectedFloating(dx: number, dy: number): boolean {
		const ids = new Set(selectedIds.length ? selectedIds : selectedId ? [selectedId] : []);
		if (!ids.size || (dx === 0 && dy === 0)) return false;
		let changed = false;
		monitor = {
			...monitor,
			floating: monitor.floating.map((l) => {
				if (!ids.has(l.id)) return l;
				changed = true;
				if (isGroup(l.unit)) {
					const g = l.unit;
					const gx = typeof g.config?.x === 'number' ? g.config.x : 0;
					const gy = typeof g.config?.y === 'number' ? g.config.y : 0;
					return leaf({ ...g, config: { ...(g.config ?? {}), x: gx + dx, y: gy + dy } });
				}
				const u = l.unit as WidgetInstance;
				return leaf({ ...u, rect: { ...u.rect, x: u.rect.x + dx, y: u.rect.y + dy } });
			})
		};
		return changed;
	}

	// Delete every selected widget (multi-delete). One saveLayout → one undo step.
	function deleteSelected() {
		const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
		if (!ids.length) return;
		for (const id of ids) {
			monitor = monitor.floating.some((l) => l.id === id)
				? { ...monitor, floating: monitor.floating.filter((l) => l.id !== id) }
				: { ...monitor, root: removeNode(monitor.root, id) };
		}
		selectedId = null;
		selectedIds = [];
		saveLayout();
	}

	// --- right-click context menu (5d, in-editor) ---
	function onWidgetContextMenu(event: CustomEvent<{ id: string; x: number; y: number }>) {
		menu = { x: event.detail.x, y: event.detail.y, id: event.detail.id };
	}
	function onCanvasContextMenu(event: MouseEvent) {
		if (!editMode) return;
		event.preventDefault();
		// Target the deepest container under the cursor (studio) so split acts on THAT cell/pane;
		// the root stays the '__canvas__' sentinel (handled specially by menuNode).
		const id = studio ? containerAt(toWorld(event.clientX, event.clientY)) : monitor.root.id;
		menu = { x: event.clientX, y: event.clientY, id: id === monitor.root.id ? '__canvas__' : id };
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
	// Split the targeted container (or the root, via the '__canvas__' sentinel) in two.
	const mSplit = (dir: 'rows' | 'cols' | 'grid') =>
		menu && menuAct({ op: 'split', id: menu.id === '__canvas__' ? monitor.root.id : menu.id, dir });
	function mEditDef() {
		const d = menuGroup?.def;
		if (d) menuAct({ op: 'editDef', defId: d });
	}
	function mMoveToMonitor(key: string) {
		if (menu) moveNodeToMonitor(menu.id, key);
		menu = null;
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
			case 'split':
				splitNode(op.id, op.dir);
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
			case 'dropWidget':
				dropWidgetInto(op.containerId, op.widgetType);
				break;
			case 'reparent':
				reparentNode(op.id, op.containerId);
				break;
		}
		saveLayout();
	}

	// Outline DnD: a palette widget dropped onto a container row → new flow leaf inside it.
	function dropWidgetInto(containerId: string, widgetType: string) {
		const id = `${widgetType}-${rand()}`;
		monitor = {
			...monitor,
			root: insertChild(monitor.root, containerId, leaf(createWidget(widgetType, id)))
		};
		selectedId = id;
	}

	// Outline DnD: move an existing node (flow or floating) into a container (at its end).
	function reparentNode(id: string, containerId: string) {
		if (id === containerId) return;
		const node = findNode(monitor.root, id);
		// Never move a container into its own descendant (would orphan the subtree).
		if (node && isContainer(node) && findNode(node, containerId)) return;
		const fl = monitor.floating.find((l) => l.id === id);
		if (fl) {
			monitor = {
				...monitor,
				floating: monitor.floating.filter((l) => l.id !== id),
				root: insertChild(monitor.root, containerId, fl)
			};
		} else {
			monitor = { ...monitor, root: moveNode(monitor.root, id, containerId) };
		}
		selectedId = id;
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
		// A new pane claims available space (basis fr:1 fills the parent's main axis; align
		// stretch fills the cross axis) so it's immediately visible to drop into, rather than
		// collapsing to its (zero) intrinsic size while empty. A grid is pre-populated with one
		// container per CELL (default 2×2) so EVERY cell is an independent drop target — you can
		// drop into any cell, in any order, not just the next dense slot.
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
		const parentId = selectedContainer?.id ?? monitor.root.id;
		let root = insertChild(monitor.root, parentId, c);
		// The new pane's WIDTH is the parent's cross axis, set by the parent's `align`. A
		// saved/older parent may be 'start' (panes left-aligned at intrinsic = 0 width), so
		// force the parent to stretch its children — the pane then fills the available width.
		root = updateContainer(root, parentId, { align: 'stretch' });
		monitor = { ...monitor, root };
		selectedId = id;
	}

	// Split a container (cell/pane) into two regions (item 1): 'rows' → a col (stacked), 'cols' →
	// a row (side by side), 'grid' → a 2×2 grid. Existing content is kept as the first region (so
	// nothing is lost); an empty target becomes two empty cells. The new empty region is selected.
	function splitNode(id: string, dir: 'rows' | 'cols' | 'grid') {
		const node = findNode(monitor.root, id);
		if (!node || !isContainer(node)) return;
		const cell = () => container(`cell-${rand()}`, 'col', [], { align: 'stretch' });
		// Wrap the node's current children into a single cell, preserving their own layout.
		const keep = node.children.length
			? container(`cell-${rand()}`, node.kind, node.children, {
					align: node.align ?? 'stretch',
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
			const kind: Container['kind'] = dir === 'rows' ? 'col' : 'row';
			patch = {
				kind,
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
		monitor = { ...monitor, root: updateNode(monitor.root, id, () => patched) };
		const kids = patched.children;
		selectedId = (keep ? kids[kids.length - 1] : kids[0]).id;
	}

	// The deepest (smallest-area) flow container under a WORLD point, or the root id if over open
	// space. Lets a right-click on a specific grid cell/pane target THAT node (to split it).
	function containerAt(world: { x: number; y: number }): string {
		let bestId = monitor.root.id;
		let bestArea = Infinity;
		for (const c of containerRects) {
			const r = c.rect;
			if (world.x < r.x || world.x >= r.x + r.w || world.y < r.y || world.y >= r.y + r.h) continue;
			const area = r.w * r.h;
			if (area < bestArea) {
				bestArea = area;
				bestId = c.id;
			}
		}
		return bestId;
	}

	// Insert a built-in template's widgets into the floating layer (a draft edit — preview, then
	// Save or Cancel/undo). Template ids are remapped to unique ones so a preset can be inserted
	// more than once. The inserted widgets become the selection (drag them as a group to reposition).
	function applyTemplate(id: string) {
		const t = getTemplate(id);
		if (!t) return;
		const leaves = t.widgets().map((u) => leaf({ ...u, id: `${u.type}-${rand()}` }));
		if (!leaves.length) return;
		monitor = { ...monitor, floating: [...monitor.floating, ...leaves] };
		selectedIds = leaves.map((l) => l.id);
		selectedId = leaves[leaves.length - 1].id;
		lastPrimary = selectedId; // keep the multi-selection (see syncSelectionPrimary)
		saveLayout();
	}

	function removeById(id: string) {
		monitor = monitor.floating.some((l) => l.id === id)
			? { ...monitor, floating: monitor.floating.filter((l) => l.id !== id) }
			: { ...monitor, root: removeNode(monitor.root, id) };
		if (selectedId === id) selectedId = null;
		if (selectedIds.includes(id)) selectedIds = selectedIds.filter((s) => s !== id);
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
		const node = lookup(id, monitor);
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

	// Item 4: start the widget designer on a brand-new, empty widget def. Creates the def
	// (an empty stretchy container) + a floating instance so it persists in the layout, then
	// enters the def editor. "Done" (def-banner) returns to the layout designer.
	function newWidget() {
		const defId = `def-${rand()}`;
		const def: WidgetDef = {
			id: defId,
			name: `widget-${rand()}`,
			size: { w: 200, h: 120 },
			child: container(`${defId}__root`, 'col', [], { align: 'stretch' })
		};
		library = { version: library?.version ?? 1, defs: [...(library?.defs ?? []), def] };
		const grpId = `grp-${rand()}`;
		const g = group(grpId, def.size, clone(def.child), {
			def: defId,
			name: def.name,
			config: { x: 24, y: 24 }
		});
		monitor = { ...monitor, floating: [...monitor.floating, leaf(g)] };
		enterDefEdit(defId);
	}

	// Item 4: re-open the widget designer on an existing def (from the studio's Widgets menu).
	function editExistingDef(defId: string) {
		if (defId) handleOp({ op: 'editDef', defId });
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
		resetHistory(); // undo within the def editor is scoped to the def tree
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
		resetHistory(); // back on the real monitor; undo doesn't reach into the def session
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
	// Build a floating leaf from a primitive/group leaf at `(x,y)`, carrying its solved size.
	function floatingLeafFrom(node: Leaf, x: number, y: number, r?: Rect): Leaf {
		if (!isGroup(node.unit)) {
			const u = node.unit;
			return leaf({ ...u, rect: { x, y, w: r?.w ?? u.rect.w, h: r?.h ?? u.rect.h } });
		}
		const g = node.unit;
		return leaf({ ...g, config: { ...(g.config ?? {}), x, y } });
	}

	function floatNode(id: string, at?: { x: number; y: number }) {
		const node = findNode(monitor.root, id);
		if (!node || !isLeaf(node)) return;
		const r = solved.get(id);
		const lf = floatingLeafFrom(node, at?.x ?? r?.x ?? 0, at?.y ?? r?.y ?? 0, r);
		monitor = {
			...monitor,
			root: removeNode(monitor.root, id),
			floating: [...monitor.floating, lf]
		};
		selectedId = id;
	}

	// Move a widget/group to ANOTHER monitor's layout (studio): drop it from this monitor and
	// append it as a floating leaf (at its current position) to the target's saved layout.
	async function moveNodeToMonitor(id: string, targetKey: string) {
		if (targetKey === myMonitor) return;
		const node = lookup(id, monitor);
		if (!node || !isLeaf(node)) return; // leaves/groups only (not whole containers)
		const r = solved.get(id);
		const moved = floatingLeafFrom(node, r?.x ?? 24, r?.y ?? 24, r);
		removeById(id);
		selectedId = null;
		await saveLayout({ key: targetKey, leaf: moved });
	}
</script>

<svelte:window on:keydown={onKeydown} on:resize={updateWorkArea} />

<div
	class="canvas"
	class:edit={editMode}
	class:studio
	bind:this={canvasEl}
	bind:clientWidth={stageW}
	bind:clientHeight={stageH}
	on:contextmenu={onCanvasContextMenu}
	on:mousedown={onCanvasMouseDown}
	on:wheel={onWheel}
>
	<StyleLayer css={styleCss} />
	<!-- The "world" layer: in the studio it is sized to the real monitor and scaled/panned to
	     fit the stage (zoom-to-fit); in the overlay it fills the canvas 1:1 (identity). -->
	<div class="world" class:scaled={studio} style={worldStyle}>
		{#if studio}
			<!-- The monitor's work-area frame + nested pane outlines, drawn behind the widgets
			     so the layout structure is visible in the designer. Non-interactive. -->
			<div
				class="monitor-frame"
				style="left: {workArea.x}px; top: {workArea.y}px; width: {workArea.w}px; height: {workArea.h}px"
			/>
			{#each containerRects as c (c.id)}
				{#if c.id !== monitor.root.id}
					<div
						class="cbound"
						class:csel={c.id === selectedId}
						style="left: {c.rect.x}px; top: {c.rect.y}px; width: {c.rect.w}px; height: {c.rect.h}px"
					>
						<span class="ctag">{c.kind}</span>
					</div>
				{/if}
			{/each}
			{#each gridPlaceholders as cell, i (i)}
				<div
					class="grid-cell"
					style="left: {cell.x}px; top: {cell.y}px; width: {cell.w}px; height: {cell.h}px"
				/>
			{/each}
		{/if}
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
				selected={r.selectId === selectedId || selectedSet.has(r.selectId)}
				grid={GRID}
				scale={studio ? zoom : 1}
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
			{#if dropZone}
				<div
					class="dropzone"
					style="left: {dropZone.x}px; top: {dropZone.y}px; width: {dropZone.w}px; height: {dropZone.h}px"
				/>
			{/if}
		{/if}
	</div>
	<!-- Rubber-band selection rectangle (item 3), in canvas-space so its border stays 1px
	     regardless of zoom. Drawn above the world layer. -->
	{#if marquee}
		<div
			class="marquee"
			style="left: {marquee.x}px; top: {marquee.y}px; width: {marquee.w}px; height: {marquee.h}px"
		/>
	{/if}
	{#if editMode}
		{#if studio}
			<div class="studio-bar">
				<span class="lbl">Studio</span>
				<select on:change={(e) => switchMonitor(e.currentTarget.value)}>
					{#each monitorOptions as o (o.key)}
						<option value={o.key} selected={o.key === myMonitor}>{o.label}</option>
					{/each}
				</select>
				<span class="lbl">File</span>
				<button
					type="button"
					class="save"
					class:hot={dirty}
					title="Save to disk — applies to the desktop overlays (Ctrl+S)"
					disabled={!dirty}
					on:click={commitSave}>{dirty ? '● Save' : 'Saved'}</button
				>
				<button
					type="button"
					title="Discard unsaved changes"
					disabled={!dirty}
					on:click={cancelEdits}>Cancel</button
				>
				<span class="lbl">Edit</span>
				<button type="button" title="Undo (Ctrl+Z)" disabled={!canUndo} on:click={undo}
					>↶ Undo</button
				>
				<button type="button" title="Redo (Ctrl+Y)" disabled={!canRedo} on:click={redo}
					>↷ Redo</button
				>
				<span class="lbl">Zoom</span>
				<button type="button" on:click={fit}>Fit</button>
				<span class="zlevel">{Math.round(zoom * 100)}%</span>
				<span class="lbl">Widgets</span>
				<button type="button" on:click={newWidget}>＋ New</button>
				{#if library?.defs.length}
					<select on:change={(e) => editExistingDef(e.currentTarget.value)}>
						<option value="">Edit…</option>
						{#each library.defs as d (d.id)}
							<option value={d.id}>{d.name}</option>
						{/each}
					</select>
				{/if}
				<span class="lbl">Template</span>
				<select
					title="Insert a preset cluster of widgets (preview; Save to keep)"
					on:change={(e) => {
						applyTemplate(e.currentTarget.value);
						e.currentTarget.value = '';
					}}
				>
					<option value="">Insert…</option>
					{#each TEMPLATES as t (t.id)}
						<option value={t.id} title={t.description}>{t.name}</option>
					{/each}
				</select>
				<span class="lbl">Theme</span>
				<select on:change={(e) => setTheme(e.currentTarget.value)}>
					<option value="" selected={selectedTheme === ''}>(default)</option>
					{#each themeList as t (t)}
						<option value={t} selected={t === selectedTheme}>{t}</option>
					{/each}
				</select>
				<button type="button" on:click={openThemeEditor}>Edit</button>
			</div>
			<div class="monitor-badge">▦ {monName}</div>
		{/if}
		{#if themeEditorOpen}
			<div class="theme-editor">
				<div class="te-hd">
					Theme editor
					<button type="button" class="te-close" on:click={() => (themeEditorOpen = false)}
						>✕</button
					>
				</div>
				<label class="te-name">
					name
					<input bind:value={themeDraftName} placeholder="my-theme" />
				</label>
				<textarea
					class="te-css"
					bind:value={themeDraft}
					spellcheck="false"
					placeholder={':root {\n\t--np-accent: #77c4d3;\n\t--np-fg: #ffffff;\n}'}
				/>
				<div class="te-actions">
					<button type="button" on:click={saveThemeEditor}>Save & apply</button>
				</div>
			</div>
		{/if}
		{#if dragHint}
			<div class="drag-hint" style="left: {dragHint.x}px; top: {dragHint.y}px">
				{dragHint.text}
			</div>
		{/if}
		{#if editingDefId}
			<div class="def-banner">
				Editing widget: {editingDefName}
				<button type="button" on:click={() => handleOp({ op: 'endDefEdit' })}>Done</button>
			</div>
		{/if}
		{#if !studio}
			<div class="edit-badge">EDIT — Ctrl+E to exit</div>
		{/if}
		<Outline
			root={monitor.root}
			floating={monitor.floating}
			{selectedId}
			docked={studio}
			on:op={(e) => handleOp(e.detail)}
		/>
		<Inspector
			widget={selectedWidget}
			container={selectedContainer}
			groupUnit={selectedGroup}
			def={selectedDef}
			defs={library?.defs ?? []}
			tokens={tokenOverrides}
			{baseWidget}
			{baseContainer}
			{baseGroup}
			baseTokens={savedBaseline?.tokens ?? null}
			{nodeIsNew}
			{placement}
			{widgetTypes}
			{configFields}
			{sensors}
			docked={studio}
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
					<span class="ctx-hd">Split</span>
					<button type="button" on:click={() => mSplit('rows')}>⬍ Into rows</button>
					<button type="button" on:click={() => mSplit('cols')}>⬌ Into columns</button>
					<button type="button" on:click={() => mSplit('grid')}>▦ Into 2×2 grid</button>
				{/if}
				{#if studio && menuLeaf && monitorOptions.length > 1}
					<div class="ctx-sep" />
					<span class="ctx-hd">Move to</span>
					{#each monitorOptions.filter((o) => o.key !== myMonitor) as o (o.key)}
						<button type="button" on:click={() => mMoveToMonitor(o.key)}>→ {o.name}</button>
					{/each}
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
		overflow: hidden; /* clip stray/edge widgets instead of scrolling (overlay + studio) */
	}

	.canvas.edit {
		pointer-events: auto;
	}

	/* Studio: a normal opaque window (not a transparent desktop overlay). The canvas is the
	   inset STAGE between the tool rails — the top bar, left rail (Outline) and right rail
	   (Inspector) live in the reserved margins (fixed), so the tools never overlap widgets.
	   The rail/bar sizes are shared with the docked panels via these custom properties. */
	.canvas.studio {
		--bar-h: 36px;
		--rail-l: 250px;
		--rail-r: 264px;
		background: #0b0b0e;
		top: var(--bar-h);
		left: var(--rail-l);
		right: var(--rail-r);
		bottom: 0;
		overflow: hidden; /* clip the zoomed world to the stage (don't spill over the rails) */
	}

	/* The world layer (zoom-to-fit). Overlay: fills the canvas 1:1. Studio (.scaled): sized to
	   the monitor, transformed from the top-left by the inline transform. */
	.world {
		position: absolute;
		inset: 0;
		transform-origin: 0 0;
	}

	.world.scaled {
		inset: auto;
		left: 0;
		top: 0;
	}

	/* The monitor's work-area frame + nested pane outlines (designer only). */
	.monitor-frame {
		position: absolute;
		border: 1px solid rgba(119, 196, 211, 0.55);
		pointer-events: none;
	}

	.cbound {
		position: absolute;
		border: 1px dashed rgba(218, 237, 226, 0.35);
		pointer-events: none;
	}

	.cbound.csel {
		border-color: rgba(119, 196, 211, 0.9);
		border-style: solid;
	}

	.cbound .ctag {
		position: absolute;
		top: 0;
		left: 0;
		padding: 0 3px;
		font-family: monospace;
		font-size: 9px;
		line-height: 1.5;
		color: rgba(218, 237, 226, 0.7);
		background: rgba(10, 10, 12, 0.55);
	}

	/* Empty grid cells: faint dashed boxes showing where the next widgets will land. */
	.grid-cell {
		position: absolute;
		box-sizing: border-box;
		border: 1px dashed rgba(119, 196, 211, 0.25);
		pointer-events: none;
	}

	/* Highlight a container the drag will drop INTO (e.g. an empty grid). */
	.dropzone {
		position: absolute;
		box-sizing: border-box;
		border: 1px solid rgb(119, 196, 211);
		background: rgba(119, 196, 211, 0.12);
		pointer-events: none;
		z-index: 3;
	}

	.guide {
		position: absolute;
		background: rgba(119, 196, 211, 0.4);
		pointer-events: none;
		z-index: 2;
	}

	.drag-hint {
		position: absolute;
		transform: translate(12px, 12px);
		padding: 2px 6px;
		font-family: monospace;
		font-size: 10px;
		color: #0b0b0b;
		background: rgba(218, 237, 226, 0.95);
		border-radius: 3px;
		pointer-events: none;
		white-space: nowrap;
		z-index: 8;
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

	/* Rubber-band selection rectangle (item 3). Above the world/widgets, below the tool bars. */
	.marquee {
		position: absolute;
		box-sizing: border-box;
		border: 1px dashed rgb(119, 196, 211);
		background: rgba(119, 196, 211, 0.1);
		pointer-events: none;
		z-index: 6;
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

	.ctx-sep {
		height: 1px;
		margin: 3px 4px;
		background: #333;
	}

	.ctx-hd {
		padding: 1px 8px;
		font-family: monospace;
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 1px;
		color: rgb(119, 196, 211);
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

	/* The studio's full-width top bar (in the reserved margin above the stage). */
	.studio-bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: var(--bar-h, 36px);
		box-sizing: border-box;
		display: flex;
		gap: 8px;
		align-items: center;
		padding: 0 10px;
		background: rgba(10, 10, 12, 0.95);
		border-bottom: 1px solid rgba(119, 196, 211, 0.5);
		color: #eee;
		font-family: monospace;
		font-size: 11px;
		pointer-events: auto;
		z-index: 7;
	}

	.studio-bar .lbl {
		color: rgb(119, 196, 211);
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.studio-bar .zlevel {
		min-width: 34px;
		text-align: right;
		color: #ccc;
	}

	/* Which physical monitor this stage is editing (screen-space, top-left of the stage). */
	.monitor-badge {
		position: absolute;
		top: 6px;
		left: 6px;
		padding: 2px 7px;
		font-family: monospace;
		font-size: 10px;
		letter-spacing: 0.5px;
		color: rgb(119, 196, 211);
		background: rgba(10, 10, 12, 0.7);
		border: 1px solid rgba(119, 196, 211, 0.4);
		border-radius: 3px;
		pointer-events: none;
		z-index: 5;
	}

	.studio-bar select,
	.studio-bar button {
		background: #1a1a1e;
		color: #eee;
		border: 1px solid #333;
		font-family: monospace;
		font-size: 11px;
		padding: 2px 6px;
		cursor: pointer;
	}

	.studio-bar button:hover {
		border-color: rgb(119, 196, 211);
	}

	.studio-bar button:disabled {
		opacity: 0.4;
		cursor: default;
		border-color: #333;
	}

	/* Save glows while there are unsaved changes; disabled (= "Saved") when clean. */
	.studio-bar button.save.hot {
		border-color: rgb(119, 196, 211);
		color: rgb(170, 230, 240);
		background: rgba(119, 196, 211, 0.18);
		opacity: 1;
	}

	/* Item 5: the theme editor panel (a floating modal over the stage). */
	.theme-editor {
		position: fixed;
		top: calc(var(--bar-h, 36px) + 16px);
		right: calc(var(--rail-r, 264px) + 16px);
		width: 320px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		background: rgba(12, 12, 16, 0.98);
		border: 1px solid rgba(119, 196, 211, 0.6);
		border-radius: 4px;
		color: #eee;
		font-family: monospace;
		font-size: 11px;
		pointer-events: auto;
		z-index: 11;
	}

	.theme-editor .te-hd {
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: rgb(119, 196, 211);
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.theme-editor .te-close {
		background: transparent;
		border: none;
		color: #aaa;
		cursor: pointer;
		font-size: 12px;
	}

	.theme-editor .te-name {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.theme-editor input,
	.theme-editor textarea {
		background: #1a1a1e;
		color: #eee;
		border: 1px solid #333;
		font-family: monospace;
		font-size: 11px;
		padding: 4px;
	}

	.theme-editor .te-css {
		height: 200px;
		resize: vertical;
		white-space: pre;
	}

	.theme-editor .te-actions {
		display: flex;
		justify-content: flex-end;
	}

	.theme-editor .te-actions button {
		background: rgb(119, 196, 211);
		color: #07181c;
		border: none;
		border-radius: 3px;
		padding: 4px 10px;
		cursor: pointer;
		font-family: monospace;
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
