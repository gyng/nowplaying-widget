// Content-fit sizing support: bridge between the (impure) render layer's DOM measurements and the
// (pure) solver. A flow leaf whose basis is 'content' is sized to its rendered HTML/CSS box — the
// WidgetHost measures it and reports a size, the Canvas collects those into a `Measured` map, and
// `applyMeasured` substitutes them into the tree's rects JUST for solving (the stored layout keeps
// the user's own w/h, so this never dirties the document). Pure; co-located tests in measure.test.ts.

import {
	isContainer,
	isGroup,
	type Container,
	type LayoutNode,
	type MonitorLayout
} from '../../core/layoutTree';

export type Measured = Record<string, { w: number; h: number }>;

/** Ids of the flow-tree leaves whose basis is 'content' (primitive widgets only — group instances
 * are sized by their def). The render layer uses this to know which widgets to measure. */
export function contentLeafIds(monitor: MonitorLayout): Set<string> {
	const out = new Set<string>();
	const walk = (n: LayoutNode): void => {
		if (isContainer(n)) {
			n.children.forEach(walk);
			return;
		}
		if (n.basis === 'content' && !isGroup(n.unit)) out.add(n.id);
	};
	walk(monitor.root);
	return out;
}

/**
 * Return a monitor whose 'content' leaves have their rect.{w,h} replaced by the measured size, so
 * the existing solver (which reads rect for 'auto'/'content') lays them out at their rendered size.
 * Returns the SAME monitor reference when nothing changes — so the solve memo doesn't churn and the
 * real (stored) layout is never mutated.
 */
export function applyMeasured(monitor: MonitorLayout, measured: Measured): MonitorLayout {
	const walk = (n: LayoutNode): LayoutNode => {
		if (isContainer(n)) {
			const kids = n.children.map(walk);
			return kids.some((k, i) => k !== n.children[i]) ? { ...n, children: kids } : n;
		}
		if (n.basis !== 'content' || isGroup(n.unit)) return n;
		const m = measured[n.id];
		const u = n.unit;
		if (!m || (u.rect.w === m.w && u.rect.h === m.h)) return n;
		return { ...n, unit: { ...u, rect: { ...u.rect, w: m.w, h: m.h } } };
	};
	const root = walk(monitor.root);
	return root === monitor.root ? monitor : { ...monitor, root: root as Container };
}
