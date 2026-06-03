// Canvas (organism): owns the telemetry hub, wires the backend source, and lays out this
// monitor's widgets. Holds the versioned v2 MonitorLayout (an in-flow root tree + a floating
// layer) in the editor model (useEditorModel); persists/loads widgets.json as v2 via parseLayoutAny.
// The solver (solveMonitor) positions the flow tree; floating widgets are free-moved. Edit mode
// shows the Outline (structure) + Inspector (props) which funnel every change through handleOp →
// core/layoutEdit. React port of Canvas.svelte (behaviour parity is paramount).
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ChangeEvent
} from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createTelemetryHub } from '../core/telemetry';
import { sourceCatalogIds } from '../core/plugin';
import '../telemetry/source'; // side-effect: registers the built-in `system` source
import './plugins/home-assistant'; // side-effect: registers the Home Assistant plugin
import { DEFAULT_MONITOR, type Rect, type WidgetInstance } from '../core/layout';
import {
	emptyRoot,
	isContainer,
	isGroup,
	isLeaf,
	leaf,
	monitorHasWidgets,
	type Container,
	type Group,
	type Leaf,
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
	type Renderable,
	solveMonitor
} from '../core/solve';
import { assembleStyles } from '../core/style';
import { DEFAULT_TOKENS, firstFontFamily, tokensToCss } from '../core/tokens';
import { TEMPLATES } from '../core/templates';
import {
	dropTarget,
	findNode,
	findParent,
	flowLeaves,
	insertChild,
	moveNode,
	removeNode,
	type Drop
} from '../core/layoutEdit';
import WidgetHost from './WidgetHost';
import Inspector from './Inspector';
import Outline from './Outline';
import StyleLayer from './StyleLayer';
import { paletteItems } from './registry';
import type { LayoutOp } from './ops';
import { snapRectToPeers } from '../core/align';
import { sensorCatalog } from '../core/sensors';
import { getMeta } from '../core/widget';
import {
	ensureFont,
	listThemes,
	loadThemeCss,
	saveThemeCss,
	monitorParam,
	monitorWorkArea,
	openDevtools,
	reconcileOverlays,
	setClickThrough,
	setMainWindowVisible,
	syncInteractiveRects
} from '../overlay';
import { TelemetryHubContext } from './telemetryContext';
import { useEditorModel, lookup, setSolvedForFloat, editHelpers } from './canvas/useEditorModel';
import { usePersistence } from './canvas/usePersistence';
import { useStageSize } from './canvas/useStageSize';
import { useZoomFit } from './canvas/useZoomFit';
import { useCanvasPointer } from './canvas/useCanvasPointer';
import { useKeyboard } from './canvas/useKeyboard';
import { clampMenuToViewport } from './canvas/menuPosition';
import { studioHints } from './canvas/studioHints';
import { useStudioInit } from './canvas/useStudioInit';
import type { EditorState, Extra, MonitorOption } from './canvas/types';
import './Canvas.css';

type Props = { studio?: boolean };

const GRID = 8;
const ALIGN_THRESHOLD = 6;
// Docked-panel selector: a palette-widget drop over any of these is the panel's own (e.g. the
// Outline's container drop), so the stage-level drop handler bails on it.
const PANEL_SEL = '.outline, .inspector, .studio-bar, .powerbar, .theme-editor, .ctx';
const rand = (): string => Math.random().toString(36).slice(2, 8);

