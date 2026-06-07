// Pure policy (AGENTS.md §5): given an overlay window's role + the current mode, decide every
// presentation flag in ONE place — OS decorations, taskbar/alt-tab presence, z-order, whole-window
// click-through, and whether the page should paint an opaque background. No Tauri/DOM/React; the
// lib/overlay.ts adapter applies the result to the real window. Tested directly.
import type { OverlayLayer } from './overlayPrefs';

export type OverlayPresentation = {
	/** OS window chrome (title bar + border). Off for a normal overlay; on for windowed-debug. */
	decorations: boolean;
	/** Visible in the taskbar / alt-tab. Off for a normal overlay; on for windowed-debug. */
	taskbar: boolean;
	/** Float above every other window. */
	alwaysOnTop: boolean;
	/** Sit below application windows (above the desktop icons). */
	alwaysOnBottom: boolean;
	/** Whole-window click-through (ignore cursor events) — clicks pass through to whatever's behind. */
	clickThrough: boolean;
	/** Paint an opaque app background (windowed-debug) instead of the see-through overlay surface. */
	opaque: boolean;
};

export type PresentationInput = {
	/** Windowed-debug mode: render the overlay as an ordinary decorated, interactive, alt-tab-able
	 *  window so a crash (or anything else) is visible, clickable, and inspectable. */
	windowed: boolean;
	/** The chosen z-order when NOT windowed. */
	layer: OverlayLayer;
	/** The primary `main` overlay. It is ALWAYS interactive (never click-through) so its webview can
	 *  never get stuck behind a click-through surface — e.g. an un-clickable crash page. */
	isMain: boolean;
	/** Editing the layout: the whole window is interactive so widgets can be selected/dragged. */
	editMode: boolean;
};

/**
 * The single source of truth for how an overlay window should present itself.
 *
 * - Windowed-debug wins over everything: a normal decorated, interactive, taskbar-present, non-topmost
 *   window with an opaque background.
 * - Otherwise it's a borderless, taskbar-skipping overlay whose z-order follows `layer`, and it is
 *   click-through ONLY when passive — edit mode and the `main` window are always interactive. (A passive
 *   secondary overlay is whole-window click-through; the Rust cursor watcher re-enables it over widget
 *   rects, so per-widget interactivity still works.)
 */
export function overlayPresentation(i: PresentationInput): OverlayPresentation {
	if (i.windowed) {
		return {
			decorations: true,
			taskbar: true,
			alwaysOnTop: false,
			alwaysOnBottom: false,
			clickThrough: false,
			opaque: true
		};
	}
	const wholeWindowInteractive = i.editMode || i.isMain;
	return {
		decorations: false,
		taskbar: false,
		alwaysOnTop: i.layer === 'top',
		alwaysOnBottom: i.layer === 'bottom',
		clickThrough: !wholeWindowInteractive,
		opaque: false
	};
}

/** Whether THIS window's whole surface is interactive (so the per-widget click-through rects are
 *  unnecessary and should be cleared). The complement of `clickThrough`. Pure. */
export function isWholeWindowInteractive(i: PresentationInput): boolean {
	return !overlayPresentation(i).clickThrough;
}
