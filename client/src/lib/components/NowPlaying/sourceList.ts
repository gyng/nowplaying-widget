// Pure helpers for editing a newline-delimited source list (the now-playing priority / ignore
// lists). Shared by the settings pane's structured rows (reorder / remove / quick-add) AND the raw
// textarea fallback (normalize on blur). Framework-agnostic, unit-tested — no React/Tauri.

/** Split a newline list into trimmed, non-empty entries (preserving order + case). */
export function listEntries(list: string): string[] {
	return list
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);
}

/** Append `value` (trimmed + lowercased) unless an equal entry is already present (case-insensitive). */
export function appendEntry(list: string, value: string): string {
	const id = value.trim().toLowerCase();
	if (!id) return list;
	const entries = listEntries(list);
	if (entries.some((e) => e.toLowerCase() === id)) return list;
	return [...entries, id].join('\n');
}

/** Remove the entry at `index` (no-op when out of range). */
export function removeAt(list: string, index: number): string {
	const entries = listEntries(list);
	if (index < 0 || index >= entries.length) return list;
	entries.splice(index, 1);
	return entries.join('\n');
}

/** Move the entry at `from` to position `to` (both clamped into range). */
export function moveEntry(list: string, from: number, to: number): string {
	const entries = listEntries(list);
	if (from < 0 || from >= entries.length) return list;
	const dest = Math.max(0, Math.min(entries.length - 1, to));
	if (dest === from) return list;
	const [item] = entries.splice(from, 1);
	entries.splice(dest, 0, item);
	return entries.join('\n');
}

/** Canonical form for persistence: trim + lowercase each line, drop blanks + duplicates. */
export function normalizeList(list: string): string {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const line of list.split('\n')) {
		const e = line.trim().toLowerCase();
		if (e && !seen.has(e)) {
			seen.add(e);
			out.push(e);
		}
	}
	return out.join('\n');
}
