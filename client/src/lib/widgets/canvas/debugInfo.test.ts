import { describe, it, expect } from 'vitest';
import { buildDebugInfo } from './debugInfo';
import { container, type MonitorLayout } from '../../core/layoutTree';
import type { Solved } from '../../core/solve';

describe('buildDebugInfo', () => {
	function clockDef(pad: number): MonitorLayout {
		const root = container(
			'root',
			'col',
			[
				container('cell-a', 'col', [], { align: 'stretch', basis: { fr: 1 } }),
				container('cell-b', 'col', [], { align: 'stretch', basis: { fr: 1 } })
			],
			{ pad, gap: 15, align: 'stretch', basis: { fr: 1 } }
		);
		return { root, floating: [] };
	}

	// Hand-built measured boxes for the clockDef tree over a 166×98 canvas (replaces the old
	// solveMonitor call): pad 111 collapses the content to zero so both fr cells are zero-size;
	// pad 8 leaves a 150×82 content that the two fr:1 cells split (minus the 15px gap) ~33.5 high.
	function solvedFor(pad: number): Solved {
		if (pad === 111) {
			return new Map([
				['root', { x: 0, y: 0, w: 166, h: 98 }],
				['cell-a', { x: 111, y: 98, w: 0, h: 0 }],
				['cell-b', { x: 111, y: 98, w: 0, h: 0 }]
			]);
		}
		return new Map([
			['root', { x: 0, y: 0, w: 166, h: 98 }],
			['cell-a', { x: 8, y: 8, w: 150, h: 33.5 }],
			['cell-b', { x: 8, y: 56.5, w: 150, h: 33.5 }]
		]);
	}

	const argsFor = (mon: MonitorLayout, pad: number, workArea = { x: 0, y: 0, w: 166, h: 98 }) => ({
		designing: true,
		editingDef: { id: 'def-clock', name: 'Clock (JP weekday)', size: { w: 166, h: 98 } },
		monitorKey: 'default',
		workArea,
		stageSize: { w: 166, h: 98 },
		zoom: 2.73,
		panX: 10,
		panY: 20,
		monitor: mon,
		solved: solvedFor(pad),
		selectedId: 'cell-b',
		defs: [{ id: 'def-clock', name: 'Clock (JP weekday)', size: { w: 166, h: 98 } }]
	});

	it('flags collapsed (zero-size) panes from an over-padded canvas', () => {
		const out = buildDebugInfo(argsFor(clockDef(111), 111));
		expect(out).toContain('COLLAPSED');
		expect(out).toMatch(/issues \(2\)/); // both cells collapsed
		expect(out).toContain('"pad": 111'); // the over-large pad is captured in the tree dump
		expect(out).toContain('editing def: def-clock');
	});

	it('reports no issues for a sane pad where the cells fill the canvas', () => {
		const out = buildDebugInfo(argsFor(clockDef(8), 8));
		expect(out).toContain('issues: none detected');
		expect(out).not.toContain('COLLAPSED');
	});
});
