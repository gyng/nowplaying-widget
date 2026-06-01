<script lang="ts">
	// Canvas (organism): owns the telemetry hub, wires the backend source, and lays
	// out widget instances. Loads the saved widgets.json on mount (Phase 3a); the
	// hardcoded list below is the fallback/demo default until a layout is saved.
	import { onDestroy, onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
	import { createTelemetryHub } from '../core/telemetry';
	import { startTelemetrySource } from '../telemetry/source';
	import {
		DEFAULT_MONITOR,
		WIDGET_TYPES,
		createWidget,
		defaultLayout,
		parseLayout,
		type Layout,
		type WidgetInstance
	} from '../core/layout';
	import WidgetHost from './WidgetHost.svelte';
	import Inspector from './Inspector.svelte';
	import { snapRectToPeers } from '../core/align';
	import { sensorCatalog } from '../core/sensors';
	import {
		fillCurrentMonitor,
		monitorParam,
		setClickThrough,
		spawnSecondaryOverlays,
		syncInteractiveRects
	} from '../overlay';

	// This window's monitor key: ?monitor=<i> on secondary overlays, else the primary
	// key on main. Widgets are filtered/saved per monitor so windows don't clobber each
	// other.
	const myMonitor = monitorParam() ?? DEFAULT_MONITOR;

	// A small row of per-core CPU sparklines (the System skin's centrepiece). A full
	// configurable grid arrives with the Phase 3 editor; this proves the per-core pipe.
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

	// The demo layout seeds the primary monitor only; secondaries start empty.
	export let widgets: WidgetInstance[] = monitorParam() ? [] : DEMO_WIDGETS;

	const hub = createTelemetryHub();
	let unlisten: UnlistenFn | undefined;
	let unlistenLayout: UnlistenFn | undefined;
	let unlistenEdit: UnlistenFn | undefined;

	async function reloadLayout() {
		try {
			const raw = await invoke<string | null>('load_layout');
			const saved = raw ? parseLayout(JSON.parse(raw)) : null;
			const monitor = saved?.monitors[myMonitor];
			if (monitor) {
				widgets = monitor.widgets;
			}
		} catch (err) {
			console.warn('load_layout failed; using default layout', err);
		}
	}

	onMount(async () => {
		unlisten = await startTelemetrySource(hub);
		await reloadLayout();
		// Live-reload external edits to widgets.json (ignored while actively editing).
		unlistenLayout = await listen('layout_changed', () => {
			if (!editMode) reloadLayout().then(syncRects);
		});
		// The primary window fills its monitor and opens overlays on the others.
		if (!monitorParam()) {
			await fillCurrentMonitor();
			await spawnSecondaryOverlays();
		}
		await setClickThrough(true);
		syncRects();
		unlistenEdit = await listen('toggle_edit', () => setEdit(!editMode));
	});

	onDestroy(() => {
		unlisten?.();
		unlistenLayout?.();
		unlistenEdit?.();
	});

	// Edit mode: tray "Edit layout" toggles it (or Ctrl+E while the window is focused).
	// Entering edit mode disables click-through so you can drag/resize/use the inspector.
	let editMode = false;
	let selectedId: string | null = null;
	const GRID = 8;
	const ALIGN_THRESHOLD = 6;
	let guideXs: number[] = [];
	let guideYs: number[] = [];

	$: selectedWidget = widgets.find((w) => w.id === selectedId) ?? null;
	$: sensors = sensorCatalog(selectedWidget ? hub.sensorIds() : []);

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
		syncInteractiveRects(widgets, editMode).catch((err) =>
			console.warn('set_interactive_rects failed', err)
		);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.ctrlKey && event.key.toLowerCase() === 'e') {
			event.preventDefault();
			// Broadcast so every monitor's overlay toggles together, not just this one.
			emit('toggle_edit');
		}
	}

	function onChange(event: CustomEvent<{ id: string; rect: WidgetInstance['rect'] }>) {
		const { id, rect } = event.detail;
		const peers = widgets.filter((w) => w.id !== id).map((w) => w.rect);
		const snapped = snapRectToPeers(rect, peers, ALIGN_THRESHOLD);
		guideXs = snapped.guideXs;
		guideYs = snapped.guideYs;
		widgets = widgets.map((w) => (w.id === id ? { ...w, rect: snapped.rect } : w));
	}

	function onCommit() {
		guideXs = [];
		guideYs = [];
		saveLayout();
	}

	async function saveLayout() {
		let layout: Layout;
		try {
			const raw = await invoke<string | null>('load_layout');
			layout = (raw ? parseLayout(JSON.parse(raw)) : null) ?? defaultLayout();
		} catch {
			layout = defaultLayout();
		}
		// Update only this monitor's widgets so other monitors aren't clobbered.
		layout.monitors[myMonitor] = { widgets };
		try {
			await invoke('save_layout', { contents: JSON.stringify(layout, null, 2) });
		} catch (err) {
			console.warn('save_layout failed', err);
		}
	}

	function onSelect(event: CustomEvent<{ id: string }>) {
		selectedId = event.detail.id;
	}

	function onUpdate(event: CustomEvent<Partial<WidgetInstance>>) {
		if (!selectedId) return;
		const patch = event.detail;
		widgets = widgets.map((w) => (w.id === selectedId ? { ...w, ...patch } : w));
		saveLayout();
	}

	function onRemove() {
		widgets = widgets.filter((w) => w.id !== selectedId);
		selectedId = null;
		saveLayout();
	}

	function onAdd(event: CustomEvent<{ type: string }>) {
		const { type } = event.detail;
		const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
		widgets = [...widgets, createWidget(type, id)];
		selectedId = id;
		saveLayout();
	}
</script>

<svelte:window on:keydown={onKeydown} />

<div class="canvas" class:edit={editMode}>
	{#each widgets as widget (widget.id)}
		<WidgetHost
			{hub}
			instance={widget}
			{editMode}
			selected={widget.id === selectedId}
			grid={GRID}
			on:change={onChange}
			on:commit={onCommit}
			on:select={onSelect}
		/>
	{/each}
	{#if editMode}
		{#each guideXs as gx (gx)}
			<div class="guide v" style="left: {gx}px" />
		{/each}
		{#each guideYs as gy (gy)}
			<div class="guide h" style="top: {gy}px" />
		{/each}
		<div class="edit-badge">EDIT — Ctrl+E to exit</div>
		<Inspector
			widget={selectedWidget}
			types={WIDGET_TYPES}
			{sensors}
			on:update={onUpdate}
			on:remove={onRemove}
			on:add={onAdd}
		/>
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
