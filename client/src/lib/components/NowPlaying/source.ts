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
import { COMMANDS, EVENTS } from '../../bridge/contract';

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
	return invoke<MediaCaps | null>(COMMANDS.mediaCapabilities, { source: source ?? null }).catch(
		() => null
	);
}

/** Send a transport action (play/pause/next/seek/…) to the backend's media controller. `source`
 * targets a specific session (null = the active one); `value` carries a seek position. Rejects on
 * invoke failure so a macro run can record the failed step. */
export function mediaControl(
	action: string,
	source: string | null,
	value: number | null
): Promise<void> {
	return invoke(COMMANDS.mediaControl, { action, source, value });
}

let started = false;

export function startMediaSource(): void {
	if (started) return;
	started = true;
	invoke<{ sessions: Record<number, SessionRecord> }>(COMMANDS.getInitialSessions, { message: '' })
		.then((ev) => handleInitialize({ sessions: ev.sessions }))
		.catch(() => undefined);
	tauriEvent.listen<SessionRecord>(EVENTS.sessionUpdate, (ev) =>
		handleUpdate({ sessionRecord: ev.payload })
	);
	tauriEvent.listen<SessionRecord>(EVENTS.sessionDelete, (ev) =>
		handleDelete({ sessionRecord: ev.payload })
	);
}
