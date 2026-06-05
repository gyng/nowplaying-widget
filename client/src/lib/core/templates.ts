// Built-in layout templates ("presets"): the author's Rainmeter `gyng\*` skins recreated as
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

// gyng\DateTime (+ the Enigma analog icon on top, as in the saved layout): a small clock icon, the
// HHmm time (24h, no separator), the Japanese weekday glyph, and a "D MMMM" date row. Text leaves use
// basis 'content' so each hugs its own text (the date "5" + month "JUNE" sit adjacent); the icon is a
// fixed square with a bottom margin so it sits clear of the time.
function clockTree(): Container {
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
			lf(prim('dt-time', 'clock', { format: 'HHmm' }, { w: 150, h: 34 }), 'content'),
			lf(prim('dt-day', 'clock', { format: 'ddd', locale: 'ja' }, { w: 60, h: 34 }), 'content'),
			container(
				'dt-date-row',
				'row',
				[
					lf(prim('dt-date', 'clock', { format: 'D' }, { w: 30, h: 22 }), 'content'),
					lf(
						prim(
							'dt-month',
							'clock',
							{ format: 'MMMM' },
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
			// Per-core lines: thin, white, short window + rounded joins to match the Rainmeter LINE
			// meters. `cols: 8` → 8 cores per row (the System skin's grid), wrapping to as many rows
			// as the core count needs. A top margin sets the grid clear of the GPU/VRAM number row above.
			lf(
				prim(
					'sys-cores',
					'cpu',
					{ mode: 'cores', cols: 8, seconds: 20, color: 'rgb(255, 255, 255)', lineWidth: 1 },
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
					{ histogram: true, min: 0, seconds: HIST_SECONDS, color: 'rgb(119, 196, 211)' },
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
					{ histogram: true, min: 0, seconds: HIST_SECONDS, color: 'rgb(218, 237, 226)' },
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
					rate('net-up-txt', '▲', 'net.up', 'rgb(119, 196, 211)', true), // up: left cell, right-anchored
					rate('net-down-txt', '▼', 'net.down', 'rgb(218, 237, 226)', false) // down: right cell, left-anchored
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

export type Template = {
	id: string;
	name: string;
	description: string;
	size: { w: number; h: number }; // the group def's canvas size
	/** The flow tree (the def's child). Template-local ids; remapped to fresh ids on insert. */
	tree: () => LayoutNode;
};

export const TEMPLATES: Template[] = [
	{
		id: 'clock-jp',
		name: 'Clock (JP weekday)',
		description: 'Analog icon · time · Japanese weekday · date',
		size: { w: 170, h: 150 },
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
