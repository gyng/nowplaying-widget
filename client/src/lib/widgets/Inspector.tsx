// Editor inspector (edit mode): a palette to add widgets, plus a properties panel for
// the selected node — widget props (sensor / rect / config / dock·float) or container
// props (kind / cols / gap / pad / align / justify / grow). Emits a single `op` event;
// all state + persistence lives in Canvas.
import { useEffect, useMemo, useState, type DragEvent as ReactDragEvent } from 'react';
import type {
	Align,
	AlignH,
	AlignV,
	Container,
	Group,
	Justify,
	Length,
	Rect,
	WidgetDef,
	WidgetInstance
} from '../core/layoutTree';
import { getMeta } from '../core/widget';
import type { ConfigField } from '../core/widget';
import type { LayoutOp } from './ops';
import { clampSpacing, maxGap, maxPad } from './canvas/spacingGuard';
import { containerAlignControls, LEAF_H_OPTIONS, LEAF_V_OPTIONS } from './canvas/alignControls';
import './Inspector.css';

type Props = {
	widget?: WidgetInstance | null;
	container?: Container | null;
	groupUnit?: Group | null;
	def?: WidgetDef | null; // the selected group's def (for params)
	defs?: WidgetDef[]; // the whole library (for insert / delete)
	tokens?: Record<string, string>; // global token overrides (7d)
	// Manual-save baseline (item 2): the selected node / tokens as they were at the last save, so
	// changed fields can be flagged. `baseTokens === null` = no baseline (overlay / nothing saved);
	// `nodeIsNew` = the selected node didn't exist at the last save → all its fields read dirty.
	baseWidget?: WidgetInstance | null;
	baseContainer?: Container | null;
	baseGroup?: Group | null;
	baseTokens?: Record<string, string> | null;
	nodeIsNew?: boolean;
	isGridCell?: boolean; // the selected container is a grid cell → show cell sizing fields
	containerBox?: Rect | null; // the selected container's solved box — caps pad/gap to it (guardrail)
	placement?: 'flow' | 'floating' | null;
	widgetBasis?: Length; // the selected in-flow leaf's main-axis basis (drives the grow toggle)
	widgetHalign?: AlignH; // the selected leaf's horizontal placement within its box (default 'fill')
	widgetValign?: AlignV; // the selected leaf's vertical placement within its box (default 'fill')
	// In the studio this docks as the full-height right rail (vs a floating box on an overlay).
	docked?: boolean;
	widgetTypes?: { type: string; label: string }[]; // palette (8a)
	configFields?: ConfigField[]; // typed config schema for the selected widget (8a)
	sensors?: string[];
	// Optional id → display metadata, so HA (and other) sensor ids show a friendly label + unit in
	// the dropdown instead of the raw id. Missing entries just render the bare id.
	sensorMeta?: Record<string, { label?: string; unit?: string }>;
	onOp?: (op: LayoutOp) => void;
};

// The common tokens surfaced in the Theme panel (the rest are set via theme CSS).
const TOKEN_FIELDS = [
	{ key: '--np-accent', label: 'accent', ph: 'rgb(119, 196, 211)' },
	{ key: '--np-fg', label: 'text', ph: '#ffffff' },
	{ key: '--np-label', label: 'label', ph: 'rgb(218, 237, 226)' },
	{ key: '--np-track', label: 'track', ph: 'rgba(255, 255, 255, 0.15)' },
	{ key: '--np-font-display', label: 'font', ph: "'Bahnschrift', …" }
];

const RECT_KEYS = ['x', 'y', 'w', 'h'] as const;

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
		if (!b || ne(c.basis, b.basis)) d.add('basis');
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

// String / boolean views of a config value (avoids `as` casts in the template).
const cfgStr = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
const cfgBool = (v: unknown): boolean => !!v;
// Whether a basis means "grow/stretch along the parent's main axis" (an `fr` length).
const isFrBasis = (b?: Length): boolean => typeof b === 'object' && b !== null && 'fr' in b;

