import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import ThemePreview from './ThemePreview';

describe('ThemePreview', () => {
	it('renders representative meters in cells', () => {
		const { container, getByText } = render(<ThemePreview />);
		// one cell per seeded widget
		expect(container.querySelectorAll('.tp-cell').length).toBe(6);
		// the button meter renders its label — a stable, non-time-dependent assertion
		expect(getByText('tap')).toBeTruthy();
	});
});
