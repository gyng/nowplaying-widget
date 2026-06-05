import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import Button from './Button';

describe('Button (action button)', () => {
	it('renders its label', () => {
		const { getByText } = render(<Button label="Goodnight" />);
		expect(() => getByText('Goodnight')).not.toThrow();
	});

	it('emits a single macro ControlEvent carrying its actions on click', () => {
		const actions = [
			{ domain: 'light', service: 'turn_off', data: { entity_id: 'light.bed' } },
			{ domain: 'media', service: 'pause' }
		];
		let detail: unknown = null;
		const { getByRole } = render(
			<Button label="Goodnight" actions={actions} onControl={(e) => (detail = e)} />
		);
		fireEvent.click(getByRole('button'));
		expect(detail).toEqual({ domain: 'macro', service: 'run', data: { actions } });
	});

	it('drops malformed actions before emitting (normalizes config JSON)', () => {
		let detail: unknown = null;
		const { getByRole } = render(
			<Button
				actions={[{ domain: 'light', service: 'toggle' }, { domain: 'light' }, 'junk']}
				onControl={(e) => (detail = e)}
			/>
		);
		fireEvent.click(getByRole('button'));
		expect(detail).toEqual({
			domain: 'macro',
			service: 'run',
			data: { actions: [{ domain: 'light', service: 'toggle' }] }
		});
	});

	it('does not fire onControl when there are no (valid) actions', () => {
		let fired = false;
		const { getByRole } = render(<Button onControl={() => (fired = true)} />);
		fireEvent.click(getByRole('button'));
		expect(fired).toBe(false);
	});
});
