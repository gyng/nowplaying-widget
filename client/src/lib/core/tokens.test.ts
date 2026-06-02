import { describe, expect, it } from 'vitest';
import { DEFAULT_TOKENS, TOKEN_NAMES, tokensToCss } from './tokens';

describe('tokens', () => {
	it('the default vocabulary covers the core themeable properties', () => {
		for (const name of ['--np-accent', '--np-fg', '--np-track', '--np-font-display']) {
			expect(TOKEN_NAMES).toContain(name);
		}
		expect(DEFAULT_TOKENS['--np-accent']).toBe('rgb(119, 196, 211)');
	});

	it('tokensToCss emits a :root rule by default', () => {
		const css = tokensToCss({ '--np-accent': 'red' });
		expect(css).toBe(':root {\n\t--np-accent: red;\n}');
	});

	it('tokensToCss honours a custom selector', () => {
		expect(tokensToCss({ '--np-fg': '#000' }, '.theme-light')).toBe(
			'.theme-light {\n\t--np-fg: #000;\n}'
		);
	});

	it('the default tokens round-trip into a parseable :root block', () => {
		const css = tokensToCss(DEFAULT_TOKENS);
		expect(css.startsWith(':root {')).toBe(true);
		expect(css).toContain('--np-font-display:');
	});
});
