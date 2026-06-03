// The contextual action hints shown in the studio's bottom "powerline" bar. Pure: maps the current
// interaction state to an ordered list of key→action segments, so the bar always advertises what
// the mouse/keyboard will do right now (e.g. nudge/remove only appear with a selection; panning
// takes over the bar while a pan is in progress). Unit-tested.
export type StudioHint = { key: string; label: string };

export function studioHints(s: {
	hasSelection: boolean;
	spaceDown: boolean;
	panning: boolean;
}): StudioHint[] {
	if (s.panning) {
		return [
			{ key: 'Drag', label: 'panning view' },
			{ key: 'Release', label: 'done' }
		];
	}
	const hints: StudioHint[] = [
		{ key: 'Click', label: 'select' },
		{ key: 'Drag', label: 'move' },
		{ key: 'Right-click', label: 'menu' }
	];
	hints.push(
		s.spaceDown ? { key: 'Space+Drag', label: 'pan' } : { key: 'Shift+Drag', label: 'marquee' }
	);
	hints.push({ key: 'Scroll', label: 'zoom' });
	if (s.hasSelection) {
		hints.push({ key: 'Arrows', label: 'nudge' });
		hints.push({ key: 'Del', label: 'remove' });
	}
	return hints;
}
