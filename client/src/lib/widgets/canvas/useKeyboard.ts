// Global keyboard (svelte:window on:keydown/on:keyup): Escape closes the menu; Ctrl+E broadcasts
// toggle_edit; Ctrl+S saves the studio draft; Ctrl+Z/Y/Shift+Z undo/redo; Delete removes the
// selection; arrows nudge floating widgets (Shift = grid step); Space (held) enters pan mode.
// Ported verbatim from onKeydown/onKeyup, gated identically. `spaceDownRef` is shared with the
// canvas-pointer hook so a Space+left-drag pans.
import { useEffect, useRef, useState } from 'react';
import { emit } from '@tauri-apps/api/event';

const GRID = 8;

export type KeyboardDeps = {
	studio: boolean;
	editMode: () => boolean;
	menuOpen: () => boolean;
	closeMenu: () => void;
	dirty: () => boolean;
	commitSave: () => void;
	undo: () => void;
	redo: () => void;
	hasSelection: () => boolean;
	deleteSelected: () => void;
	nudge: (dx: number, dy: number) => void; // translateSelectedFloating + saveLayout if it changed
};

export function useKeyboard(deps: KeyboardDeps): {
	spaceDownRef: React.RefObject<boolean>;
	spaceDown: boolean;
} {
	// `spaceDown` is BOTH a ref (read synchronously by the pointer hook for a Space+left-drag pan)
	// AND render state (drives the `panmode` class on the canvas — Svelte's class:panmode={spaceDown}).
	const spaceDownRef = useRef(false);
	const [spaceDown, setSpaceDown] = useState(false);
	const setSpace = (v: boolean) => {
		spaceDownRef.current = v;
		setSpaceDown(v);
	};
	// Hold deps in a ref so the window listeners stay stable (registered once) but read latest.
	const d = useRef(deps);
	d.current = deps;

	useEffect(() => {
		const onKeydown = (event: KeyboardEvent) => {
			const dep = d.current;
			if (event.key === 'Escape' && dep.menuOpen()) {
				dep.closeMenu();
				return;
			}
			if (event.ctrlKey && event.key.toLowerCase() === 'e') {
				event.preventDefault();
				emit('toggle_edit'); // broadcast so every monitor's overlay toggles together
			}
			if (!(dep.studio || dep.editMode())) return;
			const k = event.key.toLowerCase();
			if (event.ctrlKey && k === 's') {
				event.preventDefault();
				if (dep.studio && dep.dirty()) dep.commitSave();
				return;
			}
			const target = event.target as HTMLElement | null;
			if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
			if (dep.studio && event.code === 'Space' && target?.tagName !== 'BUTTON') {
				event.preventDefault();
				setSpace(true);
				return;
			}
			if (event.ctrlKey && k === 'z' && !event.shiftKey) {
				event.preventDefault();
				dep.undo();
				return;
			} else if (event.ctrlKey && (k === 'y' || (k === 'z' && event.shiftKey))) {
				event.preventDefault();
				dep.redo();
				return;
			}
			if (!dep.hasSelection()) return;
			if (k === 'delete' || k === 'backspace') {
				event.preventDefault();
				dep.deleteSelected();
				return;
			}
			const step = event.shiftKey ? GRID : 1;
			const map: Record<string, [number, number]> = {
				arrowleft: [-step, 0],
				arrowright: [step, 0],
				arrowup: [0, -step],
				arrowdown: [0, step]
			};
			const delta = map[k];
			if (delta) {
				event.preventDefault();
				dep.nudge(delta[0], delta[1]);
			}
		};
		const onKeyup = (event: KeyboardEvent) => {
			if (event.code === 'Space') setSpace(false);
		};
		window.addEventListener('keydown', onKeydown);
		window.addEventListener('keyup', onKeyup);
		return () => {
			window.removeEventListener('keydown', onKeydown);
			window.removeEventListener('keyup', onKeyup);
		};
	}, []);

	return { spaceDownRef, spaceDown };
}
