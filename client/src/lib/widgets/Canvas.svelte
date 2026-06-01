<script lang="ts">
	// Canvas (organism): owns the telemetry hub, wires the backend source, and lays
	// out widget instances. Phase S hardcodes a single CPU gauge to prove the pipe;
	// Phase 3 loads widgets.json per monitor.
	import { onDestroy, onMount } from 'svelte';
	import type { UnlistenFn } from '@tauri-apps/api/event';
	import { createTelemetryHub } from '../core/telemetry';
	import { startTelemetrySource } from '../telemetry/source';
	import type { WidgetInstance } from '../core/layout';
	import WidgetHost from './WidgetHost.svelte';

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

	onMount(async () => {
		unlisten = await startTelemetrySource(hub);
	});

	onDestroy(() => unlisten?.());
</script>

<div class="canvas">
	{#each widgets as widget (widget.id)}
		<WidgetHost {hub} instance={widget} />
	{/each}
</div>

<style>
	.canvas {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
</style>
