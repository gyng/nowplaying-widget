import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import DefaultNowPlaying from './DefaultNowPlaying.svelte';
import type { SessionRecord } from '../../../../stores/stores';

describe('DefaultNowPlaying', () => {
	it('shows artist and title', () => {
		const session: SessionRecord = {
			session_id: 0,
			source: '',
			timestamp_created: null,
			timestamp_updated: null,
			last_media_update: {
				Media: [
					{
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
					null
				]
			},
			last_model_update: {
				Model: {
					playback: null,
					timeline: null,
					media: null,
					source: ''
				}
			}
		};
		const { getByText } = render(DefaultNowPlaying, { session });

		expect(() => getByText(/fooartist/i)).not.toThrow();
		expect(() => getByText(/bartitle/i)).not.toThrow();
	});
});
