// The studio's left-rail nav: an ordered, top-down list of sections (a permanent thin nav strip
// selects one; the panel area beside it shows that section's panel). Pure data so the order, the
// <gap> before the foot group (Settings), the stub flags, and glyph uniqueness are
// unit-tested without React.
export type SectionId =
	| 'layouts'
	| 'widget-designer'
	| 'sensors'
	| 'plugins'
	| 'themes'
	| 'sacks'
	| 'saved-layouts'
	| 'settings';

export type Section = {
	id: SectionId;
	label: string; // full name (tooltip)
	short: string; // compact label shown under the icon in the narrow strip
	icon: string;
	group: 'main' | 'foot'; // `foot` sits after a spacer at the bottom (the <gap> before Settings)
	stub?: boolean; // not yet a real panel
};

export const SECTIONS: Section[] = [
	{ id: 'layouts', label: 'Layouts', short: 'Layout', icon: '▤', group: 'main' },
	{ id: 'widget-designer', label: 'Widget designer', short: 'Defs', icon: '◳', group: 'main' },
	{ id: 'sensors', label: 'Sensors', short: 'Sensors', icon: '∿', group: 'main' },
	// Plugins ❖ (not ⧉ — ⧉ is "copy" elsewhere) and Sacks ❏ (not ▦ — ▦ is a container/grid/monitor)
	// so each nav glyph is a distinct signifier (the glyph-uniqueness test locks this in).
	{ id: 'plugins', label: 'Plugins', short: 'Plugins', icon: '❖', group: 'main' },
	{ id: 'themes', label: 'Themes', short: 'Themes', icon: '◐', group: 'main' },
	{ id: 'sacks', label: 'Sacks', short: 'Sacks', icon: '❏', group: 'main' },
	// Saved layout profiles (save the current monitor's arrangement, load it back). ⊞ is distinct
	// from the other nav glyphs and from the in-canvas ▦ (container/grid) signifier.
	{ id: 'saved-layouts', label: 'Saved layouts', short: 'Saved', icon: '⊞', group: 'main' },
	// Control remaps moved into Settings → Controls; Settings is the sole foot item now.
	{ id: 'settings', label: 'Settings', short: 'Settings', icon: '⚙', group: 'foot' }
];

// The sections in the exact top-to-bottom order the NavRail renders them: the `main` group first,
// then the `foot` group after the spacer. Keyboard section-jump (Ctrl+1..8) and Next/Prev cycle index
// THIS, so the numeric/cycle order always tracks the visible rail even if the two groups are
// reordered independently (a unit test pins this to the rail order).
export const RAIL_ORDER: Section[] = [
	...SECTIONS.filter((s) => s.group === 'main'),
	...SECTIONS.filter((s) => s.group === 'foot')
];
