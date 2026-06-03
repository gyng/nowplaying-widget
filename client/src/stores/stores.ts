import { createStore } from './createStore';

export type ManagerEventWrapper = unknown;

export type SessionUpdateEventWrapper = unknown;

export type UnsupportedEvent = [number | null, string];

export type SystemTime = {
	nanos_since_epoch: number;
	secs_since_epoch: number;
};

export type SessionRecord = {
	session_id: number;
	source: string;
	timestamp_created: SystemTime | null;
	timestamp_updated: SystemTime | null;
	last_media_update: SessionUpdateEventMedia;
	last_model_update: SessionUpdateEventModel;
};

export type MonitorInfo = {
	name: string | null;
	position: { x: number; y: number };
	size: { width: number; height: number };
};

export type SavedPosition = {
	x: number;
	y: number;
	width: number;
	height: number;
	timestamp: number;
};

export type State = {
	sessions: Record<string, SessionRecord>;
	sourcePriority: string;
	// Newline-separated source ids to hide entirely (lowercased). A session is dropped from the
	// now-playing selection if any non-blank line is a substring of its source — see filterIgnored.
	ignoreList: string;
	styleOverride: string;
	preferredMonitor: MonitorInfo | null;
	savedPosition: SavedPosition | null;
	restoreToSavedPosition: boolean;
};

export type SerializedState = Pick<
	State,
	| 'sourcePriority'
	| 'ignoreList'
	| 'styleOverride'
	| 'preferredMonitor'
	| 'savedPosition'
	| 'restoreToSavedPosition'
>;

export type PlaybackType = 'Unknown' | 'Music' | 'Video' | 'Image';
export type PlaybackStatus = 'Closed' | 'Opened' | 'Changing' | 'Stopped' | 'Playing' | 'Paused';
export type AutoRepeat = 'None' | 'Track' | 'List';

export type SessionModel = {
	playback: PlaybackModel | null;
	timeline: TimelineModel | null;
	media: MediaModel | null;
	source: string;
};

export type MediaModel = {
	album: AlbumModel | null;
	artist: string;
	genres: string[];
	playback_type: PlaybackType;
	subtitle: string;
	title: string;
	track_number: number | null;
};

export type AlbumModel = {
	artist: string;
	title: string;
	track_count: number;
};

export type PlaybackModel = {
	auto_repeat: AutoRepeat;
	rate: number;
	shuffle: boolean;
	status: PlaybackStatus;
	type: PlaybackType;
};

export type TimelineModel = {
	end: number;
	last_updated_at_ms: number;
	position: number;
	start: number;
};

export type ThumbnailInfo = { content_type?: string; data?: number[]; url?: string };
export type SessionUpdateEventMedia = { Media: [SessionModel, ThumbnailInfo | null] };
export type SessionUpdateEventModel = { Model: SessionModel };

export const defaultState: State = {
	sessions: {},
	sourcePriority: ['SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', 'foobar2000.exe']
		.join('\n')
		.toLowerCase(),
	ignoreList: '',
	styleOverride: '',
	preferredMonitor: null,
	savedPosition: null,
	restoreToSavedPosition: false
};

// Local storage
const MEDIA_STORE_KEY = '_mediaStore';
const localMediaStoreSerializedState = localStorage.getItem(MEDIA_STORE_KEY) ?? '';
let localMediaStoreDeserializedState: SerializedState | Record<string, never>;

try {
	// TODO: Validate deserialised values and do migrations if needed
	const raw = JSON.parse(localMediaStoreSerializedState);
	localMediaStoreDeserializedState = {
		sourcePriority: raw.sourcePriority,
		ignoreList: raw.ignoreList ?? '',
		styleOverride: raw.styleOverride,
		preferredMonitor: raw.preferredMonitor ?? null,
		savedPosition: raw.savedPosition ?? null,
		restoreToSavedPosition: raw.restoreToSavedPosition ?? false
	};
} catch (err) {
	localMediaStoreDeserializedState = {};
	console.warn(err);
}

const initialState: State = {
	...defaultState,
	...localMediaStoreDeserializedState
};

export const mediaStore = createStore<State>(initialState);

function persist(value: State): void {
	const toSerialize: SerializedState = {
		sourcePriority: value.sourcePriority,
		ignoreList: value.ignoreList,
		styleOverride: value.styleOverride,
		preferredMonitor: value.preferredMonitor,
		savedPosition: value.savedPosition,
		restoreToSavedPosition: value.restoreToSavedPosition
	};
	localStorage.setItem(MEDIA_STORE_KEY, JSON.stringify(toSerialize));
}

// Svelte's writable fired its subscriber synchronously on subscribe, so persistence ran at import
// AND on every change. `createStore` does NOT fire on subscribe, so replicate both halves: persist
// once now, then on every update. The subscription is module-level (decoupled from React) so it
// persists even when no component is mounted.
persist(initialState);
mediaStore.subscribe(() => persist(mediaStore.getSnapshot()));

export type HandleInitializeOpts = { sessions: Record<number, SessionRecord> };
export function handleInitialize(opts: HandleInitializeOpts) {
	if (!opts) return;

	mediaStore.update((cur) => {
		return {
			...cur,
			sessions: opts.sessions
		};
	});
}

export type HandleUpdateOpts = {
	sessionRecord: SessionRecord;
};
export function handleUpdate(opts: HandleUpdateOpts) {
	mediaStore.update((cur) => {
		return {
			...cur,
			sessions: {
				...cur.sessions,
				[opts.sessionRecord.session_id]: opts.sessionRecord
			}
		};
	});
}

export type HandleDeleteOpts = {
	sessionRecord: SessionRecord;
};
export function handleDelete(opts: HandleDeleteOpts) {
	mediaStore.update((cur) => {
		const copy = { ...cur };
		const copySessions = copy.sessions;
		delete copySessions[opts.sessionRecord.session_id];
		return copy;
	});
}
