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
	// Rolling history window in SECONDS; the chart is right-anchored to this window.
	seconds?: number;
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
	seconds = 60
}: Props) {
	const windowSlots = Math.max(1, Math.round(seconds));
	const points = histogram ? [] : sparklinePoints(history, W, H, min, max, windowSlots);
	const bars = histogram ? sparklineBars(history, W, H, min, max, 0.2, windowSlots) : [];
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
				bars.map((b, i) => (
					<rect
						key={i}
						data-part="bar"
						x={b.x}
						y={b.y}
						width={b.w}
						height={b.h}
						style={{ fill: colorCss }}
					/>
				))
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
							strokeWidth="1.5"
							vectorEffect="non-scaling-stroke"
						/>
					)}
				</>
			)}
		</svg>
	);
}
