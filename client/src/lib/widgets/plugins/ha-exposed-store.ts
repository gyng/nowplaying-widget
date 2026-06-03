// Persistence adapter for the HA "exposed" allowlist (the pure logic is core/haExposed.ts). A
// localStorage-backed external store so the studio's entity browser and the inspector dropdown
// (both in the studio window) share one normalized list that survives restarts. Outer ring: the
// only I/O (localStorage) lives here; the store holds `ha.<entity_id>` ids.
import { createStore } from '../../../stores/createStore';
import { normalizeExposed } from '../../core/haExposed';

const KEY = 'ha.exposed';

function load(): string[] {
	try {
		const raw = localStorage.getItem(KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		if (!Array.isArray(parsed)) return [];
		return normalizeExposed(parsed.filter((x): x is string => typeof x === 'string'));
	} catch {
		return [];
	}
}

export const haExposedStore = createStore<string[]>(load());

// Persist on every change (a no-op subscriber leak is fine — the store lives for the app's life).
haExposedStore.subscribe(() => {
	try {
		localStorage.setItem(KEY, JSON.stringify(haExposedStore.getSnapshot()));
	} catch {
		// best-effort: storage may be unavailable (private mode / quota); the in-memory list still works.
	}
});
