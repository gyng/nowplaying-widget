// Inspector control for a `kind:'macro'` config field: edit an ordered list of {domain, service,
// data?} action calls run in sequence on press. Controlled (value + onChange) and prop-only — the
// immutable edit ops live in core/macro.ts; this just wires them to row inputs. `domain`/`service`
// are plain text; `data` is a JSON object edited as text and committed on blur (like the inspector's
// raw-config escape hatch), so partial/invalid JSON while typing never clobbers the field. Styled by
// Inspector.css (it only ever renders inside the inspector).
import { useState } from 'react';
import {
	addAction,
	moveAction,
	removeAction,
	updateAction,
	type Macro,
	type MacroAction
} from '../core/macro';

type Props = {
	value: Macro;
	onChange: (next: Macro) => void;
};

const dataToText = (data: Record<string, unknown> | undefined): string =>
	data ? JSON.stringify(data) : '';

export default function MacroEditor({ value, onChange }: Props) {
	const actions = value ?? [];
	return (
		<div className="macro-editor">
			{actions.length === 0 ? (
				<div className="macro-empty">No actions — the button is inert until you add one.</div>
			) : null}
			{actions.map((a, i) => (
				<MacroRow
					// Keyed by index + data identity so a reorder (which changes the data at this slot)
					// re-mounts the row and re-seeds its local data buffer from props.
					key={`${i}:${dataToText(a.data)}`}
					action={a}
					first={i === 0}
					last={i === actions.length - 1}
					onPatch={(patch) => onChange(updateAction(actions, i, patch))}
					onUp={() => onChange(moveAction(actions, i, -1))}
					onDown={() => onChange(moveAction(actions, i, 1))}
					onRemove={() => onChange(removeAction(actions, i))}
				/>
			))}
			<button type="button" className="macro-add" onClick={() => onChange(addAction(actions))}>
				+ action
			</button>
		</div>
	);
}

function MacroRow({
	action,
	first,
	last,
	onPatch,
	onUp,
	onDown,
	onRemove
}: {
	action: MacroAction;
	first: boolean;
	last: boolean;
	onPatch: (patch: Partial<MacroAction>) => void;
	onUp: () => void;
	onDown: () => void;
	onRemove: () => void;
}) {
	const [dataText, setDataText] = useState(dataToText(action.data));
	const [dataError, setDataError] = useState(false);

	// Commit the data field: empty clears `data`; a JSON object sets it; anything else flags an error
	// and leaves the committed value untouched (the text stays so the user can fix it).
	const commitData = () => {
		const t = dataText.trim();
		if (t === '') {
			setDataError(false);
			onPatch({ data: undefined });
			return;
		}
		try {
			const parsed = JSON.parse(t) as unknown;
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				setDataError(true);
				return;
			}
			setDataError(false);
			onPatch({ data: parsed as Record<string, unknown> });
		} catch {
			setDataError(true);
		}
	};

	return (
		<div className="macro-row">
			<div className="macro-row-main">
				<input
					className="macro-domain"
					placeholder="domain"
					title="domain — e.g. light, switch, scene, script, or media"
					value={action.domain}
					onChange={(e) => onPatch({ domain: e.currentTarget.value })}
				/>
				<input
					className="macro-service"
					placeholder="service"
					title="service — e.g. toggle, turn_on; for media: playpause, next, previous"
					value={action.service}
					onChange={(e) => onPatch({ service: e.currentTarget.value })}
				/>
				<div className="macro-row-ops">
					<button type="button" title="Move up" disabled={first} onClick={onUp}>
						↑
					</button>
					<button type="button" title="Move down" disabled={last} onClick={onDown}>
						↓
					</button>
					<button
						type="button"
						className="x"
						title="Remove action"
						aria-label="Remove action"
						onClick={onRemove}
					>
						✕
					</button>
				</div>
			</div>
			<input
				className={dataError ? 'macro-data error' : 'macro-data'}
				placeholder='data (JSON), e.g. {"entity_id":"light.kitchen"}'
				title="optional JSON args — HA needs entity_id here on an unbound button"
				value={dataText}
				onChange={(e) => setDataText(e.currentTarget.value)}
				onBlur={commitData}
			/>
		</div>
	);
}
