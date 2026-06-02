import { describe, expect, it } from 'vitest';
import { createTelemetryHub } from './telemetry';
import { listSources, registerSource, sourceCatalogIds, startAllSources } from './plugin';

describe('sensor sources', () => {
	it('starts all registered sources against the hub and stops them', async () => {
		let stopped = 0;
		registerSource({
			id: 'fake-a',
			start: async (hub) => {
				hub.ingest({ sensor: 'fake.a', ts_ms: 0, value: { kind: 'scalar', value: 7 } });
				return () => {
					stopped += 1;
				};
			},
			catalog: () => ['fake.a']
		});
		registerSource({
			id: 'fake-b',
			start: async () => () => {
				stopped += 1;
			}
		});

		const hub = createTelemetryHub();
		const stop = await startAllSources(hub);
		expect(hub.sensorIds()).toContain('fake.a');
		stop();
		expect(stopped).toBe(2);
	});

	it('registering by id replaces; catalog ids are the deduped union', () => {
		registerSource({ id: 'dup', start: async () => () => undefined, catalog: () => ['x', 'y'] });
		registerSource({ id: 'dup', start: async () => () => undefined, catalog: () => ['y', 'z'] });
		// 'dup' replaced (one entry), catalog union deduped
		expect(listSources().filter((s) => s.id === 'dup')).toHaveLength(1);
		const ids = sourceCatalogIds();
		expect(ids).toContain('y');
		expect(ids).toContain('z');
		expect(ids.filter((i) => i === 'y')).toHaveLength(1);
	});
});
