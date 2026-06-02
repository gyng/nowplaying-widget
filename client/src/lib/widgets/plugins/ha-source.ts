// The Home Assistant data source (Phase 8c). HA is a Rust *proxy* source: the WebSocket
// and the long-lived token live server-side (widgetsack/src/ha.rs, plugins/ha.json), and
// entity state arrives over the EXISTING `telemetry` event as `ha.<entity_id>` samples —
// ingested by the built-in `system` source's listener, unchanged. So this source only
// flips the connection on/off and provides the entity catalog for the inspector dropdown;
// it never opens a socket or sees the token (the more-secure model, locked 2026-06-02).

import { invoke } from '@tauri-apps/api/core';
import type { SensorSource } from '../../core/plugin';

type HaEntity = { entity_id: string; state: string; friendly_name?: string; unit?: string };

// Entity ids cached from the last catalog fetch, so the inspector dropdown can list HA
// sensors synchronously alongside the live system sensors.
let cachedIds: string[] = [];

export const haSource: SensorSource = {
	id: 'home-assistant',
	start: async () => {
		try {
			// Spawns the server-side WS task iff plugins/ha.json exists; a no-op otherwise.
			await invoke('ha_connect');
			const entities = await invoke<HaEntity[]>('list_ha_entities');
			cachedIds = entities.map((e) => `ha.${e.entity_id}`);
		} catch {
			// Not configured / unreachable: leave the catalog empty. The widgets still
			// register; the user adds plugins/ha.json and restarts to light them up.
			cachedIds = [];
		}
		return () => {
			invoke('ha_disconnect').catch(() => undefined);
		};
	},
	catalog: () => cachedIds
};
