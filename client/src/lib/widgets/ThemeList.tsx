// The studio's theme picker (Themes section): the synthetic "(default)" reset, then the built-in
// presets grouped Classic / Light / Dark / Fun, then the user's own themes ("Your themes") — a
// responsive grid of swatch cards (the grid + card look lives in NavRail.css). The active card is
// badged + highlighted. Built-ins are immutable, so they expose only "duplicate to edit" (⎘); user
// themes get edit (✎) / duplicate (⎘) / delete (✕). A filter box appears once the list is long
// enough to be worth searching, and matches across every group by label.
import { useState } from 'react';
import { DEFAULT_SWATCH, type Swatch } from '../core/tokens';
import ColorSwatch from './ColorSwatch';

/** Case-insensitive substring filter over a list of labels (pure — unit-tested). Empty query → all. */
export function filterThemes(names: string[], query: string): string[] {
	const q = query.trim().toLowerCase();
	if (!q) return names;
	return names.filter((n) => n.toLowerCase().includes(q));
}

/** Show the filter box only once the combined list is long enough that scanning it is tedious. */
const FILTER_THRESHOLD = 8;

export type ThemeItem = { value: string; label: string; swatch?: Swatch };
export type ThemeGroup = { key: string; label: string; items: ThemeItem[] };

function ThemeRow({
	value,
	label,
	swatch,
	active,
	onPick,
	onEdit,
	onDuplicate,
	onDelete
}: {
	value: string;
	label: string;
	swatch?: Swatch;
	active: boolean;
	onPick: (value: string) => void;
	// Per-row actions. A built-in passes only `onDuplicate` (fork-to-edit); a user theme passes all
	// three; the "(default)" reset passes none. Each is keyed off the row's selection `value`.
	onEdit?: (value: string) => void;
	onDuplicate?: (value: string) => void;
	onDelete?: (value: string) => void;
}) {
	const hasActions = Boolean(onEdit || onDuplicate || onDelete);
	return (
		<div className={['theme-item', active && 'cur'].filter(Boolean).join(' ')}>
			<button
				type="button"
				className={['theme-row', active && 'active'].filter(Boolean).join(' ')}
				title={label}
				aria-pressed={active}
				onClick={() => onPick(value)}
			>
				<ColorSwatch sw={swatch} />
				<span className="theme-card-foot">
					<span className="rp-id">{label}</span>
					{active ? <span className="rp-badge">active</span> : null}
				</span>
			</button>
			{hasActions && (
				<span className="theme-acts">
					{onEdit && (
						<button
							type="button"
							className="dl-icon"
							title={`Edit "${label}" CSS`}
							aria-label={`Edit ${label} CSS`}
							onClick={() => onEdit(value)}
						>
							✎
						</button>
					)}
					{onDuplicate && (
						<button
							type="button"
							className="dl-icon"
							title={`Duplicate "${label}" to a new editable theme`}
							aria-label={`Duplicate ${label}`}
							onClick={() => onDuplicate(value)}
						>
							⎘
						</button>
					)}
					{onDelete && (
						<button
							type="button"
							className="dl-icon dl-del"
							title={`Delete "${label}"`}
							aria-label={`Delete ${label}`}
							onClick={() => onDelete(value)}
						>
							✕
						</button>
					)}
				</span>
			)}
		</div>
	);
}

type Props = {
	groups: ThemeGroup[]; // built-in presets, grouped (item.value = `builtin:<id>`)
	userThemes: ThemeItem[]; // the user's own themes (value = filename), with parsed swatches
	active: string; // current selection ('' = default)
	onPick: (value: string) => void;
	onEdit: (name: string) => void; // user themes only
	onDuplicate: (value: string) => void; // built-ins + user (built-ins fork to a copy)
	onDelete: (name: string) => void; // user themes only
};

export default function ThemeList({
	groups,
	userThemes,
	active,
	onPick,
	onEdit,
	onDuplicate,
	onDelete
}: Props) {
	const [query, setQuery] = useState('');
	const q = query.trim().toLowerCase();
	const match = (label: string) => q === '' || label.toLowerCase().includes(q);

	// Filter every section by label; drop sections that end up empty.
	const shownGroups = groups
		.map((g) => ({ ...g, items: g.items.filter((it) => match(it.label)) }))
		.filter((g) => g.items.length > 0);
	const shownUser = userThemes.filter((it) => match(it.label));
	const showDefault = match('(default)');

	const total = groups.reduce((n, g) => n + g.items.length, 0) + userThemes.length + 1; // + default
	const shown =
		shownGroups.reduce((n, g) => n + g.items.length, 0) + shownUser.length + (showDefault ? 1 : 0);

	return (
		<>
			{total - 1 > FILTER_THRESHOLD && (
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
				<>
					{showDefault && (
						<div className="theme-list">
							<ThemeRow
								label="(default)"
								value=""
								swatch={DEFAULT_SWATCH}
								active={active === ''}
								onPick={onPick}
							/>
						</div>
					)}
					{shownGroups.map((g) => (
						<div key={g.key} className="theme-group">
							<div className="rp-hd">{g.label}</div>
							<div className="theme-list">
								{g.items.map((it) => (
									<ThemeRow
										key={it.value}
										value={it.value}
										label={it.label}
										swatch={it.swatch}
										active={active === it.value}
										onPick={onPick}
										onDuplicate={onDuplicate}
									/>
								))}
							</div>
						</div>
					))}
					{shownUser.length > 0 && (
						<div className="theme-group">
							<div className="rp-hd">Your themes</div>
							<div className="theme-list">
								{shownUser.map((it) => (
									<ThemeRow
										key={it.value}
										value={it.value}
										label={it.label}
										swatch={it.swatch}
										active={active === it.value}
										onPick={onPick}
										onEdit={onEdit}
										onDuplicate={onDuplicate}
										onDelete={onDelete}
									/>
								))}
							</div>
						</div>
					)}
				</>
			)}
		</>
	);
}
