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
