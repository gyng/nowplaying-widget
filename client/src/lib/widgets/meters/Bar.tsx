// Presentational meter (molecule): a horizontal or vertical fill bar. Themeable via
// tokens (--np-accent / -track); a per-instance `color`/`track` overrides the token.
import { fraction } from './scale';
import './Bar.css';

type Props = {
	value?: number | null;
	min?: number;
	max?: number;
	orientation?: 'horizontal' | 'vertical';
	color?: string;
	track?: string;
	label?: string;
};

export default function Bar({
	value = null,
	min = 0,
	max = 100,
	orientation = 'horizontal',
	color,
	track,
	label = ''
}: Props) {
	const pct = `${(fraction(value, min, max) * 100).toFixed(1)}%`;
	const fillCss = color ?? 'var(--np-accent, rgb(119, 196, 211))';
	const trackCss = track ?? 'var(--np-track, rgba(255, 255, 255, 0.15))';

	return (
		<div className={`bar np-bar ${orientation}`} data-part="track" style={{ background: trackCss }}>
			<div
				className="fill"
				data-part="fill"
				style={{
					background: fillCss,
					[orientation === 'horizontal' ? 'width' : 'height']: pct
				}}
			/>
			{label && (
				<span className="label" data-part="label">
					{label}
				</span>
			)}
		</div>
	);
}
