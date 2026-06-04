import { describe, it, expect, beforeEach } from 'vitest';
import { OVERLAY_PREF_DEFAULTS, readOverlayPrefs, writeOverlayPrefs } from './overlayPrefs';

describe('overlayPrefs', () => {
	beforeEach(() => localStorage.clear());

	it('defaults to respecting the work area (taskbar-aware)', () => {
		expect(readOverlayPrefs()).toEqual({ respectWorkArea: true });
		expect(OVERLAY_PREF_DEFAULTS.respectWorkArea).toBe(true);
	});

	it('round-trips a written value', () => {
		writeOverlayPrefs({ respectWorkArea: false });
		expect(readOverlayPrefs().respectWorkArea).toBe(false);
	});

	it('falls back to defaults on malformed storage', () => {
		localStorage.setItem('widgetsack.overlay.prefs', '{not json');
		expect(readOverlayPrefs()).toEqual({ respectWorkArea: true });
	});

	it('merges defaults for missing keys', () => {
		localStorage.setItem('widgetsack.overlay.prefs', '{}');
		expect(readOverlayPrefs().respectWorkArea).toBe(true);
	});
});
