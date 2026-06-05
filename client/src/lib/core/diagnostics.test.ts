import { describe, expect, it } from 'vitest';
import {
	aggregateWidgets,
	heapFromMemory,
	heapUsedFraction,
	mergeReport,
	pruneStale,
	roleFromLabel,
	type WindowDiag
} from './diagnostics';

const diag = (label: string, at: number, over: Partial<WindowDiag> = {}): WindowDiag => ({
	label,
	role: roleFromLabel(label),
	monitor: null,
	heap: null,
	sessions: 0,
	artBytes: 0,
	sensors: 0,
	activeSensors: 0,
	domNodes: 0,
	widgets: [],
	at,
	...over
});

describe('heapFromMemory', () => {
	it('maps a Chromium performance.memory into bytes', () => {
		const h = heapFromMemory({ usedJSHeapSize: 10, totalJSHeapSize: 20, jsHeapSizeLimit: 100 });
		expect(h).toEqual({ usedBytes: 10, totalBytes: 20, limitBytes: 100 });
	});

	it('returns null when memory is missing or malformed', () => {
		expect(heapFromMemory(undefined)).toBeNull();
		expect(heapFromMemory(null)).toBeNull();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect(heapFromMemory({} as any)).toBeNull();
	});
});

describe('heapUsedFraction', () => {
	it('is used/limit, clamped to 0..1', () => {
		expect(heapUsedFraction({ usedBytes: 50, totalBytes: 60, limitBytes: 100 })).toBe(0.5);
		expect(heapUsedFraction({ usedBytes: 200, totalBytes: 200, limitBytes: 100 })).toBe(1);
	});

	it('is null without heap stats or a positive limit', () => {
		expect(heapUsedFraction(null)).toBeNull();
		expect(heapUsedFraction({ usedBytes: 1, totalBytes: 1, limitBytes: 0 })).toBeNull();
	});
});

describe('mergeReport', () => {
	it('upserts by label, newest wins, without mutating the input', () => {
		const a = { 'overlay-2': diag('overlay-2', 1, { sessions: 1 }) };
		const b = mergeReport(a, diag('overlay-2', 2, { sessions: 5 }));
		expect(b['overlay-2'].sessions).toBe(5);
		expect(a['overlay-2'].sessions).toBe(1); // original untouched
		const c = mergeReport(b, diag('studio', 3));
		expect(Object.keys(c).sort()).toEqual(['overlay-2', 'studio']);
	});
});

describe('pruneStale', () => {
	it('drops reports older than maxAge relative to the newest seen', () => {
		const reports = {
			fresh: diag('fresh', 1000),
			stale: diag('stale', 100)
		};
		const kept = pruneStale(reports, 1000, 500);
		expect(Object.keys(kept)).toEqual(['fresh']);
	});

	it('is a no-op when maxAge <= 0', () => {
		const reports = { a: diag('a', 100) };
		expect(pruneStale(reports, 9999, 0)).toBe(reports);
	});
});

describe('aggregateWidgets', () => {
	it('groups by type, sums counts + nodes, and sorts by nodes desc', () => {
		const out = aggregateWidgets([
			{ type: 'sparkline', nodes: 5 },
			{ type: 'nowplaying', nodes: 40 },
			{ type: 'sparkline', nodes: 7 }
		]);
		expect(out).toEqual([
			{ type: 'nowplaying', count: 1, nodes: 40 },
			{ type: 'sparkline', count: 2, nodes: 12 }
		]);
	});

	it('breaks node ties by type name for a stable order', () => {
		const out = aggregateWidgets([
			{ type: 'clock', nodes: 3 },
			{ type: 'button', nodes: 3 }
		]);
		expect(out.map((w) => w.type)).toEqual(['button', 'clock']);
	});

	it('is empty for no widgets', () => {
		expect(aggregateWidgets([])).toEqual([]);
	});
});

describe('roleFromLabel', () => {
	it('classifies studio / main / overlay', () => {
		expect(roleFromLabel('studio')).toBe('studio');
		expect(roleFromLabel('main')).toBe('main');
		expect(roleFromLabel('overlay-2')).toBe('overlay');
	});
});
