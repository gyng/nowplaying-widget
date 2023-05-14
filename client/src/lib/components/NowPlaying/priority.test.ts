import { describe, expect, it } from 'vitest';
import type { MediaRecord, PlaybackModel, SessionModel } from '../../../stores/stores';
import { sortMediaByPriority } from './priority';

const playback: PlaybackModel = {
	auto_repeat: 'None',
	rate: 0,
	shuffle: false,
	status: 'Playing',
	type: 'Unknown'
};

const session: SessionModel = {
	playback: playback,
	timeline: null,
	media: null,
	source: 'set_me'
};

const record: MediaRecord = {
	session,
	thumbnail: undefined,
	timestamp: 1
};

describe('priority', () => {
	it('sorts media by priority in list', () => {
		const allMedia: Record<string, MediaRecord> = {
			foobar: {
				...record,
				session: { ...session, source: 'foobar' }
			},
			barbaz: {
				...record,
				session: { ...session, source: 'barbaz' }
			},
			notinlist: {
				...record,
				session: { ...session, source: 'notinlist' }
			}
		};
		const priority = 'barbaz\nfoobar';

		const sorted = sortMediaByPriority(allMedia, priority);

		expect(sorted[0].session?.source).toBe('barbaz');
		expect(sorted[1].session?.source).toBe('foobar');
		expect(sorted[2].session?.source).toBe('notinlist');
	});

	it('sorts media by playing status after sorting by priority list', () => {
		const allMedia: Record<string, MediaRecord> = {
			foobar: {
				...record,
				session: { ...session, playback: { ...playback, status: 'Playing' }, source: 'foobar' }
			},
			barbaz: {
				...record,
				session: { ...session, playback: { ...playback, status: 'Stopped' }, source: 'barbaz' }
			},
			notinlist: {
				...record,
				session: { ...session, playback: { ...playback, status: 'Playing' }, source: 'notinlist' }
			}
		};
		const priority = 'barbaz\nfoobar';

		const sorted = sortMediaByPriority(allMedia, priority);

		expect(sorted[0].session?.source).toBe('foobar');
		expect(sorted[1].session?.source).toBe('notinlist');
		expect(sorted[2].session?.source).toBe('barbaz');
	});

	it('sorts media by timestamp otherwise', () => {
		const allMedia: Record<string, MediaRecord> = {
			foobar: {
				...record,
				session: { ...session, source: 'foobar' },
				timestamp: 1
			},
			barbaz: {
				...record,
				session: { ...session, source: 'barbaz' },
				timestamp: 5
			},
			notinlist: {
				...record,
				session: { ...session, source: 'notinlist' },
				timestamp: 10
			}
		};
		const priority = '';

		const sorted = sortMediaByPriority(allMedia, priority);

		expect(sorted[0].session?.source).toBe('notinlist');
		expect(sorted[1].session?.source).toBe('barbaz');
		expect(sorted[2].session?.source).toBe('foobar');
	});
});
