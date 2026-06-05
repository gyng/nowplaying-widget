// Text-to-speech via the webview's Web Speech API (speechSynthesis) — zero-dep, works in WebView2 on
// Windows. Outer-ring adapter (touches `window`); gracefully no-ops where unavailable (plain-browser
// unit tests, older webviews), so callers can speak unconditionally.

export type SpeakOptions = { rate?: number; pitch?: number; volume?: number; voice?: string };

/** Whether the runtime can speak (the webview exposes speechSynthesis + the utterance constructor). */
export function ttsAvailable(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof window.speechSynthesis !== 'undefined' &&
		typeof window.SpeechSynthesisUtterance !== 'undefined'
	);
}

function clamp(n: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, n));
}

/** Speak `text` aloud, cancelling anything already in progress. No-op when unavailable or blank. */
export function speak(text: string, opts: SpeakOptions = {}): void {
	if (!ttsAvailable()) return;
	const t = text.trim();
	if (!t) return;
	const synth = window.speechSynthesis;
	synth.cancel(); // never let utterances queue up — the newest briefing/reply wins
	const u = new SpeechSynthesisUtterance(t);
	u.rate = clamp(opts.rate ?? 1, 0.5, 2);
	u.pitch = clamp(opts.pitch ?? 1, 0, 2);
	u.volume = clamp(opts.volume ?? 1, 0, 1);
	if (opts.voice) {
		const v = synth.getVoices().find((vv) => vv.name === opts.voice);
		if (v) u.voice = v;
	}
	synth.speak(u);
}

/** Stop any in-progress speech. */
export function cancelSpeech(): void {
	if (ttsAvailable()) window.speechSynthesis.cancel();
}

/** The available voice names (empty when unavailable; the webview may populate them asynchronously). */
export function listVoices(): string[] {
	if (!ttsAvailable()) return [];
	return window.speechSynthesis.getVoices().map((v) => v.name);
}
