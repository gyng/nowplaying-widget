import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';

// Stub the Tauri-backed media source (no backend in tests); show every control (caps = null).
vi.mock('../../components/NowPlaying/source', () => ({
	startMediaSource: () => undefined,
	getMediaCapabilities: () => Promise.resolve(null)
}));

import NowPlaying from './NowPlaying';
import { defaultState, mediaStore, type SessionRecord } from '../../../stores/stores';

// happy-dom doesn't implement blob object URLs; stub so the crossfade layers get a usable src.
beforeAll(() => {
	let n = 0;
	URL.createObjectURL = () => `blob:mock/${n++}`;
	URL.revokeObjectURL = () => undefined;
});

const ART = [137, 80, 78, 71, 1, 2, 3, 42]; // a non-empty thumbnail (distinct first/last byte → artKey)

const session = (title: string, art: number[] | null): SessionRecord => ({
	session_id: 1,
	source: 'spotify.exe',
	timestamp_created: null,
	timestamp_updated: null,
	last_media_update: {
		Media: [
			{
				source: 'spotify.exe',
				playback: {
					auto_repeat: 'None',
					rate: 1,
					shuffle: false,
					status: 'Playing',
					type: 'Music'
				},
				timeline: { start: 0, end: 100, position: 25, last_updated_at_ms: 0 },
				media: {
					album: null,
					artist: 'A',
					genres: [],
					playback_type: 'Music',
					subtitle: '',
					title,
					track_number: null
				}
			},
			art ? { content_type: 'image/png', data: art } : null
		]
	},
	last_model_update: { Model: { playback: null, timeline: null, media: null, source: '' } }
});

// Render NowPlaying showing a track whose cover has loaded (the visible, full-colour layer).
async function renderWithLoadedCover() {
	const view = render(<NowPlaying />);
	const img = await waitFor(() => {
		const el = view.container.querySelector('.np-thumb') as HTMLImageElement | null;
		if (!el) throw new Error('no cover layer yet');
		return el;
	});
	fireEvent.load(img); // onLayerLoad → rAF → loaded:true (opacity fades in)
	await waitFor(() => expect(img.getAttribute('data-loaded')).toBe('true'));
	return { ...view, img };
}

beforeEach(() => {
	mediaStore.set({ ...defaultState, sourcePriority: '', sessions: { 1: session('Song A', ART) } });
});
afterEach(() => vi.useRealTimers());

describe('NowPlaying — song-change grey cue', () => {
	it('the freshly-loaded cover is in full colour (not leaving)', async () => {
		const { img } = await renderWithLoadedCover();
		expect(img.getAttribute('data-leaving')).toBe('false');
	});

	it('greys the previous cover (data-leaving) the instant the song changes — even with no new art', async () => {
		const { img } = await renderWithLoadedCover();
		// Same cover bytes (same album → no crossfade), only the title changes: still must grey at once.
		act(() => {
			mediaStore.set({ ...mediaStore.getSnapshot(), sessions: { 1: session('Song B', ART) } });
		});
		await waitFor(() => expect(img.getAttribute('data-leaving')).toBe('true'));
	});

	it('recovers the same cover to colour after the hold (same-album reuse never sticks grey)', async () => {
		const { img } = await renderWithLoadedCover();
		vi.useFakeTimers();
		act(() => {
			mediaStore.set({ ...mediaStore.getSnapshot(), sessions: { 1: session('Song B', ART) } });
		});
		expect(img.getAttribute('data-leaving')).toBe('true');
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1000); // past GREY_HOLD_MS
		});
		expect(img.getAttribute('data-leaving')).toBe('false');
	});
});
