// Presentational meter (molecule): driven entirely by props, no store/Tauri access.
// Themeable via tokens (--np-accent / -track / -fg / -muted / -label / -font-display);
// a per-instance `color`/`track` (from config) overrides the token. SVG colours are set
// via the `style` attribute (not presentation attributes) so var() resolves.
import { fraction } from './scale';
import './Gauge.css';

type Props = {
	value?: number | null;
	min?: number;
	max?: number;
	label?: string;
	unit?: string;
	color?: string; // per-instance accent override
	track?: string; // per-instance track override
};

const SIZE = 100;
const STROKE = 9;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const SWEEP = 0.75; // 270° arc, gap centred at the bottom

export default function Gauge({
	value = null,
	min = 0,
	max = 100,
	label = '',
	unit = '%',
	color,
	track
}: Props) {
	const frac = fraction(value, min, max);
	const display = value === null ? '–' : Math.round(value).toString();
	const fillCss = color ?? 'var(--np-accent, rgb(119, 196, 211))';
	const trackCss = track ?? 'var(--np-track, rgba(255, 255, 255, 0.15))';

	return (
		<div className="gauge np-gauge">
			<svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${label} ${display}${unit}`}>
				<g transform={`rotate(135 ${SIZE / 2} ${SIZE / 2})`}>
					<circle
						className="arc"
						data-part="track"
						cx={SIZE / 2}
						cy={SIZE / 2}
						r={R}
						fill="none"
						style={{ stroke: trackCss }}
						strokeWidth={STROKE}
						strokeDasharray={`${SWEEP * C} ${C}`}
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
						strokeDasharray={`${frac * SWEEP * C} ${C}`}
						strokeLinecap="round"
					/>
				</g>
				<text x="50%" y="52%" className="value" data-part="value" dominantBaseline="middle">
					{display}
					<tspan className="unit" data-part="unit">
						{unit}
					</tspan>
				</text>
				{label && (
					<text x="50%" y="70%" className="label" data-part="label" dominantBaseline="middle">
						{label}
					</text>
				)}
			</svg>
		</div>
	);
}
