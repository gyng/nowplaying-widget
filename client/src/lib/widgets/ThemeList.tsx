// The studio's theme picker (Themes section): a selectable list of themes with the active one
// badged + highlighted, replacing a bare <select> dropdown — so all themes are visible at a glance
// and a long name truncates instead of overflowing. A filter box appears once there are enough
// themes to be worth searching. "(default)" (no theme = the meters' token fallbacks) is always
// offered as the reset, regardless of the filter.
import { useState } from 'react';

/** Case-insensitive substring filter over theme names (pure — unit-tested). Empty query → all. */
export function filterThemes(names: string[], query: string): string[] {
	const q = query.trim().toLowerCase();
	if (!q) return names;
	return names.filter((n) => n.toLowerCase().includes(q));
}

/** Show the filter box only once the list is long enough that scanning it is tedious. */
const FILTER_THRESHOLD = 6;

function ThemeRow({
	name,
	label,
	active,
	onPick
}: {
	name: string;
	label: string;
	active: boolean;
	onPick: (name: string) => void;
}) {
	return (
		<button
			type="button"
			className={['theme-row', active && 'active'].filter(Boolean).join(' ')}
			title={label}
			aria-pressed={active}
			onClick={() => onPick(name)}
		>
			<span className="rp-id">{label}</span>
			{active ? <span className="rp-badge">active</span> : null}
		</button>
	);
}

type Props = {
	themes: string[]; // named themes (the synthetic "(default)" is added here)
	active: string; // '' = default
	onPick: (name: string) => void;
};

export default function ThemeList({ themes, active, onPick }: Props) {
	const [query, setQuery] = useState('');
	const q = query.trim().toLowerCase();
	const filtered = filterThemes(themes, query);
	// "(default)" is always the reset; it shows unless a non-empty query excludes the word "default".
	const showDefault = q === '' || 'default'.includes(q);
	const total = themes.length + 1; // + default
	const shown = filtered.length + (showDefault ? 1 : 0);

	return (
		<>
			{themes.length > FILTER_THRESHOLD && (
				<div className="rp-filter">
					<input
						type="search"
						value={query}
						placeholder="Filter themes…"
						aria-label="Filter themes"
						onInput={(e) => setQuery(e.currentTarget.value)}
					/>
					<span className="rp-count">{shown !== total ? `${shown} / ${total}` : total}</span>
				</div>
			)}
			{shown === 0 ? (
				<div className="rp-stub">No themes match.</div>
			) : (
				<div className="theme-list">
					{showDefault && (
						<ThemeRow name="" label="(default)" active={active === ''} onPick={onPick} />
					)}
					{filtered.map((n) => (
						<ThemeRow key={n} name={n} label={n} active={active === n} onPick={onPick} />
					))}
				</div>
			)}
		</>
	);
}
