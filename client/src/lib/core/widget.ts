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
	defaultCss?: string; // seeded into a new instance's editable `css` (the default LOOK lives here,
	// not in the component, so it's fully restylable). The component ships structure only.
	configFields?: ConfigField[];
	interactive?: boolean; // catches clicks in passive mode (per-widget click-through)
};

// The Now Playing widget's ENTIRE stylesheet (layout + look), seeded into each new instance's
// editable `css` — the component itself is pure DOM (no <style>), so this is fully restylable.
// Scoped to the widget at injection (assembleStyles), so these selectors target the component's
// parts. The progress bar, timers and controls are display:none here (un-hide via css).
export const NOWPLAYING_DEFAULT_CSS = `.np-nowplaying {
	display: flex;
	flex-direction: column;
	gap: var(--np-gap, 4px);
	width: 100%;
	height: 100%;
	overflow: hidden;
	font-family: var(--np-font-display, 'Bahnschrift', 'Arial Narrow', sans-serif);
	color: var(--np-fg, rgb(255, 255, 255));
}
.np-thumb {
	flex: 1 1 0;
	min-height: 0;
	width: 100%;
	object-fit: contain;
	object-position: left;
}
.np-title,
.np-artist {
	flex: 0 0 auto;
	font-size: 52px;
	/* >1 so descenders (g, y, p) aren't clipped by the line's overflow:hidden (ellipsis). */
	line-height: 1.2;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.np-progress,
.np-times,
.np-controls {
	display: none;
	flex: 0 0 auto;
}
.np-progress {
	height: 3px;
	background: var(--np-track, rgba(255, 255, 255, 0.15));
}
.np-progress-fill {
	height: 100%;
	background: var(--np-accent, rgb(119, 196, 211));
}
.np-times {
	justify-content: space-between;
}
.np-controls {
	gap: 8px;
}`;

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
		defaultConfig: { seconds: 60 },
		configFields: [
			color('color', 'color'),
			{ key: 'fill', label: 'fill', kind: 'toggle' },
			{ key: 'histogram', label: 'histogram (bars)', kind: 'toggle' },
			num('seconds', 'history (s)', { min: 5, step: 5 })
		]
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
		configFields: [
			text('format', 'format'),
			{ key: 'locale', label: 'locale', kind: 'select', options: ['en', 'ja'] },
			text('label', 'label'),
			color('color', 'color')
		]
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
		defaultSize: { w: 160, h: 200 },
		defaultConfig: {},
		defaultCss: NOWPLAYING_DEFAULT_CSS,
		configFields: [text('label', 'label (when idle)')]
	},
	{
		// Self-sourcing CPU widget: reads cpu.total + cpu.core.* from the hub (binds:none). Toggles
		// between a combined gauge and a per-core sparkline grid (the Rainmeter System skin).
		type: 'cpu',
		binds: 'none',
		label: 'CPU',
		defaultSize: { w: 160, h: 90 },
		defaultConfig: { mode: 'cores', cols: 8 },
		configFields: [
			{ key: 'mode', label: 'mode', kind: 'select', options: ['cores', 'combined'] },
			num('cols', 'cols (per-core grid)', { min: 1 }),
			num('seconds', 'history (s)', { min: 5, step: 5 }),
			{ key: 'histogram', label: 'histogram (bars)', kind: 'toggle' },
			text('label', 'label (combined)'),
			color('color', 'color')
		]
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
	if (meta?.defaultCss) inst.css = meta.defaultCss;
	return inst;
}
