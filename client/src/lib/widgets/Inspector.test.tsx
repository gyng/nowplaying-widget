import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Inspector from './Inspector';
import { container, leaf, type WidgetInstance } from '../core/layoutTree';
import type { LayoutOp } from './ops';

const flowWidget: WidgetInstance = {
	id: 'w1',
	type: 'clock',
	rect: { x: 0, y: 0, w: 160, h: 40 },
	config: {}
};

describe('Inspector Data tab (JSON/YAML representation)', () => {
	it('applies an edited JSON node via replaceNode, coercing the id back to the slot', () => {
		const onOp = vi.fn<(op: LayoutOp) => void>();
		const node = leaf(flowWidget); // { id: 'w1', unit: flowWidget }
		const { getByText, getByLabelText } = render(
			<Inspector widget={flowWidget} placement="floating" node={node} onOp={onOp} />
		);
		fireEvent.click(getByText('Data'));
		const area = getByLabelText('Node JSON') as HTMLTextAreaElement;
		const edited = JSON.stringify(
			{ ...node, id: 'CHANGED', unit: { ...flowWidget, config: { format: 'HH:mm' } } },
			null,
			2
		);
		fireEvent.change(area, { target: { value: edited } });
		fireEvent.click(getByText('Apply'));
		const call = onOp.mock.calls.map((c) => c[0]).find((o) => o.op === 'replaceNode');
		expect(call).toBeTruthy();
		expect(call && call.op === 'replaceNode' && call.id).toBe('w1');
		// id is coerced back to the slot id even though the edit changed it
		expect(call && call.op === 'replaceNode' && call.node.id).toBe('w1');
	});

	it('rejects invalid JSON without emitting replaceNode', () => {
		const onOp = vi.fn<(op: LayoutOp) => void>();
		const node = leaf(flowWidget);
		const { getByText, getByLabelText } = render(
			<Inspector widget={flowWidget} placement="floating" node={node} onOp={onOp} />
		);
		fireEvent.click(getByText('Data'));
		fireEvent.change(getByLabelText('Node JSON'), { target: { value: '{ not json' } });
		fireEvent.click(getByText('Apply'));
		expect(onOp.mock.calls.some((c) => c[0].op === 'replaceNode')).toBe(false);
	});

	it('shows a read-only YAML view and copies it via onCopy', () => {
		const onCopy = vi.fn<(t: string) => void>();
		const node = leaf(flowWidget);
		const { getByText, getByLabelText } = render(
			<Inspector widget={flowWidget} placement="floating" node={node} onCopy={onCopy} />
		);
		fireEvent.click(getByText('Data'));
		fireEvent.click(getByText('YAML'));
		const yaml = getByLabelText('Node YAML (read-only)') as HTMLTextAreaElement;
		expect(yaml.readOnly).toBe(true);
		expect(yaml.value).toContain('type: clock');
		fireEvent.click(getByText('⧉ Copy'));
		expect(onCopy).toHaveBeenCalledWith(expect.stringContaining('type: clock'));
	});
});

describe('Inspector pad/gap guardrail', () => {
	it('clamps an over-large pad to the selected container box', () => {
		const onOp = vi.fn<(op: LayoutOp) => void>();
		const c = container('root', 'col', [], { align: 'stretch' });
		const { getByLabelText } = render(
			<Inspector container={c} containerBox={{ x: 0, y: 0, w: 166, h: 98 }} onOp={onOp} />
		);
		// pad 111 on a 166×98 box would collapse the content; the guardrail caps it at 24 (¼ of 98).
		// The pad control is now a BoxField (locked → one "all sides" input that clamps each side).
		fireEvent.input(getByLabelText('pad all sides'), { target: { value: '111' } });
		expect(onOp).toHaveBeenCalledWith({ op: 'patchContainer', id: 'root', patch: { pad: 24 } });
	});

	it('passes a within-range pad through unchanged', () => {
		const onOp = vi.fn<(op: LayoutOp) => void>();
		const c = container('root', 'col', [], { align: 'stretch' });
		const { getByLabelText } = render(
			<Inspector container={c} containerBox={{ x: 0, y: 0, w: 166, h: 98 }} onOp={onOp} />
		);
		fireEvent.input(getByLabelText('pad all sides'), { target: { value: '8' } });
		expect(onOp).toHaveBeenCalledWith({ op: 'patchContainer', id: 'root', patch: { pad: 8 } });
	});
});

