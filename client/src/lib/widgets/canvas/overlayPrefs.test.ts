import { describe, it, expect, beforeEach } from 'vitest';
import { OVERLAY_PREF_DEFAULTS, readOverlayPrefs, writeOverlayPrefs } from './overlayPrefs';

describe('overlayPrefs', () => {
	beforeEach(() => localStorage.clear());

	it('defaults to respecting the work area and a below-windows (bottom) layer', () => {
		expect(readOverlayPrefs()).toEqual({ respectWorkArea: true, overlayLayer: 'bottom' });
		expect(OVERLAY_PREF_DEFAULTS).toEqual({ respectWorkArea: true, overlayLayer: 'bottom' });
	});

	it('round-trips written values', () => {
		writeOverlayPrefs({ respectWorkArea: false, overlayLayer: 'wallpaper' });
		expect(readOverlayPrefs()).toEqual({ respectWorkArea: false, overlayLayer: 'wallpaper' });
	});

	it('falls back to defaults on malformed storage', () => {
		localStorage.setItem('widgetsack.overlay.prefs', '{not json');
		expect(readOverlayPrefs()).toEqual({ respectWorkArea: true, overlayLayer: 'bottom' });
	});

	it('merges defaults for missing keys (old prefs without overlayLayer → bottom)', () => {
		localStorage.setItem('widgetsack.overlay.prefs', JSON.stringify({ respectWorkArea: false }));
		expect(readOverlayPrefs()).toEqual({ respectWorkArea: false, overlayLayer: 'bottom' });
	});
});
