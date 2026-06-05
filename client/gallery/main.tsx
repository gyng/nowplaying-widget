// Gallery entry. Runs in a plain browser (no Tauri): freeze the clock and seed the media store, then
// render. We deliberately do NOT install the Tauri dev mock — the now-playing widget's startup calls
// (get_initial_sessions / media_capabilities) then simply reject and are caught, leaving our seeded
// session intact (the mock would answer get_initial_sessions with an empty set and wipe it).
import { createRoot } from 'react-dom/client';
import { freezeClock, seedMedia } from './seed';
import Gallery from './Gallery';

// Minimal Tauri stub: in a plain browser `invoke()` would sync-throw on `transformCallback`. Resolve
// `undefined` instead — un-awaited `listen()` calls then settle cleanly (no unhandled rejection), and
// get_initial_sessions' `.then(ev => ...ev.sessions)` throws on undefined → caught by its own `.catch`,
// leaving the seeded media session intact (the full dev mock would return an empty set and wipe it).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__TAURI_INTERNALS__ = {
	transformCallback: (cb: unknown) => cb,
	invoke: () => Promise.resolve(undefined)
};

async function boot(): Promise<void> {
	freezeClock();
	await seedMedia();
	const root = document.getElementById('root');
	if (root) createRoot(root).render(<Gallery />);
}

void boot();
