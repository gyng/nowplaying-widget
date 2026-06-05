// Self-sourcing stock/crypto ticker (binds: 'none'): reads the `stocks.<SYMBOL>.*` sensors fed by the
// Rust stocks poller (plugins/stocks.ts → widgetsack/src/stocks.rs) straight from the telemetry hub,
// the way Cpu reads cpu.core.* — so it isn't a single bound sensor. Renders the symbol, last price,
// colour-coded change %, and an intraday sparkline (the real `.series`, falling back to the price
// history ring). Up/down colour flows from one `data-dir` on the root (the sparkline picks it up via
// currentColor), so the whole widget restyles from CSS.
import { useTelemetryHub } from '../telemetryContext';
import { useSensor } from '../useSensor';
import Sparkline from './Sparkline';
import {
	currencySymbol,
	direction,
	directionArrow,
	formatChangePct,
	formatPrice,
	marketLabel
} from './tickerFormat';
import './Ticker.css';

type Props = {
	symbol?: string;
	label?: string; // overrides the symbol shown in the header
	decimals?: number;
	showSparkline?: boolean;
	// Swap the up/down colours (red = up, green = down) — the East-Asian-market convention.
	invertColors?: boolean;
};

const numeric = (s: { value: { kind: string; value: unknown } | null }): number | null =>
	s.value?.kind === 'scalar' ? (s.value.value as number) : null;
const textOf = (s: { value: { kind: string; value: unknown } | null }): string | null =>
	s.value?.kind === 'text' ? (s.value.value as string) : null;

export default function Ticker({
	symbol = '',
	label = '',
	decimals = 2,
	showSparkline = true,
	invertColors = false
}: Props) {
	const hub = useTelemetryHub();
	const sym = symbol.trim().toUpperCase();
	const base = sym ? `stocks.${sym}` : '__ticker_none__';

	// One subscription per field (stable hook order; the no-symbol case binds inert `__ticker_none__.*`).
	const price = useSensor(hub, `${base}.price`);
	const change = useSensor(hub, `${base}.change`);
	const seriesState = useSensor(hub, `${base}.series`);
	const currency = useSensor(hub, `${base}.currency`);
	const state = useSensor(hub, `${base}.state`);

	if (!sym) {
		return (
			<div className="np-ticker" data-part="root" data-empty="true">
				<span className="np-ticker-msg" data-part="placeholder">
					Set a symbol
				</span>
			</div>
		);
	}

	const priceVal = numeric(price);
	const changeVal = numeric(change);
	const cur = textOf(currency);
	const market = marketLabel(textOf(state));
	const dir = direction(changeVal);
	const loading = priceVal === null;

	const series = seriesState.value?.kind === 'series' ? (seriesState.value.value as number[]) : [];
	const spark = series.length >= 2 ? series : price.history;

	return (
		<div
			className="np-ticker"
			data-part="root"
			data-dir={dir}
			data-invert={invertColors}
			data-loading={loading}
		>
			<div className="np-ticker-head">
				<span className="np-ticker-symbol" data-part="symbol">
					{label.trim() || sym}
				</span>
				{market && (
					<span className="np-ticker-state" data-part="state">
						{market}
					</span>
				)}
			</div>
			<div className="np-ticker-price" data-part="price">
				{loading ? '…' : `${currencySymbol(cur)}${formatPrice(priceVal, decimals)}`}
			</div>
			<div className="np-ticker-change" data-part="change">
				<span className="np-ticker-arrow" data-part="arrow">
					{directionArrow(dir)}
				</span>
				<span className="np-ticker-pct">{formatChangePct(changeVal)}</span>
			</div>
			{showSparkline && spark.length >= 2 && (
				<div className="np-ticker-spark" data-part="spark">
					<Sparkline history={spark} color="currentColor" seconds={spark.length} fill />
				</div>
			)}
		</div>
	);
}
