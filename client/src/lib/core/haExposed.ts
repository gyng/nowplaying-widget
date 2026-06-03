// Pure logic for the Home Assistant "exposed" allowlist — the set of `ha.<entity_id>` sensor ids
// the user has opted into surfacing in widgets' sensor dropdown. Framework-agnostic domain
// (AGENTS.md §5): no React/Tauri/localStorage — just data in, data out — so it is unit-tested
// directly; the localStorage persistence + the studio panel live in adapters around it.
//
// Curation rule (opt-in): an EMPTY allowlist means "no curation yet" → show everything, so the
// dropdown is never mysteriously empty before the user has exposed anything. Once at least one id
// is exposed, the catalog narrows to the exposed set.

/** De-dupe + sort + drop empties (the canonical stored form). */
export function normalizeExposed(ids: string[]): string[] {
	return Array.from(new Set(ids.map((s) => s.trim()).filter(Boolean))).sort();
}

export function isExposed(exposed: string[], id: string): boolean {
	return exposed.includes(id);
}

/** Add `id` if absent, remove it if present — returns a new normalized list. */
export function toggleExposed(exposed: string[], id: string): string[] {
	const has = exposed.includes(id);
	return normalizeExposed(has ? exposed.filter((x) => x !== id) : [...exposed, id]);
}

/** Curate a list of items by the allowlist via each item's id. Empty allowlist = passthrough. */
export function curate<T>(items: T[], idOf: (item: T) => string, exposed: string[]): T[] {
	if (exposed.length === 0) return items;
	const set = new Set(exposed);
	return items.filter((it) => set.has(idOf(it)));
}
