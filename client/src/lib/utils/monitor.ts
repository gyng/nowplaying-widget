import { availableMonitors, currentMonitor, type Monitor } from '@tauri-apps/api/window';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/window';
import type { MonitorInfo } from '../../stores/stores';

/**
 * Get all available monitors
 */
export async function getAllMonitors(): Promise<Monitor[]> {
	return await availableMonitors();
}

/**
 * Get the monitor the window is currently on
 */
export async function getCurrentMonitorInfo(): Promise<Monitor | null> {
	return await currentMonitor();
}

/**
 * Convert a Tauri Monitor to our MonitorInfo type (using logical coordinates)
 */
export function monitorToInfo(monitor: Monitor): MonitorInfo {
	return {
		name: monitor.name,
		position: {
			x: Math.round(monitor.position.x / monitor.scaleFactor),
			y: Math.round(monitor.position.y / monitor.scaleFactor)
		},
		size: {
			width: Math.round(monitor.size.width / monitor.scaleFactor),
			height: Math.round(monitor.size.height / monitor.scaleFactor)
		}
	};
}

/**
 * Find a monitor that matches the saved monitor info (stored in logical coordinates)
 * Returns the monitor if found, or null if not found
 */
export async function findMonitorByMatch(savedMonitor: MonitorInfo): Promise<Monitor | null> {
	const monitors = await getAllMonitors();

	// First, try to match by exact name
	const exactMatch = monitors.find((m) => m.name === savedMonitor.name);
	if (exactMatch) return exactMatch;

	// If name doesn't match (monitor was renamed/changed), try to match by position and size
	// Compare using logical coordinates
	const positionMatch = monitors.find((m) => {
		const logicalX = Math.round(m.position.x / m.scaleFactor);
		const logicalY = Math.round(m.position.y / m.scaleFactor);
		const logicalWidth = Math.round(m.size.width / m.scaleFactor);
		const logicalHeight = Math.round(m.size.height / m.scaleFactor);

		return (
			logicalX === savedMonitor.position.x &&
			logicalY === savedMonitor.position.y &&
			logicalWidth === savedMonitor.size.width &&
			logicalHeight === savedMonitor.size.height
		);
	});

	return positionMatch ?? null;
}

/**
 * Check if a position (in logical coordinates) is within the bounds of a monitor
 */
export function isPositionOnMonitor(
	x: number,
	y: number,
	monitor: Monitor,
	windowWidth = 0,
	windowHeight = 0
): boolean {
	// Convert monitor physical coordinates to logical
	const logicalMonX = monitor.position.x / monitor.scaleFactor;
	const logicalMonY = monitor.position.y / monitor.scaleFactor;
	const logicalMonWidth = monitor.size.width / monitor.scaleFactor;
	const logicalMonHeight = monitor.size.height / monitor.scaleFactor;

	const monitorRight = logicalMonX + logicalMonWidth;
	const monitorBottom = logicalMonY + logicalMonHeight;

	// Check if at least part of the window is visible on the monitor
	const windowRight = x + windowWidth;
	const windowBottom = y + windowHeight;

	return (
		x < monitorRight &&
		windowRight > logicalMonX &&
		y < monitorBottom &&
		windowBottom > logicalMonY
	);
}

/**
 * Calculate a centered position for the window on a specific monitor
 */
export function centerWindowOnMonitor(
	monitor: Monitor,
	windowWidth: number,
	windowHeight: number
): { x: number; y: number } {
	// Use logical pixels (Tauri handles DPI scaling automatically)
	const scaledWidth = monitor.size.width / monitor.scaleFactor;
	const scaledHeight = monitor.size.height / monitor.scaleFactor;
	const scaledX = monitor.position.x / monitor.scaleFactor;
	const scaledY = monitor.position.y / monitor.scaleFactor;

	return {
		x: Math.floor(scaledX + (scaledWidth - windowWidth) / 2),
		y: Math.floor(scaledY + (scaledHeight - windowHeight) / 2)
	};
}

/**
 * Validate that a saved position is still valid (on-screen)
 * Returns true if valid, false if the position is off-screen
 */
export async function validatePosition(
	x: number,
	y: number,
	width: number,
	height: number
): Promise<boolean> {
	const monitors = await getAllMonitors();

	// Check if the window is at least partially visible on any monitor
	return monitors.some((monitor) => isPositionOnMonitor(x, y, monitor, width, height));
}

/**
 * Get the current window position and size in logical coordinates
 * This is important because we need to save/restore using the same coordinate system
 */
export async function getCurrentWindowBounds() {
	const window = getCurrentWindow();
	const physicalPosition = await window.outerPosition();
	const physicalSize = await window.outerSize();
	const scaleFactor = await window.scaleFactor();

	// Convert physical pixels to logical pixels
	return {
		x: Math.round(physicalPosition.x / scaleFactor),
		y: Math.round(physicalPosition.y / scaleFactor),
		width: Math.round(physicalSize.width / scaleFactor),
		height: Math.round(physicalSize.height / scaleFactor)
	};
}

/**
 * Move window to a specific position using logical coordinates
 */
export async function moveWindowTo(x: number, y: number): Promise<void> {
	const window = getCurrentWindow();
	await window.setPosition(new LogicalPosition(x, y));
}

/**
 * Resize window to specific dimensions using logical coordinates
 */
export async function resizeWindowTo(width: number, height: number): Promise<void> {
	const window = getCurrentWindow();
	await window.setSize(new LogicalSize(width, height));
}

/**
 * Get the next monitor in the list (for cycling through monitors)
 */
export async function getNextMonitor(): Promise<Monitor | null> {
	const monitors = await getAllMonitors();
	if (monitors.length <= 1) {
		return null; // No other monitors available
	}

	const current = await getCurrentMonitorInfo();
	if (!current) {
		// If we can't detect current monitor, return the first one
		return monitors[0] ?? null;
	}

	// Find current monitor index
	const currentIndex = monitors.findIndex((m) => m.name === current.name);
	if (currentIndex === -1) {
		// Current monitor not found in list, return first monitor
		return monitors[0] ?? null;
	}

	// Get next monitor (wrap around to 0 if at the end)
	const nextIndex = (currentIndex + 1) % monitors.length;
	return monitors[nextIndex] ?? null;
}
