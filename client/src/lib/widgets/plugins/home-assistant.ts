// The Home Assistant plugin (Phase 8c) — the first build-time plugin, and the worked
// example of the Phase 8 plugin API. Importing this module registers its source + widgets
// via `registerPlugin`; Canvas side-effect-imports it. Adding HA touches no core wiring:
// the widgets go through the same registerMeta/createWidget path as the built-ins, and the
// data rides the existing `telemetry` event (see ha-source.ts).

import { registerPlugin } from '../plugin';
import { haSource } from './ha-source';
import HaSensor from '../meters/HaSensor';
import HaLight from '../meters/HaLight';
import HaClimate from '../meters/HaClimate';
import type { MeterComponent } from '../registry';

// HA widgets have no defaultSensor — the entity is unknown until the user picks one from
// the inspector's sensor dropdown (which lists `ha.<entity_id>` ids once connected). They
// bind 'json' so the meter receives the whole HA state object (state + attributes).
registerPlugin({
	id: 'home-assistant',
	name: 'Home Assistant',
	sources: [haSource],
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
			component: HaSensor as unknown as MeterComponent
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
			component: HaLight as unknown as MeterComponent
		},
		{
			meta: {
				type: 'ha.climate',
				binds: 'json',
				label: 'HA Climate',
				defaultSize: { w: 160, h: 58 },
				defaultConfig: {},
				configFields: [{ key: 'label', label: 'label', kind: 'text' }]
			},
			component: HaClimate as unknown as MeterComponent
		}
	]
});
