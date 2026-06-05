// Pure symbol-list parsing for the stocks settings input, kept out of the component file so the panel
// only exports its component (React Fast Refresh requires component-only exports) and so the parsing
// is unit-testable on its own (AGENTS.md §4).

/** Split a symbols box (newline- or comma-separated) into trimmed, upper-cased, de-duped tickers. */
export function parseSymbols(text: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of text.split(/[\n,]/)) {
		const s = raw.trim().toUpperCase();
		if (s && !seen.has(s)) {
			seen.add(s);
			out.push(s);
		}
	}
	return out;
}
