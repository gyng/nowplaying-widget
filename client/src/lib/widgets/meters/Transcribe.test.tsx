import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TranscribeView } from './Transcribe';

describe('TranscribeView', () => {
	it('shows the placeholder, then the output', () => {
		const { getByText, rerender } = render(<TranscribeView />);
		expect(getByText(/Click the mic and speak/)).toBeTruthy();
		rerender(<TranscribeView output="hola mundo" />);
		expect(getByText('hola mundo')).toBeTruthy();
	});

	it('shows a listening state while recording and transcribing while busy', () => {
		const { getByText, rerender } = render(<TranscribeView recording />);
		expect(getByText(/Listening/)).toBeTruthy();
		rerender(<TranscribeView busy />);
		expect(getByText(/Transcribing/)).toBeTruthy();
	});

	it('shows the source transcript faintly in translate mode', () => {
		const { getByText } = render(
			<TranscribeView mode="translate" source="hello world" output="hola mundo" />
		);
		expect(getByText('hola mundo')).toBeTruthy();
		expect(getByText('hello world')).toBeTruthy();
	});

	it('toggles the mic and shows recording state', () => {
		const onToggle = vi.fn();
		const { getByLabelText, rerender } = render(<TranscribeView onToggle={onToggle} />);
		fireEvent.click(getByLabelText('Record'));
		expect(onToggle).toHaveBeenCalledOnce();
		rerender(<TranscribeView recording onToggle={onToggle} />);
		expect(getByLabelText('Stop and transcribe')).toBeTruthy();
	});

	it('shows an error', () => {
		const { getByText } = render(<TranscribeView error="no API key" />);
		expect(getByText(/no API key/)).toBeTruthy();
	});
});
