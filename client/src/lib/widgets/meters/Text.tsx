// Presentational meter (molecule): formats a scalar sensor value as text. Themeable via
// tokens (--np-fg / -font); a per-instance `color` (from config) overrides --np-fg.
import { formatScalar } from '../../core/format';
import './Text.css';

type Props = {
	// number from a bound sensor; string when driven by a text formula (already rendered by the engine).
	value?: number | string | null;
	format?: string;
	label?: string;
	color?: string;
};

export default function Text({ value = null, format = 'integer', label = '', color }: Props) {
	const display = typeof value === 'string' ? value : formatScalar(value, format);
	const colorCss = color ?? 'var(--np-fg, rgb(255, 255, 255))';

	return (
		<div className="text np-text" style={{ color: colorCss }}>
			{label && (
				<span className="label" data-part="label">
					{label}
				</span>
			)}
			<span className="value" data-part="value">
				{display}
			</span>
		</div>
	);
}
