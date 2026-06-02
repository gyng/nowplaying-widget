import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import WidgetHost from './WidgetHost.svelte';
import HaSensor from './meters/HaSensor.svelte';
import { registerWidget, type MeterComponent } from './registry';
import { createTelemetryHub } from '../core/telemetry';
import type { WidgetInstance } from '../core/layout';

// A binds:'json' widget type for the test (reuses the HA sensor meter as the renderer).
registerWidget(
	{ type: 'test.json', binds: 'json', label: 'T' },
	HaSensor as unknown as MeterComponent
);

describe('WidgetHost binds-driven value passing', () => {
	it('forwards the raw JSON SensorValue payload to a binds:json meter', async () => {
		const hub = createTelemetryHub();
		const instance: WidgetInstance = {
			id: 'w1',
			type: 'test.json',
			sensor: 'x',
			rect: { x: 0, y: 0, w: 150, h: 44 },
			config: {}
		};
		const { getByText } = render(WidgetHost, { hub, instance, editMode: false });

		hub.ingest({
			sensor: 'x',
			ts_ms: 0,
			value: { kind: 'json', value: { state: '42', attributes: { friendly_name: 'Foo' } } }
		});
		await tick();

		expect(() => getByText('Foo')).not.toThrow();
		expect(() => getByText(/42/)).not.toThrow();
	});
});
