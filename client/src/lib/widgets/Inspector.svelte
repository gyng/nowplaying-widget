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
	import type { ConfigField } from '../core/widget';
	import type { LayoutOp } from './ops';

	export let widget: WidgetInstance | null = null;
	export let container: Container | null = null;
	export let groupUnit: Group | null = null;
	export let def: WidgetDef | null = null; // the selected group's def (for params)
	export let defs: WidgetDef[] = []; // the whole library (for insert / delete)
	export let tokens: Record<string, string> = {}; // global token overrides (7d)
	// Manual-save baseline (item 2): the selected node / tokens as they were at the last save, so
	// changed fields can be flagged. `baseTokens === null` = no baseline (overlay / nothing saved);
	// `nodeIsNew` = the selected node didn't exist at the last save → all its fields read dirty.
	export let baseWidget: WidgetInstance | null = null;
	export let baseContainer: Container | null = null;
	export let baseGroup: Group | null = null;
	export let baseTokens: Record<string, string> | null = null;
	export let nodeIsNew = false;
	export let isGridCell = false; // the selected container is a grid cell → show cell sizing fields
	export let placement: 'flow' | 'floating' | null = null;
	// In the studio this docks as the full-height right rail (vs a floating box on an overlay).
	export let docked = false;
	export let widgetTypes: { type: string; label: string }[] = []; // palette (8a)
	export let configFields: ConfigField[] = []; // typed config schema for the selected widget (8a)
	export let sensors: string[] = [];

	// The common tokens surfaced in the Theme panel (the rest are set via theme CSS).
	const TOKEN_FIELDS = [
		{ key: '--np-accent', label: 'accent', ph: 'rgb(119, 196, 211)' },
		{ key: '--np-fg', label: 'text', ph: '#ffffff' },
		{ key: '--np-label', label: 'label', ph: 'rgb(218, 237, 226)' },
		{ key: '--np-track', label: 'track', ph: 'rgba(255, 255, 255, 0.15)' },
		{ key: '--np-font-display', label: 'font', ph: "'Bahnschrift', …" }
	];

	let paramKey = '';
	let paramTarget = '';

	const RECT_KEYS = ['x', 'y', 'w', 'h'] as const;
	const ALIGNS: Align[] = ['start', 'center', 'end', 'stretch'];
	const JUSTIFIES: Justify[] = ['start', 'center', 'end', 'between', 'around'];

	const dispatch = createEventDispatcher<{ op: LayoutOp }>();
	const op = (o: LayoutOp) => dispatch('op', o);

	// --- dirty-field tracking (item 2): the set of field keys that differ from the saved baseline.
	// A `label`/field marks itself dirty via `dirtyKeys.has('<key>')`. Keys: sensor, rect.<x|y|w|h>,
	// config.<key>, css, kind/cols/rows/gap/pad/align/justify/basis, name, param.<key>, token.<key>.
	const ne = (a: unknown, b: unknown): boolean =>
		JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
	function computeDirty(
		w: WidgetInstance | null,
		c: Container | null,
		g: Group | null,
		tk: Record<string, string>,
		bw: WidgetInstance | null,
		bc: Container | null,
		bg: Group | null,
		btk: Record<string, string> | null,
		isNew: boolean
	): Set<string> {
		const d = new Set<string>();
		if (w) {
			const b = isNew ? null : bw;
			if (!b || ne(w.sensor, b.sensor)) d.add('sensor');
			for (const k of RECT_KEYS) if (!b || w.rect[k] !== b.rect[k]) d.add('rect.' + k);
			const keys = new Set([...Object.keys(w.config ?? {}), ...Object.keys(b?.config ?? {})]);
			for (const k of keys) if (!b || ne(w.config?.[k], b.config?.[k])) d.add('config.' + k);
			if (!b || ne(w.css, b.css)) d.add('css');
		}
		if (c) {
			const b = isNew ? null : bc;
			if (!b || ne(c.kind, b.kind)) d.add('kind');
			if (!b || ne(c.cols, b.cols)) d.add('cols');
			if (!b || ne(c.rows, b.rows)) d.add('rows');
			if (!b || ne(c.gap, b.gap)) d.add('gap');
			if (!b || ne(c.pad, b.pad)) d.add('pad');
			if (!b || ne(c.align, b.align)) d.add('align');
			if (!b || ne(c.justify, b.justify)) d.add('justify');
			if (!b || (typeof c.basis === 'object') !== (typeof b.basis === 'object')) d.add('basis');
			if (!b || !!c.overlap !== !!b.overlap) d.add('overlap');
			if (!b || ne(c.cellW, b.cellW)) d.add('cellW');
			if (!b || ne(c.cellH, b.cellH)) d.add('cellH');
			if (!b || ne(c.aspect, b.aspect)) d.add('aspect');
		}
		if (g) {
			const b = isNew ? null : bg;
			if (!b || ne(g.name, b.name)) d.add('name');
			if (!b || ne(g.css, b.css)) d.add('css');
			const keys = new Set([...Object.keys(g.params ?? {}), ...Object.keys(b?.params ?? {})]);
			for (const k of keys) if (!b || ne(g.params?.[k], b.params?.[k])) d.add('param.' + k);
		}
		if (btk) {
			const keys = new Set([...Object.keys(tk), ...Object.keys(btk)]);
			for (const k of keys) if ((tk[k] ?? '') !== (btk[k] ?? '')) d.add('token.' + k);
		}
		return d;
	}
	$: dirtyKeys = computeDirty(
		widget,
		container,
		groupUnit,
		tokens,
		baseWidget,
		baseContainer,
		baseGroup,
		baseTokens,
		nodeIsNew
	);
	// The raw-JSON box mirrors the whole config, so it's dirty if any config field changed.
	$: configDirty = [...dirtyKeys].some((k) => k.startsWith('config.'));

	let configText = '';
	let configError = false;
	let lastConfig: Record<string, unknown> | null = null;

	// Re-sync the raw-JSON box whenever the config object changes by reference — i.e. on
	// widget switch AND on every typed-field edit (setConfig makes a new config object).
	// This keeps the escape-hatch textarea in step with the schema fields, so committing
	// the JSON can't silently revert a field edit. Typing in the textarea doesn't change
	// widget.config until commit, so an in-progress edit is never clobbered.
	$: if (widget && widget.config !== lastConfig) {
		lastConfig = widget.config;
		configText = JSON.stringify(widget.config, null, 2);
		configError = false;
	}

	function patchWidget(patch: Partial<WidgetInstance>) {
		if (widget) op({ op: 'patchWidget', id: widget.id, patch });
	}

	function setConfig(key: string, value: unknown) {
		if (widget) patchWidget({ config: { ...widget.config, [key]: value } });
	}

	// String / boolean views of a config value (avoids `as` casts in the template, which
	// Svelte's parser rejects).
	const cfgStr = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
	const cfgBool = (v: unknown): boolean => !!v;

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
	const resetWidget = () => widget && op({ op: 'resetWidget', id: widget.id });
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

