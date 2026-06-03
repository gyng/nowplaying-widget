import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import Inspector from './Inspector';
import { container } from '../core/layoutTree';
import type { LayoutOp } from './ops';

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
