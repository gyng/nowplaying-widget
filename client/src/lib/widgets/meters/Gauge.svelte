<script lang="ts">
	// Presentational meter (molecule): driven entirely by props, no store/Tauri access.
	import { gaugeFraction } from './gauge';

	export let value: number | null = null;
	export let min = 0;
	export let max = 100;
	export let label = '';
	export let unit = '%';
	export let color = 'rgb(119, 196, 211)';
	export let track = 'rgba(255, 255, 255, 0.15)';

	const SIZE = 100;
	const STROKE = 9;
	const R = (SIZE - STROKE) / 2;
	const C = 2 * Math.PI * R;
	const SWEEP = 0.75; // 270° arc, gap centred at the bottom

	$: frac = gaugeFraction(value, min, max);
	$: display = value === null ? '–' : Math.round(value).toString();
</script>

<div class="gauge">
	<svg viewBox="0 0 {SIZE} {SIZE}" role="img" aria-label="{label} {display}{unit}">
		<g transform="rotate(135 {SIZE / 2} {SIZE / 2})">
			<circle
				cx={SIZE / 2}
				cy={SIZE / 2}
				r={R}
				fill="none"
				stroke={track}
				stroke-width={STROKE}
				stroke-dasharray="{SWEEP * C} {C}"
				stroke-linecap="round"
			/>
			<circle
				cx={SIZE / 2}
				cy={SIZE / 2}
				r={R}
				fill="none"
				stroke={color}
				stroke-width={STROKE}
				stroke-dasharray="{frac * SWEEP * C} {C}"
				stroke-linecap="round"
			/>
		</g>
		<text x="50%" y="52%" class="value" dominant-baseline="middle"
			>{display}<tspan class="unit">{unit}</tspan></text
		>
		{#if label}
			<text x="50%" y="70%" class="label" dominant-baseline="middle">{label}</text>
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
		fill: #fff;
		font-family: 'DIN Engschrift Std', 'Arial Narrow', sans-serif;
		font-size: 26px;
		text-anchor: middle;
	}

	.unit {
		font-size: 12px;
		fill: rgba(255, 255, 255, 0.6);
	}

	.label {
		fill: rgb(218, 237, 226);
		font-family: 'DIN Engschrift Std', 'Arial Narrow', sans-serif;
		font-size: 11px;
		letter-spacing: 1px;
		text-anchor: middle;
	}
</style>
