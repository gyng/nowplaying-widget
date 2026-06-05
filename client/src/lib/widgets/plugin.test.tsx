import { describe, expect, it } from 'vitest';
import { listPlugins, pluginSensorNamesFrom, registerPlugin, type Plugin } from './plugin';
import { getMeta } from '../core/widget';
import { getControl } from '../core/controls';
import type { MeterComponent } from './registry';

// A trivial meter component for the widget-registration assertion.
const Stub = (() => null) as unknown as MeterComponent;
const Settings = () => null;

describe('plugin registry', () => {
	it('records a registered plugin (listPlugins) and wires its widget meta', () => {
		registerPlugin({
			id: 'test.plugin',
			name: 'Test Plugin',
			description: 'a test',
			widgets: [
				{
					meta: {
						type: 'test.widget',
						binds: 'none',
						label: 'Test',
						defaultSize: { w: 10, h: 10 }
					},
					component: Stub
				}
			]
		});
		const found = listPlugins().find((p) => p.id === 'test.plugin');
		expect(found).toMatchObject({ id: 'test.plugin', name: 'Test Plugin', description: 'a test' });
		// The widget half went through registerWidget → the meta is now resolvable.
		expect(getMeta('test.widget')).toMatchObject({ type: 'test.widget', label: 'Test' });
	});

	it('registers plugin-contributed controls into the controls registry', () => {
		registerPlugin({
			id: 'test.controls',
			name: 'With Controls',
			controls: [
				{
					id: 'plugin:test.controls.demo',
					scope: 'widget',
					group: 'widget',
					label: 'Demo action',
					triggers: [{ type: 'key', key: 'd', ctrl: true, shift: true }]
				}
			]
		});
		expect(getControl('plugin:test.controls.demo')).toMatchObject({ label: 'Demo action' });
	});

	it('keeps the optional settings component', () => {
		registerPlugin({ id: 'test.settings', name: 'With Settings', settings: Settings });
		const found = listPlugins().find((p) => p.id === 'test.settings');
		expect(found?.settings).toBe(Settings);
	});

	it('re-registering by id replaces rather than duplicates', () => {
		registerPlugin({ id: 'test.dup', name: 'First' });
		registerPlugin({ id: 'test.dup', name: 'Second' });
		const matches = listPlugins().filter((p) => p.id === 'test.dup');
		expect(matches).toHaveLength(1);
		expect(matches[0].name).toBe('Second');
	});
});

describe('pluginSensorNamesFrom', () => {
	const src = (id: string, catalog: string[]) => ({
		id,
		start: async () => () => undefined,
		catalog: () => catalog
	});
	const list: Plugin[] = [
		{
			id: 'home-assistant',
			name: 'Home Assistant',
			sources: [src('home-assistant', ['ha.light.kitchen', 'ha.sensor.temp'])]
		},
		{ id: 'mqtt', name: 'MQTT', sources: [src('mqtt', ['mqtt.zigbee/temp'])] },
		{ id: 'no-source', name: 'No Source' } // a plugin without a sensor source contributes nothing
	];

	it('maps each plugin-source catalog id to its plugin name', () => {
		const names = pluginSensorNamesFrom(list);
		expect(names.get('ha.light.kitchen')).toBe('Home Assistant');
		expect(names.get('ha.sensor.temp')).toBe('Home Assistant');
		expect(names.get('mqtt.zigbee/temp')).toBe('MQTT');
	});

	it('does not badge built-in / unlisted sensors', () => {
		const names = pluginSensorNamesFrom(list);
		expect(names.has('cpu.total')).toBe(false);
		expect(names.has('mem.used')).toBe(false);
	});
});
