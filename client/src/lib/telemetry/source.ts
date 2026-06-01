// Outer-ring adapter: pipes the Tauri `telemetry` event into the framework-agnostic
// hub. The Tauri dependency lives here, not in core/ (AGENTS.md §5). A React port
// reuses this file unchanged (Tauri is infra, not a UI framework).

import * as tauriEvent from '@tauri-apps/api/event';
import type { TelemetryBatch, TelemetryHub } from '../core/telemetry';

export const TELEMETRY_EVENT = 'telemetry';

/** Subscribe the hub to backend telemetry. Resolves to an unlisten function. */
export function startTelemetrySource(hub: TelemetryHub): Promise<tauriEvent.UnlistenFn> {
	return tauriEvent.listen<TelemetryBatch>(TELEMETRY_EVENT, (ev) => {
		hub.ingestBatch(ev.payload);
	});
}
