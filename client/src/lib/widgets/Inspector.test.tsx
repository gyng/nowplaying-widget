import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import Inspector from './Inspector';
import { container, type WidgetInstance } from '../core/layoutTree';
import type { LayoutOp } from './ops';

const flowWidget: WidgetInstance = {
	id: 'w1',
	type: 'clock',
	rect: { x: 0, y: 0, w: 160, h: 40 },
	config: {}
};

describe('Inspector pad/gap guardrail', () => {
	it('clamps an over-large pad to the selected container box', () => {
		const onOp = vi.fn<(op: LayoutOp) => void>();
		const c = container('root', 'col', [], { align: 'stretch' });
		const { getByLabelText } = render(
			<Inspector container={c} containerBox={{ x: 0, y: 0, w: 166, h: 98 }} onOp={onOp} />
		);
		// pad 111 on a 166×98 box would collapse the content; the guardrail caps it at 24 (¼ of 98).
		fireEvent.input(getByLabelText('pad'), { target: { value: '111' } });
		expect(onOp).toHaveBeenCalledWith({ op: 'patchContainer', id: 'root', patch: { pad: 24 } });
	});

	it('passes a within-range pad through unchanged', () => {
		const onOp = vi.fn<(op: LayoutOp) => void>();
		const c = container('root', 'col', [], { align: 'stretch' });
		const { getByLabelText } = render(
			<Inspector container={c} containerBox={{ x: 0, y: 0, w: 166, h: 98 }} onOp={onOp} />
		);
		fireEvent.input(getByLabelText('pad'), { target: { value: '8' } });
		expect(onOp).toHaveBeenCalledWith({ op: 'patchContainer', id: 'root', patch: { pad: 8 } });
	});
});

describe('Inspector flow-widget sizing (fixed / content / grow)', () => {
	it('reflects an fr basis as "grow" and emits cleared basis for "fixed"', () => {
		const onOp = vi.fn<(op: LayoutOp) => void>();
		const { getByLabelText } = render(
			<Inspector widget={flowWidget} placement="flow" widgetBasis={{ fr: 1 }} onOp={onOp} />
		);
		const select = getByLabelText(/size along the row/i) as HTMLSelectElement;
		expect(select.value).toBe('grow');
		fireEvent.change(select, { target: { value: 'fixed' } });
		expect(onOp).toHaveBeenCalledWith({ op: 'setBasis', id: 'w1', basis: undefined });
	});

	it('defaults to "fixed" with no basis, and emits an fr basis for "grow"', () => {
		const onOp = vi.fn<(op: LayoutOp) => void>();
		const { getByLabelText } = render(
			<Inspector widget={flowWidget} placement="flow" onOp={onOp} />
		);
		const select = getByLabelText(/size along the row/i) as HTMLSelectElement;
		expect(select.value).toBe('fixed');
		fireEvent.change(select, { target: { value: 'grow' } });
		expect(onOp).toHaveBeenCalledWith({ op: 'setBasis', id: 'w1', basis: { fr: 1 } });
	});

	it('emits the measured-content basis for "fit to content"', () => {
		const onOp = vi.fn<(op: LayoutOp) => void>();
		const { getByLabelText } = render(
			<Inspector widget={flowWidget} placement="flow" widgetBasis="content" onOp={onOp} />
		);
		const select = getByLabelText(/size along the row/i) as HTMLSelectElement;
		expect(select.value).toBe('content');
		fireEvent.change(select, { target: { value: 'content' } });
		expect(onOp).toHaveBeenCalledWith({ op: 'setBasis', id: 'w1', basis: 'content' });
	});

	it('hides the sizing control for a floating widget (no row to size within)', () => {
		const onOp = vi.fn<(op: LayoutOp) => void>();
		const { queryByLabelText } = render(
			<Inspector widget={flowWidget} placement="floating" onOp={onOp} />
		);
		expect(queryByLabelText(/size along the row/i)).toBeNull();
	});
});

describe('Inspector sensor dropdown labels', () => {
	it('labels options with the friendly name (+ unit) while keeping the raw id as the value', () => {
		const { container } = render(
			<Inspector
				widget={flowWidget}
				placement="floating"
				sensors={['ha.sensor.temp', 'cpu.total']}
				sensorMeta={{ 'ha.sensor.temp': { label: 'Temp', unit: '°C' } }}
			/>
		);
		const opts = container.querySelectorAll('#sensor-list option');
		const temp = Array.from(opts).find((o) => (o as HTMLOptionElement).value === 'ha.sensor.temp');
		expect(temp?.getAttribute('label')).toBe('Temp (°C)');
		// An id without metadata gets no synthetic label (just the bare value).
		const cpu = Array.from(opts).find((o) => (o as HTMLOptionElement).value === 'cpu.total');
		expect(cpu?.getAttribute('label')).toBeNull();
	});
});
