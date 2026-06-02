<script lang="ts">
	// Presentational meter (molecule): a horizontal or vertical fill bar. Themeable via
	// tokens (--np-accent / -track); a per-instance `color`/`track` overrides the token.
	import { fraction } from './scale';

	export let value: number | null = null;
	export let min = 0;
	export let max = 100;
	export let orientation: 'horizontal' | 'vertical' = 'horizontal';
	export let color: string | undefined = undefined;
	export let track: string | undefined = undefined;
	export let label = '';

	$: pct = `${(fraction(value, min, max) * 100).toFixed(1)}%`;
	$: extent = orientation === 'horizontal' ? `width: ${pct}` : `height: ${pct}`;
	$: fillCss = color ?? 'var(--np-accent, rgb(119, 196, 211))';
	$: trackCss = track ?? 'var(--np-track, rgba(255, 255, 255, 0.15))';
</script>

<div class="bar np-bar {orientation}" data-part="track" style="background: {trackCss}">
	<div class="fill" data-part="fill" style="background: {fillCss}; {extent}" />
	{#if label}<span class="label" data-part="label">{label}</span>{/if}
</div>

<style>
	.bar {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		border-radius: var(--np-radius, 2px);
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
		font-family: var(--np-font, 'Bahnschrift', 'Arial Narrow', sans-serif);
		font-size: 11px;
		color: var(--np-fg, #fff);
	}
</style>
