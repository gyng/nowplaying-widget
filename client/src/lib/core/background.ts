// background.ts — pure helpers for the per-monitor wallpaper layer (core/layoutTree.ts BackgroundSpec).
// Parse/validate an untrusted spec (load + editor) and map a fit to CSS. NO React / Tauri / DOM, so
// it's unit-tested directly (background.test.ts) and reused by both the loader (migration.ts) and the
// presentational <BackgroundLayer>.

import type { BackgroundFit, BackgroundKind, BackgroundSpec } from './layoutTree';

export const BACKGROUND_KINDS: BackgroundKind[] = ['color', 'image', 'video', 'web'];
export const BACKGROUND_FITS: BackgroundFit[] = ['cover', 'contain', 'fill', 'center', 'tile'];

/** A file-backed kind (image/video) — the only kinds whose `src` is a wallpapers/ filename that
 * needs resolving to an asset URL; 'color'/'web' use `src` verbatim. */
export function isMediaKind(kind: BackgroundKind): boolean {
	return kind === 'image' || kind === 'video';
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Validate a raw (parsed-JSON / editor) value into a clean BackgroundSpec, or undefined when it
 * isn't a usable background (no object, unknown kind, or an effectively-empty media/web source).
 * Drops unknown fields and clamps the numeric ranges, so a hand-edited or imported layout can't
 * inject a malformed background. Pure.
 */
export function parseBackgroundSpec(raw: unknown): BackgroundSpec | undefined {
	if (typeof raw !== 'object' || raw === null) return undefined;
	const o = raw as Record<string, unknown>;
	const kind = o.kind;
	if (typeof kind !== 'string' || !BACKGROUND_KINDS.includes(kind as BackgroundKind)) {
		return undefined;
	}
	const src = typeof o.src === 'string' ? o.src.trim() : '';
	// A non-color background with no source is "nothing" — treat as cleared.
	if (kind !== 'color' && !src) return undefined;
	// A color background needs a colour; empty → cleared.
	if (kind === 'color' && !src) return undefined;

	const spec: BackgroundSpec = { kind: kind as BackgroundKind, src };
	if (typeof o.fit === 'string' && BACKGROUND_FITS.includes(o.fit as BackgroundFit)) {
		spec.fit = o.fit as BackgroundFit;
	}
	if (typeof o.opacity === 'number' && Number.isFinite(o.opacity))
		spec.opacity = clamp01(o.opacity);
	if (typeof o.dim === 'number' && Number.isFinite(o.dim)) spec.dim = clamp01(o.dim);
	if (typeof o.mute === 'boolean') spec.mute = o.mute;
	if (typeof o.loop === 'boolean') spec.loop = o.loop;
	return spec;
}

/** CSS `object-fit` for a `<video>` (and `<img>`) element. 'center' shows native size (no scaling);
 * 'tile' has no object-fit equivalent, so a video falls back to 'cover'. */
export function fitObjectFit(fit: BackgroundFit | undefined): string {
	switch (fit) {
		case 'contain':
			return 'contain';
		case 'fill':
			return 'fill';
		case 'center':
			return 'none';
		case 'tile': // not expressible for <video>; closest is cover
		case 'cover':
		default:
			return 'cover';
	}
}

/** background-size / -repeat / -position for an image rendered as a `background-image` div — this
 * form (vs <img object-fit>) is what lets 'tile' and 'center' work. */
export function fitBackgroundProps(fit: BackgroundFit | undefined): {
	backgroundSize: string;
	backgroundRepeat: string;
	backgroundPosition: string;
} {
	switch (fit) {
		case 'contain':
			return {
				backgroundSize: 'contain',
				backgroundRepeat: 'no-repeat',
				backgroundPosition: 'center'
			};
		case 'fill':
			return {
				backgroundSize: '100% 100%',
				backgroundRepeat: 'no-repeat',
				backgroundPosition: 'center'
			};
		case 'center':
			return {
				backgroundSize: 'auto',
				backgroundRepeat: 'no-repeat',
				backgroundPosition: 'center'
			};
		case 'tile':
			return { backgroundSize: 'auto', backgroundRepeat: 'repeat', backgroundPosition: 'top left' };
		case 'cover':
		default:
			return {
				backgroundSize: 'cover',
				backgroundRepeat: 'no-repeat',
				backgroundPosition: 'center'
			};
	}
}
