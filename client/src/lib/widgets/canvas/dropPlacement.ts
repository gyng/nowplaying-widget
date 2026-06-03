// Where a widget dropped from the palette lands: centered on the drop point, snapped to the editor
// grid so it aligns with everything else. Pure — unit-tested; the editor model uses it to position a
// new floating widget (the drop's world coords come from the Canvas's toWorld transform).
export function dropPlacement(
	size: { w: number; h: number },
	x: number,
	y: number,
	grid = 8
): { x: number; y: number } {
	const snap = (n: number) => Math.round(n / grid) * grid;
	return { x: snap(x - size.w / 2), y: snap(y - size.h / 2) };
}
