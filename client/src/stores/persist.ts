// The ONE localStorage seam (outer ring). Every persisted UI preference / store goes through
// these helpers instead of hand-rolling try/catch JSON — storage may be unavailable (private
// mode / quota), so reads fall back and writes are best-effort, silently.
//
// Key convention: new keys are namespaced 'widgetsack.<area>.<name>' (e.g.
// 'widgetsack.studio.panes'). Legacy keys ('_mediaStore', 'ha.exposed') keep their historical
// names — renaming would orphan users' saved state.
import { createStore, type ExternalStore } from './createStore';

/** Parsed JSON at `key`, or null when missing/corrupt/unavailable. Callers validate the shape. */
export function readJson(key: string): unknown {
	try {
		const raw = localStorage.getItem(key);
		return raw === null ? null : (JSON.parse(raw) as unknown);
	} catch {
		return null;
	}
}

/** Best-effort JSON write; a failure just means the value won't survive this session. */
export function writeJson(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* ignore quota / unavailable */
	}
}

/** Raw string at `key` (NOT JSON — for keys that store a bare string), or null. */
export function readString(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

/** Best-effort raw string write. */
export function writeString(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		/* ignore quota / unavailable */
	}
}

/**
 * An ExternalStore seeded from localStorage that persists on every change. `parse` receives the
 * stored JSON (or null) and must return a full value — it owns validation and defaults.
 * `serialize` picks what is written back (defaults to the whole value); use it when the store
 * holds runtime-only fields that must not persist. Persists once at creation too (so defaults
 * land on first run) and via a module-level subscription, decoupled from React mounts.
 */
export function createPersistedStore<T>(
	key: string,
	parse: (raw: unknown) => T,
	serialize: (value: T) => unknown = (v) => v
): ExternalStore<T> {
	const store = createStore<T>(parse(readJson(key)));
	writeJson(key, serialize(store.getSnapshot()));
	store.subscribe(() => writeJson(key, serialize(store.getSnapshot())));
	return store;
}
