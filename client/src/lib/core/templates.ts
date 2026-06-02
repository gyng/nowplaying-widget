// Built-in layout templates ("presets"): named clusters of widgets you can drop into a layout
// from the studio. Framework-agnostic and pure (no Svelte/Tauri) so they're testable and reusable
// by a React port. Each template returns fresh WidgetInstances with template-local ids; the studio
// remaps those to unique ids on insert. These recreate the author's Rainmeter `gyng\*` skins.

import type { WidgetInstance } from './layout';
import { NOWPLAYING_DEFAULT_CSS } from './widget';

const widget = (
	id: string,
	type: string,
	rect: { x: number; y: number; w: number; h: number },
	config: Record<string, unknown> = {},
	extra: Partial<WidgetInstance> = {}
): WidgetInstance => ({ id, type, rect, config, ...extra });

// DateTime skin: time, Japanese weekday glyph, date, uppercased month.
function clockCluster(): WidgetInstance[] {
	return [
		widget('time', 'clock', { x: 16, y: 12, w: 150, h: 34 }, { format: 'HH:mm' }),
		widget('weekday', 'clock', { x: 16, y: 50, w: 56, h: 24 }, { format: 'ddd', locale: 'ja' }),
		widget('date', 'clock', { x: 74, y: 50, w: 40, h: 24 }, { format: 'D' }),
		widget(
			'month',
			'clock',
			{ x: 16, y: 76, w: 150, h: 22 },
			{ format: 'MMMM' },
			{ css: 'text-transform: uppercase;' }
		)
	];
}

// System skin: CPU/RAM/SWAP/GPU/VRAM text + an 8×4 grid of 32 per-core sparklines.
function systemCluster(): WidgetInstance[] {
	const metrics: [string, string][] = [
		['CPU', 'cpu.total'],
		['RAM', 'mem.used'],
		['SWAP', 'swap.used'],
		['GPU', 'gpu.util'],
		['VRAM', 'gpu.vram']
	];
	const out: WidgetInstance[] = metrics.map(([label, sensor], i) =>
		widget(
			`sys-${label.toLowerCase()}`,
			'text',
			{ x: 16, y: 112 + i * 20, w: 150, h: 18 },
			{ format: 'percent', label },
			{ sensor }
		)
	);
	for (let i = 0; i < 32; i++) {
		const col = i % 8;
		const row = Math.floor(i / 8);
		out.push(
			widget(
				`core-${i}`,
				'sparkline',
				{ x: 16 + col * 17, y: 220 + row * 16, w: 15, h: 12 },
				{ min: 0, max: 100 },
				{ sensor: `cpu.core.${i}` }
			)
		);
	}
	return out;
}

// Network skin: out/in throughput histograms + auto-scaled rate text.
function networkCluster(): WidgetInstance[] {
	return [
		widget(
			'net-out-hist',
			'sparkline',
			{ x: 16, y: 296, w: 150, h: 38 },
			{ histogram: true, min: 0, color: 'rgb(119, 196, 211)' },
			{ sensor: 'net.up' }
		),
		widget(
			'net-in-hist',
			'sparkline',
			{ x: 16, y: 336, w: 150, h: 38 },
			{ histogram: true, min: 0, color: 'rgb(218, 237, 226)' },
			{ sensor: 'net.down' }
		),
		widget(
			'net-down-txt',
			'text',
			{ x: 16, y: 376, w: 90, h: 18 },
			{ format: 'rate', label: '↓', color: 'rgb(218, 237, 226)' },
			{ sensor: 'net.down' }
		),
		widget(
			'net-up-txt',
			'text',
			{ x: 106, y: 376, w: 90, h: 18 },
			{ format: 'rate', label: '↑', color: 'rgb(119, 196, 211)' },
			{ sensor: 'net.up' }
		)
	];
}

// Music skin: now-playing (cover above title/artist; no progress bar — fb2k emits no timeline).
// Seeded with the default editable css so the look matches a palette-added widget.
function musicCluster(): WidgetInstance[] {
	return [
		widget(
			'nowplaying',
			'nowplaying',
			{ x: 16, y: 400, w: 180, h: 200 },
			{},
			{ css: NOWPLAYING_DEFAULT_CSS }
		)
	];
}

export type Template = {
	id: string;
	name: string;
	description: string;
	/** Fresh widgets with template-local ids (the studio remaps them to unique ids on insert). */
	widgets: () => WidgetInstance[];
};

export const TEMPLATES: Template[] = [
	{
		id: 'rainmeter-sidebar',
		name: 'Rainmeter sidebar',
		description: 'Clock · system · network · music (all skins)',
		widgets: () => [...clockCluster(), ...systemCluster(), ...networkCluster(), ...musicCluster()]
	},
	{
		id: 'system',
		name: 'System monitor',
		description: 'CPU/RAM/SWAP/GPU/VRAM + 32-core sparkline grid',
		widgets: systemCluster
	},
	{
		id: 'network',
		name: 'Network',
		description: 'Up/down throughput histograms + rate text',
		widgets: networkCluster
	},
	{
		id: 'clock-jp',
		name: 'Clock (JP weekday)',
		description: 'Time · Japanese weekday · date · month',
		widgets: clockCluster
	},
	{
		id: 'nowplaying',
		name: 'Now playing',
		description: 'Compact media widget',
		widgets: musicCluster
	}
];

export function getTemplate(id: string): Template | undefined {
	return TEMPLATES.find((t) => t.id === id);
}
