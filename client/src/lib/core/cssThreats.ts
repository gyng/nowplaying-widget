// cssThreats.ts — a pure scanner for UNTRUSTED theme CSS (e.g. a theme packed into a shared sack).
// Theme CSS is injected verbatim into the studio/overlay (StyleLayer), so a hostile theme can reach
// outside the app: a remote `url(...)` or `@import` silently phones home (a tracking pixel / web
// font that leaks your IP + "app is open" the moment the layout renders), and a full-viewport
// `position: fixed` block can overlay the whole screen (UI redress). The CSP blocks script and most
// connect-src, but stylesheet-driven remote fetches (img/font/background) still go out — so we warn
// the user before importing a stranger's theme. Pure (no I/O), unit-tested in cssThreats.test.ts.

export type ThreatKind = 'remote-url' | 'import' | 'overlay';

export type CssThreat = {
	kind: ThreatKind;
	/** A human-readable, already-truncated description for a confirm() dialog. */
	detail: string;
};

// A `url(...)` whose target is remote: an absolute http(s) URL or a protocol-relative `//host`.
// Local references — convertFileSrc/asset:, data:, blob:, and relative paths — are NOT flagged.
const REMOTE_URL = /url\(\s*(['"]?)\s*(https?:\/\/|\/\/)[^)'"]+/gi;
const IMPORT = /@import\b[^;]*/gi;
const OVERLAY = /position\s*:\s*(?:fixed|sticky)/gi;

/** First ~80 chars of a match, whitespace-collapsed, for a readable dialog line. */
function snippet(s: string): string {
	const one = s.replace(/\s+/g, ' ').trim();
	return one.length > 80 ? `${one.slice(0, 77)}…` : one;
}

/**
 * Scan a CSS string for constructs that reach outside the local app or hijack the viewport.
 * Returns one threat per distinct site (de-duplicated by detail), empty when the CSS is benign.
 */
export function scanCssThreats(css: string | undefined): CssThreat[] {
	const text = css ?? '';
	const seen = new Set<string>();
	const out: CssThreat[] = [];
	const add = (kind: ThreatKind, detail: string) => {
		const key = `${kind}:${detail}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push({ kind, detail });
	};

	let m: RegExpExecArray | null;
	while ((m = REMOTE_URL.exec(text)) !== null) add('remote-url', snippet(m[0]));
	while ((m = IMPORT.exec(text)) !== null) add('import', snippet(m[0]));
	while ((m = OVERLAY.exec(text)) !== null) add('overlay', snippet(m[0]));
	return out;
}

/** A one-line summary for a confirm() prompt, or '' when there's nothing to warn about. */
export function threatSummary(threats: CssThreat[]): string {
	if (!threats.length) return '';
	const remote = threats.filter((t) => t.kind === 'remote-url' || t.kind === 'import').length;
	const overlay = threats.filter((t) => t.kind === 'overlay').length;
	const bits: string[] = [];
	if (remote) bits.push(`${remote} remote resource${remote === 1 ? '' : 's'} (could phone home)`);
	if (overlay) bits.push(`${overlay} full-screen overlay rule${overlay === 1 ? '' : 's'}`);
	return bits.join(' and ');
}
