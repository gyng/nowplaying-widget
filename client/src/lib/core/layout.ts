// Framework-agnostic layout types. The versioned `Layout` is what `widgets.json`
// (de)serializes to in Phase 3; for now Canvas hardcodes a list of instances.
// No Svelte/Tauri imports — reused as-is by a future React port.

export type Rect = { x: number; y: number; w: number; h: number };

export type WidgetInstance = {
	id: string;
	type: string; // 'gauge' | 'bar' | 'sparkline' | 'clock' | 'text' | 'nowplaying'
	sensor?: string; // omitted for self-sourcing meters (e.g. clock)
	rect: Rect;
	config: Record<string, unknown>;
	css?: string;
};

export type MonitorLayout = { widgets: WidgetInstance[] };

export type Layout = {
	version: number;
	monitors: Record<string, MonitorLayout>; // key = monitor id
};
