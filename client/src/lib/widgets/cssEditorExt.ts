// CodeMirror 6 extension bundle for the studio CSS editors: dark highlight theme matching the
// inspector, the CSS language (which brings property/value autocomplete), our `--np-*` theme-token
// + `data-part` completion sources, bracket matching/closing, and the fragment linter
// (cssEditorLint). Kept apart from the React wrapper so the wiring is one focused module.
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
	bracketMatching,
	HighlightStyle,
	indentOnInput,
	syntaxHighlighting
} from '@codemirror/language';
import {
	autocompletion,
	closeBrackets,
	closeBracketsKeymap,
	completionKeymap,
	type Completion,
	type CompletionContext,
	type CompletionResult
} from '@codemirror/autocomplete';
import { linter, lintKeymap } from '@codemirror/lint';
import { css, cssLanguage } from '@codemirror/lang-css';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';
import { CSS_PART_HINTS, tokenCompletions } from '../core/cssComplete';
import { cssDiagnostics } from './cssEditorLint';

// Dark syntax theme tuned to the inspector palette (accent rgb(119,196,211), label green).
const highlightStyle = HighlightStyle.define([
	{ tag: t.comment, color: '#6a737d', fontStyle: 'italic' },
	{ tag: t.propertyName, color: 'rgb(150, 214, 228)' },
	{ tag: [t.variableName, t.atom], color: 'rgb(218, 237, 226)' },
	{ tag: [t.className, t.tagName], color: 'rgb(119, 196, 211)' },
	{ tag: t.keyword, color: 'rgb(199, 146, 234)' },
	{ tag: t.string, color: 'rgb(186, 222, 160)' },
	{ tag: [t.number, t.unit], color: 'rgb(224, 180, 120)' },
	{ tag: t.color, color: 'rgb(224, 180, 120)' },
	{ tag: t.operator, color: '#aaa' }
]);

const editorTheme = EditorView.theme(
	{
		'&': {
			color: '#eee',
			backgroundColor: '#1a1a1e',
			border: '1px solid #333',
			borderRadius: '3px',
			fontSize: '11px'
		},
		'&.cm-focused': { outline: 'none', borderColor: 'rgba(119, 196, 211, 0.75)' },
		'.cm-content': { fontFamily: 'monospace', caretColor: 'rgb(119, 196, 211)' },
		'.cm-scroller': { fontFamily: 'monospace', lineHeight: '1.4' },
		'.cm-gutters': { display: 'none' },
		'.cm-placeholder': { color: '#666' },
		'.cm-tooltip': { background: '#0d0d10', border: '1px solid #333', color: '#eee' },
		'.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'monospace', fontSize: '11px' },
		'.cm-tooltip-autocomplete ul li[aria-selected]': {
			background: 'rgba(119, 196, 211, 0.25)',
			color: '#fff'
		},
		'.cm-completionDetail': { color: '#888', fontStyle: 'normal', marginLeft: '1em' },
		'.cm-diagnostic-error': { borderLeftColor: 'rgb(220, 120, 120)' },
		'.cm-diagnostic-warning': { borderLeftColor: 'rgb(224, 180, 120)' }
	},
	{ dark: true }
);

// `--np-*` theme tokens, offered when typing a custom property (e.g. inside `var(--np-…)`).
// Exported for testing — registered as a CSS language autocomplete source in cssExtensions.
export function tokenCompletionSource(context: CompletionContext): CompletionResult | null {
	const m = context.matchBefore(/--[\w-]*/);
	if (!m && !context.explicit) return null;
	const options: Completion[] = tokenCompletions().map((tok) => ({
		label: tok.label,
		type: 'variable',
		detail: tok.detail
	}));
	return { from: m ? m.from : context.pos, options, validFor: /^[-\w]*$/ };
}

// Structural hooks, offered while authoring a `[data-part="…"]` selector. Exported for testing.
export function partCompletionSource(context: CompletionContext): CompletionResult | null {
	const m = context.matchBefore(/\[data-part="[\w-]*/);
	if (!m) return null;
	const options: Completion[] = CSS_PART_HINTS.map((p) => ({
		label: p,
		type: 'constant',
		apply: `${p}"]`
	}));
	return { from: m.from + '[data-part="'.length, options, validFor: /^[\w-]*$/ };
}

const cssLinter = linter((view) =>
	cssDiagnostics(view.state.doc.toString()).map((d) => ({
		from: d.from,
		to: d.to,
		severity: d.severity,
		message: d.message
	}))
);

/** The full extension list for a CSS editor instance (one `placeholder` per field). */
export function cssExtensions(placeholder = ''): Extension[] {
	return [
		history(),
		bracketMatching(),
		closeBrackets(),
		indentOnInput(),
		css(),
		cssLanguage.data.of({ autocomplete: tokenCompletionSource }),
		cssLanguage.data.of({ autocomplete: partCompletionSource }),
		autocompletion(),
		syntaxHighlighting(highlightStyle),
		cssLinter,
		editorTheme,
		cmPlaceholder(placeholder),
		EditorView.lineWrapping,
		keymap.of([
			...closeBracketsKeymap,
			...defaultKeymap,
			...historyKeymap,
			...completionKeymap,
			...lintKeymap,
			indentWithTab
		])
	];
}
