<script lang="ts">
	// Editor inspector (edit mode): a palette to add widgets, plus a properties panel for
	// the selected node — widget props (sensor / rect / config / dock·float) or container
	// props (kind / cols / gap / pad / align / justify / grow). Emits a single `op` event;
	// all state + persistence lives in Canvas.
	import { createEventDispatcher } from 'svelte';
	import type {
		Align,
		Container,
		Group,
		Justify,
		WidgetDef,
		WidgetInstance
	} from '../core/layoutTree';
	import type { LayoutOp } from './ops';

	export let widget: WidgetInstance | null = null;
	export let container: Container | null = null;
	export let groupUnit: Group | null = null;
	export let def: WidgetDef | null = null; // the selected group's def (for params)
	export let defs: WidgetDef[] = []; // the whole library (for insert / delete)
	export let tokens: Record<string, string> = {}; // global token overrides (7d)
	export let placement: 'flow' | 'floating' | null = null;
	export let types: string[] = [];
	export let sensors: string[] = [];

	// The common tokens surfaced in the Theme panel (the rest are set via theme CSS).
	const TOKEN_FIELDS = [
		{ key: '--np-accent', label: 'accent', ph: 'rgb(119, 196, 211)' },
		{ key: '--np-fg', label: 'text', ph: '#ffffff' },
		{ key: '--np-label', label: 'label', ph: 'rgb(218, 237, 226)' },
		{ key: '--np-track', label: 'track', ph: 'rgba(255, 255, 255, 0.15)' },
		{ key: '--np-font-display', label: 'font', ph: "'DIN Engschrift Std', …" }
	];

	let paramKey = '';
	let paramTarget = '';

	const RECT_KEYS = ['x', 'y', 'w', 'h'] as const;
	const ALIGNS: Align[] = ['start', 'center', 'end', 'stretch'];
	const JUSTIFIES: Justify[] = ['start', 'center', 'end', 'between', 'around'];

	const dispatch = createEventDispatcher<{ op: LayoutOp }>();
	const op = (o: LayoutOp) => dispatch('op', o);

	let configText = '';
	let configError = false;
	let lastId: string | null = null;

	// Reset the config editor only when the selected widget changes (not per edit).
	$: if (widget && widget.id !== lastId) {
		lastId = widget.id;
		configText = JSON.stringify(widget.config, null, 2);
		configError = false;
	}

	function patchWidget(patch: Partial<WidgetInstance>) {
		if (widget) op({ op: 'patchWidget', id: widget.id, patch });
	}

	function patchContainer(patch: Partial<Container>) {
		if (container) op({ op: 'patchContainer', id: container.id, patch });
	}

	// Typed setters (the casts live here, not in the template — Svelte's parser rejects
	// inline `as` in event handlers).
	const setKind = (v: string) => patchContainer({ kind: v as Container['kind'] });
	const setAlign = (v: string) => patchContainer({ align: v as Align });
	const setJustify = (v: string) => patchContainer({ justify: v as Justify });

	// Guarded actions (Svelte doesn't narrow `container`/`widget` inside template closures).
	const removeContainer = () => container && op({ op: 'remove', id: container.id });
	const removeWidget = () => widget && op({ op: 'remove', id: widget.id });
	const dockWidget = () => widget && op({ op: 'dock', id: widget.id });
	const floatWidget = () => widget && op({ op: 'float', id: widget.id });
	const makeWidgetFromContainer = () => container && op({ op: 'makeWidget', id: container.id });
	const makeWidgetFromWidget = () => widget && op({ op: 'makeWidget', id: widget.id });
	const ungroupGroup = () => groupUnit && op({ op: 'ungroup', id: groupUnit.id });
	const removeGroup = () => groupUnit && op({ op: 'remove', id: groupUnit.id });
	const setGroupName = (name: string) =>
		groupUnit && op({ op: 'patchGroup', id: groupUnit.id, patch: { name } });
	const renameDefName = (name: string) => def && op({ op: 'renameDef', defId: def.id, name });
	const editDef = () => def && op({ op: 'editDef', defId: def.id });
	const setDefW = (w: number) => def && op({ op: 'setDefSize', defId: def.id, w, h: def.size.h });
	const setDefH = (h: number) => def && op({ op: 'setDefSize', defId: def.id, w: def.size.w, h });
	const setWidgetCss = (css: string) =>
		widget && op({ op: 'patchWidget', id: widget.id, patch: { css: css || undefined } });
	const setGroupCss = (css: string) =>
		groupUnit && op({ op: 'patchGroup', id: groupUnit.id, patch: { css: css || undefined } });
	const setDefCss = (css: string) => def && op({ op: 'setDefCss', defId: def.id, css });
	const setParam = (key: string, value: string) =>
		groupUnit &&
		op({
			op: 'patchGroup',
			id: groupUnit.id,
			patch: { params: { ...(groupUnit.params ?? {}), [key]: value } }
		});
	function addParam() {
		if (def && paramKey) {
			op({ op: 'addDefParam', defId: def.id, key: paramKey, target: paramTarget || undefined });
			paramKey = '';
			paramTarget = '';
		}
	}

	function updateRect(key: (typeof RECT_KEYS)[number], value: number) {
		if (widget) patchWidget({ rect: { ...widget.rect, [key]: value } });
	}

	function commitConfig() {
		try {
			const parsed = JSON.parse(configText) as Record<string, unknown>;
			configError = false;
			patchWidget({ config: parsed });
		} catch {
			configError = true;
		}
	}
