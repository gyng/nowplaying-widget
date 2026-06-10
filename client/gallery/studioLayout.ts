// The studio screenshot's showcase layout: a full 1920×1080 monitor's worth of widgets (the old
// shot let Canvas fall back to the small demo seed — three groups huddled in a corner of an empty
// stage). Composed from the REAL templates + widget defaults via core factories, serialized as the
// v2 layout JSON the dev mock serves for `load_layout`. Every sensor referenced here is seeded by
// gallery/seed.ts, so meters render live-looking values. Dev/docs only.
import { createWidget } from '../src/lib/core/widget';
import { group, leaf, type Leaf } from '../src/lib/core/layoutTree';
import { freshIds, getTemplate, instantiateTemplate } from '../src/lib/core/templates';
import type { WidgetInstance } from '../src/lib/core/layout';

function inst(
	type: string,
	id: string,
	rect: { x: number; y: number; w: number; h: number },
	over: { sensor?: string; config?: Record<string, unknown> } = {}
): Leaf {
	const w: WidgetInstance = createWidget(type, id);
	if (over.sensor) w.sensor = over.sensor;
	if (over.config) w.config = { ...w.config, ...over.config };
	w.rect = rect;
	return leaf(w);
}

function tpl(templateId: string, id: string, x: number, y: number): Leaf {
	const t = getTemplate(templateId);
	if (!t) throw new Error(`template ${templateId} missing`);
	return leaf(
		group(id, { ...t.size }, freshIds(instantiateTemplate(t)), {
			name: t.name,
			config: { x, y }
		})
	);
}

/** The serialized layout the dev mock answers `load_layout` with for the studio capture. */
export function studioShotLayout(): string {
	const floating: Leaf[] = [
		// Left rail — the classic skin cluster: system + network templates, timer, rates, controls.
		tpl('system', 'sg-system', 40, 40),
		tpl('network', 'sg-network', 40, 220),
		inst('timer', 'sg-timer', { x: 40, y: 392, w: 170, h: 72 }),
		inst(
			'text',
			'sg-down',
			{ x: 40, y: 492, w: 170, h: 18 },
			{ sensor: 'net.down', config: { format: 'rate', label: '↓ ', color: 'rgb(218, 237, 226)' } }
		),
		inst(
			'text',
			'sg-up',
			{ x: 40, y: 514, w: 170, h: 18 },
			{ sensor: 'net.up', config: { format: 'rate', label: '↑ ', color: 'rgb(119, 196, 211)' } }
		),
		inst(
			'text',
			'sg-uptime',
			{ x: 40, y: 536, w: 170, h: 18 },
			{ sensor: 'host.uptime', config: { format: 'duration', label: 'up ' } }
		),
		inst('button', 'sg-tap', { x: 40, y: 584, w: 120, h: 44 }, { config: { label: 'tap' } }),
		inst('ha.sensor', 'sg-temp', { x: 40, y: 660, w: 170, h: 40 }, { sensor: 'demo.temperature' }),
		inst('ha.climate', 'sg-clim', { x: 40, y: 712, w: 170, h: 88 }, { sensor: 'demo.climate' }),
		inst('ha.light', 'sg-light', { x: 40, y: 814, w: 170, h: 48 }, { sensor: 'demo.light' }),

		// Top centre — the clock template.
		tpl('clock-jp', 'sg-clock', 850, 48),

		// Centre — the gauge style showcase (issue #17): arc, circle, needle, then linear + pips.
		inst(
			'gauge',
			'sg-g-arc',
			{ x: 560, y: 210, w: 150, h: 150 },
			{ sensor: 'cpu.total', config: { label: 'CPU', unit: '%' } }
		),
		inst(
			'gauge',
			'sg-g-circle',
			{ x: 740, y: 210, w: 150, h: 150 },
			{ sensor: 'gpu.util', config: { label: 'GPU', unit: '%', style: 'circle' } }
		),
		inst(
			'gauge',
			'sg-g-needle',
			{ x: 920, y: 200, w: 170, h: 170 },
			{ sensor: 'mem.used', config: { label: 'MEM', unit: '%', style: 'needle' } }
		),
		inst(
			'gauge',
			'sg-g-linear',
			{ x: 560, y: 420, w: 530, h: 40 },
			{
				sensor: 'gpu.vram',
				config: { label: 'VRAM', unit: '%', style: 'linear', direction: 'ltr' }
			}
		),
		inst(
			'gauge',
			'sg-g-pips',
			{ x: 560, y: 478, w: 530, h: 26 },
			{
				sensor: 'disk.c.used.pct',
				config: { label: 'DISK', unit: '%', style: 'pips', direction: 'ltr', pips: 20 }
			}
		),
		inst(
			'cpu',
			'sg-cores',
			{ x: 560, y: 544, w: 530, h: 130 },
			{ config: { mode: 'cores', cols: 12 } }
		),
		inst('spectrum', 'sg-spectrum', { x: 560, y: 712, w: 530, h: 110 }),

		// Centre-right — wide throughput histograms + memory bars.
		inst(
			'sparkline',
			'sg-spark-down',
			{ x: 1140, y: 210, w: 440, h: 90 },
			{ sensor: 'net.down', config: { histogram: true, color: 'rgb(218, 237, 226)' } }
		),
		inst(
			'sparkline',
			'sg-spark-up',
			{ x: 1140, y: 318, w: 440, h: 90 },
			{ sensor: 'net.up', config: { histogram: true, color: 'rgb(119, 196, 211)' } }
		),
		inst(
			'bar',
			'sg-mem',
			{ x: 1140, y: 440, w: 440, h: 16 },
			{ sensor: 'mem.used', config: { label: 'MEM' } }
		),
		inst(
			'bar',
			'sg-vram',
			{ x: 1140, y: 464, w: 440, h: 16 },
			{ sensor: 'gpu.vram', config: { label: 'VRAM' } }
		),

		// Right rail — cards: now playing, stock ticker, analog clock, uptime.
		tpl('nowplaying', 'sg-np', 1660, 40),
		inst(
			'ticker',
			'sg-ticker',
			{ x: 1660, y: 280, w: 220, h: 110 },
			{ config: { symbol: 'NVDA' } }
		),
		inst(
			'analogclock',
			'sg-analog',
			{ x: 1690, y: 430, w: 160, h: 160 },
			{ config: { showTicks: true } }
		)
	];
	return JSON.stringify({ version: 2, monitors: { default: { root: rootCol(), floating } } });
}

// A bare flow root (the floating layer carries the showcase; an empty padded col matches what the
// app itself seeds — see core/layoutTree.emptyRoot, inlined here to avoid importing editor paths).
function rootCol() {
	return { id: 'root', kind: 'col', children: [], align: 'stretch', pad: 16 };
}
