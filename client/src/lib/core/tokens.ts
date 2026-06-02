// Framework-agnostic design tokens for widget theming (Phase 7). Meters read these CSS
// custom properties with fallbacks (= today's look), so setting a token restyles every
// meter without touching component code — and a theme is just a CSS file that sets them
// (and/or targets the stable `np-*` hooks). Pure data + a tiny CSS emitter; a React port
// reuses this verbatim. Co-located vitest tests in tokens.test.ts.

export type Tokens = Record<string, string>;

/** The token vocabulary + default values (the Bahnschrift / teal-green look). A per-instance
 * `color`/`track` override beats the token; the token beats this literal fallback. */
export const DEFAULT_TOKENS: Tokens = {
	'--np-accent': 'rgb(119, 196, 211)', // primary fill / line / accent
	'--np-fg': '#ffffff', // main text / numerals
	'--np-muted': 'rgba(255, 255, 255, 0.6)', // secondary text (units)
	'--np-label': 'rgb(218, 237, 226)', // labels
	'--np-track': 'rgba(255, 255, 255, 0.15)', // gauge / bar track
	'--np-bg': 'rgba(10, 10, 12, 0.6)', // widget chrome background (e.g. button)
	'--np-font': "'Bahnschrift', 'Arial Narrow', sans-serif",
	'--np-font-display': "'Bahnschrift', 'Arial Narrow', sans-serif",
	'--np-radius': '2px',
	'--np-gap': '4px'
};

// CSS generic family keywords (+ global values): a font-family value leading with one of these has
// no installed file to load, so the font loader skips it.
const GENERIC_FAMILIES = new Set([
	'sans-serif',
	'serif',
	'monospace',
	'cursive',
	'fantasy',
	'system-ui',
	'ui-sans-serif',
	'ui-serif',
	'ui-monospace',
	'ui-rounded',
	'math',
	'emoji',
	'fangsong',
	'inherit',
	'initial',
	'revert',
	'revert-layer',
	'unset'
]);

/** The first concrete font family in a CSS `font-family` value (quotes stripped), or null when the
 * value leads with a generic keyword. Lets the font loader pick which installed family to
 * @font-face so a configured font renders even when the webview won't enumerate it (per-user). */
export function firstFontFamily(value: string): string | null {
	const first = value
		.split(',')[0]
		.trim()
		.replace(/^['"]|['"]$/g, '')
		.trim();
	if (!first || GENERIC_FAMILIES.has(first.toLowerCase())) return null;
	return first;
}

export const TOKEN_NAMES: string[] = Object.keys(DEFAULT_TOKENS);

/** Emit a `selector { --k: v; … }` rule for `tokens` (default selector `:root`). Pure. */
export function tokensToCss(tokens: Tokens, selector = ':root'): string {
	const body = Object.entries(tokens)
		.map(([k, v]) => `\t${k}: ${v};`)
		.join('\n');
	return `${selector} {\n${body}\n}`;
}
