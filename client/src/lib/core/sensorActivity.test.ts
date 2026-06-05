import { describe, expect, it } from 'vitest';
import { collectSensorRefs, isAlwaysOnSensor, sensorActivity } from './sensorActivity';
import { container, leaf, type MonitorLayout } from './layoutTree';

const inst = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
	id,
	type,
	rect: { x: 0, y: 0, w: 10, h: 10 },
	config: {},
	...extra
});

describe('isAlwaysOnSensor (mirrors sensors.rs gating)', () => {
	it('cheap system sensors are always-on', () => {
		for (const id of [
			'cpu.total',
			'cpu.core.5',
			'mem.used',
			'mem.total',
			'swap.used',
			'net.down',
			'host.uptime',
			'host.idle',
			'battery.percent'
		]) {
			expect(isAlwaysOnSensor(id)).toBe(true);
		}
	});

	it('demand-gated system sensors are NOT always-on', () => {
		for (const id of [
			'gpu.util',
			'gpu.temp',
			'cpu.freq',
			'cpu.freq.current',
			'cpu.core.3.freq',
			'mem.commit.used',
			'mem.cached',
			'host.procs',
			'host.handles',
			'disk.c.total',
			'disk.c.read',
			'net.linkspeed.rx',
			'net.adapter',
			'proc.cpu.top.pct'
		]) {
			expect(isAlwaysOnSensor(id)).toBe(false);
		}
	});

	it('plugin sensors are not classified as always-on (survive close only if referenced)', () => {
		expect(isAlwaysOnSensor('ha.light.kitchen')).toBe(false);
		expect(isAlwaysOnSensor('stock.AAPL.price')).toBe(false);
	});
});

describe('collectSensorRefs', () => {
	const layout: MonitorLayout = {
		root: container('root', 'col', [
			leaf(inst('g', 'gauge', { sensor: 'gpu.util' })),
			leaf(inst('t', 'text', { config: { value: '{bytes(mem.used.bytes)} · {gpu.temp}°' } }))
		]),
		floating: []
	};
	const refs = collectSensorRefs([{ key: 'default', layout }]);

	it('records a bound sensor with its widget', () => {
		expect(refs.get('gpu.util')).toMatchObject([
			{ widgetType: 'gauge', widgetId: 'g', monitorKey: 'default', via: 'bound' }
		]);
	});

	it('records formula/template references', () => {
		expect(refs.get('mem.used.bytes')?.[0]).toMatchObject({ widgetType: 'text', via: 'formula' });
		expect(refs.get('gpu.temp')?.[0].via).toBe('formula');
	});
});

describe('sensorActivity', () => {
	it('referenced → active + names the widgets (the why)', () => {
		const a = sensorActivity('gpu.util', [
			{ widgetType: 'gauge', widgetId: 'g', monitorKey: 'default', via: 'bound' }
		]);
		expect(a).toMatchObject({ active: true, referenced: true });
		expect(a.reason).toContain('gauge');
	});

	it('unreferenced cheap sensor → still active (always sampled)', () => {
		expect(sensorActivity('cpu.total', undefined)).toMatchObject({
			active: true,
			referenced: false
		});
	});

	it('unreferenced gated/plugin sensor → stops on close', () => {
		expect(sensorActivity('gpu.temp', undefined).active).toBe(false);
		expect(sensorActivity('ha.light.x', undefined).active).toBe(false);
	});
});
