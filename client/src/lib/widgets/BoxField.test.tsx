import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import BoxField from './BoxField';

describe('BoxField', () => {
	it('locked by default: one input; typing emits a uniform number', () => {
		const onChange = vi.fn();
		const { getByLabelText, queryByLabelText } = render(
			<BoxField label="margin" max={100} onChange={onChange} />
		);
		expect(queryByLabelText('margin top')).toBeNull(); // no per-side inputs while locked
		fireEvent.input(getByLabelText('margin all sides'), { target: { value: '8' } });
		expect(onChange).toHaveBeenCalledWith(8);
	});

	it('all sides 0 clears the value (undefined)', () => {
		const onChange = vi.fn();
		const { getByLabelText } = render(
			<BoxField label="pad" max={100} value={5} onChange={onChange} />
		);
		fireEvent.input(getByLabelText('pad all sides'), { target: { value: '0' } });
		expect(onChange).toHaveBeenCalledWith(undefined);
	});

	it('unlock → four side inputs; editing one emits a per-side object', () => {
		const onChange = vi.fn();
		const { getByLabelText } = render(
			<BoxField label="margin" max={100} value={4} onChange={onChange} />
		);
		fireEvent.click(getByLabelText('margin locked'));
		fireEvent.input(getByLabelText('margin top'), { target: { value: '10' } });
		expect(onChange).toHaveBeenCalledWith({ t: 10, r: 4, b: 4, l: 4 });
	});

	it('a non-uniform value shows four inputs even with the lock intent on', () => {
		const { getByLabelText, queryByLabelText } = render(
			<BoxField label="margin" max={100} value={{ t: 1, r: 2, b: 3, l: 4 }} onChange={vi.fn()} />
		);
		expect(queryByLabelText('margin all sides')).toBeNull();
		expect(getByLabelText('margin top')).toBeTruthy();
		expect(getByLabelText('margin per-side')).toBeTruthy(); // lock control reads as per-side
	});

	it('clamps each side to max', () => {
		const onChange = vi.fn();
		const { getByLabelText } = render(<BoxField label="pad" max={20} onChange={onChange} />);
		fireEvent.input(getByLabelText('pad all sides'), { target: { value: '999' } });
		expect(onChange).toHaveBeenCalledWith(20);
	});
});
