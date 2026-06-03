// Pure coordinate math for the CSS-layout pivot: convert a DOM getBoundingClientRect (post-CSS,
// post-zoom screen px) back into the LOGICAL/layout space the solver used (origin at the .world
// element, 1 unit = 1 logical px). The studio wraps .world in `translate(pan) scale(zoom)`, so
// measuring a child relative to .world's own (already-panned, already-zoomed) box and dividing by
// zoom recovers logical coords; pan cancels out because both are measured in the same frame.
// Framework-agnostic + unit-tested (the only measurement piece happy-dom can verify — real
// getBoundingClientRect values need Playwright).

import type { Rect } from './layout';

type Box = { left: number; top: number; width: number; height: number };
type Origin = { left: number; top: number };

export function screenRectToLayout(el: Box, world: Origin, zoom: number): Rect {
	const z = zoom || 1;
	return {
		x: (el.left - world.left) / z,
		y: (el.top - world.top) / z,
		w: el.width / z,
		h: el.height / z
	};
}
