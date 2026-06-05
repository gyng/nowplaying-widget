import { describe, expect, it } from 'vitest';
import { KNOWN_SENSORS, sensorCatalog } from './sensors';

describe('sensorCatalog', () => {
	it('includes the curated sensors when nothing is live', () => {
		expect(sensorCatalog([])).toEqual([...KNOWN_SENSORS].sort());
	});

	it('merges live ids (e.g. per-core), de-dupes, and sorts', () => {
		const out = sensorCatalog(['cpu.core.1', 'cpu.core.0', 'cpu.total']);
		expect(out).toContain('cpu.core.0');
		expect(out).toContain('cpu.core.1');
		expect(out.filter((s) => s === 'cpu.total')).toHaveLength(1); // de-duped
		expect(out).toEqual([...out].sort()); // sorted
	});

	it('offers the absolute-byte totals alongside the percent ids', () => {
		// The explicit ask: max RAM / VRAM / swap absolutes are discoverable in the picker, while
		// the original percent ids stay (backward compat with templates + ported skins).
		for (const id of [
			'mem.total',
			'mem.used.bytes',
			'swap.total',
			'gpu.vram.total',
			'gpu.vram.used'
		]) {
			expect(KNOWN_SENSORS).toContain(id);
		}
		for (const id of ['mem.used', 'swap.used', 'gpu.vram']) {
			expect(KNOWN_SENSORS).toContain(id);
		}
	});

	it('omits dynamic per-drive ids (they arrive via the live merge)', () => {
		expect(KNOWN_SENSORS.some((id) => id.startsWith('disk.'))).toBe(false);
		expect(sensorCatalog(['disk.c.free'])).toContain('disk.c.free');
	});
});
