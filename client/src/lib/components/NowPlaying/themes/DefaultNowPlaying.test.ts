import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import DefaultNowPlaying from './DefaultNowPlaying.svelte';
import type { MediaRecord } from '../../../../stores/stores';

describe('DefaultNowPlaying', () => {
	it('shows artist and title', () => {
		const currentMedia: MediaRecord = {
			session: {
				playback: null,
				timeline: null,
				media: {
					album: null,
					artist: 'fooartist',
					genres: [],
					playback_type: 'Music',
					subtitle: '',
					title: 'bartitle',
					track_number: null
				},
				source: 'test.exe'
			},
			thumbnail: undefined,
			timestamp: 1
		};
		const { getByText } = render(DefaultNowPlaying, { currentMedia });

		expect(() => getByText(/fooartist/i)).not.toThrow();
		expect(() => getByText(/bartitle/i)).not.toThrow();
	});
});
