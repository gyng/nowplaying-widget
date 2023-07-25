import { writable } from 'svelte/store';

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

export type State = {
	sessions: Record<string, SessionRecord>;
	sourcePriority: string;
	styleOverride: string;
};

export type SerializedState = Pick<State, 'sourcePriority' | 'styleOverride'>;

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
	styleOverride: ''
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
		styleOverride: raw.styleOverride
	};
} catch (err) {
	localMediaStoreDeserializedState = {};
	console.warn(err);
}

const initialState: State = {
	...defaultState,
	...localMediaStoreDeserializedState
};

export const mediaStore = writable<State>(initialState);

mediaStore.subscribe((value) => {
	const toSerialize: SerializedState = {
		sourcePriority: value.sourcePriority,
		styleOverride: value.styleOverride
	};
	localStorage.setItem(MEDIA_STORE_KEY, JSON.stringify(toSerialize));
});

export type HandleInitializeOpts = { sessions: Record<number, SessionRecord> };
export function handleInitialize(opts: HandleInitializeOpts) {
	console.log('store handling session initialization', opts);
	if (!opts) {
		console.log('skipping initialization', opts);
		return;
	}

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
	console.log('store handling update', opts);
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
	console.log('store handling delete', opts);
	mediaStore.update((cur) => {
		const copy = { ...cur };
		const copySessions = copy.sessions;
		delete copySessions[opts.sessionRecord.session_id];
		return copy;
	});
}

// type UpdateMediaOptions = { session: SessionModel; thumbnail: ThumbnailInfo | null };
// export function handleMediaEvent(ev: UpdateMediaOptions) {
// 	console.log('handling Media update', ev);

// 	if (!ev) {
// 		console.log('skipping Media', ev);
// 		return;
// 	}

// 	let imageUrl: string;
// 	if (ev.thumbnail?.data) {
// 		imageUrl = URL.createObjectURL(
// 			new Blob([new Uint8Array(ev.thumbnail.data)], {
// 				type: ev.thumbnail.content_type
// 			})
// 		);
// }

// mediaStore.update((cur) => {
// 	const toUpdate = cur.currentMedia[ev.session.source];
// 	return {
// 		currentMedia: {
// 			...cur.currentMedia,
// 			[ev.session.source]: {
// 				...(toUpdate ?? {}),
// 				session: ev.session,
// 				thumbnail: { ...ev.thumbnail, url: imageUrl },
// 				timestamp: Date.now()
// 			}
// 		},
// 		sourcePriority: cur.sourcePriority,
// 		styleOverride: cur.styleOverride
// 	};
// });
// }

// type UpdateModelInfo = {
// 	session: SessionModel;
// };
// export function handleModelEvent(ev: UpdateModelInfo | null) {
// 	console.log('handling Model update', ev);

// 	if (!ev) {
// 		console.log('skipping Model', ev);
// 		return;
// 	}

// 	mediaStore.update((cur) => {
// 		const toUpdate = cur.currentMedia[ev.session.source];
// 		return {
// 			currentMedia: {
// 				...cur.currentMedia,
// 				[ev.session.source]: {
// 					...(toUpdate ?? {}),
// 					session: ev.session,
// 					timestamp: Date.now()
// 				}
// 			},
// 			sourcePriority: cur.sourcePriority,
// 			styleOverride: cur.styleOverride
// 		};
// 	});
// }
