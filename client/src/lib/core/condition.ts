// Conditional-container conditions (pure domain): a discriminated union that decides whether a
// container's contents render at runtime, evaluated against live data — the set of open application
// windows and/or a sensor value. No Tauri / React / DOM here; unit-tested directly. Validation
// follows the BackgroundSpec pattern (core/background.ts): unknown kinds / malformed shapes return
// undefined rather than throwing, so a bad value just means "no condition" (always shown).
//
// Evaluation is intentionally pure: the React layer supplies the current window list + a sensor
// reader (core/canvas/conditionVisibility.ts), so the same logic is testable without a window.

import type { SensorValue } from './telemetry';
import { anyWindowMatches, type WindowDescriptor } from './windowMatch';

/** The synthetic sensor id the overlay feeds with the open-window list (see windows/source.ts). An
 * `appOpen` condition reads it; centralised here so the source + the resolver agree on the id. */
export const WINDOWS_SENSOR = 'windows.open';

export type CompareOp = '>' | '>=' | '<' | '<=' | '==' | '!=';
export const COMPARE_OPS: CompareOp[] = ['>', '>=', '<', '<=', '==', '!='];

/**
 * A container visibility condition.
 * - `appOpen`  — satisfied when a window matching exe/class/title is open (reuses windowMatch).
 * - `sensor`   — satisfied when a scalar/text sensor compares true against `value`.
 * `negate` flips satisfied→hidden, giving the "show when X" vs "hide when X" polarity. A container
 * is shown when its condition is satisfied (or has no condition); hidden (kept-space) otherwise.
 */
export type Condition =
	| {
			kind: 'appOpen';
			matchExe?: string;
			matchClass?: string;
			matchTitle?: string;
			negate?: boolean;
	  }
	| { kind: 'sensor'; sensorId: string; op: CompareOp; value: string; negate?: boolean };

const isStr = (v: unknown): v is string => typeof v === 'string';
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/**
 * Validate raw JSON into a Condition, or undefined when absent/malformed (→ "always shown"). Drops
 * unknown fields. An `appOpen` needs at least one match field; a `sensor` needs id + a valid op.
 */
export function parseCondition(raw: unknown): Condition | undefined {
	if (typeof raw !== 'object' || raw === null) return undefined;
	const o = raw as Record<string, unknown>;
	const negate = o.negate === true ? { negate: true } : {};
	if (o.kind === 'appOpen') {
		const c: Condition = { kind: 'appOpen', ...negate };
		if (nonEmpty(o.matchExe)) c.matchExe = o.matchExe;
		if (nonEmpty(o.matchClass)) c.matchClass = o.matchClass;
		if (nonEmpty(o.matchTitle)) c.matchTitle = o.matchTitle;
		// A fieldless appOpen can't match anything meaningful — treat as no condition.
		if (!c.matchExe && !c.matchClass && !c.matchTitle) return undefined;
		return c;
	}
	if (o.kind === 'sensor') {
		if (!nonEmpty(o.sensorId)) return undefined;
		if (!isStr(o.op) || !COMPARE_OPS.includes(o.op as CompareOp)) return undefined;
		const value = isStr(o.value) ? o.value : o.value == null ? '' : String(o.value);
		return { kind: 'sensor', sensorId: o.sensorId, op: o.op as CompareOp, value, ...negate };
	}
	return undefined;
}

/** The sensor ids a condition depends on — what the resolver subscribes to so it re-evaluates. */
export function conditionRefs(c: Condition): string[] {
	return c.kind === 'appOpen' ? [WINDOWS_SENSOR] : [c.sensorId];
}

/** A scalar/text view of a sensor value for comparison, or null when not comparable. Handles HA-style
 * json by reading its `.state`, and series by its latest sample. */
export function comparableOf(v: SensorValue | null | undefined): number | string | null {
	if (!v) return null;
	if (v.kind === 'scalar') return v.value;
	if (v.kind === 'text') return v.value;
	if (v.kind === 'series') return v.value.at(-1) ?? null;
	// json: HA entities serialize as { state, attributes }; compare against the state if primitive.
	const o = v.value;
	if (o && typeof o === 'object' && 'state' in o) {
		const s = (o as { state: unknown }).state;
		if (typeof s === 'number' || typeof s === 'string') return s;
	}
	return null;
}

function compareSensor(v: SensorValue | null | undefined, op: CompareOp, value: string): boolean {
	const a = comparableOf(v);
	if (a === null) return false; // no data yet → condition not satisfied (don't assert true)
	const numA = typeof a === 'number' ? a : Number(a);
	const numB = Number(value);
	const bothNum = value.trim() !== '' && !Number.isNaN(numA) && !Number.isNaN(numB);
	switch (op) {
		case '>':
			return bothNum && numA > numB;
		case '>=':
			return bothNum && numA >= numB;
		case '<':
			return bothNum && numA < numB;
		case '<=':
			return bothNum && numA <= numB;
		case '==':
			return bothNum ? numA === numB : String(a).trim() === value.trim();
		case '!=':
			return bothNum ? numA !== numB : String(a).trim() !== value.trim();
	}
}

/** The data a condition is evaluated against. `windows` is the live open-window list; `sensorValue`
 * reads the latest value of a sensor id (null when unseen). */
export type ConditionContext = {
	windows: readonly WindowDescriptor[];
	sensorValue: (id: string) => SensorValue | null | undefined;
};

/** Whether the container should be SHOWN. Pure. `negate` flips the satisfied result. */
export function conditionMet(c: Condition, ctx: ConditionContext): boolean {
	if (c.kind === 'appOpen') {
		// An incomplete appOpen (no match fields yet, e.g. just enabled in the editor) is inert — always
		// shown — so a half-authored condition never blanks a container. (parseCondition also drops it.)
		if (!c.matchExe && !c.matchClass && !c.matchTitle) return true;
		const matched = anyWindowMatches(ctx.windows, {
			exe: c.matchExe,
			className: c.matchClass,
			title: c.matchTitle
		});
		return c.negate ? !matched : matched;
	}
	const ok = compareSensor(ctx.sensorValue(c.sensorId), c.op, c.value);
	return c.negate ? !ok : ok;
}
