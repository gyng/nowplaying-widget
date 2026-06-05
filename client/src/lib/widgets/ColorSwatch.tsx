// A tiny colour preview of a theme — its surface filled, with an accent + a foreground dot — so a
// theme reads at a glance in the picker (the Themes panel rows AND the app-bar dropdown). Pure +
// presentational; uses a bare global class so it also styles correctly inside the Select's menu,
// which is portaled to <body> (outside .canvas). Decorative → hidden from assistive tech.
import type { Swatch } from '../core/tokens';
import './ColorSwatch.css';

export default function ColorSwatch({ sw }: { sw?: Swatch }) {
	if (!sw) return <span className="np-swatch np-swatch-empty" aria-hidden="true" />;
	return (
		<span className="np-swatch" aria-hidden="true" style={{ background: sw.bg }}>
			<i className="np-swatch-dot" style={{ background: sw.accent }} />
			<i className="np-swatch-dot" style={{ background: sw.fg }} />
		</span>
	);
}
