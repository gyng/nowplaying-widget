// The studio's bottom "powerline" hints are now DERIVED from the central controls registry (the single
// source of truth) instead of being hand-maintained here — so they can no longer drift from real
// behavior (the old list never advertised middle-drag pan, the reported bug). This thin adapter builds
// the studio ControlContext and delegates to deriveHints; rebinds (Phase 4 overrides) flow straight
// through. Importing controls.defaults registers the built-in inventory as a side-effect.
import '../../core/controls.defaults';
import {
	deriveHints,
	listControls,
	mergeOverrides,
	type ControlContext,
	type ControlOverrides
} from '../../core/controls';

export type StudioHint = { key: string; label: string };

export function studioHints(
	s: { hasSelection: boolean; spaceDown: boolean; panning: boolean },
	overrides: ControlOverrides = {}
): StudioHint[] {
	// The powerbar lives in the studio, which is always an editor — so studio/editMode are constant
	// here; only selection/space/panning vary. Menu/dirty/preview don't affect the advertised set.
	const ctx: ControlContext = {
		scope: 'studio',
		studio: true,
		editMode: true,
		menuOpen: false,
		dirty: false,
		hasSelection: s.hasSelection,
		spaceDown: s.spaceDown,
		panning: s.panning,
		previewing: false
	};
	return deriveHints(mergeOverrides(listControls(), overrides), ctx);
}
