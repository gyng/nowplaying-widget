<script lang="ts">
	// Presentational meter (molecule): formats a scalar sensor value as text. Themeable via
	// tokens (--np-fg / -font); a per-instance `color` (from config) overrides --np-fg.
	import { formatScalar } from '../../core/format';

	export let value: number | null = null;
	export let format = 'integer';
	export let label = '';
	export let color: string | undefined = undefined;

	$: display = formatScalar(value, format);
	$: colorCss = color ?? 'var(--np-fg, rgb(255, 255, 255))';
</script>

<div class="text np-text" style="color: {colorCss}">
	{#if label}<span class="label" data-part="label">{label}</span>{/if}
	<span class="value" data-part="value">{display}</span>
</div>

<style>
	.text {
		display: flex;
		align-items: baseline;
		gap: var(--np-gap, 4px);
		width: 100%;
		height: 100%;
		font-family: var(--np-font, 'Bahnschrift', 'Arial Narrow', sans-serif);
	}

	.label {
		font-size: 11px;
		opacity: 0.7;
	}

	.value {
		font-size: 15px;
	}
</style>
