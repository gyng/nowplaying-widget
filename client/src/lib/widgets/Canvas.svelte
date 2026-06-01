<script lang="ts">
	// Canvas (organism): owns the telemetry hub, wires the backend source, and lays
	// out widget instances. Loads the saved widgets.json on mount (Phase 3a); the
	// hardcoded list below is the fallback/demo default until a layout is saved.
	import { onDestroy, onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { listen, type UnlistenFn } from '@tauri-apps/api/event';
	import { createTelemetryHub } from '../core/telemetry';
	import { startTelemetrySource } from '../telemetry/source';
	import {
		DEFAULT_MONITOR,
		LAYOUT_VERSION,
		WIDGET_TYPES,
		createWidget,
		parseLayout,
		type WidgetInstance
	} from '../core/layout';
	import WidgetHost from './WidgetHost.svelte';
	import Inspector from './Inspector.svelte';

	// A small row of per-core CPU sparklines (the System skin's centrepiece). A full
	// configurable grid arrives with the Phase 3 editor; this proves the per-core pipe.
	const cores: WidgetInstance[] = Array.from({ length: 4 }, (_, i) => ({
		id: `core-${i}`,
		type: 'sparkline',
		sensor: `cpu.core.${i}`,
		rect: { x: 16 + i * 40, y: 280, w: 36, h: 26 },
		config: { min: 0, max: 100 }
	}));

	export let widgets: WidgetInstance[] = [
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
		...cores
	];

	const hub = createTelemetryHub();
	let unlisten: UnlistenFn | undefined;
	let unlistenLayout: UnlistenFn | undefined;

	async function reloadLayout() {
		try {
			const raw = await invoke<string | null>('load_layout');
			const saved = raw ? parseLayout(JSON.parse(raw)) : null;
			const monitor = saved?.monitors[DEFAULT_MONITOR];
			if (monitor && monitor.widgets.length > 0) {
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
			if (!editMode) reloadLayout();
		});
	});

	onDestroy(() => {
		unlisten?.();
		unlistenLayout?.();
	});

	// Edit mode: Ctrl+E toggles; drag/resize widgets and edit them via the inspector.
	let editMode = false;
	let selectedId: string | null = null;
	const GRID = 8;

	$: selectedWidget = widgets.find((w) => w.id === selectedId) ?? null;

	function onKeydown(event: KeyboardEvent) {
		if (event.ctrlKey && event.key.toLowerCase() === 'e') {
			event.preventDefault();
			editMode = !editMode;
		}
	}

	function onChange(event: CustomEvent<{ id: string; rect: WidgetInstance['rect'] }>) {
		const { id, rect } = event.detail;
		widgets = widgets.map((w) => (w.id === id ? { ...w, rect } : w));
	}

	function saveLayout() {
		const layout = { version: LAYOUT_VERSION, monitors: { [DEFAULT_MONITOR]: { widgets } } };
		invoke('save_layout', { contents: JSON.stringify(layout, null, 2) }).catch((err) =>
			console.warn('save_layout failed', err)
		);
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
			on:commit={saveLayout}
			on:select={onSelect}
		/>
	{/each}
	{#if editMode}
		<div class="edit-badge">EDIT — Ctrl+E to exit</div>
		<Inspector
			widget={selectedWidget}
			types={WIDGET_TYPES}
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
