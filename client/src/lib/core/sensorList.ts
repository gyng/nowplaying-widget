// Pure helpers for the studio's sensor list (widgets/SensorList.tsx): value formatting, id
// filtering, and grouping by source. Framework-agnostic and unit-tested here so the React
// component stays a clean, Fast-Refresh-friendly module (component-only exports).
import { formatScalar, guessSensorFormat } from './format';
import type { SensorValue } from './telemetry';

/** A short, human display of a sensor's current value (pure — unit-tested). */
export function formatSensorValue(v: SensorValue | null): string {
	if (!v) return '—';
	if (v.kind === 'scalar') return Number.isInteger(v.value) ? String(v.value) : v.value.toFixed(2);
	if (v.kind === 'text') return v.value;
	if (v.kind === 'series') {
		const last = v.value.at(-1);
		return last == null ? '[ ]' : `${Number.isInteger(last) ? last : last.toFixed(1)} ⋯`;
	}
	return JSON.stringify(v.value).slice(0, 48);
}

/** Like formatSensorValue, but uses the sensor id's naming convention to render scalars in their
 * natural unit (bytes/rate/duration/percent) — so mem.total reads '16.0 GiB', not '17179869184'. */
export function displaySensorValue(id: string, v: SensorValue | null): string {
	if (v?.kind === 'scalar') return formatScalar(v.value, guessSensorFormat(id));
	return formatSensorValue(v);
}

/** Case-insensitive substring filter over sensor ids (pure — unit-tested). Empty query → all ids. */
export function filterSensorIds(ids: string[], query: string): string[] {
	const q = query.trim().toLowerCase();
	if (!q) return ids;
	return ids.filter((id) => id.toLowerCase().includes(q));
}

export type SensorGroup = { label: string; ids: string[] };

/** The group label that sorts first (the built-in system feed), before plugin groups. */
export const SYSTEM_GROUP = 'System';

/** Bucket sensor ids by `groupFor(id)`. The system group comes first; the remaining (plugin) groups
 * keep first-appearance order. Pure — unit-tested. */
export function groupSensorIds(ids: string[], groupFor: (id: string) => string): SensorGroup[] {
	const buckets = new Map<string, string[]>();
	for (const id of ids) {
		const label = groupFor(id);
		const arr = buckets.get(label);
		if (arr) arr.push(id);
		else buckets.set(label, [id]);
	}
	// Stable sort floats the system group to the top; plugin groups keep insertion order.
	const labels = [...buckets.keys()].sort((a, b) =>
		a === SYSTEM_GROUP ? -1 : b === SYSTEM_GROUP ? 1 : 0
	);
	return labels.map((label) => ({ label, ids: buckets.get(label) as string[] }));
}
