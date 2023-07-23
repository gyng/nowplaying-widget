import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import ThemeInjector from './ThemeInjector.svelte';

describe('ThemeInjector', () => {
	it('injects HTML', () => {
		const { getByText } = render(ThemeInjector, { css: '', html: '<p>foo</p>' });
		expect(() => getByText(/foo/i)).not.toThrow();
	});

	it('injects CSS', () => {
		// Depends on "injects HTML" test to also pass
		const { getByText } = render(ThemeInjector, { css: 'p { display: none }', html: '<p>foo</p>' });
		expect(() => getByText(/foo/i)).toThrow();
	});
});
