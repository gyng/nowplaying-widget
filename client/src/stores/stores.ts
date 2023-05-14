import { writable } from 'svelte/store';

export type State = {
	currentMedia: Record<string, MediaRecord>;
	sourcePriority: string;
};

export type MediaRecord = {
	session: SessionModel | null;
	thumbnail: ThumbnailInfo | undefined;
	timestamp: number;
};

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

export type SessionUpdateEventMedia = [SessionModel, ThumbnailInfo | null];
export type SessionUpdateEventModel = SessionModel;
export type SessionUpdateEvent = SessionUpdateEventModel | SessionUpdateEventMedia;

export const mediaStore = writable<State>({
	currentMedia: {},
	sourcePriority: ['SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', 'foobar2000.exe']
		.join('\n')
		.toLowerCase()
});

type UpdateMediaOptions = { session: SessionModel; thumbnail: ThumbnailInfo | null };
export function handleMediaEvent(ev: UpdateMediaOptions) {
	console.log('handling Media update', ev);

	if (!ev) {
		console.log('skipping Media', ev);
		return;
	}

	let imageUrl: string;
	if (ev.thumbnail?.data) {
		imageUrl = URL.createObjectURL(
			new Blob([new Uint8Array(ev.thumbnail.data)], {
				type: ev.thumbnail.content_type
			})
		);
	}

	mediaStore.update((cur) => {
		const toUpdate = cur.currentMedia[ev.session.source];
		return {
			currentMedia: {
				...cur.currentMedia,
				[ev.session.source]: {
					...(toUpdate ?? {}),
					session: ev.session,
					thumbnail: { ...ev.thumbnail, url: imageUrl },
					timestamp: Date.now()
				}
			},
			sourcePriority: cur.sourcePriority
		};
	});
}

type UpdateModelInfo = {
	session: SessionModel;
};
export function handleModelEvent(ev: UpdateModelInfo | null) {
	console.log('handling Model update', ev);

	if (!ev) {
		console.log('skipping Model', ev);
		return;
	}

	mediaStore.update((cur) => {
		const toUpdate = cur.currentMedia[ev.session.source];
		return {
			currentMedia: {
				...cur.currentMedia,
				[ev.session.source]: {
					...(toUpdate ?? {}),
					session: ev.session,
					timestamp: Date.now()
				}
			},
			sourcePriority: cur.sourcePriority
		};
	});
}
