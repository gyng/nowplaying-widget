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

	export let widgets: WidgetInstance[] = [
		{
			id: 'cpu-1',
			type: 'gauge',
			sensor: 'cpu.total',
			rect: { x: 170, y: 16, w: 110, h: 110 },
			config: { label: 'CPU', unit: '%', min: 0, max: 100 }
		}
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
