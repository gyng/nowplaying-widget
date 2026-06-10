// The Home Assistant plugin (Phase 8c) — the first build-time plugin, and the worked
// example of the Phase 8 plugin API. Calling `registerHomeAssistantPlugin()` registers its
// source + widgets via `registerPlugin`; plugins/index.ts calls it (error-isolated) for
// Canvas. Adding HA touches no core wiring: the widgets go through the same
// registerMeta/createWidget path as the built-ins, and the data rides the existing
// `telemetry` event (see ha-source.ts).

import { registerPlugin } from '../plugin';
import { haSource } from './ha-source';
import { haCallService } from './ha-commands';
import HaSettings from './HaSettings';
import HaSensor from '../meters/HaSensor';
import HaLight from '../meters/HaLight';
import HaClimate from '../meters/HaClimate';
import { asMeter } from '../registry';

// HA widgets have no defaultSensor — the entity is unknown until the user picks one from
// the inspector's sensor dropdown (which lists `ha.<entity_id>` ids once connected). They
// bind 'json' so the meter receives the whole HA state object (state + attributes).
export const registerHomeAssistantPlugin = (): void =>
	registerPlugin({
		id: 'home-assistant',
		name: 'Home Assistant',
		description:
			'Sensors, lights and climate from Home Assistant. Configured server-side via plugins/ha.json.',
		sources: [haSource],
		settings: HaSettings,
		statusSensor: 'ha.status',
		// The catch-all control handler: any non-media {domain, service} bang is an HA service call
		// (light.turn_on, climate.set_temperature, …), targeting the action's explicit `data.entity_id`
		// (macros on an unbound button supply it) or, falling back, the firing widget's bound
		// `ha.<entity>` sensor. Resolves to a no-op when there's no entity to target; rejects on
		// invoke failure so a macro run can record the failed step.
		actions: [
			{
				domain: '*',
				dispatch: async ({ domain, service, data }, { sensor }) => {
					const entity_id =
						(data?.entity_id as string | undefined) ??
						(sensor && sensor.startsWith('ha.') ? sensor.slice('ha.'.length) : undefined);
					if (!entity_id) return;
					// Merge the action's control data (e.g. brightness, temperature) with the resolved entity.
					await haCallService(domain, service, { entity_id, ...data });
				}
			}
		],
		widgets: [
			{
				meta: {
					type: 'ha.sensor',
					binds: 'json',
					label: 'HA Sensor',
					defaultSize: { w: 150, h: 44 },
					defaultConfig: {},
					configFields: [{ key: 'label', label: 'label', kind: 'text' }]
				},
				component: asMeter(HaSensor)
			},
			{
				meta: {
					type: 'ha.light',
					binds: 'json',
					label: 'HA Light',
					interactive: true,
					defaultSize: { w: 120, h: 48 },
					defaultConfig: {},
					configFields: [{ key: 'label', label: 'label', kind: 'text' }]
				},
				component: asMeter(HaLight)
			},
			{
				meta: {
					type: 'ha.climate',
					binds: 'json',
					label: 'HA Climate',
					interactive: true,
					defaultSize: { w: 160, h: 72 },
					defaultConfig: {},
					configFields: [{ key: 'label', label: 'label', kind: 'text' }]
				},
				component: asMeter(HaClimate)
			}
		]
	});
