// Pure resolver for conditional-container visibility: walk the flow tree, find containers with a
// `condition`, and (given the live window list + sensor values) compute which container ids are
// currently HIDDEN. The React layer (Canvas) supplies the live ConditionContext and applies the set
// as visibility:hidden in FlowNode. Kept pure + co-located-testable; no React/Tauri.

import { isContainer, type LayoutNode } from '../../core/layoutTree';
import {
	conditionMet,
	conditionRefs,
	type Condition,
	type ConditionContext
} from '../../core/condition';

export type ConditionalNode = { id: string; condition: Condition };

/** Every container in the subtree that carries a condition (depth-first, stable order). */
export function collectConditions(node: LayoutNode): ConditionalNode[] {
	const out: ConditionalNode[] = [];
	const walk = (n: LayoutNode): void => {
		if (!isContainer(n)) return; // conditions live on containers; leaves have none
		if (n.condition) out.push({ id: n.id, condition: n.condition });
		n.children.forEach(walk);
	};
	walk(node);
	return out;
}

/** The de-duplicated sensor ids all the conditions depend on (what to subscribe to). */
export function conditionSensorRefs(conds: readonly ConditionalNode[]): string[] {
	const s = new Set<string>();
	for (const c of conds) for (const r of conditionRefs(c.condition)) s.add(r);
	return [...s];
}

/** The set of container ids whose condition is currently UNsatisfied (→ hide, keep space). */
export function hiddenContainerIds(
	conds: readonly ConditionalNode[],
	ctx: ConditionContext
): Set<string> {
	const hidden = new Set<string>();
	for (const c of conds) if (!conditionMet(c.condition, ctx)) hidden.add(c.id);
	return hidden;
}
