import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import WidgetHost from './WidgetHost';
import HaSensor from './meters/HaSensor';
import { registerWidget, type MeterComponent } from './registry';
import { createTelemetryHub } from '../core/telemetry';
import type { WidgetInstance } from '../core/layout';

// A binds:'json' widget type for the test (reuses the HA sensor meter as the renderer).
registerWidget(
	{ type: 'test.json', binds: 'json', label: 'T' },
	HaSensor as unknown as MeterComponent
);

describe('WidgetHost binds-driven value passing', () => {
	it('forwards the raw JSON SensorValue payload to a binds:json meter', () => {
		const hub = createTelemetryHub();
		const instance: WidgetInstance = {
			id: 'w1',
			type: 'test.json',
			sensor: 'x',
			rect: { x: 0, y: 0, w: 150, h: 44 },
			config: {}
		};
		const { getByText } = render(<WidgetHost hub={hub} instance={instance} editMode={false} />);

		// ingest happens OUTSIDE React's render — wrap in act() so the useSyncExternalStore subscriber
		// commits before the assertion (otherwise the re-render hasn't flushed).
		act(() => {
			hub.ingest({
				sensor: 'x',
				ts_ms: 0,
				value: { kind: 'json', value: { state: '42', attributes: { friendly_name: 'Foo' } } }
			});
		});

		expect(() => getByText('Foo')).not.toThrow();
		expect(() => getByText(/42/)).not.toThrow();
	});
});
