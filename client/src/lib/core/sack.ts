// A "sack": a portable bundle of studio content (widget library + active theme + token overrides)
// that a user can export and re-import to share a set. Pure — no Tauri/DOM (the overlay.ts adapters
// do the file I/O via the Rust read_sack/write_sack commands; the Canvas wires export/import).
// Co-located vitest tests in sack.test.ts.
import { isContainer, isGroup, type Library, type LayoutNode, type WidgetDef } from './layoutTree';

/** The on-disk sack format. Versioned + tagged so a future reader can detect and migrate it. */
export type Sack = {
	kind: 'widgetsack/sack';
	version: 1;
	name?: string;
	library?: Library; // shareable widget defs
	theme?: { name: string; css: string }; // the active theme's CSS, by name
	tokens?: Record<string, string>; // global token overrides (--np-*)
};

/** Pack the studio's shareable state into a sack, omitting empty parts. */
export function packSack(src: {
	name?: string;
	library?: Library;
	theme?: { name: string; css: string };
	tokens?: Record<string, string>;
}): Sack {
	const sack: Sack = { kind: 'widgetsack/sack', version: 1 };
	if (src.name) sack.name = src.name;
	if (src.library && src.library.defs.length) sack.library = src.library;
	if (src.theme && src.theme.name && src.theme.css) sack.theme = src.theme;
	if (src.tokens && Object.keys(src.tokens).length) sack.tokens = src.tokens;
	return sack;
}

/** A structural check that an arbitrary value is a sack (and not, say, a raw widgets.json). */
export function isSack(o: unknown): o is Sack {
	return !!o && typeof o === 'object' && (o as Sack).kind === 'widgetsack/sack';
}

/** Parse + validate raw JSON into a Sack, or null if it isn't one / is malformed. */
export function unpackSack(raw: string): Sack | null {
	try {
		const o: unknown = JSON.parse(raw);
		return isSack(o) ? o : null;
	} catch {
		return null;
	}
}

// First unused suffix of `base` not already in `taken` (deterministic — testable without rng).
function freshId(base: string, taken: Set<string>): string {
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base}-${n}`)) n++;
	return `${base}-${n}`;
}

// Rewrite any nested group.def reference in a def's child tree to its remapped id (in place).
function remapRefs(node: LayoutNode, idMap: Record<string, string>): void {
	if (isContainer(node)) {
		for (const child of node.children) remapRefs(child, idMap);
		return;
	}
	const unit = node.unit;
	if (isGroup(unit)) {
		if (unit.def && idMap[unit.def]) unit.def = idMap[unit.def];
		remapRefs(unit.child, idMap);
	}
}

/** Merge incoming defs into an existing library, regenerating colliding def ids and rewriting any
 * nested group.def cross-references so two sacks (or a sack and the live library) can't clash.
 * Returns the new library + the id remapping applied to the incoming defs. Pure (deep-clones). */
export function mergeLibrary(
	into: Library | undefined,
	incoming: WidgetDef[]
): { library: Library; idMap: Record<string, string> } {
	const taken = new Set((into?.defs ?? []).map((d) => d.id));
	const idMap: Record<string, string> = {};
	// Pass 1: assign a fresh id to every incoming def, reserving it so later incoming defs avoid it too.
	for (const def of incoming) {
		const newId = freshId(def.id, taken);
		taken.add(newId);
		idMap[def.id] = newId;
	}
	// Pass 2: deep-clone each incoming def, apply its new id, and rewrite nested cross-references.
	const remapped = incoming.map((def) => {
		const copy = JSON.parse(JSON.stringify(def)) as WidgetDef;
		copy.id = idMap[def.id];
		remapRefs(copy.child, idMap);
		return copy;
	});
	const library: Library = {
		version: into?.version ?? 1,
		defs: [...(into?.defs ?? []), ...remapped]
	};
	return { library, idMap };
}
