// The studio's left-rail nav: an ordered, top-down list of sections (a permanent thin nav strip
// selects one; the panel area beside it shows that section's panel). Pure data so the order, the
// <gap> before Settings (the lone `foot` group), and the stub flags are unit-tested without React.
export type SectionId =
	| 'layouts'
	| 'widget-designer'
	| 'sensors'
	| 'plugins'
	| 'themes'
	| 'sacks'
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
	{ id: 'widget-designer', label: 'Widget designer', short: 'Design', icon: '◳', group: 'main' },
	{ id: 'sensors', label: 'Sensors', short: 'Sensors', icon: '∿', group: 'main' },
	{ id: 'plugins', label: 'Plugins', short: 'Plugins', icon: '⧉', group: 'main' },
	{ id: 'themes', label: 'Themes', short: 'Themes', icon: '◐', group: 'main' },
	{ id: 'sacks', label: 'Sacks', short: 'Sacks', icon: '▦', group: 'main' },
	{ id: 'settings', label: 'Settings', short: 'Settings', icon: '⚙', group: 'foot', stub: true }
];
