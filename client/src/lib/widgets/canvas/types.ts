// Shared types for the Canvas editor model (the reducer + persistence hooks). The editor state
// is the snapshot-relevant slice of the old Canvas.svelte component locals (monitor / library /
// selection / theme / tokens / def-edit / undo-redo / manual-save baseline). Everything else
// (drag/marquee/pan bookkeeping, measured stage size, zoom) lives in refs/hooks, not here —
// it was never part of an undo snapshot or a disk write.

import type { Library, MonitorLayout } from '../../core/layoutTree';

/** An undo/redo snapshot of the editable {monitor, library} pair. Immutable tree ops reassign
 * these to NEW objects, so a snapshot is just the current references — no deep clone. */
export type Snap = { monitor: MonitorLayout; library: Library | undefined };

/** The last-persisted snapshot (studio manual-save): `dirty` compares the live editor state to
 * it; Cancel reverts to it. Captured on load and after every Save. */
export type Baseline = {
	monitor: MonitorLayout;
	library: Library | undefined;
	theme: string;
	tokens: Record<string, string>;
};

/** A floating leaf queued for ANOTHER monitor's layout (a cross-monitor move), merged on Save. */
export type Extra = { key: string; leaf: import('../../core/layoutTree').Leaf };

/** Studio monitor-switcher option (device name + logical size per per-monitor key). */
export type MonitorOption = { key: string; label: string; name: string; w: number; h: number };

/** The full editor model — the reducer's state. Mirrors the Svelte component locals that
 * participated in undo/baseline/persistence. */
export type EditorState = {
	monitor: MonitorLayout;
	library: Library | undefined;
	selectedId: string | null;
	selectedIds: string[];
	// The last selectedId the multi-select set was synced to (Svelte's lastPrimary). When an op
	// sets selectedId without also setting selectedIds, the reducer collapses selectedIds to just
	// the new primary — UNLESS the op set selectedIds itself (marquee / template / group move).
	lastPrimary: string | null;
	selectedTheme: string;
	tokenOverrides: Record<string, string>;
	// Def editor (6b): while editing a def, `monitor` is the scoped tree and the real monitor is
	// stashed in `savedMonitor`. `defEditBaseline` is the scoped tree as of def-edit START, so the
	// Save indicator (`dirty`) can tell whether the in-progress def has been edited yet (Svelte got
	// this for free because persistToDisk→syncEditingDef reassigned `library` mid-edit).
	editingDefId: string | null;
	savedMonitor: MonitorLayout | null;
	defEditBaseline: MonitorLayout | null;
	// Undo/redo (item 2).
	undoStack: Snap[];
	redoStack: Snap[];
	lastSnap: Snap | null;
	historyReady: boolean;
	// Manual-save baseline (studio).
	savedBaseline: Baseline | null;
	pendingExtras: Extra[];
	// Bumped on every commit (saveLayout); the persistence effect watches it to write to disk.
	saveSeq: number;
	// Distinguishes overlay (auto-save now) from studio (debounced preview) for the save effect.
	studio: boolean;
};
