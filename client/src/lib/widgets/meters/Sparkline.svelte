<script lang="ts">
	// Presentational meter (molecule): renders a sensor's history ring buffer as a
	// line, optionally filled. Driven entirely by props.
	import { sparklinePoints } from './sparkline';

	export let history: number[] = [];
	export let min: number | null = null;
	export let max: number | null = null;
	export let color = 'rgb(119, 196, 211)';
	export let fill = true;

	const W = 100;
	const H = 32;

	$: points = sparklinePoints(history, W, H, min, max);
	$: line = points.map(([x, y]) => `${x},${y}`).join(' ');
	$: area = points.length ? `0,${H} ${line} ${W},${H}` : '';
</script>

<svg
	class="sparkline"
	viewBox="0 0 {W} {H}"
	preserveAspectRatio="none"
	role="img"
	aria-label="history"
>
	{#if fill && points.length}
		<polygon points={area} fill={color} fill-opacity="0.18" stroke="none" />
	{/if}
	{#if points.length}
		<polyline
			points={line}
			fill="none"
			stroke={color}
			stroke-width="1.5"
			vector-effect="non-scaling-stroke"
		/>
	{/if}
</svg>

<style>
	.sparkline {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
