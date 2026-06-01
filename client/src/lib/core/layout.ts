// Framework-agnostic layout types. The versioned `Layout` is what `widgets.json`
// (de)serializes to in Phase 3; for now Canvas hardcodes a list of instances.
// No Svelte/Tauri imports — reused as-is by a future React port.

export type Rect = { x: number; y: number; w: number; h: number };

export type WidgetInstance = {
	id: string;
	type: string; // 'gauge' | 'bar' | 'sparkline' | 'clock' | 'text' | 'nowplaying'
	sensor?: string; // omitted for self-sourcing meters (e.g. clock)
	rect: Rect;
	layer?: 'top' | 'desktop'; // z-layer (3c); default 'top'. desktop layer lands in Phase 4
	interactive?: boolean; // catches clicks in passive mode (per-widget click-through)
	config: Record<string, unknown>;
	css?: string;
};

export type MonitorLayout = { widgets: WidgetInstance[] };

export type Layout = {
	version: number;
	monitors: Record<string, MonitorLayout>; // key = monitor id
};

export const LAYOUT_VERSION = 1;
export const DEFAULT_MONITOR = 'default';

export function defaultLayout(): Layout {
	return { version: LAYOUT_VERSION, monitors: { [DEFAULT_MONITOR]: { widgets: [] } } };
}

function isWidgetInstance(w: unknown): w is WidgetInstance {
	if (typeof w !== 'object' || w === null) return false;
	const o = w as Record<string, unknown>;
	return (
		typeof o.id === 'string' &&
		typeof o.type === 'string' &&
		typeof o.rect === 'object' &&
		o.rect !== null &&
		typeof o.config === 'object' &&
		o.config !== null
	);
}

/**
 * Validate raw JSON into a Layout. Returns null on structural failure (so the
 * caller can fall back to a default); individually malformed widgets are dropped
 * rather than failing the whole layout. Pure — unit-tested, no I/O.
 */
export function parseLayout(raw: unknown): Layout | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const obj = raw as Record<string, unknown>;
	if (typeof obj.version !== 'number') return null;
	if (typeof obj.monitors !== 'object' || obj.monitors === null) return null;

	const monitors: Record<string, MonitorLayout> = {};
	for (const [key, mon] of Object.entries(obj.monitors as Record<string, unknown>)) {
		if (typeof mon !== 'object' || mon === null) return null;
		const widgets = (mon as Record<string, unknown>).widgets;
		if (!Array.isArray(widgets)) return null;
		monitors[key] = { widgets: widgets.filter(isWidgetInstance) };
	}

	return { version: obj.version, monitors };
}

export const WIDGET_TYPES = ['gauge', 'bar', 'sparkline', 'text', 'clock', 'button'];

/** Build a sensible default instance for a widget `type` with the given id. Pure. */
export function createWidget(type: string, id: string): WidgetInstance {
	const at = { x: 24, y: 24 };
	switch (type) {
		case 'gauge':
			return {
				id,
				type,
				sensor: 'cpu.total',
				rect: { ...at, w: 110, h: 110 },
				config: { label: 'CPU', unit: '%', min: 0, max: 100 }
			};
		case 'bar':
			return {
				id,
				type,
				sensor: 'mem.used',
				rect: { ...at, w: 140, h: 16 },
				config: { min: 0, max: 100, label: 'MEM' }
			};
		case 'sparkline':
			return { id, type, sensor: 'cpu.total', rect: { ...at, w: 140, h: 30 }, config: {} };
		case 'text':
			return {
				id,
				type,
				sensor: 'net.down',
				rect: { ...at, w: 100, h: 18 },
				config: { format: 'rate', label: '↓' }
			};
		case 'clock':
			return { id, type, rect: { ...at, w: 160, h: 40 }, config: { format: 'HH:mm:ss' } };
		case 'button':
			return {
				id,
				type,
				rect: { ...at, w: 90, h: 44 },
				config: { label: 'tap' },
				interactive: true
			};
		default:
			return { id, type, rect: { ...at, w: 120, h: 80 }, config: {} };
	}
}
