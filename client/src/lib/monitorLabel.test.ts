import { describe, expect, it } from 'vitest';
import { monitorOptionLabel } from './monitorLabel';

describe('monitorOptionLabel', () => {
	it('appends the friendly name after the device tag (and the primary marker) when known', () => {
		expect(
			monitorOptionLabel({
				device: 'DISPLAY1',
				friendly: 'Dell U2720Q',
				isPrimary: true,
				w: 2560,
				h: 1440,
				x: 0,
				y: 0
			})
		).toBe('DISPLAY1 — Dell U2720Q (primary) · 2560×1440 @ 0,0');
	});

	it('falls back to the device tag alone when the friendly name is unknown', () => {
		expect(
			monitorOptionLabel({
				device: 'DISPLAY2',
				friendly: '',
				isPrimary: false,
				w: 1920,
				h: 1080,
				x: 2560,
				y: 0
			})
		).toBe('DISPLAY2 · 1920×1080 @ 2560,0');
	});
});
