// The Stocks plugin: a server-side Yahoo Finance quotes source (widgetsack/src/stocks.rs), a settings
// panel, and a bespoke Ticker widget. Importing this module (Canvas side-effect-imports it) registers
// the source + the settings panel + the `ticker` widget type. Quotes also bind as `stocks.<SYMBOL>.*`
// sensors on the built-in Text / Gauge / Sparkline meters.

import { registerPlugin } from '../plugin';
import { stocksSource } from './stocks-source';
import StocksSettings from './StocksSettings';
import Ticker from '../meters/Ticker';
import type { MeterComponent } from '../registry';

registerPlugin({
	id: 'stocks',
	name: 'Stocks',
	description:
		'Live stock / crypto quotes via Yahoo Finance (keyless). Add tickers in this panel, then bind stocks.<SYMBOL>.* sensors or drop a Stock Ticker widget.',
	sources: [stocksSource],
	settings: StocksSettings,
	widgets: [
		{
			meta: {
				// Self-sourcing ticker: reads stocks.<symbol>.* from the hub internally (binds:none).
				type: 'ticker',
				binds: 'none',
				label: 'Stock Ticker',
				defaultSize: { w: 180, h: 110 },
				defaultConfig: {
					// Ship a working symbol out of the box: a freshly-dropped ticker shows a live quote
					// immediately (the poller auto-fetches whatever symbol a ticker demands — see
					// widgetsack/src/stocks.rs), instead of the "Set a symbol" placeholder.
					symbol: 'NVDA',
					label: '',
					decimals: 2,
					showSparkline: true,
					invertColors: false
				},
				configFields: [
					{
						key: 'symbol',
						label: 'symbol',
						kind: 'text',
						help: 'e.g. AAPL, SPY, BTC-USD — must be in the Stocks plugin’s symbol list'
					},
					{
						key: 'label',
						label: 'label',
						kind: 'text',
						help: 'header text (defaults to the symbol)'
					},
					{ key: 'decimals', label: 'decimals', kind: 'number', help: 'price decimal places' },
					{
						key: 'showSparkline',
						label: 'sparkline',
						kind: 'toggle',
						help: 'show the intraday mini-chart'
					},
					{
						key: 'invertColors',
						label: 'invert up/down colours',
						kind: 'toggle',
						help: 'red = up, green = down (East-Asian-market convention)'
					}
				]
			},
			component: Ticker as unknown as MeterComponent
		}
	]
});
