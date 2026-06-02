<script lang="ts">
	// Self-sourcing CPU meter that toggles between a COMBINED view (a gauge of cpu.total) and a
	// PER-CORE view (a grid of cpu.core.* sparklines — like the Rainmeter System skin's LINE
	// meters). It reads the telemetry hub from context (set by Canvas) rather than a single bound
	// sensor, since it needs cpu.total AND every core. `binds: 'none'`. Composes Gauge + Sparkline.
	import { getContext, onDestroy, onMount } from 'svelte';
	import type { TelemetryHub } from '../../core/telemetry';
	import Gauge from './Gauge.svelte';
	import Sparkline from './Sparkline.svelte';

	export let mode: 'combined' | 'cores' = 'cores';
	export let cols = 8; // columns in the per-core grid (Rainmeter used 8)
	export let label = 'CPU';
	export let color: string | undefined = undefined;
	export let seconds = 60; // per-core sparkline history window
	export let histogram = false; // per-core bars instead of lines

	const hub = getContext<TelemetryHub | undefined>('telemetryHub');

	let total: number | null = null;
	let cores: number[][] = []; // each core's history buffer, core 0..N

	const coreIndex = (id: string): number => Number(id.slice('cpu.core.'.length)) || 0;

	function readAll(): void {
		if (!hub) return;
		const t = hub.sensor('cpu.total').getSnapshot().value;
		total = t && t.kind === 'scalar' ? t.value : null;
		const ids = hub
			.sensorIds()
			.filter((id) => id.startsWith('cpu.core.'))
			.sort((a, b) => coreIndex(a) - coreIndex(b));
		cores = ids.map((id) => hub.sensor(id).getSnapshot().history);
	}

	// cpu.total + every core arrive in the same telemetry batch, so re-reading on each cpu.total
	// tick keeps both views fresh without managing a subscription per core.
	let unsub: (() => void) | undefined;
	onMount(() => {
		if (!hub) return;
		unsub = hub.sensor('cpu.total').subscribe(readAll);
		readAll();
	});
	onDestroy(() => unsub?.());

	$: gridStyle = `grid-template-columns: repeat(${Math.max(1, Math.round(cols))}, 1fr)`;
</script>

{#if mode === 'combined'}
	<Gauge value={total} {label} unit="%" min={0} max={100} {color} />
{:else}
	<div class="cores np-cpu-cores" style={gridStyle}>
		{#each cores as history, i (i)}
			<Sparkline {history} min={0} max={100} {color} {seconds} {histogram} fill={false} />
		{/each}
	</div>
{/if}

<style>
	.cores {
		display: grid;
		gap: 2px;
		width: 100%;
		height: 100%;
	}
</style>
