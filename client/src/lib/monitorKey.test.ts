import { describe, expect, it } from 'vitest';
import { monitorByKey, monitorDeviceKey } from './monitorKey';

describe('monitorDeviceKey', () => {
	it('strips the GDI prefix to the bare device tag', () => {
		expect(monitorDeviceKey('\\\\.\\DISPLAY3', 1)).toBe('DISPLAY3');
	});

	it('falls back to a position-independent m<i> when the platform gives no name', () => {
		expect(monitorDeviceKey(null, 2)).toBe('m2');
		expect(monitorDeviceKey('', 0)).toBe('m0');
	});
});

describe('monitorByKey', () => {
	const monitors = [
		{ name: '\\\\.\\DISPLAY1' },
		{ name: '\\\\.\\DISPLAY3' },
		{ name: '\\\\.\\DISPLAY2' }
	];

	it('finds the monitor whose stable device key matches', () => {
		expect(monitorByKey(monitors, 'DISPLAY3')).toBe(monitors[1]);
	});

	it('returns null when no current monitor matches the key', () => {
		expect(monitorByKey(monitors, 'DISPLAY9')).toBeNull();
	});

	it('matches the m<i> fallback keys index-aware on platforms with no device names', () => {
		const unnamed = [{ name: null }, { name: null }];
		expect(monitorByKey(unnamed, 'm1')).toBe(unnamed[1]);
		expect(monitorByKey(unnamed, 'm2')).toBeNull();
	});
});
