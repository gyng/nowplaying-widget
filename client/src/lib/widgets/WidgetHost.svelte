<script lang="ts">
	// Container (organism): positions one widget and wires its sensor to the
	// presentational meter. The meter stays prop-only; all subscription lives here.
	// In edit mode a transparent overlay drags the widget and corner/edge handles
	// resize it; both report rect changes up via the `change` event.
	import { createEventDispatcher } from 'svelte';
	import type { TelemetryHub } from '../core/telemetry';
	import type { Rect, WidgetInstance } from '../core/layout';
	import { moveRect, resizeRect, type ResizeHandle } from '../core/geometry';
	import { getMeta } from '../core/widget';
	import { registry } from './registry';
	import { sensorStore } from './sensorStore';

	export let hub: TelemetryHub;
	export let instance: WidgetInstance;
	export let editMode = false;
	export let selected = false;
	export let grid = 8;
	// The zoom factor of the surrounding world layer (studio zoom-to-fit). Pointer deltas are
	// in screen px, so they're divided by `scale` to become world px before moving/resizing.
	// 1 in the overlay (no zoom), so the math is unchanged there.
	export let scale = 1;
	// Absolute rect to render at (the solver's result). For floating widgets this equals
	// instance.rect; for in-flow widgets the solver dictates it.
	export let rect: Rect = instance.rect;
	// Floating widgets free-move/resize; in-flow widgets are positioned by the solver, so
	// they're select-only here (reorder/reparent happens via the outline or drag — 5e).
	export let movable = true;
	// What clicking selects — usually this widget, but a group's descendants select the
	// group (the selectable unit), so the host is told explicitly.
	export let selectId: string = instance.id;
	// Styling hooks (Phase 7): the unique DOM id + the group/def this widget belongs to,
	// so theme/def/instance CSS can target it (data-w / data-def / data-group / data-type).
	export let domId: string = instance.id;
	export let defId: string | undefined = undefined;
	export let groupId: string | undefined = undefined;

	const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
	const dispatch = createEventDispatcher<{
		change: { id: string; rect: Rect };
		commit: void;
		select: { id: string };
		dragover: { id: string; x: number; y: number };
		drop: { id: string; x: number; y: number };
		contextmenu: { id: string; x: number; y: number };
		control: { id: string; sensor?: string; domain: string; service: string };
	}>();

	// A plugin widget (e.g. an HA light) asks to actuate; the host adds its identity and
	// bubbles up — the side-effecting Tauri call lives in the container (Canvas), not here
	// and not in the prop-only meter (AGENTS.md §5/§6).
	function onControl(event: CustomEvent<{ domain: string; service: string }>) {
		dispatch('control', { id: instance.id, sensor: instance.sensor, ...event.detail });
	}

	function onContextMenu(event: MouseEvent) {
		if (!editMode) return;
		event.preventDefault();
		event.stopPropagation();
		dispatch('select', { id: selectId });
		dispatch('contextmenu', { id: selectId, x: event.clientX, y: event.clientY });
	}

	// A sentinel id keeps `$store` a valid store for self-sourcing widgets (no sensor).
	$: store = sensorStore(hub, instance.sensor ?? '__none__');
	$: comp = registry[instance.type];
	// How this widget type binds to its sensor drives what value-shape the meter gets
	// (Phase 8). scalar/series stay byte-identical to before (value=number + history);
	// json/text widgets (HA) get the raw SensorValue payload as `value`.
	$: binds = getMeta(instance.type)?.binds ?? 'scalar';
	$: scalar = $store.value && $store.value.kind === 'scalar' ? $store.value.value : null;
	$: rawValue = $store.value ? $store.value.value : null;
	$: history = $store.history;

	let action: 'move' | 'flow' | ResizeHandle | null = null;
	let startX = 0;
	let startY = 0;
	let startRect: Rect = instance.rect;
	// Visual offset while ghost-dragging an in-flow widget (the model only changes on drop).
	let ghostDx = 0;
	let ghostDy = 0;

	function begin(kind: 'move' | ResizeHandle, event: PointerEvent) {
		if (event.button !== 0) return; // left-button only; middle-drag is reserved for panning
		if (!editMode) return;
		dispatch('select', { id: selectId });
		if (!movable) {
			// In-flow widgets ghost-drag to reorder/reparent; the solver owns their base
			// position, so we translate a ghost and only mutate the tree on drop (5e).
			action = 'flow';
			startX = event.clientX;
			startY = event.clientY;
			ghostDx = 0;
			ghostDy = 0;
			(event.currentTarget as Element).setPointerCapture(event.pointerId);
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		action = kind;
		startX = event.clientX;
		startY = event.clientY;
		startRect = rect;
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		event.preventDefault();
		event.stopPropagation();
	}

	function move(event: PointerEvent) {
		if (action === null) return;
		if (action === 'flow') {
			// World-space offset (the ghost lives inside the scaled world; screen delta / scale
			// renders back to the same screen distance the cursor moved).
			ghostDx = (event.clientX - startX) / scale;
			ghostDy = (event.clientY - startY) / scale;
			dispatch('dragover', { id: selectId, x: event.clientX, y: event.clientY });
			return;
		}
		const dx = (event.clientX - startX) / scale;
		const dy = (event.clientY - startY) / scale;
		const next =
			action === 'move'
				? moveRect(startRect, dx, dy, grid)
				: resizeRect(startRect, action, dx, dy, grid);
		dispatch('change', { id: instance.id, rect: next });
		// A floating widget dragged over the flow tree can dock there (checked on commit).
		if (action === 'move')
			dispatch('dragover', { id: selectId, x: event.clientX, y: event.clientY });
	}

	function end(event: PointerEvent) {
		if (action === null) return;
		const wasFlow = action === 'flow';
		action = null;
		if (wasFlow) {
			ghostDx = 0;
			ghostDy = 0;
			dispatch('drop', { id: selectId, x: event.clientX, y: event.clientY });
			return;
		}
		dispatch('commit');
	}
</script>

<div
	class="widget"
	class:editable={editMode}
	class:selected
	class:active={action !== null}
	class:catch={!editMode && instance.interactive}
	class:dragging={action === 'flow'}
	style="left: {rect.x}px; top: {rect.y}px; width: {rect.w}px; height: {rect.h}px; transform: translate({ghostDx}px, {ghostDy}px)"
	data-w={domId}
	data-type={instance.type}
	data-sensor={instance.sensor}
	data-def={defId}
	data-group={groupId}
	on:contextmenu={onContextMenu}
>
	{#if comp}
		{#if !instance.sensor || binds === 'none'}
			<svelte:component this={comp} {...instance.config} on:control={onControl} />
		{:else if binds === 'json' || binds === 'text'}
			<svelte:component this={comp} value={rawValue} {...instance.config} on:control={onControl} />
		{:else}
			<svelte:component
				this={comp}
				value={scalar}
				{history}
				{...instance.config}
				on:control={onControl}
			/>
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
		{#if movable}
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

	.widget.dragging {
		z-index: 10;
		opacity: 0.85;
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
