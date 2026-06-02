<script lang="ts">
	// Presentational meter (molecule): driven entirely by props, no store/Tauri access.
	// Themeable via tokens (--np-accent / -track / -fg / -muted / -label / -font-display);
	// a per-instance `color`/`track` (from config) overrides the token. SVG colours are set
	// via the `style` attribute (not presentation attributes) so var() resolves.
	import { fraction } from './scale';

	export let value: number | null = null;
	export let min = 0;
	export let max = 100;
	export let label = '';
	export let unit = '%';
	export let color: string | undefined = undefined; // per-instance accent override
	export let track: string | undefined = undefined; // per-instance track override

	const SIZE = 100;
	const STROKE = 9;
	const R = (SIZE - STROKE) / 2;
	const C = 2 * Math.PI * R;
	const SWEEP = 0.75; // 270° arc, gap centred at the bottom

	$: frac = fraction(value, min, max);
	$: display = value === null ? '–' : Math.round(value).toString();
	$: fillCss = color ?? 'var(--np-accent, rgb(119, 196, 211))';
	$: trackCss = track ?? 'var(--np-track, rgba(255, 255, 255, 0.15))';
</script>

<div class="gauge np-gauge">
	<svg viewBox="0 0 {SIZE} {SIZE}" role="img" aria-label="{label} {display}{unit}">
		<g transform="rotate(135 {SIZE / 2} {SIZE / 2})">
			<circle
				class="arc"
				data-part="track"
				cx={SIZE / 2}
				cy={SIZE / 2}
				r={R}
				fill="none"
				style="stroke: {trackCss}"
				stroke-width={STROKE}
				stroke-dasharray="{SWEEP * C} {C}"
				stroke-linecap="round"
			/>
			<circle
				class="arc"
				data-part="fill"
				cx={SIZE / 2}
				cy={SIZE / 2}
				r={R}
				fill="none"
				style="stroke: {fillCss}"
				stroke-width={STROKE}
				stroke-dasharray="{frac * SWEEP * C} {C}"
				stroke-linecap="round"
			/>
		</g>
		<text x="50%" y="52%" class="value" data-part="value" dominant-baseline="middle"
			>{display}<tspan class="unit" data-part="unit">{unit}</tspan></text
		>
		{#if label}
			<text x="50%" y="70%" class="label" data-part="label" dominant-baseline="middle">{label}</text
			>
		{/if}
	</svg>
</div>

<style>
	.gauge {
		width: 100%;
		height: 100%;
	}

	svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	.value {
		fill: var(--np-fg, #fff);
		font-family: var(--np-font-display, 'DIN Engschrift Std', 'Arial Narrow', sans-serif);
		font-size: 26px;
		text-anchor: middle;
	}

	.unit {
		font-size: 12px;
		fill: var(--np-muted, rgba(255, 255, 255, 0.6));
	}

	.label {
		fill: var(--np-label, rgb(218, 237, 226));
		font-family: var(--np-font-display, 'DIN Engschrift Std', 'Arial Narrow', sans-serif);
		font-size: 11px;
		letter-spacing: 1px;
		text-anchor: middle;
	}
</style>
