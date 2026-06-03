import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useKeyboard, type KeyboardDeps } from './useKeyboard';

// Mutable context the deps read, so a test can flip dirty/hasSelection/menuOpen between keystrokes.
const state = { dirty: false, hasSelection: false, menuOpen: false, previewing: false };

const handlers = {
	'studio.closeMenu': vi.fn(),
	'global.toggleEdit': vi.fn(),
	'studio.save': vi.fn(),
	'studio.undo': vi.fn(),
	'studio.redo': vi.fn(),
	'studio.delete': vi.fn()
};
const nudge = vi.fn();

const deps: KeyboardDeps = {
	studio: true,
	ctx: () => ({
		studio: true,
		editMode: true,
		menuOpen: state.menuOpen,
		dirty: state.dirty,
		hasSelection: state.hasSelection,
		previewing: state.previewing
	}),
	overrides: () => ({}),
	handlers,
	nudge
};

function press(init: KeyboardEventInit, target?: EventTarget) {
	act(() => {
		(target ?? window).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
	});
}

beforeEach(() => {
	state.dirty = false;
	state.hasSelection = false;
	state.menuOpen = false;
	state.previewing = false;
	Object.values(handlers).forEach((h) => h.mockClear());
	nudge.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('useKeyboard registry dispatch', () => {
	it('Ctrl+S saves only when dirty', () => {
		renderHook(() => useKeyboard(deps));
		press({ key: 's', code: 'KeyS', ctrlKey: true });
		expect(handlers['studio.save']).not.toHaveBeenCalled();
		state.dirty = true;
		press({ key: 's', code: 'KeyS', ctrlKey: true });
		expect(handlers['studio.save']).toHaveBeenCalledTimes(1);
	});

	it('routes undo / redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)', () => {
		renderHook(() => useKeyboard(deps));
		press({ key: 'z', code: 'KeyZ', ctrlKey: true });
		press({ key: 'y', code: 'KeyY', ctrlKey: true });
		press({ key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true });
		expect(handlers['studio.undo']).toHaveBeenCalledTimes(1);
		expect(handlers['studio.redo']).toHaveBeenCalledTimes(2);
	});

	it('Delete removes only with a selection', () => {
		renderHook(() => useKeyboard(deps));
		press({ key: 'Delete', code: 'Delete' });
		expect(handlers['studio.delete']).not.toHaveBeenCalled();
		state.hasSelection = true;
		press({ key: 'Delete', code: 'Delete' });
		press({ key: 'Backspace', code: 'Backspace' });
		expect(handlers['studio.delete']).toHaveBeenCalledTimes(2);
	});

	it('Escape closes the menu only when one is open', () => {
		renderHook(() => useKeyboard(deps));
		press({ key: 'Escape', code: 'Escape' });
		expect(handlers['studio.closeMenu']).not.toHaveBeenCalled();
		state.menuOpen = true;
		press({ key: 'Escape', code: 'Escape' });
		expect(handlers['studio.closeMenu']).toHaveBeenCalledTimes(1);
	});

	it('Ctrl+E broadcasts toggle edit', () => {
		renderHook(() => useKeyboard(deps));
		press({ key: 'e', code: 'KeyE', ctrlKey: true });
		expect(handlers['global.toggleEdit']).toHaveBeenCalledTimes(1);
	});

	it('a focused text field blocks editing keys but not command chords', () => {
		renderHook(() => useKeyboard(deps));
		state.hasSelection = true;
		state.dirty = true;
		const input = document.createElement('input');
		document.body.appendChild(input);
		press({ key: 'Delete', code: 'Delete' }, input);
		expect(handlers['studio.delete']).not.toHaveBeenCalled(); // editing key suppressed in input
		press({ key: 's', code: 'KeyS', ctrlKey: true }, input);
		expect(handlers['studio.save']).toHaveBeenCalledTimes(1); // command chord still fires
		input.remove();
	});

	it('arrows nudge by 1px, or the grid step with Shift; Space enters pan mode', () => {
		state.hasSelection = true;
		const { result } = renderHook(() => useKeyboard(deps));
		press({ key: 'ArrowLeft', code: 'ArrowLeft' });
		expect(nudge).toHaveBeenLastCalledWith(-1, 0);
		press({ key: 'ArrowDown', code: 'ArrowDown', shiftKey: true });
		expect(nudge).toHaveBeenLastCalledWith(0, 8);
		expect(result.current.spaceDown).toBe(false);
		press({ key: ' ', code: 'Space' });
		expect(result.current.spaceDown).toBe(true);
	});
});
