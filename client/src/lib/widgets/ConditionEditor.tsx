// The container "Visibility / condition" editor (presentational molecule for the Inspector): turn any
// container conditional — show/hide its contents at runtime when an application is open or a sensor
// compares a certain way. Emits a whole Condition (or undefined to clear) via onChange; the Inspector
// routes that into patchContainer({ condition }). Text fields commit on blur (no undo spam); selects
// and toggles commit immediately. See core/condition.ts for the schema + evaluation.
import { COMPARE_OPS, type CompareOp, type Condition } from '../core/condition';
import Select from './Select';
import './ConditionEditor.css';

const OP_LABELS: Record<CompareOp, string> = {
	'>': '> greater than',
	'>=': '≥ at least',
	'<': '< less than',
	'<=': '≤ at most',
	'==': '= equals',
	'!=': '≠ not equals'
};

type Props = {
	value?: Condition;
	sensors?: string[]; // sensor ids for the 'sensor' kind picker
	onChange: (condition: Condition | undefined) => void;
	dirty?: boolean;
};

export default function ConditionEditor({ value, sensors = [], onChange, dirty }: Props) {
	const enabled = !!value;
	const negate = !!value?.negate;

	// Build the patched condition and emit it. Always re-attaches `negate` so toggling kind keeps it.
	const emit = (next: Condition | undefined) => onChange(next);

	return (
		<div className={['cond-editor', dirty && 'dirty'].filter(Boolean).join(' ')}>
			<label className="check">
				<input
					type="checkbox"
					checked={enabled}
					onChange={(e) => emit(e.currentTarget.checked ? { kind: 'appOpen' } : undefined)}
				/>
				Conditional — show / hide at runtime
			</label>

			{enabled && value && (
				<>
					<label className="full">
						when
						<Select
							value={value.kind}
							options={[
								{ value: 'appOpen', label: 'an application is open' },
								{ value: 'sensor', label: 'a sensor value' }
							]}
							onChange={(kind) =>
								emit(
									kind === 'sensor'
										? { kind: 'sensor', sensorId: sensors[0] ?? '', op: '>', value: '', negate }
										: { kind: 'appOpen', negate }
								)
							}
							aria-label="condition type"
						/>
					</label>

					{value.kind === 'appOpen' ? (
						<>
							<label className="full">
								exe (e.g. spotify.exe)
								<input
									type="text"
									key={`exe:${value.matchExe ?? ''}`}
									defaultValue={value.matchExe ?? ''}
									placeholder="spotify.exe"
									spellCheck={false}
									onBlur={(e) =>
										emit({ ...value, matchExe: e.currentTarget.value.trim() || undefined })
									}
								/>
							</label>
							<label className="full">
								window title (glob: * ?)
								<input
									type="text"
									key={`title:${value.matchTitle ?? ''}`}
									defaultValue={value.matchTitle ?? ''}
									placeholder="* - YouTube*"
									spellCheck={false}
									onBlur={(e) =>
										emit({ ...value, matchTitle: e.currentTarget.value.trim() || undefined })
									}
								/>
							</label>
							<label className="full">
								window class (glob)
								<input
									type="text"
									key={`class:${value.matchClass ?? ''}`}
									defaultValue={value.matchClass ?? ''}
									placeholder="Chrome_WidgetWin_1"
									spellCheck={false}
									onBlur={(e) =>
										emit({ ...value, matchClass: e.currentTarget.value.trim() || undefined })
									}
								/>
							</label>
						</>
					) : (
						<div className="row2">
							<label>
								sensor
								<Select
									value={value.sensorId}
									options={[
										{ value: '', label: '— pick —' },
										...sensors.map((s) => ({ value: s, label: s }))
									]}
									onChange={(sensorId) => emit({ ...value, sensorId })}
									aria-label="condition sensor"
								/>
							</label>
							<label>
								is
								<Select
									value={value.op}
									options={COMPARE_OPS.map((op) => ({ value: op, label: OP_LABELS[op] }))}
									onChange={(op) => emit({ ...value, op: op as CompareOp })}
									aria-label="condition operator"
								/>
							</label>
							<label>
								value
								<input
									type="text"
									key={`val:${value.value}`}
									defaultValue={value.value}
									placeholder="80 / on"
									spellCheck={false}
									onBlur={(e) => emit({ ...value, value: e.currentTarget.value })}
								/>
							</label>
						</div>
					)}

					<label className="check">
						<input
							type="checkbox"
							checked={negate}
							onChange={(e) => emit({ ...value, negate: e.currentTarget.checked || undefined })}
						/>
						Invert — hide (instead of show) when matched
					</label>
				</>
			)}
		</div>
	);
}
