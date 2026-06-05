import { describe, expect, it } from 'vitest';
import { TEMPLATES, getTemplate, resolveTemplateOptions, type Template } from './templates';
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

	it('templates colour from theme TOKENS, not baked literals (so widgets follow the active theme)', () => {
		// A `color` set anywhere in a template config must be a var(--np-*) reference — a fixed rgb()/#hex
		// would pin the widget's colour and defeat theming (the bug this guards: Network used literals).
		for (const t of TEMPLATES) {
			for (const w of leaves(t.tree())) {
				const color = w.config.color;
				if (typeof color === 'string') {
					expect(color, `${t.id}/${w.id} color must track a token`).toMatch(/^var\(--np-/);
				}
			}
		}
	});

	it('network: up tracks --np-accent, down tracks --np-label (two-tone, theme-driven)', () => {
		const tree = treeOf('network');
		expect(byId(tree, 'net-up')?.config.color).toBe('var(--np-accent)');
		expect(byId(tree, 'net-down')?.config.color).toBe('var(--np-label)');
		expect(byId(tree, 'net-up-txt')?.config.color).toBe('var(--np-accent)');
		expect(byId(tree, 'net-down-txt')?.config.color).toBe('var(--np-label)');
	});

	it('returns a fresh, independent tree each call', () => {
		expect(treeOf('system')).not.toBe(treeOf('system'));
	});
});

function tplOf(id: string): Template {
	const t = getTemplate(id);
	if (!t) throw new Error(`template ${id} missing`);
	return t;
}
const byId = (tree: LayoutNode, id: string): WidgetInstance | undefined =>
	leaves(tree).find((w) => w.id === id);

describe('clock cluster options', () => {
	const clock = tplOf('clock-jp');

	it('defaults reproduce the original (ja weekday, en date, 24-hour, no separator)', () => {
		const tree = clock.tree();
		expect(byId(tree, 'dt-time')?.config.format).toBe('HHmm');
		expect(byId(tree, 'dt-day')?.config.locale).toBe('ja');
		expect(byId(tree, 'dt-date')?.config.locale).toBe('en');
		expect(byId(tree, 'dt-month')?.config.locale).toBe('en');
	});

	it('weekday and date languages are independent (en/ja/zh)', () => {
		const tree = clock.tree({ weekdayLang: 'zh', dateLang: 'ja' });
		expect(byId(tree, 'dt-day')?.config.locale).toBe('zh');
		expect(byId(tree, 'dt-date')?.config.locale).toBe('ja');
		expect(byId(tree, 'dt-month')?.config.locale).toBe('ja');
	});

	it('12/24-hour and separator compose the time format', () => {
		const time = (opts: Record<string, string>) => byId(clock.tree(opts), 'dt-time')?.config.format;
		expect(time({ hour: '24', separator: 'colon' })).toBe('HH:mm');
		expect(time({ hour: '24', separator: 'dot' })).toBe('HH.mm');
		expect(time({ hour: '12', separator: 'colon' })).toBe('h:mm A');
		expect(time({ hour: '12', separator: 'none' })).toBe('hmm A');
	});
});

describe('resolveTemplateOptions', () => {
	it('fills every option with its default when nothing is passed', () => {
		expect(resolveTemplateOptions(tplOf('clock-jp'))).toEqual({
			weekdayLang: 'ja',
			dateLang: 'en',
			hour: '24',
			separator: 'none'
		});
	});

	it('keeps valid overrides but drops invalid values and unknown keys', () => {
		expect(
			resolveTemplateOptions(tplOf('clock-jp'), { weekdayLang: 'zh', hour: '13', bogus: 'x' })
		).toEqual({ weekdayLang: 'zh', dateLang: 'en', hour: '24', separator: 'none' });
	});

	it('resolves a template with no options to an empty map', () => {
		expect(resolveTemplateOptions(tplOf('system'))).toEqual({});
	});
});