describe('Inspector flow-widget sizing (fixed / content / grow)', () => {
	// The sizing control is now the shared <Select> (a button + portaled menu), so we open it and click
	// the option rather than firing change on a native <select>.
	it('reflects an fr basis as "grow" and emits cleared basis for "fixed"', () => {
		const onOp = vi.fn<(op: LayoutOp) => void>();
		render(<Inspector widget={flowWidget} placement="flow" widgetBasis={{ fr: 1 }} onOp={onOp} />);
		const trigger = screen.getByLabelText(/size along the row/i);
		expect(trigger).toHaveTextContent(/grow/i);
		fireEvent.click(trigger);
		fireEvent.click(
			screen.getByText('fixed — use the w/h above', { selector: '.np-select-opt-label' })
		);
		expect(onOp).toHaveBeenCalledWith({ op: 'setBasis', id: 'w1', basis: undefined });
	});

	it('defaults to "fixed" with no basis, and emits an fr basis for "grow"', () => {
		const onOp = vi.fn<(op: LayoutOp) => void>();
		render(<Inspector widget={flowWidget} placement="flow" onOp={onOp} />);
		const trigger = screen.getByLabelText(/size along the row/i);
		expect(trigger).toHaveTextContent(/fixed/i);
		fireEvent.click(trigger);
		fireEvent.click(screen.getByText('fill — grow to share', { selector: '.np-select-opt-label' }));
		expect(onOp).toHaveBeenCalledWith({ op: 'setBasis', id: 'w1', basis: { fr: 1 } });
	});

	it('reflects "content" and emits the measured-content basis when picking "fit to content"', () => {
		const onOp = vi.fn<(op: LayoutOp) => void>();
		// content shows as "hug — fit to content"…
		const { rerender } = render(
			<Inspector widget={flowWidget} placement="flow" widgetBasis="content" onOp={onOp} />
		);
		expect(screen.getByLabelText(/size along the row/i)).toHaveTextContent(/hug/i);
		// …and picking it from a DIFFERENT current value emits the content basis (Downshift only fires on
		// an actual change, so we start from grow).
		rerender(
			<Inspector widget={flowWidget} placement="flow" widgetBasis={{ fr: 1 }} onOp={onOp} />
		);
		fireEvent.click(screen.getByLabelText(/size along the row/i));
		fireEvent.click(screen.getByText('hug — fit to content', { selector: '.np-select-opt-label' }));
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

describe('Inspector sensor typeahead options', () => {
	it('labels options with the friendly name (+ unit) and shows the raw id as a hint', () => {
		render(
			<Inspector
				widget={flowWidget}
				placement="floating"
				sensors={['ha.sensor.temp', 'cpu.total']}
				sensorMeta={{ 'ha.sensor.temp': { label: 'Temp', unit: '°C' } }}
				onOp={vi.fn()}
			/>
		);
		fireEvent.click(screen.getByLabelText('Toggle options')); // open the sensor combobox
		expect(screen.getByText('Temp (°C)')).toBeInTheDocument();
		expect(
			screen.getByText('ha.sensor.temp', { selector: '.np-select-opt-hint' })
		).toBeInTheDocument();
		// An id without metadata is its own label, with no separate hint.
		expect(screen.getByText('cpu.total', { selector: '.np-select-opt-label' })).toBeInTheDocument();
	});
});
