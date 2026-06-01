<script lang="ts">
	// Presentational meter (molecule): a horizontal or vertical fill bar.
	import { fraction } from './scale';

	export let value: number | null = null;
	export let min = 0;
	export let max = 100;
	export let orientation: 'horizontal' | 'vertical' = 'horizontal';
	export let color = 'rgb(119, 196, 211)';
	export let track = 'rgba(255, 255, 255, 0.15)';
	export let label = '';

	$: pct = `${(fraction(value, min, max) * 100).toFixed(1)}%`;
	$: extent = orientation === 'horizontal' ? `width: ${pct}` : `height: ${pct}`;
</script>

<div class="bar {orientation}" style="background: {track}">
	<div class="fill" style="background: {color}; {extent}" />
	{#if label}<span class="label">{label}</span>{/if}
</div>

<style>
	.bar {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		border-radius: 2px;
	}

	.horizontal .fill {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
	}

	.vertical .fill {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
	}

	.label {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: 'DIN Engschrift Std', 'Arial Narrow', sans-serif;
		font-size: 11px;
		color: #fff;
	}
</style>
