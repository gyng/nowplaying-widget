// Built-in layout templates ("presets"): the author's `gyng\*` desktop skins recreated as
// RESPONSIVE FLOW GROUPS. Each template is a flow TREE (row/col + basis + halign) that becomes a
// reusable WidgetDef (one draggable group) when dropped from the studio — so the layout hugs/fills
// instead of being pinned to fixed pixel rects. Framework-agnostic and pure (no Svelte/Tauri), so
// it's testable and reusable; node ids here are template-local and are remapped to fresh ids on
// insert (useEditorModel.templateDef).

import type {
	AlignH,
	Container,
	LayoutNode,
	Leaf,
	Length,
	Pad,
	WidgetInstance
} from './layoutTree';
import { container } from './layoutTree';
import { NOWPLAYING_DEFAULT_CSS } from './widget';

// A primitive widget instance. `rect` is the leaf's stored box — it's the slot size for an 'auto'/
// 'content' FILL meter (gauge/sparkline/analogclock) and a fallback; intrinsic text meters on
// 'content' ignore it and shrink-wrap their text instead (flowStyle).
const prim = (
	id: string,
	type: string,
	config: Record<string, unknown> = {},
	opts: { sensor?: string; css?: string; w?: number; h?: number } = {}
): WidgetInstance => ({
	id,
	type,
	rect: { x: 0, y: 0, w: opts.w ?? 100, h: opts.h ?? 24 },
	config,
	...(opts.sensor ? { sensor: opts.sensor } : {}),
	...(opts.css ? { css: opts.css } : {})
});

// Wrap a primitive as a flow leaf with an optional main-axis basis + horizontal placement, plus an
// optional per-side box (outer `margin` between this leaf and its flow siblings, inner `pad`).
const lf = (
	unit: WidgetInstance,
	basis?: Length,
	halign?: AlignH,
	box?: { margin?: Pad; pad?: Pad }
): Leaf => ({
	id: unit.id,
	unit,
	...(basis !== undefined ? { basis } : {}),
	...(halign ? { halign } : {}),
	...(box?.margin !== undefined ? { margin: box.margin } : {}),
	...(box?.pad !== undefined ? { pad: box.pad } : {})
});

// Map the `separator` option to the literal that sits between the hour and the minute (none = the
// gyng\DateTime "HHmm" look). The time format then composes the hour width + separator + AM/PM marker.
const TIME_SEPARATORS: Record<string, string> = { none: '', colon: ':', dot: '.' };
function timeFormat(hour: string, separator: string): string {
	const sep = TIME_SEPARATORS[separator] ?? '';
	return hour === '12' ? `h${sep}mm A` : `HH${sep}mm`;
}

// gyng\DateTime (+ the Enigma analog icon on top, as in the saved layout): a small clock icon, the
// time, the weekday glyph, and a "D MMMM" date row. Text leaves use basis 'content' so each hugs its
// own text (the date "5" + month "JUNE" sit adjacent); the icon is a fixed square with a bottom margin
// so it sits clear of the time. The languages + hour + separator come from the template's options; the
// defaults reproduce the original (ja weekday, en date, 24-hour, no separator → "1700 / 火 / 5 JUNE").
function clockTree(opts: Record<string, string> = {}): Container {
	const weekdayLang = opts.weekdayLang ?? 'ja';
	const dateLang = opts.dateLang ?? 'en';
	const time = timeFormat(opts.hour ?? '24', opts.separator ?? 'none');
	return container(
		'dt-root',
		'col',
		[
			lf(
				prim(
					'dt-icon',
					'analogclock',
					{ showSeconds: true, showTicks: false, showNumbers: false, showCap: false },
					{ w: 30, h: 30 }
				),
				'content',
				'left',
				{ margin: { t: 0, r: 0, b: 8, l: 0 } }
			),
			lf(prim('dt-time', 'clock', { format: time }, { w: 150, h: 34 }), 'content'),
			lf(
				prim('dt-day', 'clock', { format: 'ddd', locale: weekdayLang }, { w: 60, h: 34 }),
				'content'
			),
			container(
				'dt-date-row',
				'row',
				[
					lf(
						prim('dt-date', 'clock', { format: 'D', locale: dateLang }, { w: 30, h: 22 }),
						'content'
					),
					lf(
						prim(
							'dt-month',
							'clock',
							{ format: 'MMMM', locale: dateLang },
							{ w: 100, h: 22, css: 'text-transform: uppercase;' }
						),
						'content'
					)
				],
				{ align: 'end', gap: 6, basis: 'content' }
			)
		],
		{ align: 'stretch', gap: 2 }
	);
}

