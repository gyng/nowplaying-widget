<script lang="ts">
	// Presentational meter (molecule): renders a sensor's history ring buffer as a line,
	// optionally filled. Themeable via --np-accent; a per-instance `color` overrides it.
	// SVG colours are set via the `style` attribute so var() resolves.
	import { sparklinePoints } from './sparkline';

	export let history: number[] = [];
	export let min: number | null = null;
	export let max: number | null = null;
	export let color: string | undefined = undefined;
	export let fill = true;

	const W = 100;
	const H = 32;

	$: points = sparklinePoints(history, W, H, min, max);
	$: line = points.map(([x, y]) => `${x},${y}`).join(' ');
	$: area = points.length ? `0,${H} ${line} ${W},${H}` : '';
	$: colorCss = color ?? 'var(--np-accent, rgb(119, 196, 211))';
</script>

<svg
	class="sparkline np-sparkline"
	viewBox="0 0 {W} {H}"
	preserveAspectRatio="none"
	role="img"
	aria-label="history"
>
	{#if fill && points.length}
		<polygon
			data-part="fill"
			points={area}
			style="fill: {colorCss}"
			fill-opacity="0.18"
			stroke="none"
		/>
	{/if}
	{#if points.length}
		<polyline
			data-part="line"
			points={line}
			fill="none"
			style="stroke: {colorCss}"
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
