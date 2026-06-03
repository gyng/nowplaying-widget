import { describe, it, expect } from 'vitest';
import { buildDebugInfo } from './debugInfo';
import { container, type MonitorLayout } from '../../core/layoutTree';
import { solveMonitor } from '../../core/solve';

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

	const argsFor = (mon: MonitorLayout, workArea = { x: 0, y: 0, w: 166, h: 98 }) => ({
		designing: true,
		editingDef: { id: 'def-clock', name: 'Clock (JP weekday)', size: { w: 166, h: 98 } },
		monitorKey: 'default',
		workArea,
		stageSize: { w: 166, h: 98 },
		zoom: 2.73,
		panX: 10,
		panY: 20,
		monitor: mon,
		solved: solveMonitor(mon, workArea),
		selectedId: 'cell-b',
		defs: [{ id: 'def-clock', name: 'Clock (JP weekday)', size: { w: 166, h: 98 } }]
	});

	it('flags collapsed (zero-size) panes from an over-padded canvas', () => {
		const out = buildDebugInfo(argsFor(clockDef(111)));
		expect(out).toContain('COLLAPSED');
		expect(out).toMatch(/issues \(2\)/); // both cells collapsed
		expect(out).toContain('"pad": 111'); // the over-large pad is captured in the tree dump
		expect(out).toContain('editing def: def-clock');
	});

	it('reports no issues for a sane pad where the cells fill the canvas', () => {
		const out = buildDebugInfo(argsFor(clockDef(8)));
		expect(out).toContain('issues: none detected');
		expect(out).not.toContain('COLLAPSED');
	});
});