// gyng\System: CPU/RAM/SWAP on one row, GPU/VRAM on the next, then the per-core CPU widget (its own
// 8-wide sparkline grid) filling the rest. Each value cell grows to an equal share of its row.
function systemTree(): Container {
	const val = (id: string, label: string, sensor: string): Leaf =>
		lf(prim(id, 'text', { label, format: 'integer' }, { sensor, w: 50, h: 16 }), { fr: 1 });
	return container(
		'sys-root',
		'col',
		[
			container(
				'sys-row1',
				'row',
				[
					val('sys-cpu', 'CPU', 'cpu.total'),
					val('sys-ram', 'RAM', 'mem.used'),
					val('sys-swap', 'SWAP', 'swap.used')
				],
				{
					gap: 6,
					basis: 'content'
				}
			),
			container(
				'sys-row2',
				'row',
				[
					val('sys-gpu', 'GPU', 'gpu.util'),
					val('sys-vram', 'VRAM', 'gpu.vram'),
					// Empty third column so VRAM sits under RAM (col 2 of 3), matching the CPU/RAM/SWAP row.
					container('sys-row2-pad', 'col', [], { basis: { fr: 1 } })
				],
				{ gap: 6, basis: 'content' }
			),
			// Per-core lines: thin, foreground-coloured (no baked literal → follows --np-fg / the active
			// theme), short window + rounded joins to match the classic LINE meters. `cols: 8` → 8 cores
			// per row (the System skin's grid), wrapping as needed. A top margin clears the number row above.
			lf(
				prim(
					'sys-cores',
					'cpu',
					{ mode: 'cores', cols: 8, seconds: 20, lineWidth: 1 },
					{ w: 150, h: 70 }
				),
				{ fr: 1 },
				undefined,
				{ margin: { t: 8, r: 0, b: 0, l: 0 } }
			)
		],
		{ align: 'stretch', gap: 4 }
	);
}

// gyng\Network: out (cyan ▲) over in (mint ▼) throughput histograms — FIXED-height rows so the
// cluster never shifts vertically — then a rate row (up left, down right). Each rate cell is a fixed
// fr half with tabular digits, the up value right-anchored + the down value left-anchored, so the
// numbers grow OUTWARD from the centre arrows and never shove the layout as the magnitude changes.
const HIST_H = 60; // fixed histogram row height (px)
const HIST_GAP = 4; // margin between the up + down histograms
const HIST_TEXT_GAP = 8; // margin between the histogram cluster and the rate text row
const HIST_SECONDS = 90; // 1.5× the default 60s window — the histograms retain more history
function networkTree(): Container {
	const rate = (
		id: string,
		label: string,
		sensor: string,
		color: string,
		alignEnd: boolean
	): Leaf =>
		lf(
			prim(
				id,
				'text',
				{ format: 'rate', label, color },
				{
					sensor,
					w: 75,
					h: 16,
					css: alignEnd ? '.np-text { justify-content: flex-end; }' : undefined
				}
			),
			{ fr: 1 }
		);
	return container(
		'net-root',
		'col',
		[
			lf(
				prim(
					'net-up',
					'sparkline',
					{ histogram: true, min: 0, seconds: HIST_SECONDS, color: 'var(--np-accent)' },
					{ sensor: 'net.up', w: 150, h: HIST_H }
				),
				HIST_H,
				undefined,
				{ margin: { t: 0, r: 0, b: HIST_GAP, l: 0 } }
			),
			lf(
				prim(
					'net-down',
					'sparkline',
					{ histogram: true, min: 0, seconds: HIST_SECONDS, color: 'var(--np-label)' },
					{ sensor: 'net.down', w: 150, h: HIST_H }
				),
				HIST_H,
				undefined,
				{ margin: { t: 0, r: 0, b: HIST_TEXT_GAP, l: 0 } }
			),
			container(
				'net-rates',
				'row',
				[
					rate('net-up-txt', '▲', 'net.up', 'var(--np-accent)', true), // up: left cell, right-anchored
					rate('net-down-txt', '▼', 'net.down', 'var(--np-label)', false) // down: right cell, left-anchored
				],
				{ gap: 6, basis: 'content' }
			)
		],
		// Inter-row spacing comes from the histograms' own bottom margins (HIST_GAP, HIST_TEXT_GAP)
		// so the two gaps differ; the root col adds none of its own.
		{ align: 'stretch', gap: 0 }
	);
}