export default function Inspector({
	widget = null,
	container = null,
	groupUnit = null,
	def = null,
	defs = [],
	tokens = {},
	baseWidget = null,
	baseContainer = null,
	baseGroup = null,
	baseTokens = null,
	nodeIsNew = false,
	isGridCell = false,
	containerBox = null,
	placement = null,
	widgetBasis = undefined,
	widgetHalign = undefined,
	widgetValign = undefined,
	docked = false,
	widgetTypes = [],
	configFields = [],
	sensors = [],
	sensorMeta = {},
	onOp
}: Props) {
	const op = (o: LayoutOp) => onOp?.(o);

	const [paramKey, setParamKey] = useState('');
	const [paramTarget, setParamTarget] = useState('');

	const dirtyKeys = useMemo(
		() =>
			computeDirty(
				widget,
				container,
				groupUnit,
				tokens,
				baseWidget,
				baseContainer,
				baseGroup,
				baseTokens,
				nodeIsNew
			),
		[
			widget,
			container,
			groupUnit,
			tokens,
			baseWidget,
			baseContainer,
			baseGroup,
			baseTokens,
			nodeIsNew
		]
	);
	// The raw-JSON box mirrors the whole config, so it's dirty if any config field changed.
	const configDirty = [...dirtyKeys].some((k) => k.startsWith('config.'));

	const [configText, setConfigText] = useState('');
	const [configError, setConfigError] = useState(false);

	// Re-sync the raw-JSON box whenever the config object changes by reference — i.e. on
	// widget switch AND on every typed-field edit (setConfig makes a new config object).
	// This keeps the escape-hatch textarea in step with the schema fields, so committing
	// the JSON can't silently revert a field edit. Typing in the textarea doesn't change
	// widget.config until commit, so an in-progress edit is never clobbered.
	useEffect(() => {
		if (widget) {
			setConfigText(JSON.stringify(widget.config, null, 2));
			setConfigError(false);
		}
		// Re-sync only on config-object identity (widget switch + each committed edit), never on
		// other widget prop changes — that would clobber in-progress typing.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [widget?.config]);

	function patchWidget(patch: Partial<WidgetInstance>) {
		if (widget) op({ op: 'patchWidget', id: widget.id, patch });
	}

	function setConfig(key: string, value: unknown) {
		if (widget) patchWidget({ config: { ...widget.config, [key]: value } });
	}

	// A field's reset value: its own explicit `default`, else the widget type's defaultConfig[key].
	const widgetMeta = widget ? getMeta(widget.type) : undefined;
	const fieldDefault = (f: ConfigField): unknown =>
		f.default !== undefined ? f.default : widgetMeta?.defaultConfig?.[f.key];

	function patchContainer(patch: Partial<Container>) {
		if (container) op({ op: 'patchContainer', id: container.id, patch });
	}

	// Guardrail: cap pad/gap to the selected container's box so they can't collapse its content out
	// of existence (a pad larger than the box zeroes every child — panes vanish + become undroppable).
	const padMax = maxPad(containerBox);
	const gapMax = maxGap(containerBox);

	// Typed setters (the casts live here, not in the template).
	const setKind = (v: string) => patchContainer({ kind: v as Container['kind'] });
	// Write one of the orientation-aware alignment controls (align = cross / justify = main).
	const setAlignField = (field: 'align' | 'justify', v: string) =>
		patchContainer(field === 'align' ? { align: v as Align } : { justify: v as Justify });
	// The container's own main-axis sizing inside its parent: fit children / grow / fixed px.
	const setContainerSizing = (mode: string) =>
		patchContainer({
			basis:
				mode === 'grow'
					? { fr: 1 }
					: mode === 'fixed'
					? typeof container?.basis === 'number'
						? container.basis
						: 100
					: undefined
		});

	// Guarded actions.
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
	// A floating group's anchor (x/y) + per-instance size override (w/h) live in its `config`.
	const groupSize = def?.size ?? groupUnit?.size ?? { w: 0, h: 0 };
	const groupCfgNum = (k: 'x' | 'y' | 'w' | 'h'): number => {
		const v = groupUnit?.config?.[k];
		if (typeof v === 'number') return v;
		return k === 'w' ? groupSize.w : k === 'h' ? groupSize.h : 0;
	};
	const setGroupConfig = (k: string, v: number) =>
		groupUnit &&
		op({
			op: 'patchGroup',
			id: groupUnit.id,
			patch: { config: { ...(groupUnit.config ?? {}), [k]: v } }
		});
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
			setParamKey('');
			setParamTarget('');
		}
	}

	function updateRect(key: (typeof RECT_KEYS)[number], value: number) {
		if (widget) patchWidget({ rect: { ...widget.rect, [key]: value } });
	}

	function commitConfig() {
		try {
			const parsed = JSON.parse(configText) as Record<string, unknown>;
			setConfigError(false);
			patchWidget({ config: parsed });
		} catch {
			setConfigError(true);
		}
	}

	// Per-leaf placement controls (halign/valign), shared by the primitive-widget and group
	// branches — both are flow leaves whose Leaf wrapper carries the alignment. `id` is the leaf id.
	const leafAlignControls = (id: string) => (
		<>
			<span className="hd">Align in its space</span>
			<div className="row2">
				<label>
					horizontal
					<select
						value={widgetHalign ?? 'fill'}
						onChange={(e) =>
							op({
								op: 'setLeafAlign',
								id,
								halign: e.currentTarget.value as AlignH,
								valign: widgetValign ?? 'fill'
							})
						}
					>
						{LEAF_H_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				</label>
				<label>
					vertical
					<select
						value={widgetValign ?? 'fill'}
						onChange={(e) =>
							op({
								op: 'setLeafAlign',
								id,
								halign: widgetHalign ?? 'fill',
								valign: e.currentTarget.value as AlignV
							})
						}
					>
						{LEAF_V_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				</label>
			</div>
		</>
	);

	// A flow leaf's own main-axis sizing inside its parent: fit (its own/def size) / grow / fixed px.
	// Used for groups (custom widgets) — primitives have a richer select with 'content' measuring.
	const leafSizingControls = (id: string) => (
		<>
			<label className="full">
				size (in parent)
				<select
					value={
						isFrBasis(widgetBasis) ? 'grow' : typeof widgetBasis === 'number' ? 'fixed' : 'fit'
					}
					onChange={(e) => {
						const v = e.currentTarget.value;
						op({
							op: 'setBasis',
							id,
							basis:
								v === 'grow'
									? { fr: 1 }
									: v === 'fixed'
									? typeof widgetBasis === 'number'
										? widgetBasis
										: 100
									: undefined
						});
					}}
				>
					<option value="fit">fit — use its own size</option>
					<option value="grow">grow — stretch to fill</option>
					<option value="fixed">fixed (px)</option>
				</select>
			</label>
			{typeof widgetBasis === 'number' && (
				<label className="full">
					size (px)
					<input
						type="number"
						min="0"
						value={widgetBasis}
						onInput={(e) => op({ op: 'setBasis', id, basis: Number(e.currentTarget.value) || 0 })}
					/>
				</label>
			)}
		</>
	);

	return (
		<div className={['inspector', docked && 'docked'].filter(Boolean).join(' ')}>
			<div className="palette">
				<span className="hd">Add</span>
				{widgetTypes.map((w) => (
					<button
						key={w.type}
						type="button"
						draggable
						title="Click to add, drag onto the canvas to place it, or onto a container in the Outline"
						onClick={() => op({ op: 'addWidget', widgetType: w.type })}
						onDragStart={(e: ReactDragEvent) =>
							e.dataTransfer?.setData('text/x-widget-type', w.type)
						}
					>
						{w.label}
					</button>
				))}
			</div>

			{defs.length ? (
				<div className="palette">
					<span className="hd">Library</span>
					{defs.map((d) => (
						<span key={d.id} className="libitem">
							<button type="button" onClick={() => op({ op: 'insertWidget', defId: d.id })}>
								{d.name}
							</button>
							<button
								type="button"
								className="x"
								title="Delete def (only if unused)"
								onClick={() => op({ op: 'deleteDef', defId: d.id })}
							>
								✕
							</button>
						</span>
					))}
				</div>
			) : null}

			{container ? (
				<div className="fields">
					<span className="hd">
						{container.kind} · {container.id}
					</span>
					<label className={['full', dirtyKeys.has('kind') && 'dirty'].filter(Boolean).join(' ')}>
						kind
						<select value={container.kind} onChange={(e) => setKind(e.currentTarget.value)}>
							<option value="row">row (hsplit)</option>
							<option value="col">col (vsplit)</option>
							<option value="grid">grid (panes)</option>
						</select>
					</label>
					{container.kind === 'grid' && (
						<div className="row2">
							<label className={dirtyKeys.has('cols') ? 'dirty' : undefined}>
								cols
								<input
									type="number"
									min="1"
									value={container.cols ?? 1}
									onInput={(e) => patchContainer({ cols: Number(e.currentTarget.value) })}
								/>
							</label>
							<label className={dirtyKeys.has('rows') ? 'dirty' : undefined}>
								rows
								<input
									type="number"
									min="1"
									value={container.rows ?? 1}
									onInput={(e) => patchContainer({ rows: Number(e.currentTarget.value) })}
								/>
							</label>
						</div>
					)}
					<div className="row2">
						<label className={dirtyKeys.has('gap') ? 'dirty' : undefined}>
							gap
							<input
								type="number"
								min="0"
								max={gapMax}
								value={container.gap ?? 0}
								onInput={(e) =>
									patchContainer({ gap: clampSpacing(Number(e.currentTarget.value), gapMax) })
								}
							/>
						</label>
						<label className={dirtyKeys.has('pad') ? 'dirty' : undefined}>
							pad
							<input
								type="number"
								min="0"
								max={padMax}
								value={typeof container.pad === 'number' ? container.pad : 0}
								onInput={(e) =>
									patchContainer({ pad: clampSpacing(Number(e.currentTarget.value), padMax) })
								}
							/>
						</label>
					</div>
					<span className="hd">Align children</span>
					{containerAlignControls(container).map((ctl) => (
						<label
							key={ctl.axis}
							className={['full', dirtyKeys.has(ctl.field) && 'dirty'].filter(Boolean).join(' ')}
						>
							{ctl.label}
							<select
								value={ctl.value}
								onChange={(e) => setAlignField(ctl.field, e.currentTarget.value)}
							>
								{ctl.options.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</select>
						</label>
					))}
					<label className={['full', dirtyKeys.has('basis') && 'dirty'].filter(Boolean).join(' ')}>
						size (in parent)
						<select
							value={
								isFrBasis(container.basis)
									? 'grow'
									: typeof container.basis === 'number'
									? 'fixed'
									: 'fit'
							}
							onChange={(e) => setContainerSizing(e.currentTarget.value)}
						>
							<option value="fit">fit children</option>
							<option value="grow">grow — stretch to fill</option>
							<option value="fixed">fixed (px)</option>
						</select>
					</label>
					{typeof container.basis === 'number' && (
						<label className="full">
							size (px)
							<input
								type="number"
								min="0"
								value={container.basis}
								onInput={(e) => patchContainer({ basis: Number(e.currentTarget.value) || 0 })}
							/>
						</label>
					)}
					<label
						className={['check', dirtyKeys.has('overlap') && 'dirty'].filter(Boolean).join(' ')}
					>
						<input
							type="checkbox"
							checked={!!container.overlap}
							onChange={(e) => patchContainer({ overlap: e.currentTarget.checked || undefined })}
						/>
						stack children (overlap in one cell)
					</label>
					{isGridCell && (
						<>
							<span className="hd">Grid cell</span>
							<div className="row2">
								<label className={dirtyKeys.has('cellW') ? 'dirty' : undefined}>
									width (px)
									<input
										type="number"
										min="0"
										value={container.cellW ?? ''}
										placeholder="flex"
										onInput={(e) =>
											patchContainer({ cellW: Number(e.currentTarget.value) || undefined })
										}
									/>
								</label>
								<label className={dirtyKeys.has('cellH') ? 'dirty' : undefined}>
									height (px)
									<input
										type="number"
										min="0"
										value={container.cellH ?? ''}
										placeholder="flex"
										onInput={(e) =>
											patchContainer({ cellH: Number(e.currentTarget.value) || undefined })
										}
									/>
								</label>
							</div>
							<label
								className={['full', dirtyKeys.has('aspect') && 'dirty'].filter(Boolean).join(' ')}
							>
								aspect (w/h, e.g. 1 or 1.78)
								<input
									type="number"
									min="0"
									step="0.01"
									value={container.aspect ?? ''}
									placeholder="off"
									onInput={(e) =>
										patchContainer({ aspect: Number(e.currentTarget.value) || undefined })
									}
								/>
							</label>
						</>
					)}
					<div className="actions">
						<button type="button" onClick={makeWidgetFromContainer}>
							Make widget
						</button>
						<button type="button" className="remove" onClick={removeContainer}>
							Remove
						</button>
					</div>
				</div>
			) : widget ? (
				<div className="fields">
					<span className="hd">
						{widget.type} · {widget.id}
					</span>
					<label className={['full', dirtyKeys.has('sensor') && 'dirty'].filter(Boolean).join(' ')}>
						sensor
						<input
							list="sensor-list"
							value={widget.sensor ?? ''}
							placeholder="(none)"
							onInput={(e) => patchWidget({ sensor: e.currentTarget.value.trim() || undefined })}
						/>
					</label>
					<datalist id="sensor-list">
						{sensors.map((s) => {
							const m = sensorMeta[s];
							// Show a friendly label (+ unit) when known; the value bound stays the raw id.
							const label =
								m?.label && m.label !== s
									? m.unit
										? `${m.label} (${m.unit})`
										: m.label
									: undefined;
							return <option key={s} value={s} label={label} />;
						})}
					</datalist>
					{placement === 'floating' && (
						<div className="row">
							{RECT_KEYS.map((key) => (
								<label key={key} className={dirtyKeys.has('rect.' + key) ? 'dirty' : undefined}>
									{key}
									<input
										type="number"
										value={widget.rect[key]}
										onInput={(e) => updateRect(key, Number(e.currentTarget.value))}
									/>
								</label>
							))}
						</div>
					)}
					{placement === 'flow' && (
						<>
							<div className="row2">
								{(['w', 'h'] as const).map((key) => (
									<label key={key} className={dirtyKeys.has('rect.' + key) ? 'dirty' : undefined}>
										{key} (fixed)
										<input
											type="number"
											value={widget.rect[key]}
											onInput={(e) => updateRect(key, Number(e.currentTarget.value))}
										/>
									</label>
								))}
							</div>
							<label className="full">
								size along the row / column
								<select
									value={
										isFrBasis(widgetBasis)
											? 'grow'
											: widgetBasis === 'content'
											? 'content'
											: 'fixed'
									}
									onChange={(e) => {
										const v = e.currentTarget.value;
										op({
											op: 'setBasis',
											id: widget.id,
											basis: v === 'grow' ? { fr: 1 } : v === 'content' ? 'content' : undefined
										});
									}}
								>
									<option value="fixed">fixed — use the w/h above</option>
									<option value="content">fit to content — measure the rendered size</option>
									<option value="grow">grow — stretch to fill</option>
								</select>
							</label>
							{leafAlignControls(widget.id)}
						</>
					)}
					{configFields.map((f) => {
						// The reset button lives OUTSIDE the <label> (positioned over its top-right) so the
						// field's input stays the label's labeled control — a nested button would otherwise
						// become the label's control (a11y regression + clicking the label would reset it).
						const def = fieldDefault(f);
						return (
							<div className="cfg-field" key={f.key}>
								<button
									type="button"
									className="reset-field"
									title="Reset to default"
									disabled={def === undefined}
									onClick={() => setConfig(f.key, def)}
								>
									↺
								</button>
								<label
									title={f.help}
									className={['full', dirtyKeys.has('config.' + f.key) && 'dirty']
										.filter(Boolean)
										.join(' ')}
								>
									{f.label}
									{f.kind === 'number' ? (
										<input
											type="number"
											value={cfgStr(widget.config[f.key])}
											onInput={(e) =>
												setConfig(
													f.key,
													e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value)
												)
											}
										/>
									) : f.kind === 'toggle' ? (
										<input
											type="checkbox"
											checked={cfgBool(widget.config[f.key])}
											onChange={(e) => setConfig(f.key, e.currentTarget.checked)}
										/>
									) : f.kind === 'select' ? (
										<select
											value={cfgStr(widget.config[f.key])}
											onChange={(e) => setConfig(f.key, e.currentTarget.value)}
										>
											{f.options.map((o) => (
												<option key={o} value={o}>
													{o}
												</option>
											))}
										</select>
									) : (
										<input
											type="text"
											value={cfgStr(widget.config[f.key])}
											placeholder={f.kind === 'color' ? 'css color' : ''}
											onInput={(e) => setConfig(f.key, e.currentTarget.value || undefined)}
										/>
									)}
									{f.help ? <small className="field-help">{f.help}</small> : null}
								</label>
							</div>
						);
					})}
					<label className={['full', configDirty && 'dirty'].filter(Boolean).join(' ')}>
						config (JSON)
						<textarea
							rows={4}
							value={configText}
							className={configError ? 'error' : undefined}
							onChange={(e) => setConfigText(e.currentTarget.value)}
							onBlur={commitConfig}
						/>
					</label>
					<label className={['full', dirtyKeys.has('css') && 'dirty'].filter(Boolean).join(' ')}>
						css
						<textarea
							rows={3}
							defaultValue={widget.css ?? ''}
							key={widget.id}
							placeholder="color: red;  .value …"
							onBlur={(e) => setWidgetCss(e.currentTarget.value)}
						/>
					</label>
					<div className="actions">
						{placement === 'floating' ? (
							<button type="button" onClick={dockWidget}>
								Dock →flow
							</button>
						) : placement === 'flow' ? (
							<button type="button" onClick={floatWidget}>
								Float
							</button>
						) : null}
						<button type="button" onClick={makeWidgetFromWidget}>
							Make widget
						</button>
						<button
							type="button"
							title="Restore config / css / sensor to this widget's defaults"
							onClick={resetWidget}
						>
							Reset
						</button>
						<button type="button" className="remove" onClick={removeWidget}>
							Remove
						</button>
					</div>
				</div>
			) : groupUnit ? (
				<div className="fields">
					<span className="hd">group · {groupUnit.id}</span>
					<label className={['full', dirtyKeys.has('name') && 'dirty'].filter(Boolean).join(' ')}>
						name
						<input
							value={groupUnit.name ?? ''}
							onInput={(e) => setGroupName(e.currentTarget.value)}
						/>
					</label>
					{placement === 'flow' && (
						<>
							{leafSizingControls(groupUnit.id)}
							{leafAlignControls(groupUnit.id)}
						</>
					)}
					{placement === 'floating' && (
						<div className="row">
							{(['x', 'y', 'w', 'h'] as const).map((k) => (
								<label key={k}>
									{k}
									<input
										type="number"
										value={groupCfgNum(k)}
										onInput={(e) => setGroupConfig(k, Number(e.currentTarget.value))}
									/>
								</label>
							))}
						</div>
					)}
					{def ? (
						<>
							<label className="full">
								def name
								<input value={def.name} onInput={(e) => renameDefName(e.currentTarget.value)} />
							</label>
							<div className="row2">
								<label>
									def w
									<input
										type="number"
										value={def.size.w}
										onInput={(e) => setDefW(Number(e.currentTarget.value))}
									/>
								</label>
								<label>
									def h
									<input
										type="number"
										value={def.size.h}
										onInput={(e) => setDefH(Number(e.currentTarget.value))}
									/>
								</label>
							</div>
							<button type="button" onClick={editDef}>
								Edit def…
							</button>
							{def.params?.length ? (
								<>
									<span className="hd">Params</span>
									{def.params.map((p) => (
										<label
											key={p.key}
											className={['full', dirtyKeys.has('param.' + p.key) && 'dirty']
												.filter(Boolean)
												.join(' ')}
										>
											{p.key}
											{p.target ? <>&nbsp;→ {p.target}</> : null}
											<input
												value={`${groupUnit.params?.[p.key] ?? ''}`}
												onInput={(e) => setParam(p.key, e.currentTarget.value)}
											/>
										</label>
									))}
								</>
							) : null}
							<div className="row2">
								<input
									placeholder="param key"
									value={paramKey}
									onChange={(e) => setParamKey(e.currentTarget.value)}
								/>
								<input
									placeholder="target e.g. unit.sensor"
									value={paramTarget}
									onChange={(e) => setParamTarget(e.currentTarget.value)}
								/>
							</div>
							<button type="button" onClick={addParam}>
								Add param
							</button>
							<label className="full">
								def css
								<textarea
									rows={3}
									defaultValue={def.css ?? ''}
									key={def.id}
									onBlur={(e) => setDefCss(e.currentTarget.value)}
								/>
							</label>
						</>
					) : (
						<div className="meta">inline group (no def)</div>
					)}
					<label className={['full', dirtyKeys.has('css') && 'dirty'].filter(Boolean).join(' ')}>
						css
						<textarea
							rows={3}
							defaultValue={groupUnit.css ?? ''}
							key={groupUnit.id}
							onBlur={(e) => setGroupCss(e.currentTarget.value)}
						/>
					</label>
					<div className="actions">
						<button type="button" onClick={ungroupGroup}>
							Ungroup
						</button>
						<button type="button" className="remove" onClick={removeGroup}>
							Remove
						</button>
					</div>
				</div>
			) : (
				<div className="hint">Select a widget, container, or group — or add one above.</div>
			)}

			<div className="fields tokens">
				<span className="hd">Theme tokens</span>
				{TOKEN_FIELDS.map((t) => (
					<label
						key={t.key}
						className={['full', dirtyKeys.has('token.' + t.key) && 'dirty']
							.filter(Boolean)
							.join(' ')}
					>
						{t.label}
						<input
							defaultValue={tokens[t.key] ?? ''}
							key={`${t.key}:${tokens[t.key] ?? ''}`}
							placeholder={t.ph}
							onBlur={(e) => op({ op: 'setToken', key: t.key, value: e.currentTarget.value })}
						/>
					</label>
				))}
			</div>
		</div>
	);
}
