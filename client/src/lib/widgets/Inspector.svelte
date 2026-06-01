<script lang="ts">
	// Editor panel (edit mode only): a palette to add widgets and an inspector to
	// edit the selected widget's sensor, rect, and config. Reports changes up via
	// events; all persistence/state lives in Canvas.
	import { createEventDispatcher } from 'svelte';
	import type { WidgetInstance } from '../core/layout';

	export let widget: WidgetInstance | null = null;
	export let types: string[] = [];
	export let sensors: string[] = [];

	const RECT_KEYS = ['x', 'y', 'w', 'h'] as const;
	const dispatch = createEventDispatcher<{
		update: Partial<WidgetInstance>;
		remove: void;
		add: { type: string };
	}>();

	let configText = '';
	let configError = false;
	let lastId: string | null = null;

	// Reset the config editor only when the selected widget changes (not per edit).
	$: if (widget && widget.id !== lastId) {
		lastId = widget.id;
		configText = JSON.stringify(widget.config, null, 2);
		configError = false;
	}

	function updateRect(key: (typeof RECT_KEYS)[number], value: number) {
		if (!widget) return;
		dispatch('update', { rect: { ...widget.rect, [key]: value } });
	}

	function commitConfig() {
		try {
			const parsed = JSON.parse(configText) as Record<string, unknown>;
			configError = false;
			dispatch('update', { config: parsed });
		} catch {
			configError = true;
		}
	}
</script>

<div class="inspector">
	<div class="palette">
		<span class="hd">Add</span>
		{#each types as t (t)}
			<button type="button" on:click={() => dispatch('add', { type: t })}>{t}</button>
		{/each}
	</div>

	{#if widget}
		<div class="fields">
			<span class="hd">{widget.type} · {widget.id}</span>
			<label class="full">
				sensor
				<input
					list="sensor-list"
					value={widget.sensor ?? ''}
					placeholder="(none)"
					on:input={(e) =>
						dispatch('update', { sensor: e.currentTarget.value.trim() || undefined })}
				/>
			</label>
			<datalist id="sensor-list">
				{#each sensors as s (s)}
					<option value={s} />
				{/each}
			</datalist>
			<div class="row">
				{#each RECT_KEYS as key (key)}
					<label>
						{key}
						<input
							type="number"
							value={widget.rect[key]}
							on:input={(e) => updateRect(key, Number(e.currentTarget.value))}
						/>
					</label>
				{/each}
			</div>
			<label class="full">
				config (JSON)
				<textarea
					rows="4"
					bind:value={configText}
					class:error={configError}
					on:change={commitConfig}
				/>
			</label>
			<button type="button" class="remove" on:click={() => dispatch('remove')}>Remove</button>
		</div>
	{:else}
		<div class="hint">Select a widget, or add one above.</div>
	{/if}
</div>

<style>
	.inspector {
		position: absolute;
		bottom: 8px;
		left: 8px;
		width: 220px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: rgba(10, 10, 12, 0.92);
		border: 1px solid rgba(119, 196, 211, 0.5);
		border-radius: 4px;
		color: #eee;
		font-family: monospace;
		font-size: 11px;
		pointer-events: auto;
	}

	.hd {
		color: rgb(119, 196, 211);
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.palette {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.row {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 4px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	input,
	textarea {
		background: #1a1a1e;
		border: 1px solid #333;
		color: #eee;
		font-family: monospace;
		font-size: 11px;
		padding: 2px 4px;
		width: 100%;
		box-sizing: border-box;
	}

	textarea.error {
		border-color: rgb(220, 120, 120);
	}

	button {
		background: #1a1a1e;
		border: 1px solid #444;
		color: #eee;
		font-family: monospace;
		font-size: 11px;
		padding: 2px 6px;
		cursor: pointer;
	}

	button:hover {
		border-color: rgb(119, 196, 211);
	}

	.remove {
		border-color: rgba(220, 120, 120, 0.6);
		color: rgb(230, 160, 160);
	}

	.hint {
		color: #888;
	}
</style>
