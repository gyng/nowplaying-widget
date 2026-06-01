<script lang="ts">
	// Container (organism): positions one widget and wires its sensor to the
	// presentational meter. The meter stays prop-only; all subscription lives here.
	import type { TelemetryHub } from '../core/telemetry';
	import type { WidgetInstance } from '../core/layout';
	import { registry } from './registry';
	import { sensorStore } from './sensorStore';

	export let hub: TelemetryHub;
	export let instance: WidgetInstance;

	// A sentinel id keeps `$store` a valid store for self-sourcing widgets (no sensor).
	$: store = sensorStore(hub, instance.sensor ?? '__none__');
	$: comp = registry[instance.type];
	$: scalar = $store.value && $store.value.kind === 'scalar' ? $store.value.value : null;
</script>

<div
	class="widget"
	style="left: {instance.rect.x}px; top: {instance.rect.y}px; width: {instance.rect
		.w}px; height: {instance.rect.h}px"
>
	{#if comp}
		<svelte:component this={comp} value={scalar} {...instance.config} />
	{:else}
		<div class="missing">?{instance.type}</div>
	{/if}
</div>

<style>
	.widget {
		position: absolute;
	}

	.missing {
		font-family: monospace;
		font-size: 11px;
		color: rgba(255, 120, 120, 0.9);
	}
</style>
