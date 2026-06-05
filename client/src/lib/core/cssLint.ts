// Pure, DOM-free CSS lint primitives for the studio's CSS editors (widget / def / group / theme).
// The richer parse-based + CSS.supports checks live in the widgets layer (cssEditorLint.ts, which
// needs the CodeMirror CSS parser); this module holds the framework-agnostic part that matters most
// for hand-written CSS fragments — bracket balance — so it can be unit-tested without a DOM or a
// parser. Co-located vitest tests in cssLint.test.ts.

export type CssDiag = {
	from: number;
	to: number;
	severity: 'error' | 'warning';
	message: string;
};

const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/**
 * Report unbalanced `()`, `[]`, `{}` in a CSS fragment, ignoring brackets inside strings and
 * `/* … *\/` comments. Each diagnostic points at the offending bracket. Pure — positions are
 * character offsets into `src`. This is the #1 real error in hand-edited CSS, and detecting it
 * cleanly lets the parse-based linter skip the noisy error cascade an unbalanced doc produces.
 */
export function balanceDiagnostics(src: string): CssDiag[] {
	const diags: CssDiag[] = [];
	const stack: { ch: string; pos: number }[] = [];
	const n = src.length;
	let quote: string | null = null;
	let i = 0;
	while (i < n) {
		const c = src[i];
		if (quote) {
			if (c === '\\') {
				i += 2;
				continue;
			}
			if (c === quote) quote = null;
			i++;
			continue;
		}
		if (c === '/' && src[i + 1] === '*') {
			const end = src.indexOf('*/', i + 2);
			i = end === -1 ? n : end + 2;
			continue;
		}
		if (c === '"' || c === "'") {
			quote = c;
			i++;
			continue;
		}
		if (c === '(' || c === '[' || c === '{') {
			stack.push({ ch: c, pos: i });
			i++;
			continue;
		}
		if (c === ')' || c === ']' || c === '}') {
			const top = stack[stack.length - 1];
			if (top && top.ch === CLOSERS[c]) {
				stack.pop();
			} else {
				// Peek (don't pop) on a mismatch so one stray closer doesn't cascade into the next.
				diags.push({ from: i, to: i + 1, severity: 'error', message: `Unexpected "${c}"` });
			}
			i++;
			continue;
		}
		i++;
	}
	for (const open of stack) {
		diags.push({
			from: open.pos,
			to: open.pos + 1,
			severity: 'error',
			message: `Unclosed "${open.ch}"`
		});
	}
	return diags;
}
