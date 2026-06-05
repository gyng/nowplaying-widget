import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ColorField from './ColorField';

describe('ColorField', () => {
	it('shows the value in the text field and mirrors it in the swatch', () => {
		render(<ColorField value="rgb(119, 196, 211)" ariaLabel="accent" onChange={vi.fn()} />);
		const text = screen.getByLabelText('accent') as HTMLInputElement;
		const swatch = screen.getByLabelText('accent swatch') as HTMLInputElement;
		expect(text.value).toBe('rgb(119, 196, 211)');
		expect(swatch.value).toBe('#77c4d3');
	});

	it('falls back to the placeholder colour in the swatch when empty', () => {
		render(<ColorField value="" placeholder="#3fb950" ariaLabel="success" onChange={vi.fn()} />);
		expect((screen.getByLabelText('success swatch') as HTMLInputElement).value).toBe('#3fb950');
	});

	it('commits the typed value on blur, not per keystroke', () => {
		const onChange = vi.fn();
		render(<ColorField value="" ariaLabel="accent" onChange={onChange} />);
		const text = screen.getByLabelText('accent');
		fireEvent.change(text, { target: { value: 'gold' } });
		expect(onChange).not.toHaveBeenCalled();
		fireEvent.blur(text);
		expect(onChange).toHaveBeenCalledWith('gold');
	});

	it('commits immediately when the swatch changes', () => {
		const onChange = vi.fn();
		render(<ColorField value="" ariaLabel="accent" onChange={onChange} />);
		fireEvent.change(screen.getByLabelText('accent swatch'), { target: { value: '#112233' } });
		expect(onChange).toHaveBeenCalledWith('#112233');
	});

	it('clears the override', () => {
		const onChange = vi.fn();
		render(<ColorField value="gold" ariaLabel="accent" onChange={onChange} />);
		fireEvent.click(screen.getByLabelText('clear'));
		expect(onChange).toHaveBeenCalledWith('');
	});
});
