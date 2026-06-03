// Multi-select details pane (Figma-style): shown when 2+ widgets are selected. Edits the config
// fields COMMON to all selected widgets (applied to every one at once; differing values read
// "mixed"), plus bulk sizing and delete. Presentational — the merged fields/basis are computed by
// canvas/multiSelect.ts and the bulk apply lives in the Canvas (commitOp → one undo step). A list of
// the selected items lets you drop back to single-select to tweak one.
import type { MergedField, BasisSummary } from './canvas/multiSelect';
import './MultiInspector.css';

type Props = {
	items: { id: string; label: string }[]; // every selected node (click to focus just it)
	fields: MergedField[]; // config fields shared across the selected WIDGETS
	basis: BasisSummary | null; // shared sizing of the selected flow leaves, or null if not all flow
	onFocus: (id: string) => void;
	onPatchConfig: (key: string, value: unknown) => void;
	onSetBasis: (basis: 'fixed' | 'content' | 'grow') => void;
	onDelete: () => void;
	docked?: boolean;
};

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

export default function MultiInspector({
	items,
	fields,
	basis,
	onFocus,
	onPatchConfig,
	onSetBasis,
	onDelete,
	docked = false
}: Props) {
	const cls = ['inspector', 'multi'];
	if (docked) cls.push('docked');

	function renderField({ field, value, mixed }: MergedField) {
		const ph = mixed ? 'mixed' : undefined;
		if (field.kind === 'toggle') {
			return (
				<label key={field.key} className={mixed ? 'check mixed' : 'check'}>
					<input
						type="checkbox"
						ref={(el) => {
							if (el) el.indeterminate = mixed;
						}}
						checked={!mixed && !!value}
						onChange={(e) => onPatchConfig(field.key, e.currentTarget.checked)}
					/>
					{field.label}
				</label>
			);
		}
		if (field.kind === 'select') {
			return (
				<label key={field.key} className="full">
					{field.label}
					<select
						value={mixed ? '' : str(value)}
						onChange={(e) => onPatchConfig(field.key, e.currentTarget.value)}
					>
						{mixed && <option value="">— mixed —</option>}
						{field.options.map((o) => (
							<option key={o} value={o}>
								{o}
							</option>
						))}
					</select>
				</label>
			);
		}
		return (
			<label key={field.key} className="full">
				{field.label}
				<input
					type={field.kind === 'number' ? 'number' : 'text'}
					value={mixed ? '' : str(value)}
					placeholder={ph}
					onInput={(e) =>
						onPatchConfig(
							field.key,
							field.kind === 'number' ? num(Number(e.currentTarget.value)) : e.currentTarget.value
						)
					}
				/>
			</label>
		);
	}

	return (
		<div className={cls.join(' ')}>
			<div className="fields">
				<span className="hd">{items.length} widgets selected</span>

				<div className="multi-list">
					{items.map((it) => (
						<button key={it.id} type="button" className="multi-item" onClick={() => onFocus(it.id)}>
							{it.label}
						</button>
					))}
				</div>

				{fields.length > 0 ? (
					<>
						<span className="hd">Common properties</span>
						{fields.map(renderField)}
					</>
				) : (
					<div className="multi-note">
						No shared editable properties — click an item to edit it.
					</div>
				)}

				{basis && (
					<label className="full">
						size along the row / column
						<select
							value={basis === 'mixed' ? '' : basis}
							onChange={(e) => onSetBasis(e.currentTarget.value as 'fixed' | 'content' | 'grow')}
						>
							{basis === 'mixed' && <option value="">— mixed —</option>}
							<option value="fixed">fixed — use each one&apos;s w/h</option>
							<option value="content">fit to content</option>
							<option value="grow">grow — stretch to fill</option>
						</select>
					</label>
				)}

				<button type="button" className="multi-delete" onClick={onDelete}>
					✕ Delete {items.length}
				</button>
			</div>
		</div>
	);
}
