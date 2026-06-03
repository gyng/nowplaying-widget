import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '../../../stores/stores';
import { mediaSensorSamples, NP_SENSOR_IDS } from './sensors';

// Build a SessionRecord whose Media[0] carries the given media/playback/timeline.
const make = (over: {
	source?: string;
	title?: string;
	artist?: string;
	albumTitle?: string;
	status?: string;
	shuffle?: boolean;
	repeat?: 'None' | 'Track' | 'List';
	position?: number;
	end?: number;
}): SessionRecord => ({
	session_id: 1,
	source: over.source ?? 'spotify.exe',
	timestamp_created: null,
	timestamp_updated: null,
	last_media_update: {
		Media: [
			{
				source: over.source ?? 'spotify.exe',
				playback: {
					auto_repeat: over.repeat ?? 'None',
					rate: 1,
					shuffle: over.shuffle ?? false,
					status: (over.status ?? 'Playing') as never,
					type: 'Music'
				},
				timeline:
					over.position !== undefined || over.end !== undefined
						? { start: 0, end: over.end ?? 0, position: over.position ?? 0, last_updated_at_ms: 0 }
						: null,
				media: {
					album: over.albumTitle ? { artist: '', title: over.albumTitle, track_count: 0 } : null,
					artist: over.artist ?? '',
					genres: [],
					playback_type: 'Music',
					subtitle: '',
					title: over.title ?? '',
					track_number: null
				}
			},
			null
		]
	},
	last_model_update: { Model: { playback: null, timeline: null, media: null, source: '' } }
});

// Convenience: id -> SensorValue, for terse assertions.
const byId = (session: SessionRecord | undefined) =>
	Object.fromEntries(mediaSensorSamples(session, 123).map((s) => [s.sensor, s.value]));

describe('mediaSensorSamples', () => {
	it('emits exactly NP_SENSOR_IDS, in order, stamped with the given ts', () => {
		const samples = mediaSensorSamples(undefined, 123);
		expect(samples.map((s) => s.sensor)).toEqual(NP_SENSOR_IDS);
		expect(samples.every((s) => s.ts_ms === 123)).toBe(true);
	});

	it('yields empty text + zeroed scalars when nothing is playing', () => {
		const v = byId(undefined);
		expect(v['np.title']).toEqual({ kind: 'text', value: '' });
		expect(v['np.status']).toEqual({ kind: 'text', value: '' });
		expect(v['np.playing']).toEqual({ kind: 'scalar', value: 0 });
		expect(v['np.position']).toEqual({ kind: 'scalar', value: 0 });
		expect(v['np.progress']).toEqual({ kind: 'scalar', value: 0 });
	});

	it('maps a playing session with a timeline to the right values', () => {
		const v = byId(
			make({
				source: 'foobar2000.exe',
				title: 'Track',
				artist: 'Artist',
				albumTitle: 'Album',
				status: 'Playing',
				shuffle: true,
				repeat: 'Track',
				position: 30,
				end: 120
			})
		);
		expect(v['np.title']).toEqual({ kind: 'text', value: 'Track' });
		expect(v['np.artist']).toEqual({ kind: 'text', value: 'Artist' });
		expect(v['np.album']).toEqual({ kind: 'text', value: 'Album' });
		expect(v['np.source']).toEqual({ kind: 'text', value: 'foobar2000.exe' });
		expect(v['np.status']).toEqual({ kind: 'text', value: 'Playing' });
		expect(v['np.playing']).toEqual({ kind: 'scalar', value: 1 });
		expect(v['np.position']).toEqual({ kind: 'scalar', value: 30 });
		expect(v['np.duration']).toEqual({ kind: 'scalar', value: 120 });
		expect(v['np.progress']).toEqual({ kind: 'scalar', value: 25 });
		expect(v['np.shuffle']).toEqual({ kind: 'scalar', value: 1 });
		expect(v['np.repeat']).toEqual({ kind: 'text', value: 'Track' });
	});

	it('np.playing is 0 when paused; np.progress is 0 with no timeline', () => {
		const v = byId(make({ status: 'Paused' }));
		expect(v['np.playing']).toEqual({ kind: 'scalar', value: 0 });
		expect(v['np.progress']).toEqual({ kind: 'scalar', value: 0 });
		expect(v['np.duration']).toEqual({ kind: 'scalar', value: 0 });
	});
});
