// Pure completion DATA for the studio CSS editors: the theme-token vocabulary (so `var(--np-…)`
// autocompletes to the app's own custom properties with their default value as the hint) and the
// common structural hooks meters expose. The CodeMirror `Completion` objects are built from this in
// the widgets layer (cssEditorExt.ts); keeping the data here makes it framework-free and testable.
// Co-located vitest tests in cssComplete.test.ts.

import { DEFAULT_TOKENS } from './tokens';

export type TokenCompletion = { label: string; detail: string };

/** The `--np-*` theme custom properties as completions, each with its default value as the detail. */
export function tokenCompletions(): TokenCompletion[] {
	return Object.entries(DEFAULT_TOKENS).map(([label, detail]) => ({ label, detail }));
}

// Structural hooks the built-in meters render (`data-part="…"`) — offered when authoring a
// `[data-part="…"]` selector inside a widget's css. A generic union across meters; not exhaustive.
export const CSS_PART_HINTS: string[] = [
	'root',
	'label',
	'value',
	'state',
	'toggle',
	'title',
	'artist',
	'time',
	'unit',
	'icon'
];
