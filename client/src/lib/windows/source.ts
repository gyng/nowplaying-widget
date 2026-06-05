// Window-presence source (outer ring / Tauri adapter): polls the existing `list_windows` command and
// feeds the open-window list into the telemetry hub as the WINDOWS_SENSOR json sensor, so appOpen
// conditional containers re-evaluate reactively. Overlay-only and demand-gated: Canvas starts it only
// when the passive overlay actually has an `appOpen` condition (see useConditionHidden / Canvas).
// EnumWindows is cheap but not free, so the cadence is coarse (~1.5s) — app open/close isn't latency
// critical. Mirrors lib/telemetry/source.ts (a thin listen/poll → hub.ingest seam).
import { listWindows } from '../overlay';
import { WINDOWS_SENSOR } from '../core/condition';
import type { TelemetryHub } from '../core/telemetry';

/** Begin polling open windows into `hub` as WINDOWS_SENSOR. Returns a stop function (idempotent). */
export function startWindowSource(hub: TelemetryHub, intervalMs = 1500): () => void {
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const tick = async (): Promise<void> => {
		if (stopped) return;
		try {
			const windows = await listWindows();
			if (!stopped) {
				hub.ingest({
					sensor: WINDOWS_SENSOR,
					ts_ms: Date.now(),
					value: { kind: 'json', value: windows }
				});
			}
		} catch {
			// list_windows can fail (non-Windows, permission) — leave the last sample, retry next tick.
		}
		if (!stopped) timer = setTimeout(tick, intervalMs);
	};
	void tick();

	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
	};
}
