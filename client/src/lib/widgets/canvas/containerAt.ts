// Pure hit-test for "which container is the cursor over" — extracted from Canvas so the
// innermost-vs-outermost selection rule is unit-testable (AGENTS.md §4).
import type { Rect } from '../../core/layoutTree';

export type ContainerBox = { id: string; rect: Rect };

const contains = (r: Rect, p: { x: number; y: number }): boolean =>
	p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

/**
 * The DEEPEST container whose rect contains `point`, or `fallbackId` (the root) if none do.
 *
 * `boxes` is the PRE-ORDER walk from collectContainerRects (parent before its children), so a nested
 * cell that fills its parent has the SAME rect — and thus the SAME area — as that parent. We keep the
 * smallest-area box, breaking TIES in favour of the LATER one (the descendant). Without the tie-break
 * (a strict `<`), "split this cell" would target an equal-sized ancestor wrapping the cursor instead
 * of the innermost cell actually under it — e.g. the `keep` wrapper splitNode creates.
 */
export function innermostContainerAt(
	boxes: readonly ContainerBox[],
	point: { x: number; y: number },
	fallbackId: string
): string {
	let bestId = fallbackId;
	let bestArea = Infinity;
	for (const c of boxes) {
		if (!contains(c.rect, point)) continue;
		const area = c.rect.w * c.rect.h;
		if (area <= bestArea) {
			bestArea = area;
			bestId = c.id;
		}
	}
	return bestId;
}
