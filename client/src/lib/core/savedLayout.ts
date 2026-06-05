// A saved layout PROFILE: ONE monitor's arrangement (root flow tree + floating widgets) the user
// named in the studio so they can load it back later. Pure — no Tauri/DOM (overlay.ts does the file
// I/O via the Rust list_layouts/read_layout/save_layout_as/delete_layout commands; the Canvas wires
// save/load). Co-located vitest tests in savedLayout.test.ts.
import { parseLayoutAny } from './migration';
import type { MonitorLayout } from './layoutTree';

/** The on-disk saved-layout format. Tagged + versioned so a reader can detect/migrate it, and so it
 * is distinguishable from a sack or a raw `widgets.json` (which has a `monitors` map and no `kind`). */
export type SavedLayout = {
	kind: 'widgetsack/layout';
	version: 2;
	name?: string;
	monitor: MonitorLayout; // a single monitor's { root, floating }
};

/** Pack one monitor's layout into a named, tagged, versioned profile. */
export function packLayout(monitor: MonitorLayout, name?: string): SavedLayout {
	const out: SavedLayout = { kind: 'widgetsack/layout', version: 2, monitor };
	if (name) out.name = name;
	return out;
}

/** A structural check that a value is a saved layout (not a sack / raw widgets.json). */
export function isSavedLayout(o: unknown): o is SavedLayout {
	return !!o && typeof o === 'object' && (o as SavedLayout).kind === 'widgetsack/layout';
}

/** Parse + validate raw JSON into the saved monitor's `MonitorLayout`, or null if it isn't a saved
 * layout / is malformed. Reuses the version-aware layout validator so the tree + floating leaves are
 * checked EXACTLY as the live widgets.json is (malformed leaves dropped, bad containers reject). */
export function unpackLayout(raw: string): MonitorLayout | null {
	let o: unknown;
	try {
		o = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isSavedLayout(o)) return null;
	// Validate the single monitor by wrapping it in a throwaway v2 envelope and unwrapping the result.
	const parsed = parseLayoutAny({ version: 2, monitors: { _: o.monitor } });
	return parsed?.monitors._ ?? null;
}
