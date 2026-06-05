import { describe, expect, it } from 'vitest';
import { TEMPLATES, getTemplate } from './templates';
import {
	isContainer,
	isGroup,
	isLeaf,
	type Container,
	type LayoutNode,
	type Leaf,
	type WidgetInstance
} from './layoutTree';

// Flatten all primitive widget units in a flow tree.
function leaves(node: LayoutNode): WidgetInstance[] {
	if (isContainer(node)) return node.children.flatMap(leaves);
	return isGroup(node.unit) ? [] : [node.unit];
}
// All container/leaf nodes in the tree.
function nodes(node: LayoutNode): LayoutNode[] {
	return isContainer(node) ? [node, ...node.children.flatMap(nodes)] : [node];
}
function treeOf(id: string): LayoutNode {
	const t = getTemplate(id);
	if (!t) throw new Error(`template ${id} missing`);
	return t.tree();
}

describe('templates', () => {
	it('every template is a flow tree of known widget types, with a positive size', () => {
		const known = new Set([
			'clock',
			'text',
			'sparkline',
			'nowplaying',
			'bar',
			'gauge',
			'button',
			'analogclock',
			'cpu'
		]);
		for (const t of TEMPLATES) {
			const ls = leaves(t.tree());
			expect(ls.length).toBeGreaterThan(0);
			for (const w of ls) {
				expect(known.has(w.type)).toBe(true);
				expect(w.rect).toBeTruthy();
			}
			expect(t.size.w).toBeGreaterThan(0);
			expect(t.size.h).toBeGreaterThan(0);
		}
	});

	it('clock-jp: analog icon, ja weekday, and a date ROW (DD + MMMM hugging content, adjacent)', () => {
		const tree = treeOf('clock-jp');
		const ls = leaves(tree);
		expect(ls.some((w) => w.type === 'analogclock')).toBe(true);
		expect(ls.find((w) => w.config.format === 'ddd')?.config.locale).toBe('ja');
		const dateRow = nodes(tree)
			.filter((n): n is Container => isContainer(n) && n.kind === 'row')
			.find(
				(r) =>
					r.children.length === 2 &&
					r.children.every((c) => isLeaf(c) && !isGroup(c.unit) && c.unit.type === 'clock')
			);
		expect(dateRow).toBeTruthy();
		expect(((dateRow?.children ?? []) as Leaf[]).every((c) => c.basis === 'content')).toBe(true);
	});

	it('system: five value readouts + the per-core cpu grid widget', () => {
		const ls = leaves(treeOf('system'));
		expect(ls.filter((w) => w.type === 'text')).toHaveLength(5); // CPU/RAM/SWAP/GPU/VRAM
		expect(ls.some((w) => w.type === 'cpu' && w.config.mode === 'cores')).toBe(true);
	});

	it('network: two histogram sparklines + two auto-scaled rate readouts', () => {
		const ls = leaves(treeOf('network'));
		expect(ls.filter((w) => w.type === 'sparkline' && w.config.histogram === true)).toHaveLength(2);
		expect(ls.filter((w) => w.type === 'text' && w.config.format === 'rate')).toHaveLength(2);
	});

	it('returns a fresh, independent tree each call', () => {
		expect(treeOf('system')).not.toBe(treeOf('system'));
	});
});
