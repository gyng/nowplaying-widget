import { describe, it, expect } from 'vitest';
import { container, leaf, type WidgetInstance } from '../../core/layoutTree';
import { WINDOWS_SENSOR, type ConditionContext } from '../../core/condition';
import {
	collectConditions,
	conditionSensorRefs,
	hiddenContainerIds,
	windowsKey
} from './conditionVisibility';
import type { WindowDescriptor } from '../../core/windowMatch';

const w = (id: string) =>
	leaf({ id, type: 'gauge', rect: { x: 0, y: 0, w: 1, h: 1 }, config: {} } as WidgetInstance);

const win = (exe: string): WindowDescriptor => ({
	hwnd: 1,
	exe,
	className: 'C',
	title: 'T',
	rect: { x: 0, y: 0, w: 1, h: 1 }
});

describe('collectConditions', () => {
	it('finds conditions on nested containers, in order', () => {
		const root = container('root', 'col', [
			container('a', 'row', [w('w1')], { condition: { kind: 'appOpen', matchExe: 'spotify.exe' } }),
			container('b', 'col', [
				container('c', 'row', [], {
					condition: { kind: 'sensor', sensorId: 'cpu.total', op: '>', value: '80' }
				})
			])
		]);
		expect(collectConditions(root).map((c) => c.id)).toEqual(['a', 'c']);
	});
	it('ignores containers without a condition and leaves', () => {
		const root = container('root', 'col', [w('w1'), container('plain', 'row', [])]);
		expect(collectConditions(root)).toEqual([]);
	});
});

describe('conditionSensorRefs', () => {
	it('dedups the sensors all conditions depend on', () => {
		const conds = collectConditions(
			container('root', 'col', [
				container('a', 'row', [], { condition: { kind: 'appOpen', matchExe: 'a.exe' } }),
				container('b', 'row', [], { condition: { kind: 'appOpen', matchExe: 'b.exe' } }),
				container('c', 'row', [], {
					condition: { kind: 'sensor', sensorId: 'cpu.total', op: '>', value: '1' }
				})
			])
		);
		expect(conditionSensorRefs(conds).sort()).toEqual([WINDOWS_SENSOR, 'cpu.total'].sort());
	});
});

describe('hiddenContainerIds', () => {
	const conds = collectConditions(
		container('root', 'col', [
			container('spotify', 'row', [], { condition: { kind: 'appOpen', matchExe: 'spotify.exe' } }),
			container('busy', 'row', [], {
				condition: { kind: 'sensor', sensorId: 'cpu.total', op: '>', value: '80' }
			})
		])
	);
	it('hides the containers whose condition is unsatisfied', () => {
		const ctx: ConditionContext = {
			windows: [win('x/Code.exe')], // spotify NOT open
			sensorValue: (id) => (id === 'cpu.total' ? { kind: 'scalar', value: 50 } : null) // cpu low
		};
		expect([...hiddenContainerIds(conds, ctx)].sort()).toEqual(['busy', 'spotify']);
	});
	it('shows containers whose condition is satisfied', () => {
		const ctx: ConditionContext = {
			windows: [win('x/Spotify.exe')],
			sensorValue: () => ({ kind: 'scalar', value: 95 })
		};
		expect(hiddenContainerIds(conds, ctx).size).toBe(0);
	});
});

describe('windowsKey', () => {
	const d = (
		exe: string,
		className: string,
		title: string,
		rect = { x: 0, y: 0, w: 1, h: 1 },
		hwnd = 1
	): WindowDescriptor => ({ hwnd, exe, className, title, rect });
	it('is order-independent (z-order churn must not change it)', () => {
		const a = d('a.exe', 'A', 'one');
		const b = d('b.exe', 'B', 'two');
		expect(windowsKey([a, b])).toBe(windowsKey([b, a]));
	});
	it('ignores rect and hwnd (window moves / handle changes must not change it)', () => {
		expect(windowsKey([d('a.exe', 'A', 'one', { x: 0, y: 0, w: 1, h: 1 }, 11)])).toBe(
			windowsKey([d('a.exe', 'A', 'one', { x: 500, y: 300, w: 80, h: 60 }, 99)])
		);
	});
	it('changes when an app opens / closes or a title changes', () => {
		const base = windowsKey([d('a.exe', 'A', 'one')]);
		expect(windowsKey([d('a.exe', 'A', 'one'), d('b.exe', 'B', 'two')])).not.toBe(base);
		expect(windowsKey([d('a.exe', 'A', 'changed')])).not.toBe(base);
	});
});
