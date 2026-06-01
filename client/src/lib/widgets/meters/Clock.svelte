<script lang="ts">
	// Self-sourcing meter: renders local time on a 1s tick. No sensor binding.
	import { onMount } from 'svelte';
	import { formatClock } from '../../core/format';

	export let format = 'HH:mm';
	export let label = '';
	export let color = 'rgb(255, 255, 255)';

	let now = new Date();

	onMount(() => {
		const timer = setInterval(() => {
			now = new Date();
		}, 1000);
		return () => clearInterval(timer);
	});

	$: display = formatClock(now, format);
</script>

<div class="clock" style="color: {color}">
	<span class="value">{display}</span>
	{#if label}<span class="label">{label}</span>{/if}
</div>

<style>
	.clock {
		display: flex;
		align-items: baseline;
		gap: 6px;
		width: 100%;
		height: 100%;
		font-family: 'DIN Engschrift Std', 'Arial Narrow', sans-serif;
	}

	.value {
		font-size: 30px;
		line-height: 1;
	}

	.label {
		font-size: 11px;
		opacity: 0.7;
	}
</style>
