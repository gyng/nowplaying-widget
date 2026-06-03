// Live-preview persistence (item 3): the only place that touches disk. persistToDisk re-reads
// widgets.json to merge OTHER monitors' layouts + library + theme + tokens, folds the in-progress
// def, and writes. In the STUDIO, a commit (saveSeq bump) debounces a preview write ~150ms via a
// ref timer so the desktop overlays preview unsaved changes without per-keystroke disk thrash;
// `dirty` still tracks divergence from the saved baseline. On an OVERLAY it persists immediately
// (the original auto-save). commitSave flushes; cancelEdits/revertDraftToDisk revert; a
// clearPreviewWrite runs on unmount. Token write is authoritative (empty -> omit tokens).
import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emptyRoot, type Library, type LayoutV2, type MonitorLayout } from '../../core/layoutTree';
import { parseLayoutAny } from '../../core/migration';
import type { Baseline, EditorState, Extra } from './types';

// A frozen view of the persistence-relevant state, captured each render into a ref so the
// debounced writer reads the LATEST values when it fires (no stale closure).
type PersistView = {
	myMonitor: string;
	monitor: MonitorLayout;
	library: Library | undefined;
	selectedTheme: string;
	tokenOverrides: Record<string, string>;
	editingDefId: string | null;
	savedMonitor: MonitorLayout | null;
	studio: boolean;
};

export type Persistence = {
	// Flush the debounced preview write now (Save): writes incl. queued cross-monitor moves.
	persistToDisk: (extras: Extra[]) => Promise<void>;
	// Write a specific saved baseline back to disk (revertDraftToDisk / discard-on-switch). Used
	// instead of persistToDisk because the reducer's revert set lags a render — we write the
	// baseline values directly so the overlays return to the last-saved state immediately.
	writeBaseline: (b: Baseline, myMonitor: string) => Promise<void>;
	schedulePreviewWrite: () => void;
	clearPreviewWrite: () => void;
};

export function usePersistence(state: EditorState, myMonitor: string): Persistence {
	// Mirror the live state into a ref each render so the debounced writer + Save read the latest.
	const view = useRef<PersistView>({
		myMonitor,
		monitor: state.monitor,
		library: state.library,
		selectedTheme: state.selectedTheme,
		tokenOverrides: state.tokenOverrides,
		editingDefId: state.editingDefId,
		savedMonitor: state.savedMonitor,
		studio: state.studio
	});
	view.current = {
		myMonitor,
		monitor: state.monitor,
		library: state.library,
		selectedTheme: state.selectedTheme,
		tokenOverrides: state.tokenOverrides,
		editingDefId: state.editingDefId,
		savedMonitor: state.savedMonitor,
		studio: state.studio
	};

	// While editing a def we must fold the scoped editing tree back into the library before a
	// write — but the library set is reducer-owned. The Canvas runs `endDefEdit`/save through the
	// reducer; for a mid-def preview write we fold a LOCAL copy here (mirrors syncEditingDef) so the
	// on-disk library stays in sync without mutating reducer state.
	const persistToDisk = useCallback(async (extras: Extra[]): Promise<void> => {
		const v = view.current;
		let monitors: LayoutV2['monitors'] = {};
		let fileLib: Library | undefined;
		let fileTheme: string | undefined;
		try {
			const raw = await invoke<string | null>('load_layout');
			const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
			monitors = (obj ? parseLayoutAny(obj) : null)?.monitors ?? {};
			fileLib = obj?.library as Library | undefined;
			fileTheme = typeof obj?.theme === 'string' ? (obj.theme as string) : undefined;
		} catch {
			monitors = {};
		}
		// While editing a def, fold the in-progress def back into the library + persist the REAL
		// monitor (not the scoped editing tree). (Svelte's syncEditingDef() + savedMonitor swap.)
		let library = v.library;
		if (v.editingDefId && library) {
			const child = v.monitor.root;
			const defId = v.editingDefId;
			library = {
				...library,
				defs: library.defs.map((d) => (d.id === defId ? { ...d, child } : d))
			};
		}
		monitors[v.myMonitor] = v.editingDefId && v.savedMonitor ? v.savedMonitor : v.monitor;
		for (const extra of extras) {
			if (extra.key === v.myMonitor) continue;
			const t = monitors[extra.key] ?? { root: emptyRoot(), floating: [] };
			monitors[extra.key] = { root: t.root, floating: [...(t.floating ?? []), extra.leaf] };
		}
		const lib = library ?? fileLib;
		const theme = v.selectedTheme || fileTheme;
		const tokens = v.tokenOverrides;
		const out: Record<string, unknown> = { version: 2, monitors };
		if (lib) out.library = lib;
		if (theme) out.theme = theme;
		if (tokens && Object.keys(tokens).length) out.tokens = tokens;
		try {
			await invoke('save_layout', { contents: JSON.stringify(out, null, 2) });
		} catch (err) {
			console.warn('save_layout failed', err);
		}
	}, []);

	// Write a specific baseline straight to disk (revert path): merge the file's other monitors +
	// library/theme/tokens with the baseline's values for THIS monitor. Mirrors persistToDisk but
	// sources the editor values from `b` (and the baseline is never mid-def, so no def fold).
	const writeBaseline = useCallback(async (b: Baseline, myMonitor: string): Promise<void> => {
		let monitors: LayoutV2['monitors'] = {};
		let fileLib: Library | undefined;
		let fileTheme: string | undefined;
		try {
			const raw = await invoke<string | null>('load_layout');
			const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
			monitors = (obj ? parseLayoutAny(obj) : null)?.monitors ?? {};
			fileLib = obj?.library as Library | undefined;
			fileTheme = typeof obj?.theme === 'string' ? (obj.theme as string) : undefined;
		} catch {
			monitors = {};
		}
		monitors[myMonitor] = b.monitor;
		const lib = b.library ?? fileLib;
		const theme = b.theme || fileTheme;
		const tokens = b.tokens;
		const out: Record<string, unknown> = { version: 2, monitors };
		if (lib) out.library = lib;
		if (theme) out.theme = theme;
		if (tokens && Object.keys(tokens).length) out.tokens = tokens;
		try {
			await invoke('save_layout', { contents: JSON.stringify(out, null, 2) });
		} catch (err) {
			console.warn('save_layout failed', err);
		}
	}, []);

	const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const clearPreviewWrite = useCallback(() => {
		clearTimeout(previewTimer.current);
		previewTimer.current = undefined;
	}, []);
	const schedulePreviewWrite = useCallback(() => {
		clearTimeout(previewTimer.current);
		previewTimer.current = setTimeout(() => {
			previewTimer.current = undefined;
			persistToDisk([]);
		}, 150);
	}, [persistToDisk]);

	// clearPreviewWrite on unmount (item 4 cleanup).
	useEffect(() => () => clearPreviewWrite(), [clearPreviewWrite]);

	return { persistToDisk, writeBaseline, schedulePreviewWrite, clearPreviewWrite };
}
