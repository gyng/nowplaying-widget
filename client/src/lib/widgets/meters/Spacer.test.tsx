import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import Spacer from './Spacer';

describe('Spacer', () => {
	it('renders nothing on the live overlay (not editing)', () => {
		const { container } = render(<Spacer />);
		expect(container.firstChild).toBeNull();
	});

	it('shows a labelled, dashed affordance while editing', () => {
		const { getByText, container } = render(<Spacer editMode />);
		expect(() => getByText(/spacer/i)).not.toThrow();
		expect(container.querySelector('.spacer-widget')).not.toBeNull();
	});
});
