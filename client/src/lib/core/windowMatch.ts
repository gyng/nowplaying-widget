// Pure window→zone matching for the on-demand auto-arrange path ("position windows into the space
// if found"). Given a foreign window's descriptor and a set of zone rules, decide which zone (if
// any) the window belongs in. No Win32/Tauri/React — unit-tested directly; the Rust edge supplies
// the WindowDescriptor (windowmgr.rs) and applies the chosen zone's rect via the snapMath placement.
//
// Matching key precedence mirrors OBS's window_rating and FancyZones app-zone-history: the process
// EXE basename is the primary key (case-insensitive exact), with window CLASS and TITLE as glob
// refiners. A rule matches only if every field it specifies matches; among matching rules the most
// specific (then highest priority, then earliest) wins. exe over-matches Chromium/UWP families
// (all share one class/host exe), so a title/class refiner is how you disambiguate those.

import type { Rect } from './layout';

/** A foreign top-level window, as enumerated by the Rust edge. `hwnd` is the raw handle (i64 on the
 * Rust side) used only to act on the window; matching uses exe/className/title. Mirrors the Rust
 * `WindowDescriptor` struct 1:1 (type-mirroring contract, AGENTS.md §5). The handle crosses the
 * bridge as a JS number, which is exact only below 2^53 — fine for real Win64 handle-table values. */
export type WindowDescriptor = {
	hwnd: number;
	exe: string; // full path or basename; matching normalizes to lowercased basename
	className: string;
	title: string;
	rect: Rect;
};

/** A persisted rule binding a window to a zone. At least one of exe/className/title must be set
 * (a fieldless rule matches nothing — no accidental catch-all). class/title are globs; exe is an
 * exact basename match. Higher `priority` wins ties (default 0). */
export type ZoneRule = {
	zoneId: string;
	exe?: string;
	className?: string;
	title?: string;
	priority?: number;
};

export type MatchResult = { zoneId: string; score: number };

/** Lowercased final path segment of an exe path; tolerates both `\` and `/` separators and a bare
 * basename. `'C:\\Program Files\\Spotify\\Spotify.exe'` → `'spotify.exe'`. */
export function exeBasename(path: string): string {
	const cut = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
	return path.slice(cut + 1).toLowerCase();
}

/** Anchored, case-insensitive glob match supporting `*` (any run) and `?` (any one char). Literal
 * regex metacharacters in `pattern` are escaped, so it is safe on arbitrary class/title strings.
 * Adjacent `*` are collapsed first: patterns are user-authored and flow through sack import, and N
 * independent `.*` groups before a failing literal backtrack exponentially (ReDoS) — collapsing the
 * run keeps the worst case linear. */
export function globMatch(pattern: string, value: string): boolean {
	let re = '';
	for (const ch of pattern.replace(/\*+/g, '*')) {
		if (ch === '*') re += '.*';
		else if (ch === '?') re += '.';
		else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
	return new RegExp(`^${re}$`, 'i').test(value);
}

/** True iff every field the rule specifies matches the window. A rule with no fields never matches. */
function ruleMatches(rule: ZoneRule, win: WindowDescriptor): boolean {
	const fields = [rule.exe, rule.className, rule.title].filter((f) => f !== undefined);
	if (fields.length === 0) return false;
	if (rule.exe !== undefined && exeBasename(rule.exe) !== exeBasename(win.exe)) return false;
	if (rule.className !== undefined && !globMatch(rule.className, win.className)) return false;
	if (rule.title !== undefined && !globMatch(rule.title, win.title)) return false;
	return true;
}

/** Specificity score: exe is weighted highest (the primary key), class/title are refiners. */
function specificity(rule: ZoneRule): number {
	return (rule.exe ? 2 : 0) + (rule.className ? 1 : 0) + (rule.title ? 1 : 0);
}

/**
 * The best zone for `win`, or null if no rule matches. Ranking: explicit `priority` first, then
 * specificity (more fields = more specific), then earliest rule index (stable). The returned
 * `score` is the winning specificity (useful for tie diagnostics / UI).
 */
export function matchWindowToZone(
	win: WindowDescriptor,
	rules: readonly ZoneRule[]
): MatchResult | null {
	let best: { rule: ZoneRule; index: number } | null = null;
	for (let i = 0; i < rules.length; i++) {
		const rule = rules[i];
		if (!ruleMatches(rule, win)) continue;
		if (best === null) {
			best = { rule, index: i };
			continue;
		}
		const a = rule;
		const b = best.rule;
		const ap = a.priority ?? 0;
		const bp = b.priority ?? 0;
		if (ap > bp || (ap === bp && specificity(a) > specificity(b))) {
			best = { rule, index: i };
		}
	}
	return best ? { zoneId: best.rule.zoneId, score: specificity(best.rule) } : null;
}
