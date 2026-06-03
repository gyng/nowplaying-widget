// The standard widget API (Phase 8a). A widget TYPE is described by a framework-agnostic
// `WidgetMeta` (defaults + config schema + how it binds to a sensor); the Svelte component
// is attached in the widgets layer (registry.ts) so a React port reuses the metas verbatim.
// Built-in meters register their metas here on load, so `createWidget` is pure + testable
// without the UI layer. Plugins add more via `registerMeta` (see widgets/registry.ts
// `registerWidget`). Co-located vitest tests in widget.test.ts.

import type { WidgetInstance } from './layout';

// A typed config field, so the inspector can render a real input instead of raw JSON. `help` is a
// one-line description surfaced in the inspector; `default` is the field's own reset value (falls
// back to the widget type's defaultConfig[key] when omitted) — together these make the config UI
// fully self-describing from the widget meta (item: "config should be ui driven").
type FieldMeta = { help?: string; default?: unknown };
export type ConfigField =
	| ({
			key: string;
			label: string;
			kind: 'number';
			min?: number;
			max?: number;
			step?: number;
	  } & FieldMeta)
	| ({ key: string; label: string; kind: 'text' } & FieldMeta)
	| ({ key: string; label: string; kind: 'color' } & FieldMeta)
	| ({ key: string; label: string; kind: 'toggle' } & FieldMeta)
	| ({ key: string; label: string; kind: 'select'; options: string[] } & FieldMeta);

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

const num = (
	key: string,
	label: string,
	extra: { min?: number; max?: number; step?: number } & FieldMeta = {}
): ConfigField => ({ key, label, kind: 'number', ...extra } as ConfigField);
const text = (key: string, label: string, extra: FieldMeta = {}): ConfigField =>
	({ key, label, kind: 'text', ...extra } as ConfigField);
const color = (key: string, label: string, extra: FieldMeta = {}): ConfigField =>
	({ key, label, kind: 'color', ...extra } as ConfigField);

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
			text('unit', 'unit', { help: 'suffix after the value, e.g. % or °C' }),
			num('min', 'min', { help: 'value mapped to an empty gauge' }),
			num('max', 'max', { help: 'value mapped to a full gauge' }),
			color('color', 'color'),
			color('track', 'track', { help: 'color of the unfilled arc' })
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
			num('min', 'min', { help: 'value mapped to an empty bar' }),
			num('max', 'max', { help: 'value mapped to a full bar' }),
			{
				key: 'orientation',
				label: 'orientation',
				kind: 'select',
				options: ['horizontal', 'vertical'],
				help: 'fill direction'
			},
			color('color', 'color'),
			color('track', 'track', { help: 'color of the unfilled track' })
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
			{ key: 'fill', label: 'fill', kind: 'toggle', help: 'fill the area under the line' },
			{
				key: 'histogram',
				label: 'histogram (bars)',
				kind: 'toggle',
				help: 'draw bars instead of a line'
			},
			num('seconds', 'history (s)', { min: 5, step: 5, help: 'seconds of history to show' })
		]
	},
	{
		type: 'text',
		binds: 'scalar',
		label: 'Text',
		defaultSensor: 'net.down',
		defaultSize: { w: 100, h: 18 },
		defaultConfig: { format: 'rate', label: '↓' },
		configFields: [
			text('label', 'label'),
			text('format', 'format', {
				help: "'rate' = bytes/s (e.g. 1.2 MB/s); otherwise the raw value"
			}),
			color('color', 'color')
		]
	},
	{
		type: 'clock',
		binds: 'none',
		label: 'Clock',
		defaultSize: { w: 160, h: 40 },
		defaultConfig: { format: 'HH:mm:ss' },
		configFields: [
			text('format', 'format', { help: 'date-fns pattern, e.g. HH:mm:ss or dddd D MMMM' }),
			{
				key: 'locale',
				label: 'locale',
				kind: 'select',
				options: ['en', 'ja'],
				help: 'month/day names'
			},
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
			{
				key: 'mode',
				label: 'mode',
				kind: 'select',
				options: ['cores', 'combined'],
				help: 'per-core sparkline grid vs one combined gauge'
			},
			num('cols', 'cols (per-core grid)', { min: 1, help: 'columns in the per-core grid' }),
			num('seconds', 'history (s)', { min: 5, step: 5, help: 'seconds of history to show' }),
			{
				key: 'histogram',
				label: 'histogram (bars)',
				kind: 'toggle',
				help: 'draw bars instead of lines'
			},
			text('label', 'label (combined)'),
			color('color', 'color')
		]
	}
];

// The defaultConfig keys with no matching ConfigField — i.e. config a user could only reach via the
// raw-JSON escape hatch. A regression guard for "fully UI-driven config": every meaningful key
// should be a real control. Pure + unit-tested (asserts [] for every built-in meta).
export function configCompleteness(meta: WidgetMeta): string[] {
	const have = new Set((meta.configFields ?? []).map((f) => f.key));
	return Object.keys(meta.defaultConfig ?? {}).filter((k) => !have.has(k));
}

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
