// Wire the GSMTC media feed (the Rust `session_update`/`session_delete` events + the initial
// snapshot) into the `mediaStore`, so the `nowplaying` widget can render the active session.
// Idempotent: safe to call from every nowplaying widget instance — the listeners attach once.

import { invoke } from '@tauri-apps/api/core';
import * as tauriEvent from '@tauri-apps/api/event';
import {
	handleInitialize,
	handleUpdate,
	handleDelete,
	type SessionRecord
} from '../../../stores/stores';

// Which transport controls the active session supports (mirrors the Rust `MediaCaps` struct in
// widgetsack/src/media.rs — keep both sides in sync, AGENTS.md §5). The widget hides buttons a
// player doesn't expose.
export type MediaCaps = {
	play: boolean;
	pause: boolean;
	playpause: boolean;
	stop: boolean;
	next: boolean;
	previous: boolean;
	shuffle: boolean;
	repeat: boolean;
	seek: boolean;
};

/** Ask the backend which controls the matched (or current) session supports. Returns null when the
 * query can't run (non-Windows, no backend in tests) so the caller shows every button by default. */
export function getMediaCapabilities(source?: string): Promise<MediaCaps | null> {
	return invoke<MediaCaps | null>('media_capabilities', { source: source ?? null }).catch(
		() => null
	);
}

let started = false;

export function startMediaSource(): void {
	if (started) return;
	started = true;
	invoke<{ sessions: Record<number, SessionRecord> }>('get_initial_sessions', { message: '' })
		.then((ev) => handleInitialize({ sessions: ev.sessions }))
		.catch(() => undefined);
	tauriEvent.listen<SessionRecord>('session_update', (ev) =>
		handleUpdate({ sessionRecord: ev.payload })
	);
	tauriEvent.listen<SessionRecord>('session_delete', (ev) =>
		handleDelete({ sessionRecord: ev.payload })
	);
}
