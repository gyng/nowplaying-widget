import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TimerView } from './Timer';

describe('TimerView', () => {
	it('renders the time and label', () => {
		const { getByText } = render(<TimerView time="05:00" label="Pomodoro" />);
		expect(getByText('05:00')).toBeTruthy();
		expect(getByText('Pomodoro')).toBeTruthy();
	});

	it('shows a start control when stopped and a pause control when running', () => {
		const noop = () => undefined;
		const { getByLabelText, rerender } = render(<TimerView time="05:00" onToggle={noop} />);
		expect(getByLabelText('Start')).toBeTruthy();
		rerender(<TimerView time="04:59" running onToggle={noop} />);
		expect(getByLabelText('Pause')).toBeTruthy();
	});

	it('fires onToggle and onReset', () => {
		const onToggle = vi.fn();
		const onReset = vi.fn();
		const { getByLabelText } = render(
			<TimerView time="00:00" onToggle={onToggle} onReset={onReset} />
		);
		fireEvent.click(getByLabelText('Start'));
		fireEvent.click(getByLabelText('Reset'));
		expect(onToggle).toHaveBeenCalledOnce();
		expect(onReset).toHaveBeenCalledOnce();
	});

	it('marks the done state', () => {
		const { container } = render(<TimerView time="00:00" done />);
		expect(container.querySelector('.timer.is-done')).toBeTruthy();
	});
});
