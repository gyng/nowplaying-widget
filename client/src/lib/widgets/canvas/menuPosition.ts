// Clamp a context menu's top-left so the menu box stays fully inside the viewport. The menu opens
// at the cursor (x,y); if it would overflow the right / bottom edge we shift it back toward the
// cursor (so it effectively flips to the left of / above the pointer), keeping a small margin from
// each edge. A menu larger than the viewport pins to the top-left margin. Pure — unit-tested.
export function clampMenuToViewport(
	x: number,
	y: number,
	w: number,
	h: number,
	vw: number,
	vh: number,
	margin = 4
): { left: number; top: number } {
	let left = x;
	let top = y;
	if (left + w > vw - margin) left = Math.max(margin, vw - margin - w);
	if (top + h > vh - margin) top = Math.max(margin, vh - margin - h);
	return { left, top };
}
