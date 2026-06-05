// Speech-to-text capture in the webview: record the microphone via getUserMedia/MediaRecorder, then
// hand the bytes to the Rust `llm_transcribe` command (which uploads to the provider's Whisper-style
// endpoint, key server-side). Outer-ring adapter; degrades gracefully where mic capture is unavailable
// (plain-browser unit tests, denied permission), so callers can feature-detect with `sttAvailable()`.

export function sttAvailable(): boolean {
	return (
		typeof navigator !== 'undefined' &&
		!!navigator.mediaDevices &&
		typeof navigator.mediaDevices.getUserMedia === 'function' &&
		typeof MediaRecorder !== 'undefined'
	);
}

export type Recording = { bytes: Uint8Array; mime: string };
export type Recorder = { stop: () => Promise<Recording>; cancel: () => void };

/** The available microphones (audio inputs). Labels need a prior mic-permission grant; until then they
 * fall back to a short id. Empty when unavailable. */
export async function listMicrophones(): Promise<{ id: string; name: string }[]> {
	if (!sttAvailable() || typeof navigator.mediaDevices.enumerateDevices !== 'function') return [];
	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices
			.filter((d) => d.kind === 'audioinput')
			.map((d) => ({ id: d.deviceId, name: d.label || `Microphone ${d.deviceId.slice(0, 6)}` }));
	} catch {
		return [];
	}
}

const MIME_CANDIDATES = [
	'audio/webm;codecs=opus',
	'audio/webm',
	'audio/ogg;codecs=opus',
	'audio/mp4'
];

/** The first MediaRecorder mime type the runtime supports (empty = let the browser default). */
export function pickMime(): string {
	if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
		return '';
	}
	return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

/** Start recording from a microphone (the given `deviceId`, else the system default). Resolves to a
 * controller: call `stop()` to finish and get the captured bytes, or `cancel()` to discard. Rejects if
 * mic access is unavailable/denied. */
export async function startRecording(deviceId?: string): Promise<Recorder> {
	if (!sttAvailable()) throw new Error('microphone capture is not available here');
	const audio: MediaTrackConstraints | boolean = deviceId
		? { deviceId: { exact: deviceId } }
		: true;
	const stream = await navigator.mediaDevices.getUserMedia({ audio });
	const mime = pickMime();
	const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
	const chunks: BlobPart[] = [];
	rec.ondataavailable = (e) => {
		if (e.data.size) chunks.push(e.data);
	};
	rec.start();

	const cleanup = (): void => stream.getTracks().forEach((t) => t.stop());

	return {
		stop: () =>
			new Promise<Recording>((resolve, reject) => {
				const finish = (): void => {
					cleanup();
					const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
					blob
						.arrayBuffer()
						.then((buf) => resolve({ bytes: new Uint8Array(buf), mime: blob.type || 'audio/webm' }))
						.catch(reject);
				};
				rec.onstop = finish;
				rec.onerror = () => {
					cleanup();
					reject(new Error('recording failed'));
				};
				// If the recorder already stopped on its own (mic unplugged, an error, a prior stop), the
				// onstop handler won't fire — settle now from whatever was captured so the caller never hangs.
				if (rec.state !== 'inactive') rec.stop();
				else finish();
			}),
		cancel: () => {
			try {
				if (rec.state !== 'inactive') rec.stop();
			} catch {
				// already stopped
			}
			cleanup();
		}
	};
}
