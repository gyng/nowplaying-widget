// The common theme tokens surfaced as friendly fields (the rest are still set via raw theme CSS).
// Shared by the Inspector's "Theme tokens" group and the studio's Themes section — one set, two
// access points. Kept OUT of Inspector.tsx so that component file exports only its component: a mixed
// component + constant export makes React Fast Refresh bail ("TOKEN_FIELDS export is incompatible")
// and full-reload on every edit.
//
// `kind` drives the field's affordance: 'color' fields get a live validity check (a typo no longer
// silently falls back) so the user sees the value was rejected; 'font'/'text' are plain inputs.
export type TokenFieldKind = 'color' | 'font' | 'text';
export type TokenField = { key: string; label: string; ph: string; kind: TokenFieldKind };

export const TOKEN_FIELDS: TokenField[] = [
	{ key: '--np-accent', label: 'accent', ph: 'rgb(119, 196, 211)', kind: 'color' },
	{ key: '--np-fg', label: 'text', ph: '#ffffff', kind: 'color' },
	{ key: '--np-muted', label: 'muted', ph: 'rgba(255, 255, 255, 0.6)', kind: 'color' },
	{ key: '--np-label', label: 'label', ph: 'rgb(218, 237, 226)', kind: 'color' },
	{ key: '--np-track', label: 'track', ph: 'rgba(255, 255, 255, 0.15)', kind: 'color' },
	{ key: '--np-bg', label: 'background', ph: 'rgba(10, 10, 12, 0.6)', kind: 'color' },
	{ key: '--np-danger', label: 'danger', ph: '#e5484d', kind: 'color' },
	{ key: '--np-warn', label: 'warn', ph: '#e2a03f', kind: 'color' },
	{ key: '--np-success', label: 'success', ph: '#3fb950', kind: 'color' },
	{ key: '--np-font-display', label: 'font', ph: "'Bahnschrift', …", kind: 'font' },
	{ key: '--np-radius', label: 'radius', ph: '2px', kind: 'text' },
	{ key: '--np-gap', label: 'gap', ph: '4px', kind: 'text' }
];

/**
 * Whether a token value is a CSS-valid colour (used to flag a typo in a 'color' field). Lenient when
 * `CSS.supports` is unavailable (e.g. happy-dom in unit tests) so it never false-flags. Pure-ish.
 */
export function isValidColor(value: string): boolean {
	const v = value.trim();
	if (!v) return true; // empty = "no override", not an error
	if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return true;
	return CSS.supports('color', v);
}
