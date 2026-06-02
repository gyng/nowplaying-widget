// The standard widget API (Phase 8a). A widget TYPE is described by a framework-agnostic
// `WidgetMeta` (defaults + config schema + how it binds to a sensor); the Svelte component
// is attached in the widgets layer (registry.ts) so a React port reuses the metas verbatim.
// Built-in meters register their metas here on load, so `createWidget` is pure + testable
// without the UI layer. Plugins add more via `registerMeta` (see widgets/registry.ts
// `registerWidget`). Co-located vitest tests in widget.test.ts.

import type { WidgetInstance } from './layout';

// A typed config field, so the inspector can render a real input instead of raw JSON.
export type ConfigField =
	| { key: string; label: string; kind: 'number'; min?: number; max?: number; step?: number }
	| { key: string; label: string; kind: 'text' }
	| { key: string; label: string; kind: 'color' }
	| { key: string; label: string; kind: 'toggle' }
	| { key: string; label: string; kind: 'select'; options: string[] };

export type SensorKind = 'scalar' | 'series' | 'text' | 'json' | 'none';

export type WidgetMeta = {
	type: string;
	binds?: SensorKind; // what sensor kind it reads ('none' = self-sourcing)
	label?: string; // palette name
	defaultSensor?: string;
	defaultSize?: { w: number; h: number };
	defaultConfig?: Record<string, unknown>;
	configFields?: ConfigField[];
	interactive?: boolean; // catches clicks in passive mode (per-widget click-through)
};

const num = (key: string, label: string, extra: Partial<ConfigField> = {}): ConfigField =>
	({ key, label, kind: 'number', ...extra } as ConfigField);
const text = (key: string, label: string): ConfigField => ({ key, label, kind: 'text' });
const color = (key: string, label: string): ConfigField => ({ key, label, kind: 'color' });

// The built-in meters as data (reproduces the old createWidget switch exactly, so the
// default look/behaviour is unchanged). Components are attached in registry.ts.
export const BUILTIN_METAS: WidgetMeta[] = [
	{
		type: 'gauge',
		binds: 'scalar',
		label: 'Gauge',
		defaultSensor: 'cpu.total',
		defaultSize: { w: 110, h: 110 },
		defaultConfig: { label: 'CPU', unit: '%', min: 0, max: 100 },
		configFields: [
			text('label', 'label'),
			text('unit', 'unit'),
			num('min', 'min'),
			num('max', 'max'),
			color('color', 'color'),
			color('track', 'track')
		]
	},
	{
		type: 'bar',
		binds: 'scalar',
		label: 'Bar',
		defaultSensor: 'mem.used',
		defaultSize: { w: 140, h: 16 },
		defaultConfig: { min: 0, max: 100, label: 'MEM' },
		configFields: [
			text('label', 'label'),
			num('min', 'min'),
			num('max', 'max'),
			{
				key: 'orientation',
				label: 'orientation',
				kind: 'select',
				options: ['horizontal', 'vertical']
			},
			color('color', 'color'),
			color('track', 'track')
		]
	},
	{
		type: 'sparkline',
		binds: 'series',
		label: 'Sparkline',
		defaultSensor: 'cpu.total',
		defaultSize: { w: 140, h: 30 },
		defaultConfig: {},
		configFields: [color('color', 'color'), { key: 'fill', label: 'fill', kind: 'toggle' }]
	},
	{
		type: 'text',
		binds: 'scalar',
		label: 'Text',
		defaultSensor: 'net.down',
		defaultSize: { w: 100, h: 18 },
		defaultConfig: { format: 'rate', label: '↓' },
		configFields: [text('label', 'label'), text('format', 'format'), color('color', 'color')]
	},
	{
		type: 'clock',
		binds: 'none',
		label: 'Clock',
		defaultSize: { w: 160, h: 40 },
		defaultConfig: { format: 'HH:mm:ss' },
		configFields: [text('format', 'format'), text('label', 'label'), color('color', 'color')]
	},
	{
		type: 'button',
		binds: 'none',
		label: 'Button',
		defaultSize: { w: 90, h: 44 },
		defaultConfig: { label: 'tap' },
		interactive: true,
		configFields: [text('label', 'label')]
	},
	{
		// Self-sourcing media widget: subscribes to the GSMTC media feed internally (binds:none).
		type: 'nowplaying',
		binds: 'none',
		label: 'Now Playing',
		defaultSize: { w: 240, h: 64 },
		defaultConfig: {},
		configFields: [text('label', 'label (when idle)')]
	}
];

const metas = new Map<string, WidgetMeta>();

/** Register (or replace) a widget meta. Built-ins are registered on module load. */
export function registerMeta(meta: WidgetMeta): void {
	metas.set(meta.type, meta);
}

export function getMeta(type: string): WidgetMeta | undefined {
	return metas.get(type);
}

/** All registered metas, in registration order (for the palette). */
export function listMetas(): WidgetMeta[] {
	return Array.from(metas.values());
}

BUILTIN_METAS.forEach(registerMeta);

/**
 * Build a default `WidgetInstance` for `type` from its registered meta (id-explicit, like
 * the old switch). Unknown types fall back to a generic 120×80 box. Pure.
 */
export function createWidget(type: string, id: string): WidgetInstance {
	const meta = metas.get(type);
	const size = meta?.defaultSize ?? { w: 120, h: 80 };
	const inst: WidgetInstance = {
		id,
		type,
		rect: { x: 24, y: 24, w: size.w, h: size.h },
		config: { ...(meta?.defaultConfig ?? {}) }
	};
	if (meta?.defaultSensor) inst.sensor = meta.defaultSensor;
	if (meta?.interactive) inst.interactive = true;
	return inst;
}
