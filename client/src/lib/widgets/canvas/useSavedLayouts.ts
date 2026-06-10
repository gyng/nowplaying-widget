// Saved-layout slots (extracted from Canvas): name the current monitor's arrangement, load one
// back (one undoable commit), delete a slot. Pure pack/unpack lives in core/savedLayout; this
// hook owns the layouts/ file I/O + the prompts/confirms around it. Reads the live monitor via
// the Canvas's monitorRef so a save mid-render captures the committed tree, not a stale closure.
import { useCallback, useEffect, useState } from 'react';
import type { MonitorLayout } from '../../core/layoutTree';
import { packLayout, unpackLayout } from '../../core/savedLayout';
import { deleteLayout, listLayouts, readLayout, saveLayoutAs } from '../../overlay';
import type { SectionId } from './studioSections';
import type { EditorModel } from './useEditorModel';

type Deps = {
	studio: boolean;
	navSection: SectionId;
	editingDefId: string | null;
	monitorRef: React.RefObject<MonitorLayout>;
	commitOp: EditorModel['commitOp'];
};

export type SavedLayouts = {
	/** The saved layout profiles (names), loaded when the Saved-layouts section is open. */
	layoutNames: string[];
	saveCurrentLayout: () => Promise<void>;
	loadSavedLayout: (name: string) => Promise<void>;
	deleteSavedLayout: (name: string) => Promise<void>;
};

export function useSavedLayouts({
	studio,
	navSection,
	editingDefId,
	monitorRef,
	commitOp
}: Deps): SavedLayouts {
	const [layoutNames, setLayoutNames] = useState<string[]>([]);

	// Load the saved layout names when the Saved-layouts section opens.
	useEffect(() => {
		if (studio && navSection === 'saved-layouts') listLayouts().then(setLayoutNames);
	}, [studio, navSection]);

	const saveCurrentLayout = useCallback(async () => {
		if (editingDefId != null) {
			// Mid def-edit `monitor` is the def scratch, not the real layout — finish first (like sacks).
			window.alert('Finish editing the current widget (Done) before saving the layout.');
			return;
		}
		const name = window.prompt("Save this monitor's layout as (name):", '')?.trim();
		if (!name) return;
		const existing = await listLayouts();
		if (existing.includes(name) && !window.confirm(`Overwrite the saved layout "${name}"?`)) return;
		const json = JSON.stringify(packLayout(monitorRef.current, name), null, '\t');
		const path = await saveLayoutAs(name, json);
		setLayoutNames(await listLayouts());
		if (!path) {
			window.alert(
				'Could not save the layout. Names allow letters, numbers, spaces, _ and - (≤64).'
			);
		}
	}, [editingDefId, monitorRef]);

	const loadSavedLayout = useCallback(
		async (name: string) => {
			if (editingDefId != null) {
				window.alert('Finish editing the current widget (Done) before loading a layout.');
				return;
			}
			const raw = await readLayout(name);
			const mon = raw ? unpackLayout(raw) : null;
			if (!mon) {
				window.alert('Could not read that layout.');
				return;
			}
			if (!window.confirm(`Replace this monitor's layout with "${name}"?  (Undo restores it.)`)) {
				return;
			}
			// One undoable commit replaces the current monitor; the persistence hook then writes it to
			// widgets.json for this monitor. Selection is cleared (the old ids are gone).
			commitOp(() => ({ monitor: mon, selectedId: null, selectedIds: [] }));
		},
		[editingDefId, commitOp]
	);

	const deleteSavedLayout = useCallback(async (name: string) => {
		if (!window.confirm(`Delete the saved layout "${name}"?`)) return;
		await deleteLayout(name);
		setLayoutNames(await listLayouts());
	}, []);

	return { layoutNames, saveCurrentLayout, loadSavedLayout, deleteSavedLayout };
}
