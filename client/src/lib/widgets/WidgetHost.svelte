<script lang="ts">
	// Container (organism): positions one widget and wires its sensor to the
	// presentational meter. The meter stays prop-only; all subscription lives here.
	// In edit mode a transparent overlay drags the widget and corner/edge handles
	// resize it; both report rect changes up via the `change` event.
	import { createEventDispatcher } from 'svelte';
	import type { TelemetryHub } from '../core/telemetry';
	import type { Rect, WidgetInstance } from '../core/layout';
	import { moveRect, resizeRect, type ResizeHandle } from '../core/geometry';
	import { registry } from './registry';
	import { sensorStore } from './sensorStore';

	export let hub: TelemetryHub;
	export let instance: WidgetInstance;
	export let editMode = false;
	export let selected = false;
	export let grid = 8;

	const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
	const dispatch = createEventDispatcher<{
		change: { id: string; rect: Rect };
		commit: void;
		select: { id: string };
	}>();

	// A sentinel id keeps `$store` a valid store for self-sourcing widgets (no sensor).
	$: store = sensorStore(hub, instance.sensor ?? '__none__');
	$: comp = registry[instance.type];
	$: scalar = $store.value && $store.value.kind === 'scalar' ? $store.value.value : null;
	$: history = $store.history;

	let action: 'move' | ResizeHandle | null = null;
	let startX = 0;
	let startY = 0;
	let startRect: Rect = instance.rect;

	function begin(kind: 'move' | ResizeHandle, event: PointerEvent) {
		if (!editMode) return;
		dispatch('select', { id: instance.id });
		action = kind;
		startX = event.clientX;
		startY = event.clientY;
		startRect = instance.rect;
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		event.preventDefault();
		event.stopPropagation();
	}

	function move(event: PointerEvent) {
		if (action === null) return;
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		const rect =
			action === 'move'
				? moveRect(startRect, dx, dy, grid)
				: resizeRect(startRect, action, dx, dy, grid);
		dispatch('change', { id: instance.id, rect });
	}

	function end() {
		if (action === null) return;
		action = null;
		dispatch('commit');
	}
</script>

<div
	class="widget"
	class:editable={editMode}
	class:selected
	class:active={action !== null}
	class:catch={!editMode && instance.interactive}
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
			on:pointerdown={(e) => begin('move', e)}
			on:pointermove={move}
			on:pointerup={end}
		/>
		{#each HANDLES as handle (handle)}
			<button
				type="button"
				class="handle {handle}"
				aria-label="Resize {handle}"
				on:pointerdown={(e) => begin(handle, e)}
				on:pointermove={move}
				on:pointerup={end}
			/>
		{/each}
	{/if}
</div>

<style>
	.widget {
		position: absolute;
	}

	/* Interactive widgets catch clicks in passive mode (the canvas is otherwise
	   pointer-events:none). The cursor watcher gates this at the OS level. */
	.widget.catch {
		pointer-events: auto;
	}

	.widget.editable {
		outline: 1px dashed rgba(119, 196, 211, 0.7);
		outline-offset: 2px;
	}

	.widget.active {
		outline-style: solid;
	}

	.widget.selected {
		outline-color: rgb(119, 196, 211);
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

	.handle {
		position: absolute;
		width: 8px;
		height: 8px;
		margin: 0;
		padding: 0;
		box-sizing: border-box;
		border: 1px solid rgba(119, 196, 211, 0.9);
		background: #0b0b0b;
		z-index: 1;
	}

	.handle.n {
		top: -4px;
		left: calc(50% - 4px);
		cursor: ns-resize;
	}

	.handle.s {
		bottom: -4px;
		left: calc(50% - 4px);
		cursor: ns-resize;
	}

	.handle.e {
		right: -4px;
		top: calc(50% - 4px);
		cursor: ew-resize;
	}

	.handle.w {
		left: -4px;
		top: calc(50% - 4px);
		cursor: ew-resize;
	}

	.handle.ne {
		top: -4px;
		right: -4px;
		cursor: nesw-resize;
	}

	.handle.nw {
		top: -4px;
		left: -4px;
		cursor: nwse-resize;
	}

	.handle.se {
		bottom: -4px;
		right: -4px;
		cursor: nwse-resize;
	}

	.handle.sw {
		bottom: -4px;
		left: -4px;
		cursor: nesw-resize;
	}

	.missing {
		font-family: monospace;
		font-size: 11px;
		color: rgba(255, 120, 120, 0.9);
	}
</style>
