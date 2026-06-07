import { describe, it, expect, beforeEach } from 'vitest';
import { OVERLAY_PREF_DEFAULTS, readOverlayPrefs, writeOverlayPrefs } from './overlayPrefs';

describe('overlayPrefs', () => {
	beforeEach(() => localStorage.clear());

	it('defaults to respecting the work area, a below-windows (bottom) layer, and no debug windowed mode', () => {
		expect(readOverlayPrefs()).toEqual({
			respectWorkArea: true,
			overlayLayer: 'bottom',
			debugWindowed: false
		});
		expect(OVERLAY_PREF_DEFAULTS).toEqual({
			respectWorkArea: true,
			overlayLayer: 'bottom',
			debugWindowed: false
		});
	});

	it('round-trips written values', () => {
		writeOverlayPrefs({ respectWorkArea: false, overlayLayer: 'wallpaper', debugWindowed: true });
		expect(readOverlayPrefs()).toEqual({
			respectWorkArea: false,
			overlayLayer: 'wallpaper',
			debugWindowed: true
		});
	});

	it('falls back to defaults on malformed storage', () => {
		localStorage.setItem('widgetsack.overlay.prefs', '{not json');
		expect(readOverlayPrefs()).toEqual({
			respectWorkArea: true,
			overlayLayer: 'bottom',
			debugWindowed: false
		});
	});

	it('merges defaults for missing keys (old prefs without overlayLayer/debugWindowed)', () => {
		localStorage.setItem('widgetsack.overlay.prefs', JSON.stringify({ respectWorkArea: false }));
		expect(readOverlayPrefs()).toEqual({
			respectWorkArea: false,
			overlayLayer: 'bottom',
			debugWindowed: false
		});
	});
});
