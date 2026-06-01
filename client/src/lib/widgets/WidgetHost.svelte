<script lang="ts">
	// Container (organism): positions one widget and wires its sensor to the
	// presentational meter. The meter stays prop-only; all subscription lives here.
	// In edit mode a transparent overlay makes the widget draggable.
	import { createEventDispatcher } from 'svelte';
	import type { TelemetryHub } from '../core/telemetry';
	import type { Rect, WidgetInstance } from '../core/layout';
	import { moveRect } from '../core/geometry';
	import { registry } from './registry';
	import { sensorStore } from './sensorStore';

	export let hub: TelemetryHub;
	export let instance: WidgetInstance;
	export let editMode = false;
	export let grid = 8;

	const dispatch = createEventDispatcher<{ move: { id: string; rect: Rect }; commit: void }>();

	// A sentinel id keeps `$store` a valid store for self-sourcing widgets (no sensor).
	$: store = sensorStore(hub, instance.sensor ?? '__none__');
	$: comp = registry[instance.type];
	$: scalar = $store.value && $store.value.kind === 'scalar' ? $store.value.value : null;
	$: history = $store.history;

	let dragging = false;
	let startX = 0;
	let startY = 0;
	let startRect: Rect = instance.rect;

	function onPointerDown(event: PointerEvent) {
		if (!editMode) return;
		dragging = true;
		startX = event.clientX;
		startY = event.clientY;
		startRect = instance.rect;
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		event.preventDefault();
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging) return;
		const rect = moveRect(startRect, event.clientX - startX, event.clientY - startY, grid);
		dispatch('move', { id: instance.id, rect });
	}

	function onPointerUp() {
		if (!dragging) return;
		dragging = false;
		dispatch('commit');
	}
</script>

<div
	class="widget"
	class:editable={editMode}
	class:dragging
	style="left: {instance.rect.x}px; top: {instance.rect.y}px; width: {instance.rect
		.w}px; height: {instance.rect.h}px"
>
	{#if comp}
		{#if instance.sensor}
			<svelte:component this={comp} value={scalar} {history} {...instance.config} />
		{:else}
			<svelte:component this={comp} {...instance.config} />
		{/if}
	{:else}
		<div class="missing">?{instance.type}</div>
	{/if}

	{#if editMode}
		<button
			type="button"
			class="drag-overlay"
			aria-label="Move {instance.type} widget"
			on:pointerdown={onPointerDown}
			on:pointermove={onPointerMove}
			on:pointerup={onPointerUp}
		/>
	{/if}
</div>

<style>
	.widget {
		position: absolute;
	}

	.widget.editable {
		outline: 1px dashed rgba(119, 196, 211, 0.7);
		outline-offset: 2px;
	}

	.widget.dragging {
		outline-style: solid;
	}

	.drag-overlay {
		position: absolute;
		inset: 0;
		margin: 0;
		padding: 0;
		border: none;
		background: transparent;
		cursor: move;
	}

	.missing {
		font-family: monospace;
		font-size: 11px;
		color: rgba(255, 120, 120, 0.9);
	}
</style>
