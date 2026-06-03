import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCanvasPointer, type CanvasPointerDeps } from './useCanvasPointer';
import type { Pan } from './useZoomFit';

const canvasEl = document.createElement('div');
canvasEl.classList.add('canvas');
const widgetEl = document.createElement('div'); // not .canvas/.world

const state = { space: false };

const deps: CanvasPointerDeps = {
	editMode: true,
	studio: true,
	overrides: () => ({}),
	spaceDown: () => state.space,
	pan: (): Pan => ({ panX: 0, panY: 0, zoom: 1 }),
	setPan: vi.fn(),
	canvasRef: { current: document.createElement('div') },
	renderables: () => [],
	selectedIds: () => [],
	setSelection: vi.fn(),
	clearSelection: vi.fn()
};

type Over = Partial<{
	button: number;
	target: EventTarget;
	shiftKey: boolean;
}>;
const ev = (o: Over) =>
	({
		button: 0,
		clientX: 10,
		clientY: 10,
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		metaKey: false,
		target: canvasEl,
		preventDefault: () => undefined,
		...o
	} as unknown as React.MouseEvent);

// Release any window listeners a pan/marquee attached, and reset transient state between cases.
function release() {
	act(() => window.dispatchEvent(new MouseEvent('mouseup')));
}

afterEach(() => {
	release();
	state.space = false;
});

describe('useCanvasPointer registry-driven gestures', () => {
	it('middle-drag pans', () => {
		const { result } = renderHook(() => useCanvasPointer(deps));
		act(() => result.current.onCanvasMouseDown(ev({ button: 1 })));
		expect(result.current.panning).toBe(true);
	});

	it('Space + left-drag pans', () => {
		const { result } = renderHook(() => useCanvasPointer(deps));
		state.space = true;
		act(() => result.current.onCanvasMouseDown(ev({ button: 0 })));
		expect(result.current.panning).toBe(true);
	});

	it('left-drag on the empty canvas starts a marquee', () => {
		const { result } = renderHook(() => useCanvasPointer(deps));
		act(() => result.current.onCanvasMouseDown(ev({ button: 0, target: canvasEl })));
		expect(result.current.marquee).not.toBeNull();
		expect(result.current.panning).toBe(false);
	});

	it('left-drag that did not land on the canvas does nothing', () => {
		const { result } = renderHook(() => useCanvasPointer(deps));
		act(() => result.current.onCanvasMouseDown(ev({ button: 0, target: widgetEl })));
		expect(result.current.marquee).toBeNull();
		expect(result.current.panning).toBe(false);
	});
});
