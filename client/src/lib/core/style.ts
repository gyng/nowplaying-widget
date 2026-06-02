// Theming injection helpers (Phase 7). `scopeCss` wraps a user CSS block so it's scoped
// to one widget via native CSS nesting; `assembleStyles` builds the full stylesheet for a
// monitor in cascade order (global theme → per-def → per-instance). Pure, ZERO Svelte/
// Tauri — the Svelte <StyleLayer> just injects the returned string; a React port reuses
// this verbatim. Co-located vitest tests in style.test.ts.

import {
	type Leaf,
	type LayoutNode,
	type Library,
	type MonitorLayout,
	isContainer,
	isGroup,
	isLeaf
} from './layoutTree';

/**
 * Scope a user CSS block to `selector` via native CSS nesting: `selector { <css> }`. Both
 * bare declarations (`color: red`) and nested selectors (`.value { … }`) work inside the
 * wrapper in a WebView2/Chromium runtime. Returns '' for empty/whitespace css. Pure.
 * (`@keyframes`/`@font-face` can't be nested — those belong in the global theme.)
 */
export function scopeCss(css: string | undefined, selector: string): string {
	const c = (css ?? '').trim();
	if (!c) return '';
	return `${selector} {\n${c}\n}`;
}

/**
 * Assemble a monitor's full stylesheet. Order encodes the cascade:
 *   1. the global theme, verbatim (sets tokens + may target `np-*` hooks)
 *   2. each library def's css, scoped to `[data-def="<id>"]` (styles every instance)
 *   3. each instance's css (`[data-w="<id>"]`) and each group instance's css
 *      (`[data-group="<id>"]`), most-specific last so it wins.
 * Pure — the host carries the matching `data-w`/`data-def`/`data-group` attributes.
 */
export function assembleStyles(opts: {
	themeCss?: string;
	library?: Library;
	monitor: MonitorLayout;
}): string {
	const parts: string[] = [];

	const theme = (opts.themeCss ?? '').trim();
	if (theme) parts.push(theme);

	for (const def of opts.library?.defs ?? []) {
		const s = scopeCss(def.css, `[data-def="${def.id}"]`);
		if (s) parts.push(s);
	}

	const leafCss = (lf: Leaf): void => {
		const sel = isGroup(lf.unit) ? `[data-group="${lf.id}"]` : `[data-w="${lf.id}"]`;
		const s = scopeCss(lf.unit.css, sel);
		if (s) parts.push(s);
	};
	const walk = (node: LayoutNode): void => {
		if (isContainer(node)) {
			node.children.forEach(walk);
			return;
		}
		if (isLeaf(node)) leafCss(node);
	};
	walk(opts.monitor.root);
	opts.monitor.floating.forEach(leafCss);

	return parts.join('\n');
}
