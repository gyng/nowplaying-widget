import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { AssistantView } from './Assistant';

describe('AssistantView', () => {
	it('renders the generated text + label', () => {
		const { getByText } = render(<AssistantView text="All quiet — CPU at 12%." label="AI" />);
		expect(getByText('All quiet — CPU at 12%.')).toBeTruthy();
		expect(getByText('AI')).toBeTruthy();
	});

	it('shows a waiting placeholder when empty, and a thinking state when busy', () => {
		const { getByText, rerender } = render(<AssistantView text="" />);
		expect(getByText(/Waiting for the AI/)).toBeTruthy();
		rerender(<AssistantView text="" busy />);
		expect(getByText(/Thinking/)).toBeTruthy();
	});

	it('shows an error', () => {
		const { getByText } = render(<AssistantView error="no API key" />);
		expect(getByText(/no API key/)).toBeTruthy();
	});

	it('fires onRefresh when the refresh control is clicked', () => {
		const onRefresh = vi.fn();
		const { getByLabelText } = render(<AssistantView text="hi" onRefresh={onRefresh} />);
		fireEvent.click(getByLabelText('Generate now'));
		expect(onRefresh).toHaveBeenCalledOnce();
	});

	it('omits the refresh control when no handler is given', () => {
		const { queryByLabelText } = render(<AssistantView text="hi" />);
		expect(queryByLabelText('Generate now')).toBeNull();
	});
});
