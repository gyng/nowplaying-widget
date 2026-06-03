// A tiny external store — the `writable<T>` surface (getSnapshot/subscribe/set/update) the media
// store relied on, shaped for React's useSyncExternalStore. Replaces svelte/store with no Svelte
// dependency. NOTE: unlike a Svelte writable, `subscribe` does NOT fire synchronously on subscribe —
// callers that relied on that (e.g. persist-at-import) must invoke their effect once explicitly.
import { useSyncExternalStore } from 'react';

export interface ExternalStore<T> {
	getSnapshot(): T;
	subscribe(listener: () => void): () => void;
	set(value: T): void;
	update(fn: (current: T) => T): void;
}

export function createStore<T>(initial: T): ExternalStore<T> {
	let value = initial;
	const listeners = new Set<() => void>();
	const set = (next: T): void => {
		value = next;
		for (const listener of listeners) listener();
	};
	return {
		getSnapshot: () => value,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		set,
		update: (fn) => set(fn(value))
	};
}

/** Subscribe a React component to an ExternalStore (re-renders on every change). */
export function useStore<T>(store: ExternalStore<T>): T {
	return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
