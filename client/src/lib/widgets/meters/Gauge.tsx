// Presentational meter (molecule): driven entirely by props, no store/Tauri access.
// Themeable via tokens (--np-accent / -track / -fg / -muted / -label / -font-display);
// a per-instance `color`/`track` (from config) overrides the token. SVG colours are set
// via the `style` attribute (not presentation attributes) so var() resolves.
//
// `style` (config) picks the variant — arc (default) | circle | pips | needle | linear —
// with ALL geometry in gaugeMath.ts (pure, tested); this file only renders. Every variant
// keeps the data-part contract (track / fill / value / unit / label) so user themes and
// per-widget CSS keep matching, and the default arc stays byte-identical to the original.
import { fraction } from './scale';
import {
	arcDasharray,
	arcRotation,
	clampPips,
	clampSweep,
	dialTickCount,
	dialTicks,
	directionAxis,
	needleAngle,
	pipArcPositions,
	pipFilledCount,
	pipRadius,
	pipSegments,
	type GaugeDirection
} from './gaugeMath';
import './Gauge.css';

type GaugeStyle = 'arc' | 'circle' | 'linear' | 'pips' | 'needle';

type Props = {
	value?: number | null;
	min?: number;
	max?: number;
	label?: string;
	unit?: string;
	color?: string; // per-instance accent override
	track?: string; // per-instance track override
	style?: GaugeStyle; // rendering variant (default 'arc' — the original look)
	direction?: GaugeDirection; // pips: 'arc' or a row/column; linear: bar axis + fill end
	pips?: number; // pips: segment count
	sweep?: number; // arc/pips/needle: arc span in degrees (gap stays centred at the bottom)
};

const SIZE = 100;
const STROKE = 9;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/** The gauge's shared typography block (big value + unit, label underneath). */
function CenterText({
	display,
	unit,
	label,
	valueY = '52%',
	labelY = '70%'
}: {
	display: string;
	unit: string;
	label: string;
	valueY?: string;
	labelY?: string;
}) {
	return (
		<>
			<text x="50%" y={valueY} className="value" data-part="value" dominantBaseline="middle">
				{display}
				<tspan className="unit" data-part="unit">
					{unit}
				</tspan>
			</text>
			{label && (
				<text x="50%" y={labelY} className="label" data-part="label" dominantBaseline="middle">
					{label}
				</text>
			)}
		</>
	);
}

/** The linear composition (style 'linear', and 'pips' with a row/column direction): the gauge's
 * typography around a thin bar or a segmented SVG strip. Horizontal: label · bar (grows) · value;
 * vertical: value/label stacked on top, the bar filling the rest of the box. */
function LinearGauge({
	display,
	unit,
	label,
	aria,
	frac,
	fillCss,
	trackCss,
	direction,
	segments
}: {
	display: string;
	unit: string;
	label: string;
	aria: string;
	frac: number;
	fillCss: string;
	trackCss: string;
	direction: GaugeDirection;
	segments: number; // 0 = continuous bar, > 0 = that many pip segments
}) {
	const { vertical } = directionAxis(direction);
	const pct = `${frac * 100}%`;
	const filled = pipFilledCount(frac, segments);
	const bar =
		segments > 0 ? (
			// preserveAspectRatio="none" stretches the 0..100 box to the strip, so the rect
			// segments fill it edge-to-edge at any widget aspect (circles would distort; rects don't).
			<svg className="strip" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
				{pipSegments(segments, direction).map((s, i) => (
					<rect
						key={i}
						className="pip"
						data-part={i < filled ? 'fill' : 'track'}
						x={s.x}
						y={s.y}
						width={s.w}
						height={s.h}
						style={{ fill: i < filled ? fillCss : trackCss }}
					/>
				))}
			</svg>
		) : (
			<div className="linear-track" data-part="track" style={{ background: trackCss }}>
				<div
					className="linear-fill"
					data-part="fill"
					style={
						vertical
							? { background: fillCss, height: pct, width: '100%' }
							: { background: fillCss, width: pct, height: '100%' }
					}
				/>
			</div>
		);
	const valueText = (
		<span className="value" data-part="value">
			{display}
			<span className="unit" data-part="unit">
				{unit}
			</span>
		</span>
	);
	const labelText = label ? (
		<span className="label" data-part="label">
			{label}
		</span>
	) : null;
	return (
		<div
			className="gauge np-gauge np-gauge-linear"
			data-dir={direction}
			role="img"
			aria-label={aria}
		>
			{vertical ? (
				<>
					<div className="linear-text">
						{valueText}
						{labelText}
					</div>
					{bar}
				</>
			) : (
				<>
					{labelText}
					{bar}
					{valueText}
				</>
			)}
		</div>
	);
}

