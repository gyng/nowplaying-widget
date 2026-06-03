// Self-sourcing meter: renders local time on a 1s tick. No sensor binding. BARE DOM — the look lives
// in Clock.css; a per-instance `color` is passed only as the `--clock-color` CSS variable (the class
// resolves it with a --np-fg/token fallback), so it stays fully restylable via the editable css.
import { useEffect, useState, type CSSProperties } from 'react';
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
	const vars = color ? ({ '--clock-color': color } as CSSProperties) : undefined;

	return (
		<div className="clock np-clock" style={vars}>
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
