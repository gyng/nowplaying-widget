// Presentational meter (molecule): renders a sensor's history ring buffer as a line, optionally
// filled. Themeable via --np-accent; a per-instance `color` overrides it. SVG colours are set via
// the `style` attribute so var() resolves.
import { sparklineBars, sparklinePoints } from './sparklineMath';
import './Sparkline.css';

type Props = {
	history?: number[];
	min?: number | null;
	max?: number | null;
	color?: string;
	fill?: boolean;
	// Histogram mode: draw value bars rising from the baseline instead of a line.
	histogram?: boolean;
	// Gap between histogram bars as a fraction of each slot (0 = bars touching). Defaults to a
	// standard 0.2 margin.
	barGap?: number;
	// Draw a baseline axis line under the histogram bars (default on; histogram mode only).
	axis?: boolean;
	// Rolling history window in SECONDS; the chart is right-anchored to this window.
	seconds?: number;
	// Line thickness in px (non-scaling, so constant regardless of widget size).
	lineWidth?: number;
};

const W = 100;
const H = 32;

export default function Sparkline({
	history = [],
	min = null,
	max = null,
	color,
	fill = true,
	histogram = false,
	barGap = 0.2,
	axis = true,
	seconds = 60,
	lineWidth = 1.5
}: Props) {
	const windowSlots = Math.max(1, Math.round(seconds));
	const points = histogram ? [] : sparklinePoints(history, W, H, min, max, windowSlots);
	const bars = histogram ? sparklineBars(history, W, H, min, max, barGap, windowSlots) : [];
	const line = points.map(([x, y]) => `${x},${y}`).join(' ');
	const area = points.length ? `0,${H} ${line} ${W},${H}` : '';
	const colorCss = color ?? 'var(--np-accent, rgb(119, 196, 211))';

	return (
		<svg
			className="sparkline np-sparkline"
			viewBox={`0 0 ${W} ${H}`}
			preserveAspectRatio="none"
			role="img"
			aria-label="history"
		>
			{histogram ? (
				<>
					{bars.map((b, i) => (
						<rect
							key={i}
							data-part="bar"
							x={b.x}
							y={b.y}
							width={b.w}
							height={b.h}
							style={{ fill: colorCss }}
						/>
					))}
					{/* Baseline axis: a thin line at the bottom the bars rise from (default on). */}
					{axis && (
						<rect
							data-part="axis"
							x={0}
							y={H - 1}
							width={W}
							height={1}
							style={{ fill: colorCss }}
						/>
					)}
				</>
			) : (
				<>
					{fill && points.length > 0 && (
						<polygon
							data-part="fill"
							points={area}
							style={{ fill: colorCss }}
							fillOpacity="0.18"
							stroke="none"
						/>
					)}
					{points.length > 0 && (
						<polyline
							data-part="line"
							points={line}
							fill="none"
							style={{ stroke: colorCss }}
							strokeWidth={lineWidth}
							strokeLinejoin="round"
							strokeLinecap="round"
							vectorEffect="non-scaling-stroke"
						/>
					)}
				</>
			)}
		</svg>
	);
}
