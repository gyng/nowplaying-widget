// Splitter interactions (extracted from Canvas): drag a boundary between adjacent fr children of
// a row/col (or two flexible grid tracks), resize live (no-commit) on move, commit on release.
// Computing from the captured start + cumulative delta avoids drift as the layout reflows. Also
// the keyboard alternative (WCAG 2.5.7: arrows nudge, Shift = bigger step) and the double-click
// even-split reset. The geometry math (resizeSplit) is pure core; the writes go through the
// editor model's setGridTracks/setNodeBases helpers so they ride the normal commit/undo path.
import { useCallback, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { resizeSplit, type Splitter } from '../../core/solve';
import { editHelpers, type EditorModel } from './useEditorModel';

type Deps = {
	/** The studio zoom at event time (pointer deltas are screen px; the layout is world px). */
	zoom: number;
	commitOp: EditorModel['commitOp'];
	mutateNoSave: EditorModel['mutateNoSave'];
};

export type Splitters = {
	onSplitDown: (e: ReactPointerEvent, sp: Splitter) => void;
	onSplitMove: (e: ReactPointerEvent) => void;
	onSplitUp: (e: ReactPointerEvent) => void;
	onSplitReset: (sp: Splitter) => void;
	onSplitKey: (e: ReactKeyboardEvent, sp: Splitter) => void;
};

export function useSplitters({ zoom, commitOp, mutateNoSave }: Deps): Splitters {
	// Splitter drag: capture the pair's start sizes/weights, resize live (no-commit) on move, commit
	// on release.
	const splitDrag = useRef<{
		axis: 'row' | 'col';
		containerId: string;
		aId: string;
		bId: string;
		track?: Splitter['track'];
		frA: number;
		frB: number;
		mainA: number;
		mainB: number;
		startX: number;
		startY: number;
		last: { frA: number; frB: number };
	} | null>(null);
	// Commit a resized boundary. A GRID-track splitter writes the two tracks' colFr/rowFr weights on
	// the grid; a row/col splitter writes the two children's basis fr. Same fr math for both.
	const setSplit = useCallback(
		(
			sp: { containerId: string; aId: string; bId: string; track?: Splitter['track'] },
			fr: { frA: number; frB: number },
			commit: boolean
		) => {
			const run = commit ? commitOp : mutateNoSave;
			if (sp.track) {
				const tr = sp.track;
				run((s) =>
					editHelpers.setGridTracks(s, sp.containerId, tr.which, [
						{ index: tr.a, fr: fr.frA },
						{ index: tr.b, fr: fr.frB }
					])
				);
			} else {
				run((s) =>
					editHelpers.setNodeBases(s, [
						{ id: sp.aId, basis: { fr: fr.frA } },
						{ id: sp.bId, basis: { fr: fr.frB } }
					])
				);
			}
		},
		[commitOp, mutateNoSave]
	);
	const onSplitDown = useCallback((e: ReactPointerEvent, sp: Splitter) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		splitDrag.current = {
			axis: sp.axis,
			containerId: sp.containerId,
			aId: sp.aId,
			bId: sp.bId,
			track: sp.track,
			frA: sp.frA,
			frB: sp.frB,
			mainA: sp.mainA,
			mainB: sp.mainB,
			startX: e.clientX,
			startY: e.clientY,
			last: { frA: sp.frA, frB: sp.frB }
		};
		e.currentTarget.setPointerCapture(e.pointerId);
	}, []);
	const onSplitMove = useCallback(
		(e: ReactPointerEvent) => {
			const d = splitDrag.current;
			if (!d) return;
			const deltaMain =
				(d.axis === 'row' ? e.clientX - d.startX : e.clientY - d.startY) / (zoom || 1);
			d.last = resizeSplit(d.mainA, d.mainB, d.frA, d.frB, deltaMain);
			setSplit(d, d.last, false);
		},
		[zoom, setSplit]
	);
	const onSplitUp = useCallback(
		(e: ReactPointerEvent) => {
			const d = splitDrag.current;
			if (!d) return;
			splitDrag.current = null;
			e.currentTarget.releasePointerCapture?.(e.pointerId);
			setSplit(d, d.last, true);
		},
		[setSplit]
	);
	// Double-click a splitter → even just that pair (preserve their combined fr).
	const onSplitReset = useCallback(
		(sp: Splitter) => {
			const half = Number(((sp.frA + sp.frB) / 2).toFixed(3));
			setSplit(sp, { frA: half, frB: half }, true);
		},
		[setSplit]
	);
	// Keyboard alternative to the drag (WCAG 2.5.7): arrow keys nudge the proportion, Shift = bigger
	// step. The splitter is focusable (role=separator), so this is the no-pointer path to resizing.
	const onSplitKey = useCallback(
		(e: ReactKeyboardEvent, sp: Splitter) => {
			const step = e.shiftKey ? 24 : 8;
			let d = 0;
			if (sp.axis === 'row') d = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
			else d = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
			if (!d) return;
			e.preventDefault();
			setSplit(sp, resizeSplit(sp.mainA, sp.mainB, sp.frA, sp.frB, d), true);
		},
		[setSplit]
	);

	return { onSplitDown, onSplitMove, onSplitUp, onSplitReset, onSplitKey };
}
