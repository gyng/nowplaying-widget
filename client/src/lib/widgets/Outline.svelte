<script lang="ts">
	// The layout outline (edit mode): a flattened, indented tree of the flow `root` plus
	// the floating layer. Structural editing only — select, reorder (↑/↓), reparent
	// (⟸ out / ⟹ in), dock (⤒) / float (⤓), remove (✕), and add containers. All changes
	// go up as a single `op` event; the Canvas applies them via core/layoutEdit.
	import { createEventDispatcher } from 'svelte';
	import { isContainer, type Container, type LayoutNode, type Leaf } from '../core/layoutTree';
	import { isGroup } from '../core/layoutTree';
	import { outlineRows } from '../core/layoutEdit';
	import type { LayoutOp } from './ops';

	export let root: Container;
	export let floating: Leaf[] = [];
	export let selectedId: string | null = null;

	const dispatch = createEventDispatcher<{ op: LayoutOp }>();
	const op = (o: LayoutOp) => dispatch('op', o);

	$: rows = outlineRows(root);

	function rowLabel(node: LayoutNode): string {
		if (isContainer(node)) return `▦ ${node.kind} · ${node.id}`;
		return `• ${isGroup(node.unit) ? `group ${node.unit.name ?? node.id}` : node.unit.type}`;
	}
</script>

<div class="outline">
	<div class="hd">
		Outline
		<span class="add">
			<button type="button" on:click={() => op({ op: 'addContainer', kind: 'row' })}>+Row</button>
			<button type="button" on:click={() => op({ op: 'addContainer', kind: 'col' })}>+Col</button>
			<button type="button" on:click={() => op({ op: 'addContainer', kind: 'grid' })}>+Grid</button>
		</span>
	</div>

	<button
		type="button"
		class="row root"
		class:sel={selectedId === root.id}
		on:click={() => op({ op: 'select', id: root.id })}>▦ root ({root.kind})</button
	>

	{#each rows as r (r.node.id)}
		<div
			class="row"
			class:sel={selectedId === r.node.id}
			style="padding-left: {6 + r.depth * 12}px"
		>
			<button type="button" class="label" on:click={() => op({ op: 'select', id: r.node.id })}>
				{rowLabel(r.node)}
			</button>
			<span class="btns">
				<button
					type="button"
					title="Move up"
					disabled={r.index === 0}
					on:click={() => op({ op: 'moveUp', id: r.node.id })}>↑</button
				>
				<button
					type="button"
					title="Move down"
					disabled={r.index === r.siblingCount - 1}
					on:click={() => op({ op: 'moveDown', id: r.node.id })}>↓</button
				>
				<button
					type="button"
					title="Move out"
					disabled={r.parentId === root.id}
					on:click={() => op({ op: 'outdent', id: r.node.id })}>⟸</button
				>
				{#if r.index > 0}
					<button type="button" title="Move in" on:click={() => op({ op: 'indent', id: r.node.id })}
						>⟹</button
					>
				{/if}
				{#if !isContainer(r.node)}
					<button type="button" title="Float" on:click={() => op({ op: 'float', id: r.node.id })}
						>⤓</button
					>
				{/if}
				<button type="button" title="Remove" on:click={() => op({ op: 'remove', id: r.node.id })}
					>✕</button
				>
			</span>
		</div>
	{/each}

	{#if floating.length}
		<div class="hd2">Floating</div>
		{#each floating as lf (lf.id)}
			<div class="row" class:sel={selectedId === lf.id}>
				<button type="button" class="label" on:click={() => op({ op: 'select', id: lf.id })}>
					{rowLabel(lf)}
				</button>
				<span class="btns">
					<button
						type="button"
						title="Dock into root"
						on:click={() => op({ op: 'dock', id: lf.id })}>⤒</button
					>
					<button type="button" title="Remove" on:click={() => op({ op: 'remove', id: lf.id })}
						>✕</button
					>
				</span>
			</div>
		{/each}
	{/if}
</div>

<style>
	.outline {
		position: absolute;
		top: 8px;
		left: 8px;
		width: 240px;
		max-height: 50vh;
		overflow-y: auto;
		padding: 6px;
		background: rgba(10, 10, 12, 0.92);
		border: 1px solid rgba(119, 196, 211, 0.5);
		border-radius: 4px;
		color: #eee;
		font-family: monospace;
		font-size: 11px;
		pointer-events: auto;
	}

	.hd,
	.hd2 {
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: rgb(119, 196, 211);
		text-transform: uppercase;
		letter-spacing: 1px;
		margin-bottom: 4px;
	}

	.hd2 {
		margin-top: 6px;
		border-top: 1px solid #333;
		padding-top: 4px;
	}

	.add button {
		padding: 1px 3px;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
		border-radius: 2px;
	}

	.row.root {
		width: 100%;
		text-align: left;
		border: none;
		background: transparent;
		color: #eee;
		font-family: monospace;
		font-size: 11px;
		cursor: pointer;
		padding: 1px 4px;
	}

	.row.sel {
		background: rgba(119, 196, 211, 0.18);
		outline: 1px solid rgba(119, 196, 211, 0.6);
	}

	.label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: left;
		border: none;
		background: transparent;
		color: #eee;
		font-family: monospace;
		font-size: 11px;
		cursor: pointer;
		padding: 1px 2px;
	}

	.btns {
		display: flex;
		gap: 1px;
		flex-shrink: 0;
	}

	.btns button {
		width: 16px;
		padding: 0;
		line-height: 16px;
	}

	button {
		background: #1a1a1e;
		border: 1px solid #444;
		color: #eee;
		font-family: monospace;
		font-size: 10px;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		border-color: rgb(119, 196, 211);
	}

	button:disabled {
		opacity: 0.3;
		cursor: default;
	}
</style>
