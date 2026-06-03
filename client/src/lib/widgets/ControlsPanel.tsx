// Settings → Controls: lists every registered control (grouped), shows its effective binding, lets
// the user rebind keyboard chords (capture the next chord), flags conflicts, and resets one or all
// remaps. All the logic (formatTrigger, detectConflicts, mergeOverrides) lives in core/controls.ts —
// this is just the presentational shell + the capture interaction. Pointer/wheel gestures and the
// multi-directional nudge are shown read-only; remap those by editing controls.json (it live-reloads).
import { useEffect, useMemo, useState } from 'react';
import {
	detectConflicts,
	formatTrigger,
	listControls,
	mergeOverrides,
	parseKeyEvent,
	type Control,
	type ControlGroup,
	type ControlOverrides,
	type Trigger
} from '../core/controls';
import './ControlsPanel.css';

type Props = {
	overrides: ControlOverrides;
	onRebind: (id: string, trigger: Trigger) => void;
	onReset: (id: string) => void;
	onResetAll: () => void;
};

const GROUP_LABEL: Record<ControlGroup, string> = {
	edit: 'Edit',
	selection: 'Selection',
	view: 'View',
	navigation: 'Navigation',
	file: 'File',
	widget: 'Widgets'
};
const GROUP_ORDER: ControlGroup[] = ['edit', 'selection', 'view', 'file', 'navigation', 'widget'];
const MOD_KEYS = ['Control', 'Shift', 'Alt', 'Meta', 'OS'];

// Rebindable in-app only when it's a small set of key chords (≤2). Pointer/wheel and the 8-arrow nudge
// are read-only here (capturing those is fiddly + footgun-prone); edit controls.json to remap them.
function rebindableAsKey(c: Control): boolean {
	return (
		c.triggers.length > 0 && c.triggers.length <= 2 && c.triggers.every((t) => t.type === 'key')
	);
}

function triggerText(triggers: Trigger[]): string {
	return Array.from(new Set(triggers.map(formatTrigger))).join('   ') || '—';
}

function keyEventToTrigger(e: KeyboardEvent): Trigger {
	const chord = parseKeyEvent(e);
	const t: Trigger = { type: 'key', key: chord.key };
	if (chord.ctrl) t.ctrl = true;
	if (chord.shift) t.shift = true;
	if (chord.alt) t.alt = true;
	if (chord.meta) t.meta = true;
	return t;
}

export default function ControlsPanel({ overrides, onRebind, onReset, onResetAll }: Props) {
	const [capturing, setCapturing] = useState<string | null>(null);
	const all = listControls();
	const conflictIds = useMemo(() => {
		const set = new Set<string>();
		for (const c of detectConflicts(mergeOverrides(listControls(), overrides))) {
			set.add(c.a);
			set.add(c.b);
		}
		return set;
	}, [overrides]);

	// While capturing, the next real key chord becomes the binding; Escape cancels. Capture-phase so it
	// wins over the app's own keyboard dispatch.
	useEffect(() => {
		if (!capturing) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setCapturing(null);
				return;
			}
			if (MOD_KEYS.includes(e.key)) return; // wait for a non-modifier key
			e.preventDefault();
			e.stopPropagation();
			onRebind(capturing, keyEventToTrigger(e));
			setCapturing(null);
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [capturing, onRebind]);

	const groups = GROUP_ORDER.filter((g) => all.some((c) => c.group === g));

	return (
		<div className="rail-panel controls-panel">
			<div className="rp-hd">
				Controls
				<button type="button" className="cp-resetall" onClick={onResetAll}>
					Reset all
				</button>
			</div>
			{groups.map((g) => (
				<div key={g} className="cp-group">
					<div className="cp-grouphd">{GROUP_LABEL[g]}</div>
					<div className="rp-list">
						{all
							.filter((c) => c.group === g)
							.map((c) => {
								const ov = overrides[c.id];
								const triggers = ov?.triggers ?? c.triggers;
								return (
									<div className="cp-row" key={c.id}>
										<span className="cp-label">{c.label}</span>
										<span
											className={`cp-keys${conflictIds.has(c.id) ? ' cp-conflict' : ''}`}
											title={conflictIds.has(c.id) ? 'Conflicts with another control' : undefined}
										>
											{capturing === c.id ? 'Press keys… (Esc cancels)' : triggerText(triggers)}
										</span>
										<span className="cp-actions">
											{rebindableAsKey(c) && (
												<button type="button" onClick={() => setCapturing(c.id)}>
													Rebind
												</button>
											)}
											{ov && (
												<button
													type="button"
													title="Reset to default"
													onClick={() => onReset(c.id)}
												>
													↺
												</button>
											)}
										</span>
									</div>
								);
							})}
					</div>
				</div>
			))}
			<div className="cp-group">
				<div className="cp-grouphd">System</div>
				<div className="rp-list">
					<div className="cp-row">
						<span className="cp-label">Toggle edit (global)</span>
						<span className="cp-keys dim">Ctrl+Alt+E</span>
						<span className="cp-actions dim">set in app</span>
					</div>
				</div>
			</div>
		</div>
	);
}
