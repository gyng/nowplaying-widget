// React hook: which conditional containers are currently HIDDEN, recomputed whenever a referenced
// sensor changes. Unlike useSensors (which flattens json/series to null), this reads full SensorValue
// snapshots — needed because appOpen reads the json window-list sensor and HA conditions read json
// `.state`. The pure work lives in conditionVisibility.ts / condition.ts; this is the reactive glue.
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { Container } from '../../core/layoutTree';
import type { TelemetryHub } from '../../core/telemetry';
import type { WindowDescriptor } from '../../core/windowMatch';
import { WINDOWS_SENSOR, type ConditionContext } from '../../core/condition';
import { collectConditions, conditionSensorRefs, hiddenContainerIds } from './conditionVisibility';

const EMPTY: ReadonlySet<string> = new Set();

/**
 * `active` gates the whole thing: in edit/preview (or the studio) we pass false so conditional
 * content always shows and stays editable, and nothing subscribes. On the passive overlay it's true.
 */
export function useConditionHidden(
	hub: TelemetryHub,
	root: Container,
	active: boolean
): ReadonlySet<string> {
	const conds = useMemo(() => collectConditions(root), [root]);
	// Only subscribe when active AND there are conditions — otherwise an empty ref list (no work).
	const refsKey = useMemo(
		() => (active && conds.length ? conditionSensorRefs(conds).join('\n') : ''),
		[active, conds]
	);
	const refs = useMemo(() => (refsKey ? refsKey.split('\n') : []), [refsKey]);

	const subscribe = useCallback(
		(cb: () => void) => {
			const unsubs = refs.map((id) => hub.sensor(id).subscribe(cb));
			return () => unsubs.forEach((u) => u());
		},
		[hub, refs]
	);
	// A stable string signature of every referenced sensor value; changes → re-render → recompute.
	const getSig = useCallback(
		() => refs.map((id) => JSON.stringify(hub.sensor(id).getSnapshot().value)).join('|'),
		[hub, refs]
	);
	const sig = useSyncExternalStore(subscribe, getSig, getSig);

	return useMemo(() => {
		if (!active || conds.length === 0) return EMPTY;
		const win = hub.sensor(WINDOWS_SENSOR).getSnapshot().value;
		const windows: WindowDescriptor[] =
			win && win.kind === 'json' && Array.isArray(win.value)
				? (win.value as WindowDescriptor[])
				: [];
		const ctx: ConditionContext = {
			windows,
			sensorValue: (id) => hub.sensor(id).getSnapshot().value
		};
		return hiddenContainerIds(conds, ctx);
		// `sig` is the reactive trigger (its value is folded into the snapshot reads above).
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active, conds, hub, sig]);
}