// gyng\Music: the now-playing widget (cover above title/artist), seeded with the default editable css.
function musicLeaf(): Leaf {
	return lf(prim('np', 'nowplaying', {}, { w: 180, h: 200, css: NOWPLAYING_DEFAULT_CSS }), {
		fr: 1
	});
}

/** One configurable choice a template exposes at insert time (a select). `tree(opts)` reads the chosen
 * `value`s by `key`; `resolveTemplateOptions` fills any unset/invalid key with `default`. */
export type TemplateOption = {
	key: string;
	label: string;
	default: string;
	choices: { value: string; label: string }[];
};

export type Template = {
	id: string;
	name: string;
	description: string;
	size: { w: number; h: number }; // the group def's canvas size
	/** Insert-time options surfaced as selects in the studio picker (absent → a one-click insert). */
	options?: TemplateOption[];
	/** The flow tree (the def's child), built from the resolved options. Template-local ids; remapped
	 * to fresh ids on insert. Templates with no options ignore the argument. */
	tree: (opts?: Record<string, string>) => LayoutNode;
};

// The three clock languages, reused for both the weekday and the date selects.
const CLOCK_LANGS: TemplateOption['choices'] = [
	{ value: 'en', label: 'English' },
	{ value: 'ja', label: '日本語' },
	{ value: 'zh', label: '中文' }
];

export const TEMPLATES: Template[] = [
	{
		id: 'clock-jp',
		name: 'Clock (JP weekday)',
		description: 'Analog icon · time · weekday · date (configurable)',
		size: { w: 170, h: 150 },
		options: [
			{ key: 'weekdayLang', label: 'Weekday', default: 'ja', choices: CLOCK_LANGS },
			{ key: 'dateLang', label: 'Date', default: 'en', choices: CLOCK_LANGS },
			{
				key: 'hour',
				label: 'Hour',
				default: '24',
				choices: [
					{ value: '24', label: '24-hour' },
					{ value: '12', label: '12-hour' }
				]
			},
			{
				key: 'separator',
				label: 'Separator',
				default: 'none',
				choices: [
					{ value: 'none', label: 'None · 1700' },
					{ value: 'colon', label: 'Colon · 17:00' },
					{ value: 'dot', label: 'Dot · 17.00' }
				]
			}
		],
		tree: clockTree
	},
	{
		id: 'system',
		name: 'System monitor',
		description: 'CPU/RAM/SWAP/GPU/VRAM + per-core sparkline grid',
		size: { w: 170, h: 140 },
		tree: systemTree
	},
	{
		id: 'network',
		name: 'Network',
		description: 'Up/down throughput histograms + rate text',
		size: { w: 170, h: 104 },
		tree: networkTree
	},
	{
		id: 'nowplaying',
		name: 'Now playing',
		description: 'Compact media widget',
		size: { w: 180, h: 200 },
		tree: musicLeaf
	}
];

export function getTemplate(id: string): Template | undefined {
	return TEMPLATES.find((t) => t.id === id);
}

/** Fill a partial option map with each template option's default, dropping unknown keys and any value
 * that isn't one of the option's choices. Pure — drives both the picker's initial state and the
 * insert. A template with no options resolves to `{}`. */
export function resolveTemplateOptions(
	t: Template,
	partial: Record<string, string> = {}
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const o of t.options ?? []) {
		const v = partial[o.key];
		out[o.key] = v !== undefined && o.choices.some((c) => c.value === v) ? v : o.default;
	}
	return out;
}
