// Pure layout for the canvas-rendered per-core CPU grid (AGENTS.md §4). The SVG version leaned on CSS
// grid; the canvas draws every core into ONE buffer, so it needs the cell rectangles itself. Kept
// framework-free and unit-tested; the imperative drawing lives in CpuCoresCanvas.tsx.

export type Cell = { x: number; y: number; w: number; h: number };

/**
 * Rectangles for `count` cores laid out in `cols` columns over a `w`×`h` area with `gap` px between
 * cells (mirrors the old `grid-template-columns: repeat(cols, 1fr)` + `gap`). Rows are filled
 * left-to-right, top-to-bottom. Degenerate inputs are clamped so it never divides by zero or returns
 * negative sizes (a 0-area cell is fine — nothing draws).
 */
export function coreCellRects(
	count: number,
	cols: number,
	w: number,
	h: number,
	gap: number
): Cell[] {
	if (count <= 0) return [];
	const colCount = Math.max(1, Math.min(Math.round(cols), count));
	const rowCount = Math.ceil(count / colCount);
	const cellW = Math.max(0, (w - (colCount - 1) * gap) / colCount);
	const cellH = Math.max(0, (h - (rowCount - 1) * gap) / rowCount);
	const cells: Cell[] = [];
	for (let i = 0; i < count; i++) {
		const col = i % colCount;
		const row = Math.floor(i / colCount);
		cells.push({ x: col * (cellW + gap), y: row * (cellH + gap), w: cellW, h: cellH });
	}
	return cells;
}
