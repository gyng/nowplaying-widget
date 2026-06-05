// Owns the user's control remaps (controls.json overrides): the render state (so the hint bar + the
// Settings panel re-derive when a binding changes) plus a ref the keyboard/pointer/wheel hooks read
// synchronously at event time. reloadControls loads+validates from disk (startup + the
// `controls_changed` watcher event); setOverride/resetOverride/resetAll mutate AND persist. The file
// holds ONLY overrides (`{ version, overrides }`) — defaults live in code — so it degrades safely.
import { useCallback, useRef, useState } from 'react';
import { loadControls, saveControls } from '../../overlay';
import {
	parseControlOverrides,
	type ControlOverride,
	type ControlOverrides
} from '../../core/controls';

const VERSION = 1;

export type Controls = {
	overrides: ControlOverrides; // render state
	overridesRef: React.RefObject<ControlOverrides>; // synchronous read for the dispatch hooks
	reloadControls: () => Promise<void>;
	setOverride: (id: string, override: ControlOverride) => void;
	resetOverride: (id: string) => void;
	resetAll: () => void;
};

export function useControls(): Controls {
	const [overrides, setOverrides] = useState<ControlOverrides>({});
	const overridesRef = useRef<ControlOverrides>({});

	const persist = useCallback((next: ControlOverrides) => {
		overridesRef.current = next;
		setOverrides(next);
		saveControls(JSON.stringify({ version: VERSION, overrides: next }, null, 2));
	}, []);

	const reloadControls = useCallback(async () => {
		const raw = await loadControls();
		let obj: unknown = null;
		if (raw) {
			try {
				obj = JSON.parse(raw);
			} catch {
				obj = null; // a hand-edited/corrupt file falls back to defaults
			}
		}
		const next = parseControlOverrides(obj);
		overridesRef.current = next;
		setOverrides(next);
	}, []);

	const setOverride = useCallback(
		(id: string, override: ControlOverride) => persist({ ...overridesRef.current, [id]: override }),
		[persist]
	);
	const resetOverride = useCallback(
		(id: string) => {
			const next = { ...overridesRef.current };
			delete next[id];
			persist(next);
		},
		[persist]
	);
	const resetAll = useCallback(() => persist({}), [persist]);

	return { overrides, overridesRef, reloadControls, setOverride, resetOverride, resetAll };
}
