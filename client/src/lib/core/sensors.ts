// Curated list of well-known sensor ids the editor can suggest, plus a helper to
// merge them with whatever the telemetry hub has actually seen live (per-core CPU,
// GPU presence, etc.). Framework-agnostic, unit-tested.

export const KNOWN_SENSORS = [
	'cpu.total',
	'mem.used',
	'swap.used',
	'net.down',
	'net.up',
	'gpu.util',
	'gpu.vram',
	'gpu.temp'
];

/** Sorted, de-duped union of the curated list and the live sensor ids. */
export function sensorCatalog(live: string[]): string[] {
	return Array.from(new Set([...KNOWN_SENSORS, ...live])).sort();
}
