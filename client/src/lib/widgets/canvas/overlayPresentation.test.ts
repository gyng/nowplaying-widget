import { describe, it, expect } from 'vitest';
import { overlayPresentation, isWholeWindowInteractive } from './overlayPresentation';

describe('overlayPresentation', () => {
	it('a passive secondary overlay (below windows) is borderless + click-through', () => {
		const p = overlayPresentation({
			windowed: false,
			layer: 'bottom',
			isMain: false,
			editMode: false
		});
		expect(p).toEqual({
			decorations: false,
			taskbar: false,
			alwaysOnTop: false,
			alwaysOnBottom: true,
			clickThrough: true,
			opaque: false
		});
	});

	it("'top' layer floats above windows; 'wallpaper' is neither top nor bottom", () => {
		expect(
			overlayPresentation({ windowed: false, layer: 'top', isMain: false, editMode: false })
		).toMatchObject({ alwaysOnTop: true, alwaysOnBottom: false });
		expect(
			overlayPresentation({ windowed: false, layer: 'wallpaper', isMain: false, editMode: false })
		).toMatchObject({ alwaysOnTop: false, alwaysOnBottom: false });
	});

	it('the main overlay is ALWAYS interactive, even when passive', () => {
		const p = overlayPresentation({
			windowed: false,
			layer: 'bottom',
			isMain: true,
			editMode: false
		});
		expect(p.clickThrough).toBe(false);
		expect(
			isWholeWindowInteractive({ windowed: false, layer: 'bottom', isMain: true, editMode: false })
		).toBe(true);
	});

	it('edit mode makes any overlay whole-window interactive', () => {
		const p = overlayPresentation({
			windowed: false,
			layer: 'bottom',
			isMain: false,
			editMode: true
		});
		expect(p.clickThrough).toBe(false);
	});

	it('windowed-debug mode overrides everything: decorated, interactive, taskbar, opaque, not topmost', () => {
		// even with a 'top' layer + passive secondary, windowed wins
		const p = overlayPresentation({
			windowed: true,
			layer: 'top',
			isMain: false,
			editMode: false
		});
		expect(p).toEqual({
			decorations: true,
			taskbar: true,
			alwaysOnTop: false,
			alwaysOnBottom: false,
			clickThrough: false,
			opaque: true
		});
	});

	it('isWholeWindowInteractive is the complement of clickThrough', () => {
		const passiveSecondary = {
			windowed: false,
			layer: 'bottom' as const,
			isMain: false,
			editMode: false
		};
		expect(isWholeWindowInteractive(passiveSecondary)).toBe(false);
	});
});
