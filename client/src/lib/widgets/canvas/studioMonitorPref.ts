// The studio's last-chosen monitor key, persisted to localStorage so the choice is STICKY across
// reloads. The studio window has no `?monitor=` param to pin it (overlays do), so without this it
// always reopened on the primary ('default'). Studio-only — overlay windows resolve their monitor
// from the URL param and never read this. Pure read/write, unit-tested.

const KEY = 'widgetsack.studio.monitor';

/** The saved studio monitor key, or null if none was saved (or storage is unavailable). */
export function readStudioMonitor(): string | null {
	try {
		return localStorage.getItem(KEY);
	} catch {
		return null;
	}
}

export function writeStudioMonitor(key: string): void {
	try {
		localStorage.setItem(KEY, key);
	} catch {
		/* ignore quota / unavailable */
	}
}
