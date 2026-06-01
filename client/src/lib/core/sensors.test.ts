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
});
