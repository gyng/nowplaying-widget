<script lang="ts">
	// Presentational meter (molecule): renders a sensor's history ring buffer as a line,
	// optionally filled. Themeable via --np-accent; a per-instance `color` overrides it.
	// SVG colours are set via the `style` attribute so var() resolves.
	import { sparklineBars, sparklinePoints } from './sparkline';

	export let history: number[] = [];
	export let min: number | null = null;
	export let max: number | null = null;
	export let color: string | undefined = undefined;
	export let fill = true;
	// Histogram mode (item): draw value bars rising from the baseline instead of a line — matches
	// the Rainmeter Histogram meter used for network throughput / per-core load.
	export let histogram = false;
	// Rolling history window in SECONDS (≈ samples at the 1s base sampling cadence). The chart is
	// right-anchored to this window: it fills in from the right and leaves not-yet-recorded time
	// blank rather than stretching a few early samples across the whole width.
	export let seconds = 60;

	const W = 100;
	const H = 32;

	$: windowSlots = Math.max(1, Math.round(seconds));
	$: points = histogram ? [] : sparklinePoints(history, W, H, min, max, windowSlots);
	$: bars = histogram ? sparklineBars(history, W, H, min, max, 0.2, windowSlots) : [];
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
	{#if histogram}
		{#each bars as b, i (i)}
			<rect data-part="bar" x={b.x} y={b.y} width={b.w} height={b.h} style="fill: {colorCss}" />
		{/each}
	{:else}
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
	{/if}
</svg>

<style>
	.sparkline {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
