// Which pointer button starts a widget move-drag, and whether that drag must skip docking into the
// flow/grid. Left = a normal move (may dock per the studio "into grids" toggle); right = a free-move
// that never docks (a quick gesture instead of unchecking the toggle); middle/other are reserved
// (panning). Pure so the button->policy decision is unit-tested without a DOM.
export function dragMoveIntent(button: number): { start: boolean; skipFlow: boolean } | null {
	if (button === 0) return { start: true, skipFlow: false };
	if (button === 2) return { start: true, skipFlow: true };
	return null;
}
