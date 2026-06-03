// Self-sourcing meter: renders local time on a 1s tick. No sensor binding. Themeable
// via tokens (--np-fg / -font); a per-instance `color` overrides --np-fg.
import { useEffect, useState } from 'react';
import { formatClock } from '../../core/format';
import './Clock.css';

type Props = {
	format?: string;
	label?: string;
	color?: string;
	// Month/day-name locale: 'en' (default) or 'ja' (ddd → 日月火水木金土 weekday glyphs).
	locale?: string;
};

export default function Clock({ format = 'HH:mm', label = '', color, locale = 'en' }: Props) {
	const [now, setNow] = useState(new Date());

	useEffect(() => {
		const timer = setInterval(() => {
			setNow(new Date());
		}, 1000);
		return () => clearInterval(timer);
	}, []);

	const display = formatClock(now, format, locale);
	const colorCss = color ?? 'var(--np-fg, rgb(255, 255, 255))';

	return (
		<div className="clock np-clock" style={{ color: colorCss }}>
			<span className="value" data-part="value">
				{display}
			</span>
			{label && (
				<span className="label" data-part="label">
					{label}
				</span>
			)}
		</div>
	);
}
