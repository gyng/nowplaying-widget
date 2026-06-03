import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

// Stub the Tauri-backed media source; resolve a known MediaCaps so the capabilities grid renders.
vi.mock('../../components/NowPlaying/source', () => ({
	startMediaSource: () => undefined,
	getMediaCapabilities: () =>
		Promise.resolve({
			play: true,
			pause: true,
			playpause: true,
			stop: false,
			next: true,
			previous: true,
			shuffle: false,
			repeat: false,
			seek: true
		})
}));
vi.mock('../../overlay', () => ({ copyToClipboard: () => Promise.resolve(true) }));

import NowPlayingSettings from './NowPlayingSettings';
import { defaultState, mediaStore, type SessionRecord } from '../../../stores/stores';

const session = (source: string, title: string): SessionRecord => ({
	session_id: 1,
	source,
	timestamp_created: null,
	timestamp_updated: null,
	last_media_update: {
		Media: [
			{
				source,
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
			null
		]
	},
	last_model_update: { Model: { playback: null, timeline: null, media: null, source: '' } }
});

beforeEach(() => {
	mediaStore.set({
		...defaultState,
		sourcePriority: '',
		ignoreList: 'blocked',
		sessions: { 1: session('spotify.exe', 'Track'), 2: session('blocked.exe', 'Nope') }
	});
});

describe('NowPlayingSettings', () => {
	it('renders the editable lists + the live bindable-sensor values', async () => {
		const { container, getByText, findByText } = render(<NowPlayingSettings />);
		expect(container.querySelectorAll('textarea').length).toBe(2); // priority + ignore
		// np.* live values reflect the active (non-ignored) session.
		expect(getByText('np.title')).toBeTruthy();
		expect(getByText('Track')).toBeTruthy();
		expect(getByText('np.progress')).toBeTruthy();
		// Capabilities grid appears once the (mocked) query resolves.
		const seekCap = await findByText(/seek/);
		expect(seekCap.textContent).toContain('✓');
		expect(getByText(/stop/).textContent).toContain('✗');
	});

	it('normalizes list input to lowercase on blur (not per keystroke)', () => {
		const { container } = render(<NowPlayingSettings />);
		const ignore = container.querySelectorAll('textarea')[1];
		fireEvent.change(ignore, { target: { value: 'FooBar2000' } });
		expect(mediaStore.getSnapshot().ignoreList).toBe('FooBar2000'); // raw until blur
		fireEvent.blur(ignore);
		expect(mediaStore.getSnapshot().ignoreList).toBe('foobar2000');
	});

	it('disables the ＋ignore button for an already-ignored source', () => {
		const { getByLabelText } = render(<NowPlayingSettings />);
		expect(
			(getByLabelText('Add blocked.exe to the ignore list') as HTMLButtonElement).disabled
		).toBe(true);
		expect(
			(getByLabelText('Add spotify.exe to the ignore list') as HTMLButtonElement).disabled
		).toBe(false);
	});

	it('requires two clicks to reset (guards against an accidental wipe)', () => {
		mediaStore.set({ ...mediaStore.getSnapshot(), sourcePriority: 'zzz' });
		const { container } = render(<NowPlayingSettings />);
		const reset = container.querySelector('.rp-danger') as HTMLButtonElement;
		fireEvent.click(reset);
		expect(mediaStore.getSnapshot().sourcePriority).toBe('zzz'); // armed, not yet reset
		fireEvent.click(reset);
		expect(mediaStore.getSnapshot().sourcePriority).toBe(defaultState.sourcePriority);
	});

	it('removes an ignore entry via its row ✕ button', () => {
		const { getByLabelText } = render(<NowPlayingSettings />); // beforeEach: ignoreList = 'blocked'
		fireEvent.click(getByLabelText('Remove blocked from the ignore list'));
		expect(mediaStore.getSnapshot().ignoreList).toBe('');
	});

	it('reorders the priority list with the ↑ button', () => {
		mediaStore.set({ ...mediaStore.getSnapshot(), sourcePriority: 'a\nb\nc' });
		const { getByLabelText } = render(<NowPlayingSettings />);
		fireEvent.click(getByLabelText('Move b up'));
		expect(mediaStore.getSnapshot().sourcePriority).toBe('b\na\nc');
	});

	it('retains a collapsed raw-text fallback per list (for an app that is not running)', () => {
		const { container } = render(<NowPlayingSettings />);
		expect(container.querySelectorAll('details.nps-raw').length).toBe(2);
	});
});