<div class="inspector" class:docked>
	<div class="palette">
		<span class="hd">Add</span>
		{#each widgetTypes as w (w.type)}
			<button
				type="button"
				draggable="true"
				title="Click to add, or drag onto a container in the Outline"
				on:click={() => op({ op: 'addWidget', widgetType: w.type })}
				on:dragstart={(e) => e.dataTransfer?.setData('text/x-widget-type', w.type)}
				>{w.label}</button
			>
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
			<label class="full" class:dirty={dirtyKeys.has('kind')}>
				kind
				<select value={container.kind} on:change={(e) => setKind(e.currentTarget.value)}>
					<option value="row">row (hsplit)</option>
					<option value="col">col (vsplit)</option>
					<option value="grid">grid (panes)</option>
				</select>
			</label>
			{#if container.kind === 'grid'}
				<div class="row2">
					<label class:dirty={dirtyKeys.has('cols')}>
						cols
						<input
							type="number"
							min="1"
							value={container.cols ?? 1}
							on:input={(e) => patchContainer({ cols: Number(e.currentTarget.value) })}
						/>
					</label>
					<label class:dirty={dirtyKeys.has('rows')}>
						rows
						<input
							type="number"
							min="1"
							value={container.rows ?? 1}
							on:input={(e) => patchContainer({ rows: Number(e.currentTarget.value) })}
						/>
					</label>
				</div>
			{/if}
			<div class="row2">
				<label class:dirty={dirtyKeys.has('gap')}>
					gap
					<input
						type="number"
						value={container.gap ?? 0}
						on:input={(e) => patchContainer({ gap: Number(e.currentTarget.value) })}
					/>
				</label>
				<label class:dirty={dirtyKeys.has('pad')}>
					pad
					<input
						type="number"
						value={typeof container.pad === 'number' ? container.pad : 0}
						on:input={(e) => patchContainer({ pad: Number(e.currentTarget.value) })}
					/>
				</label>
			</div>
			<label class="full" class:dirty={dirtyKeys.has('align')}>
				align (cross)
				<select
					value={container.align ?? 'stretch'}
					on:change={(e) => setAlign(e.currentTarget.value)}
				>
					{#each ALIGNS as a (a)}<option value={a}>{a}</option>{/each}
				</select>
			</label>
			<label class="full" class:dirty={dirtyKeys.has('justify')}>
				justify (main)
				<select
					value={container.justify ?? 'start'}
					on:change={(e) => setJustify(e.currentTarget.value)}
				>
					{#each JUSTIFIES as j (j)}<option value={j}>{j}</option>{/each}
				</select>
			</label>
			<label class="check" class:dirty={dirtyKeys.has('basis')}>
				<input
					type="checkbox"
					checked={typeof container.basis === 'object'}
					on:change={(e) =>
						patchContainer({ basis: e.currentTarget.checked ? { fr: 1 } : undefined })}
				/>
				grow to fill (fr)
			</label>
			<label class="check" class:dirty={dirtyKeys.has('overlap')}>
				<input
					type="checkbox"
					checked={!!container.overlap}
					on:change={(e) => patchContainer({ overlap: e.currentTarget.checked || undefined })}
				/>
				overlap children (same cell)
			</label>
			{#if isGridCell}
				<span class="hd">Grid cell</span>
				<div class="row2">
					<label class:dirty={dirtyKeys.has('cellW')}>
						width (px)
						<input
							type="number"
							min="0"
							value={container.cellW ?? ''}
							placeholder="flex"
							on:input={(e) =>
								patchContainer({ cellW: Number(e.currentTarget.value) || undefined })}
						/>
					</label>
					<label class:dirty={dirtyKeys.has('cellH')}>
						height (px)
						<input
							type="number"
							min="0"
							value={container.cellH ?? ''}
							placeholder="flex"
							on:input={(e) =>
								patchContainer({ cellH: Number(e.currentTarget.value) || undefined })}
						/>
					</label>
				</div>
				<label class="full" class:dirty={dirtyKeys.has('aspect')}>
					aspect (w/h, e.g. 1 or 1.78)
					<input
						type="number"
						min="0"
						step="0.01"
						value={container.aspect ?? ''}
						placeholder="off"
						on:input={(e) => patchContainer({ aspect: Number(e.currentTarget.value) || undefined })}
					/>
				</label>
			{/if}
			<div class="actions">
				<button type="button" on:click={makeWidgetFromContainer}>Make widget</button>
				<button type="button" class="remove" on:click={removeContainer}>Remove</button>
			</div>
		</div>
	{:else if widget}
		<div class="fields">
			<span class="hd">{widget.type} · {widget.id}</span>
			<label class="full" class:dirty={dirtyKeys.has('sensor')}>
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
						<label class:dirty={dirtyKeys.has('rect.' + key)}>
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
			{#each configFields as f (f.key)}
				<label class="full" class:dirty={dirtyKeys.has('config.' + f.key)}>
					{f.label}
					{#if f.kind === 'number'}
						<input
							type="number"
							value={cfgStr(widget.config[f.key])}
							on:input={(e) =>
								setConfig(
									f.key,
									e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value)
								)}
						/>
					{:else if f.kind === 'toggle'}
						<input
							type="checkbox"
							checked={cfgBool(widget.config[f.key])}
							on:change={(e) => setConfig(f.key, e.currentTarget.checked)}
						/>
					{:else if f.kind === 'select'}
						<select
							value={cfgStr(widget.config[f.key])}
							on:change={(e) => setConfig(f.key, e.currentTarget.value)}
						>
							{#each f.options as o (o)}<option value={o}>{o}</option>{/each}
						</select>
					{:else}
						<input
							type="text"
							value={cfgStr(widget.config[f.key])}
							placeholder={f.kind === 'color' ? 'css color' : ''}
							on:input={(e) => setConfig(f.key, e.currentTarget.value || undefined)}
						/>
					{/if}
				</label>
			{/each}
			<label class="full" class:dirty={configDirty}>
				config (JSON)
				<textarea
					rows="4"
					bind:value={configText}
					class:error={configError}
					on:change={commitConfig}
				/>
			</label>
			<label class="full" class:dirty={dirtyKeys.has('css')}>
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
				<button
					type="button"
					title="Restore config / css / sensor to this widget's defaults"
					on:click={resetWidget}>Reset</button
				>
				<button type="button" class="remove" on:click={removeWidget}>Remove</button>
			</div>
		</div>
	{:else if groupUnit}
		<div class="fields">
			<span class="hd">group · {groupUnit.id}</span>
			<label class="full" class:dirty={dirtyKeys.has('name')}>
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
						<label class="full" class:dirty={dirtyKeys.has('param.' + p.key)}>
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
			<label class="full" class:dirty={dirtyKeys.has('css')}>
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
			<label class="full" class:dirty={dirtyKeys.has('token.' + t.key)}>
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

	/* Studio: a full-height, scrollable right rail in the reserved margin (no stage overlap). */
	.inspector.docked {
		position: fixed;
		top: var(--bar-h, 36px);
		right: 0;
		left: auto;
		bottom: 0;
		width: var(--rail-r, 264px);
		max-height: none;
		overflow-y: auto;
		border-width: 0 0 0 1px;
		border-radius: 0;
		z-index: 6;
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

	/* Dirty (unsaved) field indicator (item 2): accent the label + tint the control. */
	label.dirty {
		color: rgb(150, 214, 228);
	}

	label.dirty > input,
	label.dirty > select,
	label.dirty > textarea {
		border-color: rgba(119, 196, 211, 0.75);
		background: rgba(119, 196, 211, 0.07);
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
