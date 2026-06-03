// Editor inspector (edit mode): a palette to add widgets, plus a properties panel for
// the selected node — widget props (sensor / rect / config / dock·float) or container
// props (kind / cols / gap / pad / align / justify / grow). Emits a single `op` event;
// all state + persistence lives in Canvas.
import { useEffect, useMemo, useState, type DragEvent as ReactDragEvent } from 'react';
import type {
	Align,
	Container,
	Group,
	Justify,
	WidgetDef,
	WidgetInstance
} from '../core/layoutTree';
import { getMeta } from '../core/widget';
import type { ConfigField } from '../core/widget';
import type { LayoutOp } from './ops';
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
	placement?: 'flow' | 'floating' | null;
	// In the studio this docks as the full-height right rail (vs a floating box on an overlay).
	docked?: boolean;
	widgetTypes?: { type: string; label: string }[]; // palette (8a)
	configFields?: ConfigField[]; // typed config schema for the selected widget (8a)
	sensors?: string[];
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
const ALIGNS: Align[] = ['start', 'center', 'end', 'stretch'];
const JUSTIFIES: Justify[] = ['start', 'center', 'end', 'between', 'around'];

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

// String / boolean views of a config value (avoids `as` casts in the template).
const cfgStr = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
const cfgBool = (v: unknown): boolean => !!v;

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
	placement = null,
	docked = false,
	widgetTypes = [],
	configFields = [],
	sensors = [],
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

	// Typed setters (the casts live here, not in the template).
	const setKind = (v: string) => patchContainer({ kind: v as Container['kind'] });
	const setAlign = (v: string) => patchContainer({ align: v as Align });
	const setJustify = (v: string) => patchContainer({ justify: v as Justify });

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
								value={container.gap ?? 0}
								onInput={(e) => patchContainer({ gap: Number(e.currentTarget.value) })}
							/>
						</label>
						<label className={dirtyKeys.has('pad') ? 'dirty' : undefined}>
							pad
							<input
								type="number"
								value={typeof container.pad === 'number' ? container.pad : 0}
								onInput={(e) => patchContainer({ pad: Number(e.currentTarget.value) })}
							/>
						</label>
					</div>
					<label className={['full', dirtyKeys.has('align') && 'dirty'].filter(Boolean).join(' ')}>
						align (cross)
						<select
							value={container.align ?? 'stretch'}
							onChange={(e) => setAlign(e.currentTarget.value)}
						>
							{ALIGNS.map((a) => (
								<option key={a} value={a}>
									{a}
								</option>
							))}
						</select>
					</label>
					<label
						className={['full', dirtyKeys.has('justify') && 'dirty'].filter(Boolean).join(' ')}
					>
						justify (main)
						<select
							value={container.justify ?? 'start'}
							onChange={(e) => setJustify(e.currentTarget.value)}
						>
							{JUSTIFIES.map((j) => (
								<option key={j} value={j}>
									{j}
								</option>
							))}
						</select>
					</label>
					<label className={['check', dirtyKeys.has('basis') && 'dirty'].filter(Boolean).join(' ')}>
						<input
							type="checkbox"
							checked={typeof container.basis === 'object'}
							onChange={(e) =>
								patchContainer({ basis: e.currentTarget.checked ? { fr: 1 } : undefined })
							}
						/>
						grow to fill (fr)
					</label>
					<label
						className={['check', dirtyKeys.has('overlap') && 'dirty'].filter(Boolean).join(' ')}
					>
						<input
							type="checkbox"
							checked={!!container.overlap}
							onChange={(e) => patchContainer({ overlap: e.currentTarget.checked || undefined })}
						/>
						overlap children (same cell)
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
						{sensors.map((s) => (
							<option key={s} value={s} />
						))}
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