export default function Gauge({
	value = null,
	min = 0,
	max = 100,
	label = '',
	unit = '%',
	color,
	track,
	style = 'arc',
	direction = 'arc',
	pips = 10,
	sweep = 270
}: Props) {
	const frac = fraction(value, min, max);
	const display = value === null ? '–' : Math.round(value).toString();
	const fillCss = color ?? 'var(--np-accent, rgb(119, 196, 211))';
	const trackCss = track ?? 'var(--np-track, rgba(255, 255, 255, 0.15))';
	const aria = `${label} ${display}${unit}`;
	const sw = clampSweep(sweep);

	if (style === 'linear' || (style === 'pips' && direction !== 'arc')) {
		return (
			<LinearGauge
				display={display}
				unit={unit}
				label={label}
				aria={aria}
				frac={frac}
				fillCss={fillCss}
				trackCss={trackCss}
				direction={direction === 'arc' ? 'ltr' : direction}
				segments={style === 'pips' ? clampPips(pips) : 0}
			/>
		);
	}

	let body;
	let valueY: string | undefined;
	let labelY: string | undefined;
	if (style === 'circle') {
		// A closed ring: the track needs no dasharray; the fill starts at 12 o'clock with hard
		// (butt) ends so a near-full ring doesn't bleed past its own start.
		body = (
			<g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
				<circle
					className="arc"
					data-part="track"
					cx={SIZE / 2}
					cy={SIZE / 2}
					r={R}
					fill="none"
					style={{ stroke: trackCss }}
					strokeWidth={STROKE}
				/>
				<circle
					className="arc"
					data-part="fill"
					cx={SIZE / 2}
					cy={SIZE / 2}
					r={R}
					fill="none"
					style={{ stroke: fillCss }}
					strokeWidth={STROKE}
					strokeDasharray={arcDasharray(C, 360, frac)}
					strokeLinecap="butt"
				/>
			</g>
		);
	} else if (style === 'pips') {
		const n = clampPips(pips);
		const filled = pipFilledCount(frac, n);
		const r = pipRadius(n, sw, R);
		body = (
			<g>
				{pipArcPositions(n, sw, SIZE / 2, SIZE / 2, R).map((p, i) => (
					<circle
						key={i}
						className="pip"
						data-part={i < filled ? 'fill' : 'track'}
						cx={p.x}
						cy={p.y}
						r={r}
						style={{ fill: i < filled ? fillCss : trackCss }}
					/>
				))}
			</g>
		);
	} else if (style === 'needle') {
		// An analog dial: track-coloured ticks around the sweep, an accent needle, a small hub;
		// the text drops below the centre so the needle sweeps over clear dial.
		valueY = '76%';
		labelY = '92%';
		body = (
			<g>
				{dialTicks(sw, dialTickCount(sw), SIZE / 2, SIZE / 2, R - 7, R).map((t, i) => (
					<line
						key={i}
						className="tick"
						data-part="track"
						x1={t.x1}
						y1={t.y1}
						x2={t.x2}
						y2={t.y2}
						style={{ stroke: trackCss }}
						strokeWidth={2}
					/>
				))}
				<line
					className="needle"
					data-part="fill"
					x1={SIZE / 2}
					y1={SIZE / 2}
					x2={SIZE / 2 + (R - 10)}
					y2={SIZE / 2}
					transform={`rotate(${needleAngle(frac, sw)} ${SIZE / 2} ${SIZE / 2})`}
					style={{ stroke: fillCss }}
					strokeWidth={2.5}
					strokeLinecap="round"
				/>
				<circle
					className="hub"
					data-part="hub"
					cx={SIZE / 2}
					cy={SIZE / 2}
					r={4}
					style={{ fill: fillCss }}
				/>
			</g>
		);
	} else {
		// 'arc' (and any unknown style): the original gauge, generalized only by `sweep` — the
		// default 270° emits the exact legacy attributes (rotate(135), 0.75·C dasharrays).
		body = (
			<g transform={`rotate(${arcRotation(sw)} ${SIZE / 2} ${SIZE / 2})`}>
				<circle
					className="arc"
					data-part="track"
					cx={SIZE / 2}
					cy={SIZE / 2}
					r={R}
					fill="none"
					style={{ stroke: trackCss }}
					strokeWidth={STROKE}
					strokeDasharray={arcDasharray(C, sw)}
					strokeLinecap="round"
				/>
				<circle
					className="arc"
					data-part="fill"
					cx={SIZE / 2}
					cy={SIZE / 2}
					r={R}
					fill="none"
					style={{ stroke: fillCss }}
					strokeWidth={STROKE}
					strokeDasharray={arcDasharray(C, sw, frac)}
					strokeLinecap="round"
				/>
			</g>
		);
	}

	return (
		<div className="gauge np-gauge">
			<svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={aria}>
				{body}
				<CenterText display={display} unit={unit} label={label} valueY={valueY} labelY={labelY} />
			</svg>
		</div>
	);
}
