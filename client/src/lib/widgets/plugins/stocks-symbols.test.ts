import { describe, expect, it } from 'vitest';
import { parseSymbols } from './stocks-symbols';

describe('parseSymbols', () => {
	it('splits on newlines and commas, trims, upper-cases', () => {
		expect(parseSymbols('aapl, msft\n btc-usd ')).toEqual(['AAPL', 'MSFT', 'BTC-USD']);
	});

	it('drops blanks and de-duplicates (case-insensitively)', () => {
		expect(parseSymbols('AAPL\n\naapl,,SPY')).toEqual(['AAPL', 'SPY']);
	});

	it('returns [] for an empty box', () => {
		expect(parseSymbols('   \n , ')).toEqual([]);
	});
});