// The demo seed (primary monitor only): a row of per-core CPU sparklines + a System-skin cluster.
function buildDemoWidgets(): WidgetInstance[] {
	const cores: WidgetInstance[] = Array.from({ length: 4 }, (_, i) => ({
		id: `core-${i}`,
		type: 'sparkline',
		sensor: `cpu.core.${i}`,
		rect: { x: 16 + i * 40, y: 280, w: 36, h: 26 },
		config: { min: 0, max: 100 }
	}));
	return [
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
}

export default function Canvas({ studio = false }: Props) {
	// The widget palette (built-ins + any registered plugin widgets), with labels (8a). Computed once.
	const widgetTypes = useMemo(() => paletteItems(), []);

	// Stable telemetry hub (item 5): one per Canvas, provided via Context (replaces setContext).
	const hub = useRef(createTelemetryHub()).current;

	// This window's monitor key. In the studio this is switchable.
	const [myMonitor, setMyMonitor] = useState<string>(() => monitorParam() ?? DEFAULT_MONITOR);
	const [monitorOptions, setMonitorOptions] = useState<MonitorOption[]>([]);

	// The seed floating layer (demo on the primary, empty on secondaries). Computed once.
	const seedFloating = useMemo<Leaf[]>(
		() => (monitorParam() ? [] : buildDemoWidgets()).map((w) => leaf(w)),
		[]
	);

	const model = useEditorModel(studio, seedFloating);
	const { state, dispatch, handleOp, commitOp, mutateNoSave } = model;
	const {
		monitor,
		library,
		selectedId,
		selectedIds,
		selectedTheme,
		tokenOverrides,
		editingDefId,
		defEditBaseline,
		savedBaseline,
		undoStack,
		redoStack,
		pendingExtras,
		saveSeq
	} = state;

	// Theme css + list (the CSS is a side-effect of selectedTheme; held in component state).
	const [themeCss, setThemeCss] = useState('');
	const [themeList, setThemeList] = useState<string[]>([]);

	// Edit mode (tray "Edit layout" / Ctrl+E). Entering disables click-through.
	const [editMode, setEditMode] = useState(false);

	// Cross-highlight (studio): the id currently hovered in EITHER the Outline tree or on the stage.
	// Hovering a tree row glows the matching widget/container; hovering a widget glows its tree row.
	const [hoverId, setHoverId] = useState<string | null>(null);

	const persistence = usePersistence(state, myMonitor);
	const { persistToDisk, writeBaseline, schedulePreviewWrite, clearPreviewWrite } = persistence;

	// The work area this overlay lays its flow tree into (logical px). Set on mount + resize.
	const [workArea, setWorkArea] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });

	// The editor stage + zoom-to-fit.
	const { ref: canvasRef, stageW, stageH } = useStageSize();

	// The selected monitor's logical size (the world dimensions); falls back until loaded.
	const monSel = useMemo(
		() => monitorOptions.find((o) => o.key === myMonitor),
		[monitorOptions, myMonitor]
	);
	const monSize = useMemo(
		() => (monSel ? { w: monSel.w, h: monSel.h } : { w: 1920, h: 1080 }),
		[monSel]
	);
	const monName = monSel?.name ?? '';

	const { panX, panY, zoom, setPan, fit } = useZoomFit({
		studio,
		myMonitor,
		monSize,
		stageW,
		stageH,
		canvasRef
	});

	const worldStyle: React.CSSProperties = studio
		? {
				width: `${monSize.w}px`,
				height: `${monSize.h}px`,
				transform: `translate(${panX}px,${panY}px) scale(${zoom})`
		  }
		: {};

	// Studio lays out into the real monitor work area; the overlay uses the actual work area.
	useEffect(() => {
		if (studio) setWorkArea({ x: 0, y: 0, w: monSize.w, h: monSize.h });
	}, [studio, monSize.w, monSize.h]);

	const updateWorkArea = useCallback(async () => {
		if (studio) return; // the effect above owns the studio work area
		const wa = await monitorWorkArea();
		setWorkArea(wa ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
	}, [studio]);

	// --- derived layout (pure) ---
	const solved = useMemo(
		() => solveMonitor(monitor, workArea, library),
		[monitor, workArea, library]
	);
	// floatNode (via handleOp) reads the live solved map; keep the module ref current.
	setSolvedForFloat(solved);
	const renderables = useMemo(
		() => collectRenderables(monitor, solved, library),
		[monitor, solved, library]
	);
	const containerRects = useMemo(
		() => (studio ? collectContainerRects(monitor, solved) : []),
		[studio, monitor, solved]
	);
	const gridPlaceholders = useMemo(
		() => (studio ? collectGridPlaceholders(monitor, solved) : []),
		[studio, monitor, solved]
	);

	const tokenCss = useMemo(
		() => (Object.keys(tokenOverrides).length ? tokensToCss(tokenOverrides) : ''),
		[tokenOverrides]
	);
	const styleCss = useMemo(
		() =>
			assembleStyles({
				themeCss: [themeCss, tokenCss].filter(Boolean).join('\n'),
				library,
				monitor
			}),
		[themeCss, tokenCss, library, monitor]
	);

	// Load whatever font families the body/display tokens resolve to (ensureFont is idempotent).
	useEffect(() => {
		const families = new Set(
			[
				tokenOverrides['--np-font-display'] ?? DEFAULT_TOKENS['--np-font-display'],
				tokenOverrides['--np-font'] ?? DEFAULT_TOKENS['--np-font']
			]
				.map(firstFontFamily)
				.filter((f): f is string => !!f)
		);
		for (const family of families) ensureFont(family);
	}, [tokenOverrides]);

	// --- selection-derived state ---
	const selectedNode = useMemo(
		() => (selectedId ? lookup(selectedId, monitor) : null),
		[selectedId, monitor]
	);
	const selectedContainer = selectedNode && isContainer(selectedNode) ? selectedNode : null;
	const isGridCell = !!(
		selectedContainer && findParent(monitor.root, selectedContainer.id)?.kind === 'grid'
	);
	const selectedWidget =
		selectedNode && isLeaf(selectedNode) && !isGroup(selectedNode.unit)
			? (selectedNode.unit as WidgetInstance)
			: null;
	const selectedGroup =
		selectedNode && isLeaf(selectedNode) && isGroup(selectedNode.unit)
			? (selectedNode.unit as Group)
			: null;
	const selectedDef = useMemo((): WidgetDef | null => {
		const dId = selectedGroup?.def;
		if (!dId || !library) return null;
		return library.defs.find((d) => d.id === dId) ?? null;
	}, [selectedGroup, library]);

	// Manual-save baseline diff (item 2): the selected node as it was at the last save.
	const baseNode = useMemo(
		() =>
			studio && savedBaseline && selectedId ? lookup(selectedId, savedBaseline.monitor) : null,
		[studio, savedBaseline, selectedId]
	);
	const baseWidget =
		baseNode && isLeaf(baseNode) && !isGroup(baseNode.unit)
			? (baseNode.unit as WidgetInstance)
			: null;
	const baseContainer = baseNode && isContainer(baseNode) ? baseNode : null;
	const baseGroup =
		baseNode && isLeaf(baseNode) && isGroup(baseNode.unit) ? (baseNode.unit as Group) : null;
	const nodeIsNew = !!(studio && savedBaseline && selectedId && selectedNode && !baseNode);

	const editingDefName =
		editingDefId && library
			? library.defs.find((d) => d.id === editingDefId)?.name ?? editingDefId
			: '';

	const placement = useMemo<'flow' | 'floating' | null>(() => {
		if (selectedId === null) return null;
		if (monitor.floating.some((l) => l.id === selectedId)) return 'floating';
		if (findNode(monitor.root, selectedId)) return 'flow';
		return null;
	}, [selectedId, monitor]);

	const sensors = useMemo(
		() => sensorCatalog(selectedWidget ? [...hub.sensorIds(), ...sourceCatalogIds()] : []),
		[selectedWidget, hub]
	);
	const configFields = useMemo(
		() => (selectedWidget ? getMeta(selectedWidget.type)?.configFields ?? [] : []),
		[selectedWidget]
	);

	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

	const canUndo = undoStack.length > 0;
	const canRedo = redoStack.length > 0;

	// dirty (item 2): immutable edits reassign these to new objects, so reference inequality = unsaved.
	const dirty =
		studio &&
		savedBaseline != null &&
		((!editingDefId && monitor !== savedBaseline.monitor) ||
			// While editing a def, `monitor` is the scoped tree; it's dirty once it diverges from the
			// def-edit baseline (so Save / Ctrl+S work mid-def-edit, as in Svelte).
			(editingDefId != null && defEditBaseline != null && monitor !== defEditBaseline) ||
			library !== savedBaseline.library ||
			selectedTheme !== savedBaseline.theme ||
			tokenOverrides !== savedBaseline.tokens ||
			pendingExtras.length > 0);

	// --- interactive rects (passive click-through) ---
	const interactiveItems = useCallback(
		(): { rect: Rect; interactive?: boolean }[] =>
			renderables.map((r) => ({ rect: r.rect, interactive: r.instance.interactive })),
		[renderables]
	);
	// Latest values for callbacks that run outside the render (listeners / async).
	const interactiveItemsRef = useRef(interactiveItems);
	interactiveItemsRef.current = interactiveItems;
	const editModeRef = useRef(editMode);
	editModeRef.current = editMode;

	const syncRects = useCallback(() => {
		syncInteractiveRects(interactiveItemsRef.current(), editModeRef.current).catch((err) =>
			console.warn('set_interactive_rects failed', err)
		);
	}, []);

	// --- theme ---
	const applyTheme = useCallback(async () => {
		setThemeCss(await loadThemeCss(stateThemeRef.current));
	}, []);
	// applyTheme reads the latest selectedTheme via a ref (it's called from listeners + after sets).
	const stateThemeRef = useRef(selectedTheme);
	stateThemeRef.current = selectedTheme;

	// --- the save chokepoint bridge (saveLayout): the reducer bumps saveSeq on each commit; here we
	// run the studio/overlay branch. Cross-monitor extras are queued in the reducer's pendingExtras
	// (set by moveNodeToMonitor before the commit), so the studio preview write omits them. ---
	const firstSave = useRef(true);
	useEffect(() => {
		if (firstSave.current) {
			firstSave.current = false;
			return; // saveSeq starts at 0; don't write on mount
		}
		if (studio) {
			schedulePreviewWrite();
		} else {
			persistToDisk([]);
		}
	}, [saveSeq, studio, schedulePreviewWrite, persistToDisk]);

	// --- reloadLayout ---
	const reloadLayout = useCallback(async () => {
		const myMon = myMonitorRef.current;
		// historyReady=false up front (before the awaits) so neither the load nor any interim commit
		// is recorded as an edit (mirrors Svelte's first line). resetHistory below re-baselines.
		dispatch({ type: 'patch', patch: { historyReady: false } });
		const patch: Partial<EditorState> = {};
		let nextTheme: string | null = null;
		try {
			const raw = await invoke<string | null>('load_layout');
			const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
			const saved = obj ? parseLayoutAny(obj) : null;
			const mon = saved?.monitors[myMon];
			if (mon) patch.monitor = mon;
			const lib = obj?.library;
			if (lib && typeof lib === 'object' && Array.isArray((lib as { defs?: unknown }).defs)) {
				patch.library = lib as Library;
			}
			const t = obj?.theme;
			if (typeof t === 'string' && t !== stateThemeRef.current) {
				patch.selectedTheme = t;
				nextTheme = t;
			}
			const tk = obj?.tokens;
			patch.tokenOverrides =
				tk && typeof tk === 'object' && !Array.isArray(tk) ? (tk as Record<string, string>) : {};
		} catch (err) {
			console.warn('load_layout failed; using default layout', err);
		}
		// historyReady=false during the load + interim awaits; clear pendingExtras; reset history;
		// set baseline — all folded into one dispatch so the loaded layout is the committed baseline.
		dispatch({ type: 'load', patch: { ...patch, historyReady: false, pendingExtras: [] } });
		// Write the loaded monitor into the ref synchronously so syncPrimaryOverlays (called right after
		// reloadLayout during init, before React commits the dispatch) decides primary-window
		// visibility from the post-load monitor — deterministic, like Svelte's synchronous `monitor = mon`.
		if (patch.monitor) monitorRef.current = patch.monitor;
		// Apply the theme css for the new selectedTheme (side-effect), then re-baseline + reset history.
		if (nextTheme !== null) {
			stateThemeRef.current = nextTheme;
			setThemeCss(await loadThemeCss(nextTheme));
		}
		dispatch({ type: 'resetHistory' });
		dispatch({ type: 'setBaseline' });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dispatch]);
	// myMonitor latest, for reloadLayout/persist reading inside listeners.
	const myMonitorRef = useRef(myMonitor);
	myMonitorRef.current = myMonitor;

	// --- syncPrimaryOverlays (primary main window only) ---
	const monitorRef = useRef(monitor);
	monitorRef.current = monitor;
	const syncPrimaryOverlays = useCallback(async () => {
		await reconcileOverlays();
		await setMainWindowVisible(monitorHasWidgets(monitorRef.current));
	}, []);

	// --- init (mount effect, non-idempotent) ---
	useStudioInit({
		studio,
		hub,
		updateWorkArea,
		reloadLayout,
		editMode: () => editModeRef.current,
		syncRects,
		syncPrimaryOverlays,
		applyTheme,
		setThemeList,
		setEdit: (v) => setEdit(v),
		setEditModeImmediate: () => {
			// studio: editMode=true with no click-through round-trip. Set the ref too so the
			// layout_changed guard (always-edit studio skips auto-reload) sees it without a render lag.
			editModeRef.current = true;
			setEditMode(true);
		},
		setMonitorOptions,
		clearPreviewWrite
	});

	// resize → updateWorkArea (svelte:window on:resize).
	useEffect(() => {
		const onResize = () => updateWorkArea();
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, [updateWorkArea]);

	// --- setEdit ---
	const setEdit = useCallback(
		async (value: boolean) => {
			setEditMode(value);
			editModeRef.current = value;
			try {
				await setClickThrough(!value);
			} catch (err) {
				console.warn('setIgnoreCursorEvents failed', err);
			}
			syncRects();
		},
		[syncRects]
	);

	// --- selection helpers ---
	const setSelection = useCallback(
		(ids: string[], primary: string | null) => dispatch({ type: 'setSelectedIds', ids, primary }),
		[dispatch]
	);
	const clearSelection = useCallback(
		() => dispatch({ type: 'setSelectedIds', ids: [], primary: null }),
		[dispatch]
	);

	// translateSelectedFloating: mutate (no save). Returns whether anything changed.
	const translateSelectedFloating = useCallback(
		(dx: number, dy: number): boolean => {
			let changed = false;
			mutateNoSave((s) => {
				const ids = new Set(
					s.selectedIds.length ? s.selectedIds : s.selectedId ? [s.selectedId] : []
				);
				if (!ids.size || (dx === 0 && dy === 0)) return {};
				const floating = s.monitor.floating.map((l) => {
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
				});
				if (!changed) return {};
				return { monitor: { ...s.monitor, floating } };
			});
			return changed;
		},
		[mutateNoSave]
	);

	const deleteSelected = useCallback(() => {
		commitOp((s) => {
			const ids = s.selectedIds.length ? s.selectedIds : s.selectedId ? [s.selectedId] : [];
			if (!ids.length) return {};
			let mon = s.monitor;
			for (const id of ids) {
				mon = mon.floating.some((l) => l.id === id)
					? { ...mon, floating: mon.floating.filter((l) => l.id !== id) }
					: { ...mon, root: removeNodeFromTree(mon, id) };
			}
			return { monitor: mon, selectedId: null, selectedIds: [] };
		});
	}, [commitOp]);

	// --- undo/redo/save (used by keyboard + studio bar) ---
	const undo = useCallback(() => dispatch({ type: 'undo' }), [dispatch]);
	const redo = useCallback(() => dispatch({ type: 'redo' }), [dispatch]);

	const commitSave = useCallback(async () => {
		if (!studio) return;
		clearPreviewWrite();
		await persistToDisk(pendingExtrasRef.current);
		dispatch({ type: 'patch', patch: { pendingExtras: [] } });
		dispatch({ type: 'setBaseline' });
	}, [studio, clearPreviewWrite, persistToDisk, dispatch]);
	const pendingExtrasRef = useRef(pendingExtras);
	pendingExtrasRef.current = pendingExtras;

	const savedBaselineRef = useRef(savedBaseline);
	savedBaselineRef.current = savedBaseline;
	// Restore the editor AND the on-disk layout to the saved baseline, reverting the live preview.
	// We write the baseline values DIRECTLY (writeBaseline) rather than via persistToDisk because
	// the reducer's revert set lags a render — the disk write must use the baseline immediately.
	const revertDraftToDisk = useCallback(async () => {
		if (!savedBaselineRef.current) return;
		const b = savedBaselineRef.current;
		dispatch({ type: 'revertToBaseline' });
		clearPreviewWrite();
		await writeBaseline(b, myMonitorRef.current);
	}, [dispatch, clearPreviewWrite, writeBaseline]);

	const cancelEdits = useCallback(async () => {
		if (!studio || !dirtyRef.current || !savedBaselineRef.current) return;
		if (!window.confirm('Discard all unsaved changes since the last save?')) return;
		// drop out of any def edit too, clear selection, revert, re-apply theme, reset history.
		dispatch({
			type: 'patch',
			patch: { editingDefId: null, savedMonitor: null, selectedId: null, selectedIds: [] }
		});
		await revertDraftToDisk();
		applyTheme();
		dispatch({ type: 'resetHistory' });
	}, [studio, dispatch, revertDraftToDisk, applyTheme]);
	const dirtyRef = useRef(dirty);
	dirtyRef.current = dirty;

	// --- theme actions ---
	const setTheme = useCallback(
		(name: string) => {
			dispatch({ type: 'setTheme', name });
			stateThemeRef.current = name;
			loadThemeCss(name).then(setThemeCss);
			// saveLayout(): theme-only change → commit (history no-op, triggers a write).
			commitOp(() => ({}));
		},
		[dispatch, commitOp]
	);

	// Theme editor (item 5).
	const [themeEditorOpen, setThemeEditorOpen] = useState(false);
	const [themeDraft, setThemeDraft] = useState('');
	const [themeDraftName, setThemeDraftName] = useState('');
	const openThemeEditor = useCallback(async () => {
		setThemeDraftName(selectedTheme || 'custom');
		setThemeDraft(
			selectedTheme
				? await loadThemeCss(selectedTheme)
				: ':root {\n\t--np-accent: #77c4d3;\n\t--np-fg: #ffffff;\n}\n'
		);
		setThemeEditorOpen(true);
	}, [selectedTheme]);
	const saveThemeEditor = useCallback(async () => {
		const name = themeDraftName.trim();
		if (!name) return;
		await saveThemeCss(name, themeDraft);
		setThemeList(await listThemes());
		dispatch({ type: 'setTheme', name });
		stateThemeRef.current = name;
		setThemeCss(await loadThemeCss(name));
		commitOp(() => ({})); // saveLayout()
		setThemeEditorOpen(false);
	}, [themeDraftName, themeDraft, dispatch, commitOp]);

	// --- studio: switch monitor ---
	const switchMonitor = useCallback(
		async (key: string) => {
			if (key === myMonitorRef.current) return;
			if (dirtyRef.current) {
				if (!window.confirm('Discard unsaved changes to this monitor and switch?')) return;
				await revertDraftToDisk();
			}
			setMyMonitor(key);
			myMonitorRef.current = key;
			dispatch({ type: 'patch', patch: { selectedId: null, selectedIds: [] } });
			setMenu(null);
			dispatch({ type: 'replaceMonitor', monitor: { root: emptyRoot(), floating: [] } });
			await reloadLayout();
		},
		[dispatch, revertDraftToDisk, reloadLayout]
	);

	// --- def editor entry points (studio bar) ---
	// Create a brand-new empty def + a floating instance, then enter the def editor (one dispatch).
	const newWidget = useCallback(() => dispatch({ type: 'newWidget' }), [dispatch]);

	const editExistingDef = useCallback(
		(defId: string) => {
			if (defId) handleOp({ op: 'editDef', defId });
		},
		[handleOp]
	);

	const applyTemplate = useCallback(
		(id: string) => {
			commitOp((s) => {
				const t = editHelpers.getTemplate(id);
				if (!t) return {};
				const leaves = t.widgets().map((u) => leaf({ ...u, id: `${u.type}-${rand()}` }));
				if (!leaves.length) return {};
				return {
					monitor: { ...s.monitor, floating: [...s.monitor.floating, ...leaves] },
					selectedIds: leaves.map((l) => l.id),
					selectedId: leaves[leaves.length - 1].id
				};
			});
		},
		[commitOp]
	);

	// =========================================================================================
	// Drag / drop (WidgetHost callbacks). These are transient — onChange mutates without saving;
	// onCommit/onDrop commit (saveLayout). The drop-indicator / hint / guides are local UI state.
	// =========================================================================================
	const [guideXs, setGuideXs] = useState<number[]>([]);
	const [guideYs, setGuideYs] = useState<number[]>([]);
	const [dropIntoFlow, setDropIntoFlow] = useState(true);
	const [dropIntoCells, setDropIntoCells] = useState(false);
	const [dropBar, setDropBar] = useState<Rect | null>(null);
	const [dropZone, setDropZone] = useState<Rect | null>(null);
	const [dragHint, setDragHint] = useState<{ x: number; y: number; text: string } | null>(null);
	// dropIndicator + draggingId are bookkeeping read synchronously across dragover→commit; refs.
	const dropIndicatorRef = useRef<Drop | null>(null);
	const draggingIdRef = useRef<string | null>(null);

	// canvas / world coordinate transforms (port LITERALLY).
	const toCanvas = useCallback(
		(x: number, y: number): { x: number; y: number } => {
			const el = canvasRef.current;
			if (!el) return { x, y };
			const r = el.getBoundingClientRect();
			return { x: x - r.left, y: y - r.top };
		},
		[canvasRef]
	);
	const panRef = useRef({ panX, panY, zoom });
	panRef.current = { panX, panY, zoom };
	const toWorld = useCallback(
		(x: number, y: number): { x: number; y: number } => {
			const el = canvasRef.current;
			if (!el) return { x, y };
			const r = el.getBoundingClientRect();
			const p = panRef.current;
			return { x: (x - r.left - p.panX) / p.zoom, y: (y - r.top - p.panY) / p.zoom };
		},
		[canvasRef]
	);

	// Latest live values for the drag math (read synchronously — no stale closure).
	const solvedRef = useRef(solved);
	solvedRef.current = solved;
	const renderablesRef = useRef(renderables);
	renderablesRef.current = renderables;
	const monitorForDragRef = useRef(monitor);
	monitorForDragRef.current = monitor;
	const selectedIdsRef = useRef(selectedIds);
	selectedIdsRef.current = selectedIds;

	const computeDropBar = useCallback(
		(p: { x: number; y: number }, dragging: string): Rect | null => {
			const mon = monitorForDragRef.current;
			const sol = solvedRef.current;
			for (const lf of flowLeaves(mon.root)) {
				if (lf.id === dragging) continue;
				const r = sol.get(lf.id);
				if (!r) continue;
				if (p.x < r.x || p.x >= r.x + r.w || p.y < r.y || p.y >= r.y + r.h) continue;
				const parent = findParent(mon.root, lf.id);
				if (!parent) continue;
				if (parent.kind === 'col') {
					const after = p.y >= r.y + r.h / 2;
					return { x: r.x, y: (after ? r.y + r.h : r.y) - 1, w: r.w, h: 2 };
				}
				const after = p.x >= r.x + r.w / 2;
				return { x: (after ? r.x + r.w : r.x) - 1, y: r.y, w: 2, h: r.h };
			}
			return null;
		},
		[]
	);

	const computeDropZone = useCallback((drop: Drop | null, bar: Rect | null): Rect | null => {
		if (!drop || bar) return null;
		const mon = monitorForDragRef.current;
		const box = solvedRef.current.get(drop.parentId);
		if (!box) return null;
		const parent = findNode(mon.root, drop.parentId);
		if (parent && isContainer(parent) && parent.kind === 'grid') {
			return gridCellRects(parent, box)[drop.index] ?? box;
		}
		return box;
	}, []);

	const onChange = useCallback(
		(e: { id: string; rect: WidgetInstance['rect'] }) => {
			const { id, rect } = e;
			const mon = monitorForDragRef.current;
			const selIds = selectedIdsRef.current;
			// Group move (item 3): translate the whole multi-selection by the per-frame delta.
			if (selIds.length > 1 && selIds.includes(id)) {
				const cur = mon.floating.find((l) => l.id === id);
				const curRect = cur && !isGroup(cur.unit) ? (cur.unit as WidgetInstance).rect : null;
				if (curRect) {
					setGuideXs([]);
					setGuideYs([]);
					translateSelectedFloating(rect.x - curRect.x, rect.y - curRect.y);
					return;
				}
			}
			const peers = renderablesRef.current
				.filter((r) => r.movable && r.id !== id)
				.map((r) => r.rect);
			const snapped = snapRectToPeers(rect, peers, ALIGN_THRESHOLD);
			setGuideXs(snapped.guideXs);
			setGuideYs(snapped.guideYs);
			mutateNoSave((s) => patchFloating(s, id, { rect: snapped.rect }));
		},
		[translateSelectedFloating, mutateNoSave]
	);

	const onCommit = useCallback(() => {
		setGuideXs([]);
		setGuideYs([]);
		setDragHint(null);
		const dropIndicator = dropIndicatorRef.current;
		const draggingId = draggingIdRef.current;
		// A floating widget released over the flow tree docks into that slot.
		if (dropIndicator && draggingId) {
			const id = draggingId;
			commitOp((s) => {
				const lf = s.monitor.floating.find((l) => l.id === id);
				if (!lf) return {};
				const floating = s.monitor.floating.filter((l) => l.id !== id);
				const root = dropIndicator.merge
					? editHelpers.wrapLeafWith(s.monitor.root, dropIndicator.merge, id, lf)
					: insertChild(s.monitor.root, dropIndicator.parentId, lf, dropIndicator.index);
				return { monitor: { ...s.monitor, floating, root }, selectedId: id };
			});
		} else {
			commitOp(() => ({})); // saveLayout() (no dock) — commit the drag's onChange edits
		}
		dropIndicatorRef.current = null;
		setDropBar(null);
		setDropZone(null);
		draggingIdRef.current = null;
	}, [commitOp]);

	const onDragOver = useCallback(
		(e: { id: string; x: number; y: number }) => {
			const { id } = e;
			const w = toWorld(e.x, e.y);
			const c = toCanvas(e.x, e.y);
			draggingIdRef.current = id;
			const mon = monitorForDragRef.current;
			const allowDock = !mon.floating.some((l) => l.id === id) || dropIntoFlowRef.current;
			const drop = allowDock
				? dropTarget(mon.root, solvedRef.current, w, id, dropIntoCellsRef.current)
				: null;
			dropIndicatorRef.current = drop;
			const bar = !drop || drop.into || drop.merge ? null : computeDropBar(w, id);
			setDropBar(bar);
			setDropZone(computeDropZone(drop, bar));
			if (drop) {
				const parent = findNode(mon.root, drop.parentId);
				const kind = parent && isContainer(parent) ? parent.kind : 'flow';
				setDragHint({ x: c.x, y: c.y, text: `▦ into ${kind}` });
			} else {
				const lf = mon.floating.find((l) => l.id === id);
				const pos = lf && !isGroup(lf.unit) ? (lf.unit as WidgetInstance).rect : null;
				const px = Math.round(pos ? pos.x : w.x);
				const py = Math.round(pos ? pos.y : w.y);
				setDragHint({ x: c.x, y: c.y, text: `⊕ float · ${px}, ${py}` });
			}
		},
		[toWorld, toCanvas, computeDropBar, computeDropZone]
	);
	const dropIntoFlowRef = useRef(dropIntoFlow);
	dropIntoFlowRef.current = dropIntoFlow;
	const dropIntoCellsRef = useRef(dropIntoCells);
	dropIntoCellsRef.current = dropIntoCells;

	const onDrop = useCallback(
		(e: { id: string; x: number; y: number }) => {
			const { id } = e;
			const { x, y } = toWorld(e.x, e.y);
			dropIndicatorRef.current = null;
			setDropBar(null);
			setDropZone(null);
			draggingIdRef.current = null;
			setDragHint(null);
			commitOp((s) => {
				const drop = dropTarget(
					s.monitor.root,
					solvedRef.current,
					{ x, y },
					id,
					dropIntoCellsRef.current
				);
				if (drop?.merge) {
					const dragged = findNode(s.monitor.root, id);
					if (dragged)
						return {
							monitor: {
								...s.monitor,
								root: editHelpers.wrapLeafWith(s.monitor.root, drop.merge, id, dragged)
							},
							selectedId: id
						};
					return { selectedId: id };
				} else if (drop) {
					return {
						monitor: {
							...s.monitor,
							root: moveNode(s.monitor.root, id, drop.parentId, drop.index)
						},
						selectedId: id
					};
				}
				// float at the cursor (floatNode reads the live solved map via setSolvedForFloat).
				const node = findNode(s.monitor.root, id);
				if (!node || !isLeaf(node)) return { selectedId: id };
				const r = solvedRef.current.get(id);
				const lf = editHelpers.floatingLeafFrom(node, x, y, r);
				return {
					monitor: {
						...s.monitor,
						root: removeNodeFromTree(s.monitor, id),
						floating: [...s.monitor.floating, lf]
					},
					selectedId: id
				};
			});
		},
		[toWorld, commitOp]
	);

	const onSelect = useCallback(
		(e: { id: string }) => dispatch({ type: 'selectClick', id: e.id }),
		[dispatch]
	);

	// A plugin widget asked to actuate (HA light toggle). Side-effecting Tauri call lives here.
	const onWidgetControl = useCallback(
		async (e: { id: string; sensor?: string; domain: string; service: string }) => {
			const { sensor, domain, service } = e;
			if (!sensor || !sensor.startsWith('ha.')) return;
			const entity_id = sensor.slice('ha.'.length);
			try {
				await invoke('ha_call_service', { domain, service, data: { entity_id } });
			} catch {
				// Non-fatal: the next state_changed telemetry tick reconciles the widget anyway.
			}
		},
		[]
	);

	// =========================================================================================
	// Context menu (5d).
	// =========================================================================================
	const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
	// The menu opens at the cursor but is clamped inside the window so it isn't clipped at the
	// right/bottom edges. We render at the cursor first, then measure the box and shift it back in a
	// layout effect (runs before paint → no visible jump). Reset when the menu closes.
	const ctxRef = useRef<HTMLDivElement | null>(null);
	const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
	useLayoutEffect(() => {
		if (!menu) {
			setMenuPos(null);
			return;
		}
		const el = ctxRef.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		setMenuPos(
			clampMenuToViewport(menu.x, menu.y, r.width, r.height, window.innerWidth, window.innerHeight)
		);
	}, [menu]);

	const widgetsAt = useCallback((world: { x: number; y: number }): Renderable[] => {
		const rs = renderablesRef.current;
		const seen = new Set<string>();
		const out: Renderable[] = [];
		for (let i = rs.length - 1; i >= 0; i--) {
			const r = rs[i];
			const b = r.rect;
			if (world.x < b.x || world.x >= b.x + b.w || world.y < b.y || world.y >= b.y + b.h) continue;
			if (seen.has(r.selectId)) continue;
			seen.add(r.selectId);
			out.push(r);
		}
		return out;
	}, []);

	const containerAt = useCallback((world: { x: number; y: number }): string => {
		const mon = monitorForDragRef.current;
		let bestId = mon.root.id;
		let bestArea = Infinity;
		for (const c of containerRectsRef.current) {
			const r = c.rect;
			if (world.x < r.x || world.x >= r.x + r.w || world.y < r.y || world.y >= r.y + r.h) continue;
			const area = r.w * r.h;
			if (area < bestArea) {
				bestArea = area;
				bestId = c.id;
			}
		}
		return bestId;
	}, []);
	const containerRectsRef = useRef(containerRects);
	containerRectsRef.current = containerRects;

	// menu-derived state.
	const menuNode = menu
		? menu.id === '__canvas__'
			? monitor.root
			: lookup(menu.id, monitor)
		: null;
	const menuLeaf = menuNode && isLeaf(menuNode) ? menuNode : null;
	const menuGroup = menuLeaf && isGroup(menuLeaf.unit) ? (menuLeaf.unit as Group) : null;
	const menuId = menu?.id ?? null;
	const menuFloating = menuId !== null && monitor.floating.some((l) => l.id === menuId);
	const menuCanCollapse =
		menuNode !== null && isContainer(menuNode) && menuNode.children.some(isContainer);
	const menuParentId =
		menuId && menuId !== '__canvas__' ? findParent(monitor.root, menuId)?.id ?? null : null;
	// The right-click stack (5d, item 8): every selectable thing under the cursor — overlapping
	// widgets first (front-to-back), then the containers/grid cells nesting them (smallest first).
	// Picking an entry re-points the menu at it, so you can act on a widget OR any container around it.
	const menuStack = useMemo<{ id: string; label: string }[]>(() => {
		if (!menu || !studio) return [];
		const world = toWorld(menu.x, menu.y);
		const widgets = widgetsAt(world).map((r) => ({
			id: r.selectId,
			label: `${r.instance.type} · ${r.selectId}`
		}));
		const rootId = monitorForDragRef.current.root.id;
		const containers = containerRectsRef.current
			.filter(
				(c) =>
					c.id !== rootId &&
					world.x >= c.rect.x &&
					world.x < c.rect.x + c.rect.w &&
					world.y >= c.rect.y &&
					world.y < c.rect.y + c.rect.h
			)
			.sort((a, b) => a.rect.w * a.rect.h - b.rect.w * b.rect.h)
			.map((c) => ({ id: c.id, label: `▦ ${c.kind} · ${c.id}` }));
		return [...widgets, ...containers];
	}, [menu, studio, widgetsAt, toWorld]);

	const onWidgetContextMenu = useCallback((e: { id: string; x: number; y: number }) => {
		setMenu({ x: e.x, y: e.y, id: e.id });
	}, []);
	const onCanvasContextMenu = useCallback(
		(event: React.MouseEvent) => {
			if (!editModeRef.current) return;
			event.preventDefault();
			const mon = monitorForDragRef.current;
			const id = studio ? containerAt(toWorld(event.clientX, event.clientY)) : mon.root.id;
			setMenu({ x: event.clientX, y: event.clientY, id: id === mon.root.id ? '__canvas__' : id });
		},
		[studio, containerAt, toWorld]
	);
	// Drag a palette widget (the Inspector "Add" buttons set text/x-widget-type) onto the stage to
	// drop a new floating widget at the cursor (item 7). Drops over a docked rail belong to that
	// panel (the Outline's own dropWidget), so bail when the target is inside one.
	const onCanvasDragOver = useCallback(
		(event: React.DragEvent) => {
			if (!studio || !editModeRef.current) return;
			if (!event.dataTransfer.types.includes('text/x-widget-type')) return;
			if ((event.target as HTMLElement | null)?.closest(PANEL_SEL)) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = 'copy';
		},
		[studio]
	);
	const onCanvasDrop = useCallback(
		(event: React.DragEvent) => {
			if (!studio || !editModeRef.current) return;
			const wt = event.dataTransfer.getData('text/x-widget-type');
			if (!wt || (event.target as HTMLElement | null)?.closest(PANEL_SEL)) return;
			event.preventDefault();
			const { x, y } = toWorld(event.clientX, event.clientY);
			handleOp({ op: 'addWidgetAt', widgetType: wt, x, y });
		},
		[studio, toWorld, handleOp]
	);

	const closeMenu = useCallback(() => setMenu(null), []);
	const menuAct = useCallback(
		(op: LayoutOp) => {
			handleOp(op);
			setMenu(null);
		},
		[handleOp]
	);
	const mPick = useCallback(
		(sel: string) => {
			dispatch({ type: 'selectClick', id: sel });
			setMenu((m) => (m ? { ...m, id: sel } : m));
		},
		[dispatch]
	);
	const mSelectNode = useCallback(
		(id: string | null) => {
			if (!id) return;
			dispatch({ type: 'select', id });
			setMenu(null);
		},
		[dispatch]
	);
	const mEditDef = useCallback(() => {
		const d = menuGroup?.def;
		if (d) menuAct({ op: 'editDef', defId: d });
	}, [menuGroup, menuAct]);

	// Move a widget/group to ANOTHER monitor's layout (studio).
	const moveNodeToMonitor = useCallback(
		async (id: string, targetKey: string) => {
			if (targetKey === myMonitorRef.current) return;
			const s = stateRef.current;
			const node = lookup(id, s.monitor);
			if (!node || !isLeaf(node)) return;
			const r = solvedRef.current.get(id);
			const moved = editHelpers.floatingLeafFrom(node, r?.x ?? 24, r?.y ?? 24, r);
			// removeById(id) + selectedId=null, then saveLayout({key,leaf}) → queue extra + commit.
			const extra: Extra = { key: targetKey, leaf: moved };
			commitOp((cur) => {
				const next = editHelpers.removeById(cur, id);
				return { ...next, selectedId: null, pendingExtras: [...cur.pendingExtras, extra] };
			});
		},
		[commitOp]
	);
	const stateRef = useRef(state);
	stateRef.current = state;

	const mMoveToMonitor = useCallback(
		(key: string) => {
			if (menu) moveNodeToMonitor(menu.id, key);
			setMenu(null);
		},
		[menu, moveNodeToMonitor]
	);

	// --- keyboard ---
	const dirtyKbRef = useRef(dirty);
	dirtyKbRef.current = dirty;
	const { spaceDownRef, spaceDown } = useKeyboard({
		studio,
		editMode: () => editModeRef.current,
		menuOpen: () => menuRef.current !== null,
		closeMenu: () => setMenu(null),
		dirty: () => dirtyKbRef.current,
		commitSave,
		undo,
		redo,
		hasSelection: () => selectedIdsRef.current.length > 0 || selectedIdRef.current !== null,
		deleteSelected,
		nudge: (dx, dy) => {
			// Compute the translate SYNCHRONOUSLY from current refs and commit only when something
			// moved (Svelte: `if (translateSelectedFloating(...)) saveLayout()`). The reducer-deferred
			// `changed` flag of translateSelectedFloating reads stale here, so nudges would never
			// persist/undo — this records exactly one undo step + triggers the save when changed.
			const ids = selectedIdsRef.current.length
				? selectedIdsRef.current
				: selectedIdRef.current
				? [selectedIdRef.current]
				: [];
			const idSet = new Set(ids);
			if (!idSet.size || (dx === 0 && dy === 0)) return;
			let changed = false;
			const floating = monitorRef.current.floating.map((l) => {
				if (!idSet.has(l.id)) return l;
				changed = true;
				if (isGroup(l.unit)) {
					const g = l.unit;
					const gx = typeof g.config?.x === 'number' ? g.config.x : 0;
					const gy = typeof g.config?.y === 'number' ? g.config.y : 0;
					return leaf({ ...g, config: { ...(g.config ?? {}), x: gx + dx, y: gy + dy } });
				}
				const u = l.unit as WidgetInstance;
				return leaf({ ...u, rect: { ...u.rect, x: u.rect.x + dx, y: u.rect.y + dy } });
			});
			if (!changed) return;
			const next = { ...monitorRef.current, floating };
			commitOp(() => ({ monitor: next }));
		}
	});
	const menuRef = useRef(menu);
	menuRef.current = menu;
	const selectedIdRef = useRef(selectedId);
	selectedIdRef.current = selectedId;

	// --- canvas pointer (marquee + pan) ---
	const { marquee, panning, onCanvasMouseDown } = useCanvasPointer({
		editMode,
		studio,
		spaceDown: () => spaceDownRef.current,
		pan: () => panRef.current,
		setPan,
		canvasRef,
		renderables: () => renderablesRef.current,
		selectedIds: () => selectedIdsRef.current,
		setSelection: (ids, primary) => setSelection(ids, primary),
		clearSelection
	});

	// Contextual action hints for the studio's bottom powerline bar (item 2).
	const hasSelection = selectedIds.length > 0 || selectedId !== null;
	const hints = useMemo(
		() => studioHints({ hasSelection, spaceDown, panning }),
		[hasSelection, spaceDown, panning]
	);

	// =========================================================================================
	// Render.
	// =========================================================================================
	const canvasCls = ['canvas'];
	if (editMode) canvasCls.push('edit');
	if (studio) canvasCls.push('studio');
	if (panning) canvasCls.push('panning');
	if (spaceDown) canvasCls.push('panmode');

	return (
		<TelemetryHubContext.Provider value={hub}>
			<div
				className={canvasCls.join(' ')}
				ref={canvasRef}
				onContextMenu={onCanvasContextMenu}
				onMouseDown={onCanvasMouseDown}
				onDragOver={onCanvasDragOver}
				onDrop={onCanvasDrop}
			>
				<StyleLayer css={styleCss} />
				<div className={studio ? 'world scaled' : 'world'} style={worldStyle}>
					{studio && (
						<>
							<div
								className="monitor-frame"
								style={{ left: workArea.x, top: workArea.y, width: workArea.w, height: workArea.h }}
							/>
							{containerRects.map((c) =>
								c.id !== monitor.root.id ? (
									<div
										key={c.id}
										className={['cbound', c.id === selectedId && 'csel', c.id === hoverId && 'chl']
											.filter(Boolean)
											.join(' ')}
										style={{ left: c.rect.x, top: c.rect.y, width: c.rect.w, height: c.rect.h }}
									>
										<span className="ctag">{c.kind}</span>
									</div>
								) : null
							)}
							{gridPlaceholders.map((cell, i) => (
								<div
									key={i}
									className="grid-cell"
									style={{ left: cell.x, top: cell.y, width: cell.w, height: cell.h }}
								/>
							))}
						</>
					)}
					{renderables.map((r) => (
						<WidgetHost
							key={r.id}
							hub={hub}
							instance={r.instance}
							rect={r.rect}
							movable={r.movable}
							selectId={r.selectId}
							domId={r.id}
							defId={r.defId}
							groupId={r.groupId}
							editMode={editMode}
							selected={r.selectId === selectedId || selectedSet.has(r.selectId)}
							highlighted={hoverId !== null && r.selectId === hoverId}
							grid={GRID}
							scale={studio ? zoom : 1}
							onChange={onChange}
							onCommit={onCommit}
							onSelect={onSelect}
							onDragOver={onDragOver}
							onDrop={onDrop}
							onContextMenu={onWidgetContextMenu}
							onControl={onWidgetControl}
							onHover={editMode ? setHoverId : undefined}
						/>
					))}
					{editMode && (
						<>
							{guideXs.map((gx) => (
								<div key={`v${gx}`} className="guide v" style={{ left: gx }} />
							))}
							{guideYs.map((gy) => (
								<div key={`h${gy}`} className="guide h" style={{ top: gy }} />
							))}
							{dropBar && (
								<div
									className="dropbar"
									style={{ left: dropBar.x, top: dropBar.y, width: dropBar.w, height: dropBar.h }}
								/>
							)}
							{dropZone && (
								<div
									className="dropzone"
									style={{
										left: dropZone.x,
										top: dropZone.y,
										width: dropZone.w,
										height: dropZone.h
									}}
								/>
							)}
						</>
					)}
				</div>

				{marquee && (
					<div
						className="marquee"
						style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
					/>
				)}

				{editMode && (
					<>
						{studio && (
							<>
								<div className="studio-bar">
									<span className="lbl">Studio</span>
									<select
										value={myMonitor}
										onChange={(e: ChangeEvent<HTMLSelectElement>) =>
											switchMonitor(e.currentTarget.value)
										}
									>
										{monitorOptions.map((o) => (
											<option key={o.key} value={o.key}>
												{o.label}
											</option>
										))}
									</select>
									<span className="lbl">File</span>
									<button
										type="button"
										className={['save', dirty && 'hot'].filter(Boolean).join(' ')}
										title="Save to disk — applies to the desktop overlays (Ctrl+S)"
										disabled={!dirty}
										onClick={commitSave}
									>
										{dirty ? '● Save' : 'Saved'}
									</button>
									<button
										type="button"
										title="Discard unsaved changes"
										disabled={!dirty}
										onClick={cancelEdits}
									>
										Cancel
									</button>
									<span className="lbl">Edit</span>
									<button type="button" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
										↶ Undo
									</button>
									<button type="button" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
										↷ Redo
									</button>
									<span className="lbl">Drop</span>
									<label
										className="chk"
										title="Let a dragged floating widget dock into the flow / grids"
									>
										<input
											type="checkbox"
											checked={dropIntoFlow}
											onChange={(e) => setDropIntoFlow(e.currentTarget.checked)}
										/>{' '}
										into grids
									</label>
									<label
										className="chk"
										title="Drop into an occupied grid cell's interior (vs before/after)"
									>
										<input
											type="checkbox"
											checked={dropIntoCells}
											onChange={(e) => setDropIntoCells(e.currentTarget.checked)}
										/>{' '}
										into cells
									</label>
									<span className="lbl">Zoom</span>
									<button type="button" onClick={fit}>
										Fit
									</button>
									<span className="zlevel">{Math.round(zoom * 100)}%</span>
									<span className="lbl">Widgets</span>
									<button type="button" onClick={newWidget}>
										＋ New
									</button>
									{library?.defs.length ? (
										<select onChange={(e) => editExistingDef(e.currentTarget.value)}>
											<option value="">Edit…</option>
											{library.defs.map((d) => (
												<option key={d.id} value={d.id}>
													{d.name}
												</option>
											))}
										</select>
									) : null}
									<span className="lbl">Template</span>
									<select
										title="Insert a preset cluster of widgets (preview; Save to keep)"
										value=""
										onChange={(e) => {
											applyTemplate(e.currentTarget.value);
											e.currentTarget.value = '';
										}}
									>
										<option value="">Insert…</option>
										{TEMPLATES.map((t) => (
											<option key={t.id} value={t.id} title={t.description}>
												{t.name}
											</option>
										))}
									</select>
									<span className="lbl">Theme</span>
									<select value={selectedTheme} onChange={(e) => setTheme(e.currentTarget.value)}>
										<option value="">(default)</option>
										{themeList.map((t) => (
											<option key={t} value={t}>
												{t}
											</option>
										))}
									</select>
									<button type="button" onClick={openThemeEditor}>
										Edit
									</button>
								</div>
								<div className="monitor-badge">▦ {monName}</div>
								<div className="powerbar">
									{hints.map((h, i) => (
										<span className="seg" key={i}>
											<kbd>{h.key}</kbd>
											<span className="lbl">{h.label}</span>
										</span>
									))}
								</div>
							</>
						)}
						{themeEditorOpen && (
							<div className="theme-editor">
								<div className="te-hd">
									Theme editor
									<button
										type="button"
										className="te-close"
										onClick={() => setThemeEditorOpen(false)}
									>
										✕
									</button>
								</div>
								<label className="te-name">
									name
									<input
										value={themeDraftName}
										placeholder="my-theme"
										onChange={(e) => setThemeDraftName(e.currentTarget.value)}
									/>
								</label>
								<textarea
									className="te-css"
									value={themeDraft}
									spellCheck={false}
									placeholder={':root {\n\t--np-accent: #77c4d3;\n\t--np-fg: #ffffff;\n}'}
									onChange={(e) => setThemeDraft(e.currentTarget.value)}
								/>
								<div className="te-actions">
									<button type="button" onClick={saveThemeEditor}>
										Save &amp; apply
									</button>
								</div>
							</div>
						)}
						{dragHint && (
							<div className="drag-hint" style={{ left: dragHint.x, top: dragHint.y }}>
								{dragHint.text}
							</div>
						)}
						{editingDefId && (
							<div className="def-banner">
								Editing widget: {editingDefName}
								<button type="button" onClick={() => handleOp({ op: 'endDefEdit' })}>
									Done
								</button>
							</div>
						)}
						{!studio && <div className="edit-badge">EDIT — Ctrl+E to exit</div>}
						<Outline
							root={monitor.root}
							floating={monitor.floating}
							selectedId={selectedId}
							hoverId={hoverId}
							onHover={setHoverId}
							docked={studio}
							onOp={handleOp}
						/>
						<Inspector
							widget={selectedWidget}
							container={selectedContainer}
							groupUnit={selectedGroup}
							def={selectedDef}
							defs={library?.defs ?? []}
							tokens={tokenOverrides}
							baseWidget={baseWidget}
							baseContainer={baseContainer}
							baseGroup={baseGroup}
							baseTokens={savedBaseline?.tokens ?? null}
							nodeIsNew={nodeIsNew}
							isGridCell={isGridCell}
							placement={placement}
							widgetTypes={widgetTypes}
							configFields={configFields}
							sensors={sensors}
							docked={studio}
							onOp={handleOp}
						/>
						{menu && menuNode && (
							<>
								<button
									type="button"
									className="ctx-backdrop"
									aria-label="Close menu"
									onClick={closeMenu}
								/>
								<div
									ref={ctxRef}
									className="ctx"
									style={{ left: menuPos?.left ?? menu.x, top: menuPos?.top ?? menu.y }}
								>
									{menuStack.length > 1 && (
										<>
											<span className="ctx-hd">Select ({menuStack.length})</span>
											{menuStack.map((s) => (
												<button
													key={s.id}
													type="button"
													className={s.id === menu.id ? 'cur' : undefined}
													onClick={() => mPick(s.id)}
												>
													{s.label}
												</button>
											))}
											<div className="ctx-sep" />
										</>
									)}
									{menuGroup ? (
										<>
											{menuGroup.def && (
												<button type="button" onClick={mEditDef}>
													Edit def…
												</button>
											)}
											<button
												type="button"
												onClick={() => menu && menuAct({ op: 'ungroup', id: menu.id })}
											>
												Ungroup
											</button>
											<button
												type="button"
												className="rm"
												onClick={() => menu && menuAct({ op: 'remove', id: menu.id })}
											>
												Remove
											</button>
										</>
									) : menuLeaf ? (
										<>
											<button
												type="button"
												onClick={() => menu && menuAct({ op: 'makeWidget', id: menu.id })}
											>
												Make widget
											</button>
											{menuFloating ? (
												<button
													type="button"
													onClick={() => menu && menuAct({ op: 'dock', id: menu.id })}
												>
													Dock →flow
												</button>
											) : (
												<button
													type="button"
													onClick={() => menu && menuAct({ op: 'float', id: menu.id })}
												>
													Float
												</button>
											)}
											<button
												type="button"
												className="rm"
												onClick={() => menu && menuAct({ op: 'remove', id: menu.id })}
											>
												Remove
											</button>
										</>
									) : (
										<>
											<button
												type="button"
												onClick={() =>
													mSelectNode(menuId === '__canvas__' ? monitor.root.id : menuId)
												}
											>
												◉ Select
											</button>
											{menuParentId && (
												<button type="button" onClick={() => mSelectNode(menuParentId)}>
													◉ Select parent
												</button>
											)}
											<div className="ctx-sep" />
											<span className="ctx-hd">Split</span>
											<button
												type="button"
												onClick={() =>
													menu &&
													menuAct({
														op: 'split',
														id: menu.id === '__canvas__' ? monitor.root.id : menu.id,
														dir: 'rows'
													})
												}
											>
												⬍ Into rows
											</button>
											<button
												type="button"
												onClick={() =>
													menu &&
													menuAct({
														op: 'split',
														id: menu.id === '__canvas__' ? monitor.root.id : menu.id,
														dir: 'cols'
													})
												}
											>
												⬌ Into columns
											</button>
											<button
												type="button"
												onClick={() =>
													menu &&
													menuAct({
														op: 'split',
														id: menu.id === '__canvas__' ? monitor.root.id : menu.id,
														dir: 'grid'
													})
												}
											>
												▦ Into 2×2 grid
											</button>
											{menuCanCollapse && (
												<button
													type="button"
													onClick={() =>
														menu &&
														menuAct({
															op: 'collapse',
															id: menu.id === '__canvas__' ? monitor.root.id : menu.id
														})
													}
												>
													⊟ Collapse cells
												</button>
											)}
										</>
									)}
									{studio && menuLeaf && monitorOptions.length > 1 && (
										<>
											<div className="ctx-sep" />
											<span className="ctx-hd">Move to</span>
											{monitorOptions
												.filter((o) => o.key !== myMonitor)
												.map((o) => (
													<button key={o.key} type="button" onClick={() => mMoveToMonitor(o.key)}>
														→ {o.name}
													</button>
												))}
										</>
									)}
									<div className="ctx-sep" />
									<button
										type="button"
										title="Open the webview inspector for CSS development"
										onClick={() => {
											openDevtools();
											setMenu(null);
										}}
									>
										⧉ Inspect (devtools)
									</button>
								</div>
							</>
						)}
					</>
				)}
			</div>
		</TelemetryHubContext.Provider>
	);
}

// --- small helpers used by the Canvas closures (kept local; not part of the editor model) ---

// patchFloating, used by onChange's mutateNoSave path (mirrors the model helper). Returns a patch.
function patchFloating(
	s: { monitor: MonitorLayout },
	id: string,
	patch: Partial<WidgetInstance>
): Partial<EditorState> {
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

// Remove a node from the flow tree (used by deleteSelected + onDrop's float path).
function removeNodeFromTree(mon: MonitorLayout, id: string): Container {
	return removeNode(mon.root, id);
}
