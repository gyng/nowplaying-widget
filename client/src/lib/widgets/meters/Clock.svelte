<script lang="ts">
	// Self-sourcing meter: renders local time on a 1s tick. No sensor binding. Themeable
	// via tokens (--np-fg / -font); a per-instance `color` overrides --np-fg.
	import { onMount } from 'svelte';
	import { formatClock } from '../../core/format';

	export let format = 'HH:mm';
	export let label = '';
	export let color: string | undefined = undefined;
	// Month/day-name locale: 'en' (default) or 'ja' (ddd → 日月火水木金土 weekday glyphs).
	export let locale = 'en';

	let now = new Date();

	onMount(() => {
		const timer = setInterval(() => {
			now = new Date();
		}, 1000);
		return () => clearInterval(timer);
	});

	$: display = formatClock(now, format, locale);
	$: colorCss = color ?? 'var(--np-fg, rgb(255, 255, 255))';
</script>

<div class="clock np-clock" style="color: {colorCss}">
	<span class="value" data-part="value">{display}</span>
	{#if label}<span class="label" data-part="label">{label}</span>{/if}
</div>

<style>
	.clock {
		display: flex;
		align-items: baseline;
		gap: 6px;
		width: 100%;
		height: 100%;
		font-family: var(--np-font-display, 'Bahnschrift', 'Arial Narrow', sans-serif);
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
