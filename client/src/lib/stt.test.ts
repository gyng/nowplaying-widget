import { describe, it, expect, vi, afterEach } from 'vitest';
import { listMicrophones, pickMime, startRecording, sttAvailable } from './stt';

afterEach(() => vi.unstubAllGlobals());

describe('stt', () => {
	it('reports unavailable in a plain environment and startRecording rejects', async () => {
		expect(sttAvailable()).toBe(false);
		await expect(startRecording()).rejects.toThrow(/not available/);
		expect(await listMicrophones()).toEqual([]); // graceful when unavailable
	});

	it('lists audioinput devices with id fallback labels', async () => {
		vi.stubGlobal('MediaRecorder', class {});
		vi.stubGlobal('navigator', {
			mediaDevices: {
				getUserMedia: async () => ({}),
				enumerateDevices: async () => [
					{ kind: 'audioinput', deviceId: 'mic-abc123', label: 'Built-in Mic' },
					{ kind: 'audioinput', deviceId: 'mic-def456', label: '' },
					{ kind: 'audiooutput', deviceId: 'spk-1', label: 'Speakers' }
				]
			}
		});
		const mics = await listMicrophones();
		expect(mics).toHaveLength(2); // outputs excluded
		expect(mics[0]).toEqual({ id: 'mic-abc123', name: 'Built-in Mic' });
		expect(mics[1].name).toMatch(/Microphone mic-de/); // blank label -> id fallback
	});

	it('pickMime returns the first supported candidate, or empty when none', () => {
		vi.stubGlobal('MediaRecorder', {
			isTypeSupported: (m: string) => m === 'audio/webm'
		});
		expect(pickMime()).toBe('audio/webm');

		vi.stubGlobal('MediaRecorder', { isTypeSupported: () => false });
		expect(pickMime()).toBe('');
	});

	it('stop() resolves (does not hang) even when the recorder already went inactive', async () => {
		const tracks = [{ stop: vi.fn() }];
		let inst: { state: string; onstop: (() => void) | null } | undefined;
		class FakeRecorder {
			state = 'recording';
			mimeType = 'audio/webm';
			ondataavailable: ((e: unknown) => void) | null = null;
			onstop: (() => void) | null = null;
			onerror: (() => void) | null = null;
			constructor() {
				inst = this;
			}
			start() {}
			stop() {
				this.state = 'inactive';
				this.onstop?.();
			}
			static isTypeSupported() {
				return true;
			}
		}
		vi.stubGlobal('MediaRecorder', FakeRecorder);
		vi.stubGlobal('navigator', {
			mediaDevices: { getUserMedia: async () => ({ getTracks: () => tracks }) }
		});

		const rec = await startRecording();
		// Simulate the recorder auto-stopping (e.g. mic unplugged) before the user clicks stop.
		inst!.state = 'inactive';
		const result = await rec.stop(); // must settle, not hang
		expect(result.mime).toMatch(/audio/);
		expect(tracks[0].stop).toHaveBeenCalled(); // mic released
	});
});
