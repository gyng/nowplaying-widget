// The AI Provider plugin's status feed: unlike HA/MQTT/Stocks (whose backends emit a live
// `*.status` telemetry sample), provider readiness comes from the `llm_config_status` command —
// so the plugin ingests its own `llm.status` text sample into the hub (once at source start, and
// again after the settings panel saves), and the studio's Plugins-list dot reads it like any
// other status sensor. The text → readiness mapping is pure and tested (llm-status.test.ts).

import type { TelemetryHub } from '../../core/telemetry';
import { providerMeta } from '../../core/llm';
import type { LlmStatus } from './llm-types';

export const LLM_STATUS_SENSOR = 'llm.status';

/** Pure: 'configured' iff the ACTIVE provider is usable (saved config + a key, or needs none). */
export function llmStatusText(s: LlmStatus): 'configured' | 'unconfigured' {
	if (!s.configured || !s.active) return 'unconfigured';
	const usable = !providerMeta(s.active).needsKey || !!s.providers[s.active]?.hasKey;
	return usable ? 'configured' : 'unconfigured';
}

/** Push the readiness sample into the hub (the Plugins-list dot subscribes via useSensor). */
export function ingestLlmStatus(hub: TelemetryHub, s: LlmStatus): void {
	hub.ingest({
		sensor: LLM_STATUS_SENSOR,
		ts_ms: Date.now(),
		value: { kind: 'text', value: llmStatusText(s) }
	});
}
