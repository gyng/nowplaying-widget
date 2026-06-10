// Sack import/export (extracted from Canvas, item 10): pack the studio's shareable state
// (library + theme CSS + token overrides) into a named sack file, and import + merge one back.
// The editable state itself stays in the editor model — this hook owns the sacks/ + themes/ file
// I/O around it and funnels the import through ONE commit (one undo step). Theme side-effects go
// through the useThemes seam (adoptTheme / setThemeList) so the live CSS can't drift.
import { useCallback, useEffect, useState } from 'react';
import type { Library } from '../../core/layoutTree';
import { mergeLibrary, packSack, unpackSack } from '../../core/sack';
import { scanCssThreats, threatSummary } from '../../core/cssThreats';
import {
	listSacks,
	listThemes,
	readSack,
	resolveThemeCss,
	saveThemeCss,
	writeSack
} from '../../overlay';
import type { SectionId } from './studioSections';
import type { EditorModel } from './useEditorModel';
import type { EditorState } from './types';
import type { Themes } from './useThemes';

type Deps = {
	studio: boolean;
	navSection: SectionId;
	editingDefId: string | null;
	selectedTheme: string;
	library: Library | undefined;
	tokenOverrides: Record<string, string>;
	commitOp: EditorModel['commitOp'];
	themes: Pick<Themes, 'themeLabel' | 'setThemeList' | 'adoptTheme'>;
};

export type Sacks = {
	/** The saved sacks (names), loaded when the Sacks section is open. */
	sackNames: string[];
	exportSack: () => Promise<void>;
	importSack: (name: string) => Promise<void>;
};

export function useSacks({
	studio,
	navSection,
	editingDefId,
	selectedTheme,
	library,
	tokenOverrides,
	commitOp,
	themes
}: Deps): Sacks {
	const { themeLabel, setThemeList, adoptTheme } = themes;
	const [sackNames, setSackNames] = useState<string[]>([]);

	const exportSack = useCallback(async () => {
		if (editingDefId != null) {
			// Mid def-edit the in-progress def isn't folded back into `library` yet — exporting now would
			// pack the stale pre-edit version. Make the user finish first (matches importSack's guard).
			window.alert('Finish editing the current widget (Done) before exporting a sack.');
			return;
		}
		const name = window.prompt('Export a sack (name):', themeLabel(selectedTheme) || 'my-sack');
		if (!name) return;
		// Re-read the theme CSS at export time so a not-yet-loaded `themeCss` can't silently drop it. A
		// built-in is baked into the sack under its catalog name (the `builtin:` id never leaves the app).
		const css = selectedTheme ? await resolveThemeCss(selectedTheme) : '';
		const sack = packSack({
			name,
			library,
			theme: selectedTheme ? { name: themeLabel(selectedTheme), css } : undefined,
			tokens: tokenOverrides
		});
		const path = await writeSack(name, JSON.stringify(sack, null, '\t'));
		setSackNames(await listSacks());
		if (path) window.alert(`Saved sack:\n${path}`);
	}, [editingDefId, selectedTheme, themeLabel, library, tokenOverrides]);

	const importSack = useCallback(
		async (name: string) => {
			if (editingDefId != null) {
				window.alert('Finish editing the current widget (Done) before importing a sack.');
				return;
			}
			const raw = await readSack(name);
			const sack = raw ? unpackSack(raw) : null;
			if (!sack) {
				window.alert('Could not read that sack.');
				return;
			}
			// A sack is shared content: its theme CSS is injected verbatim into the studio + overlays, so
			// scan it for constructs that reach OUTSIDE the app (remote url()/@import that phone home) or
			// hijack the viewport, and make the user confirm before trusting a stranger's theme.
			if (sack.theme?.css) {
				const threats = scanCssThreats(sack.theme.css);
				if (threats.length) {
					const ok = window.confirm(
						`This sack's theme contains ${threatSummary(threats)}. Imported theme CSS runs with ` +
							`full access to the studio. Import anyway?`
					);
					if (!ok) return;
				}
			}
			// Theme first: resolve a name collision so an import never clobbers an existing user theme.
			let themeName: string | null = null;
			if (sack.theme) {
				const existing = await listThemes();
				themeName = existing.includes(sack.theme.name)
					? `${sack.theme.name}-imported`
					: sack.theme.name;
				await saveThemeCss(themeName, sack.theme.css);
				setThemeList(await listThemes());
			}
			// One commit applies the persisted parts: merged library + token overrides + selected theme.
			commitOp((s) => {
				const patch: Partial<EditorState> = {};
				if (sack.library?.defs.length) {
					patch.library = mergeLibrary(s.library, sack.library.defs).library;
				}
				if (sack.tokens && Object.keys(sack.tokens).length) {
					patch.tokenOverrides = { ...s.tokenOverrides, ...sack.tokens };
				}
				if (themeName) patch.selectedTheme = themeName;
				return patch;
			});
			// Live-apply the theme CSS (the commit set selectedTheme; mirror it for the live styles).
			if (themeName) await adoptTheme(themeName);
		},
		[editingDefId, commitOp, setThemeList, adoptTheme]
	);

	// Load the saved sack names when the Sacks section opens.
	useEffect(() => {
		if (studio && navSection === 'sacks') listSacks().then(setSackNames);
	}, [studio, navSection]);

	return { sackNames, exportSack, importSack };
}
