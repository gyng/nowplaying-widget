<script lang="ts">
	// Presentational meter (molecule): formats a scalar sensor value as text.
	import { formatScalar } from '../../core/format';

	export let value: number | null = null;
	export let format = 'integer';
	export let label = '';
	export let color = 'rgb(255, 255, 255)';

	$: display = formatScalar(value, format);
</script>

<div class="text" style="color: {color}">
	{#if label}<span class="label">{label}</span>{/if}
	<span class="value">{display}</span>
</div>

<style>
	.text {
		display: flex;
		align-items: baseline;
		gap: 4px;
		width: 100%;
		height: 100%;
		font-family: 'DIN Engschrift Std', 'Arial Narrow', sans-serif;
	}

	.label {
		font-size: 11px;
		opacity: 0.7;
	}

	.value {
		font-size: 15px;
	}
</style>
