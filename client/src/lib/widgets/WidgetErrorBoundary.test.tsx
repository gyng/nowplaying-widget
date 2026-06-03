import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import WidgetErrorBoundary from './WidgetErrorBoundary';

// A child that throws during render (what an error boundary catches) when `explode` is set.
function Boom({ explode, text }: { explode: boolean; text?: string }) {
	if (explode) throw new Error('kaboom');
	return <div>{text ?? 'ok'}</div>;
}

describe('WidgetErrorBoundary', () => {
	beforeEach(() => {
		// React logs every caught render error to console.error; silence it + our warn for clean output.
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});
	afterEach(() => vi.restoreAllMocks());

	it('renders children when they do not throw', () => {
		const { getByText } = render(
			<WidgetErrorBoundary label="clock">
				<Boom explode={false} text="hello" />
			</WidgetErrorBoundary>
		);
		expect(() => getByText('hello')).not.toThrow();
	});

	it('renders a labelled fallback when a child throws, and warns once', () => {
		const { getByText } = render(
			<WidgetErrorBoundary label="clock" resetKey="a">
				<Boom explode={true} />
			</WidgetErrorBoundary>
		);
		expect(() => getByText(/clock/)).not.toThrow();
		expect(console.warn).toHaveBeenCalledTimes(1);
	});

	it('clears the error and re-renders children when resetKey changes', () => {
		const { rerender, getByText, queryByText } = render(
			<WidgetErrorBoundary label="clock" resetKey="a">
				<Boom explode={true} />
			</WidgetErrorBoundary>
		);
		expect(() => getByText(/clock/)).not.toThrow(); // fallback shown
		rerender(
			<WidgetErrorBoundary label="clock" resetKey="b">
				<Boom explode={false} text="recovered" />
			</WidgetErrorBoundary>
		);
		expect(() => getByText('recovered')).not.toThrow();
		expect(queryByText(/clock/)).toBeNull(); // fallback gone
	});

	it('stays on the fallback when resetKey is unchanged', () => {
		const { rerender, getByText, queryByText } = render(
			<WidgetErrorBoundary label="clock" resetKey="a">
				<Boom explode={true} />
			</WidgetErrorBoundary>
		);
		rerender(
			<WidgetErrorBoundary label="clock" resetKey="a">
				<Boom explode={false} text="should-not-show" />
			</WidgetErrorBoundary>
		);
		// Same resetKey → no retry → fallback persists even though children would now render fine.
		expect(() => getByText(/clock/)).not.toThrow();
		expect(queryByText('should-not-show')).toBeNull();
	});
});
