import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

// Capture the Tauri event handlers the component registers, so the test can fire drag/arrange events.
const handlers: Record<string, (e: { payload: unknown }) => void> = {};
vi.mock('@tauri-apps/api/event', () => ({
	listen: vi.fn((name: string, cb: (e: { payload: unknown }) => void) => {
		handlers[name] = cb;
		return Promise.resolve(() => delete handlers[name]);
	})
}));
vi.mock('@tauri-apps/api/window', () => ({
	currentMonitor: vi.fn(() =>
		Promise.resolve({
			position: { x: 0, y: 0 },
			size: { width: 1920, height: 1080 },
			scaleFactor: 1
		})
	)
}));

// A widgets.json (v2) with one floating `zone` widget carrying an exe match rule.
const LAYOUT = JSON.stringify({
	version: 2,
	monitors: {
		default: {
			root: { id: 'root', kind: 'col', children: [] },
			floating: [
				{
					id: 'z1',
					unit: {
						id: 'z1',
						type: 'zone',
						rect: { x: 0, y: 0, w: 960, h: 1080 },
						config: { matchExe: 'notepad.exe' }
					}
				}
			]
		}
	}
});

const pointerProbe = vi.fn(() => Promise.resolve({ x: 0, y: 0, shift: false }));
const snapWindow = vi.fn<(hwnd: number, rect: unknown) => Promise<boolean>>(() =>
	Promise.resolve(true)
);
const listWindows = vi.fn(() =>
	Promise.resolve([
		{
			hwnd: 42,
			exe: 'C:\\Windows\\System32\\Notepad.exe',
			className: 'Notepad',
			title: 'Untitled - Notepad',
			rect: { x: 0, y: 0, w: 100, h: 100 }
		}
	])
);
vi.mock('../overlay', () => ({
	monitorParam: () => null,
	loadLayoutRaw: () => Promise.resolve(LAYOUT),
	pointerProbe: () => pointerProbe(),
	snapWindow: (hwnd: number, rect: unknown) => snapWindow(hwnd, rect),
	listWindows: () => listWindows()
}));

import DragSnapLayer from './DragSnapLayer';

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const pollOnce = () => act(async () => void (await new Promise((r) => setTimeout(r, 80))));

beforeEach(() => {
	for (const k of Object.keys(handlers)) delete handlers[k];
	pointerProbe.mockReset();
	snapWindow.mockReset();
	snapWindow.mockResolvedValue(true);
});
afterEach(cleanup);

describe('DragSnapLayer (zone widgets)', () => {
	it('snaps the dragged window into the armed zone (physical rect) on drag end', async () => {
		pointerProbe.mockResolvedValue({ x: 480, y: 540, shift: true }); // inside the left zone, armed
		render(<DragSnapLayer />);
		await settle();

		act(() => handlers['win_drag_start']?.({ payload: { hwnd: 7 } }));
		await pollOnce();
		await act(async () => {
			handlers['win_drag_end']?.({ payload: { hwnd: 7 } });
			await Promise.resolve();
		});

		expect(snapWindow).toHaveBeenCalledTimes(1);
		expect(snapWindow).toHaveBeenCalledWith(7, { x: 0, y: 0, w: 960, h: 1080 });
	});

	it('does not snap when not armed (Shift up)', async () => {
		pointerProbe.mockResolvedValue({ x: 480, y: 540, shift: false });
		render(<DragSnapLayer />);
		await settle();

		act(() => handlers['win_drag_start']?.({ payload: { hwnd: 7 } }));
		await pollOnce();
		await act(async () => {
			handlers['win_drag_end']?.({ payload: { hwnd: 7 } });
			await Promise.resolve();
		});

		expect(snapWindow).not.toHaveBeenCalled();
	});

	it('arrange_zones snaps a matching window into its zone', async () => {
		pointerProbe.mockResolvedValue({ x: 0, y: 0, shift: false });
		render(<DragSnapLayer />);
		await settle();

		await act(async () => {
			handlers['arrange_zones']?.({ payload: {} });
			await new Promise((r) => setTimeout(r, 0));
		});

		expect(snapWindow).toHaveBeenCalledWith(42, { x: 0, y: 0, w: 960, h: 1080 });
	});
});