</script>

<div class="inspector">
	<div class="palette">
		<span class="hd">Add</span>
		{#each types as t (t)}
			<button type="button" on:click={() => op({ op: 'addWidget', widgetType: t })}>{t}</button>
		{/each}
	</div>

	{#if defs.length}
		<div class="palette">
			<span class="hd">Library</span>
			{#each defs as d (d.id)}
				<span class="libitem">
					<button type="button" on:click={() => op({ op: 'insertWidget', defId: d.id })}
						>{d.name}</button
					>
					<button
						type="button"
						class="x"
						title="Delete def (only if unused)"
						on:click={() => op({ op: 'deleteDef', defId: d.id })}>✕</button
					>
				</span>
			{/each}
		</div>
	{/if}

	{#if container}
		<div class="fields">
			<span class="hd">{container.kind} · {container.id}</span>
			<label class="full">
				kind
				<select value={container.kind} on:change={(e) => setKind(e.currentTarget.value)}>
					<option value="row">row (hsplit)</option>
					<option value="col">col (vsplit)</option>
					<option value="grid">grid (panes)</option>
				</select>
			</label>
			{#if container.kind === 'grid'}
				<label class="full">
					cols
					<input
						type="number"
						min="1"
						value={container.cols ?? 1}
						on:input={(e) => patchContainer({ cols: Number(e.currentTarget.value) })}
					/>
				</label>
			{/if}
			<div class="row2">
				<label>
					gap
					<input
						type="number"
						value={container.gap ?? 0}
						on:input={(e) => patchContainer({ gap: Number(e.currentTarget.value) })}
					/>
				</label>
				<label>
					pad
					<input
						type="number"
						value={typeof container.pad === 'number' ? container.pad : 0}
						on:input={(e) => patchContainer({ pad: Number(e.currentTarget.value) })}
					/>
				</label>
			</div>
			<label class="full">
				align (cross)
				<select
					value={container.align ?? 'stretch'}
					on:change={(e) => setAlign(e.currentTarget.value)}
				>
					{#each ALIGNS as a (a)}<option value={a}>{a}</option>{/each}
				</select>
			</label>
			<label class="full">
				justify (main)
				<select
					value={container.justify ?? 'start'}
					on:change={(e) => setJustify(e.currentTarget.value)}
				>
					{#each JUSTIFIES as j (j)}<option value={j}>{j}</option>{/each}
				</select>
			</label>
			<label class="check">
				<input
					type="checkbox"
					checked={typeof container.basis === 'object'}
					on:change={(e) =>
						patchContainer({ basis: e.currentTarget.checked ? { fr: 1 } : undefined })}
				/>
				grow to fill (fr)
			</label>
			<div class="actions">
				<button type="button" on:click={makeWidgetFromContainer}>Make widget</button>
				<button type="button" class="remove" on:click={removeContainer}>Remove</button>
			</div>
		</div>
	{:else if widget}
		<div class="fields">
			<span class="hd">{widget.type} · {widget.id}</span>
			<label class="full">
				sensor
				<input
					list="sensor-list"
					value={widget.sensor ?? ''}
					placeholder="(none)"
					on:input={(e) => patchWidget({ sensor: e.currentTarget.value.trim() || undefined })}
				/>
			</label>
			<datalist id="sensor-list">
				{#each sensors as s (s)}
					<option value={s} />
				{/each}
			</datalist>
			{#if placement === 'floating'}
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
			{/if}
			<label class="full">
				config (JSON)
				<textarea
					rows="4"
					bind:value={configText}
					class:error={configError}
					on:change={commitConfig}
				/>
			</label>
			<label class="full">
				css
				<textarea
					rows="3"
					value={widget.css ?? ''}
					placeholder="color: red;  .value …"
					on:change={(e) => setWidgetCss(e.currentTarget.value)}
				/>
			</label>
			<div class="actions">
				{#if placement === 'floating'}
					<button type="button" on:click={dockWidget}>Dock →flow</button>
				{:else if placement === 'flow'}
					<button type="button" on:click={floatWidget}>Float</button>
				{/if}
				<button type="button" on:click={makeWidgetFromWidget}>Make widget</button>
				<button type="button" class="remove" on:click={removeWidget}>Remove</button>
			</div>
		</div>
	{:else if groupUnit}
		<div class="fields">
			<span class="hd">group · {groupUnit.id}</span>
			<label class="full">
				name
				<input value={groupUnit.name ?? ''} on:input={(e) => setGroupName(e.currentTarget.value)} />
			</label>
			{#if def}
				<label class="full">
					def name
					<input value={def.name} on:input={(e) => renameDefName(e.currentTarget.value)} />
				</label>
				<div class="row2">
					<label>
						def w
						<input
							type="number"
							value={def.size.w}
							on:input={(e) => setDefW(Number(e.currentTarget.value))}
						/>
					</label>
					<label>
						def h
						<input
							type="number"
							value={def.size.h}
							on:input={(e) => setDefH(Number(e.currentTarget.value))}
						/>
					</label>
				</div>
				<button type="button" on:click={editDef}>Edit def…</button>
				{#if def.params?.length}
					<span class="hd">Params</span>
					{#each def.params as p (p.key)}
						<label class="full">
							{p.key}{#if p.target}&nbsp;→ {p.target}{/if}
							<input
								value={`${groupUnit.params?.[p.key] ?? ''}`}
								on:input={(e) => setParam(p.key, e.currentTarget.value)}
							/>
						</label>
					{/each}
				{/if}
				<div class="row2">
					<input placeholder="param key" bind:value={paramKey} />
					<input placeholder="target e.g. unit.sensor" bind:value={paramTarget} />
				</div>
				<button type="button" on:click={addParam}>Add param</button>
				<label class="full">
					def css
					<textarea
						rows="3"
						value={def.css ?? ''}
						on:change={(e) => setDefCss(e.currentTarget.value)}
					/>
				</label>
			{:else}
				<div class="meta">inline group (no def)</div>
			{/if}
			<label class="full">
				css
				<textarea
					rows="3"
					value={groupUnit.css ?? ''}
					on:change={(e) => setGroupCss(e.currentTarget.value)}
				/>
			</label>
			<div class="actions">
				<button type="button" on:click={ungroupGroup}>Ungroup</button>
				<button type="button" class="remove" on:click={removeGroup}>Remove</button>
			</div>
		</div>
	{:else}
		<div class="hint">Select a widget, container, or group — or add one above.</div>
	{/if}

	<div class="fields tokens">
		<span class="hd">Theme tokens</span>
		{#each TOKEN_FIELDS as t (t.key)}
			<label class="full">
				{t.label}
				<input
					value={tokens[t.key] ?? ''}
					placeholder={t.ph}
					on:change={(e) => op({ op: 'setToken', key: t.key, value: e.currentTarget.value })}
				/>
			</label>
		{/each}
	</div>
</div>

<style>
	.inspector {
		position: absolute;
		bottom: 8px;
		left: 8px;
		width: 240px;
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

	.tokens {
		border-top: 1px solid #333;
		padding-top: 6px;
	}

	.row {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 4px;
	}

	.row2 {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 4px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	label.check {
		flex-direction: row;
		align-items: center;
		gap: 4px;
	}

	.actions {
		display: flex;
		gap: 4px;
	}

	input,
	textarea,
	select {
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

	.meta {
		color: #aaa;
		word-break: break-all;
	}

	.libitem {
		display: inline-flex;
	}

	.libitem .x {
		border-left: none;
		color: rgb(230, 160, 160);
		padding: 2px 4px;
	}
</style>
