/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { describe, expect, it } from 'vitest';
import type { PlaybackModel, SessionModel, SessionRecord } from '../../../stores/stores';
import { filterIgnored, sortSessionsByPriority } from './priority';

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

const sessionRecord: SessionRecord = {
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

describe('priority', () => {
	it('sorts media by priority in list', () => {
		const sessions: Record<number, SessionRecord> = {
			0: {
				...sessionRecord,
				session_id: 0,
				source: 'foobar'
			},
			2: {
				...sessionRecord,
				session_id: 2,
				source: 'barbaz'
			},
			4: {
				...sessionRecord,
				session_id: 4,
				source: 'notinlist'
			}
		};
		const priority = 'barbaz\nfoobar';

		const sorted = sortSessionsByPriority(sessions, priority);

		expect(sorted.at(2)!.source).toBe('barbaz');
		expect(sorted.at(1)!.source).toBe('foobar');
		expect(sorted.at(0)!.source).toBe('notinlist');
	});

	it('sorts media by playing status after sorting by priority list', () => {
		const sessions: Record<number, SessionRecord> = {
			0: {
				...sessionRecord,
				session_id: 0,
				source: 'foobar',
				last_model_update: { Model: { ...session, playback: { ...playback, status: 'Playing' } } }
			},
			2: {
				...sessionRecord,
				session_id: 2,
				source: 'barbaz',
				last_model_update: { Model: { ...session, playback: { ...playback, status: 'Stopped' } } }
			},
			4: {
				...sessionRecord,
				session_id: 4,
				source: 'notinlist',
				last_model_update: { Model: { ...session, playback: { ...playback, status: 'Playing' } } }
			}
		};
		const priority = 'barbaz\nfoobar';

		const sorted = sortSessionsByPriority(sessions, priority);

		expect(sorted.at(0)!.source).toBe('foobar');
		expect(sorted.at(1)!.source).toBe('notinlist');
		expect(sorted.at(2)!.source).toBe('barbaz');
	});

	it('sorts media by last updated timestamp otherwise', () => {
		const sessions: Record<number, SessionRecord> = {
			0: {
				...sessionRecord,
				session_id: 0,
				source: 'foobar',
				timestamp_updated: { secs_since_epoch: 10, nanos_since_epoch: 0 }
			},
			2: {
				...sessionRecord,
				session_id: 2,
				source: 'barbaz',
				timestamp_updated: { secs_since_epoch: 100, nanos_since_epoch: 0 }
			},
			4: {
				...sessionRecord,
				session_id: 4,
				source: 'notinlist',
				timestamp_updated: { secs_since_epoch: 1000, nanos_since_epoch: 0 }
			}
		};
		const priority = '';

		const sorted = sortSessionsByPriority(sessions, priority);

		expect(sorted.at(2)!.source).toBe('notinlist');
		expect(sorted.at(1)!.source).toBe('barbaz');
		expect(sorted.at(0)!.source).toBe('foobar');
	});
});

describe('filterIgnored', () => {
	const make = (sources: Record<number, string>): Record<number, SessionRecord> =>
		Object.fromEntries(
			Object.entries(sources).map(([id, source]) => [
				Number(id),
				{ ...sessionRecord, session_id: Number(id), source }
			])
		);

	it('drops sessions whose source matches an ignore term', () => {
		const sessions = make({ 0: 'foobar2000.exe', 1: 'spotify.exe' });
		const kept = filterIgnored(sessions, 'foobar2000');
		expect(Object.values(kept).map((s) => s.source)).toEqual(['spotify.exe']);
	});

	it('is a no-op for an empty / blank-only list', () => {
		const sessions = make({ 0: 'foobar2000.exe', 1: 'spotify.exe' });
		expect(filterIgnored(sessions, '')).toBe(sessions);
		expect(filterIgnored(sessions, '   \n\n  ')).toBe(sessions);
	});

	it('matches case-insensitively', () => {
		const sessions = make({ 0: 'FooBar2000.EXE', 1: 'spotify.exe' });
		const kept = filterIgnored(sessions, 'FOOBAR2000');
		expect(Object.values(kept).map((s) => s.source)).toEqual(['spotify.exe']);
	});

	it('honours multiple terms, ignoring blank lines', () => {
		const sessions = make({ 0: 'foobar2000.exe', 1: 'spotify.exe', 2: 'chrome.exe' });
		const kept = filterIgnored(sessions, 'foobar2000\n\nchrome');
		expect(Object.values(kept).map((s) => s.source)).toEqual(['spotify.exe']);
	});
});
