// Persistence adapter for the HA "exposed" allowlist (the pure logic is core/haExposed.ts). A
// localStorage-backed external store so the studio's entity browser and the inspector dropdown
// (both in the studio window) share one normalized list that survives restarts. Outer ring: I/O
// goes through stores/persist.ts; the store holds `ha.<entity_id>` ids.
import { createPersistedStore } from '../../../stores/persist';
import { normalizeExposed } from '../../core/haExposed';

// Legacy key, predates the 'widgetsack.*' namespace convention.
const KEY = 'ha.exposed';

function parse(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return normalizeExposed(raw.filter((x): x is string => typeof x === 'string'));
}

export const haExposedStore = createPersistedStore<string[]>(KEY, parse);
