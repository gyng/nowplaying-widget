import { describe, expect, it, beforeEach } from 'vitest';
import { readStudioMonitor, writeStudioMonitor } from './studioMonitorPref';

describe('studio monitor pref (sticky across reloads)', () => {
	beforeEach(() => localStorage.clear());

	it('returns null when nothing has been saved', () => {
		expect(readStudioMonitor()).toBeNull();
	});

	it('round-trips the saved monitor key', () => {
		writeStudioMonitor('2');
		expect(readStudioMonitor()).toBe('2');
	});

	it('the latest write wins (a later choice overwrites the earlier one)', () => {
		writeStudioMonitor('1');
		writeStudioMonitor('default');
		expect(readStudioMonitor()).toBe('default');
	});
});
