import { describe, expect, it } from 'vitest';
import {
	TEMPLATES,
	demoSeed,
	freshIds,
	getTemplate,
	instantiateTemplate,
	resolveTemplateOptions,
	type Template
} from './templates';
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

describe('clock cluster params (unified ParamSpec — same mechanism as library def params)', () => {
	const clock = tplOf('clock-jp');

	it('defaults reproduce the original (ja weekday, en date, 24-hour "HHmm")', () => {
		const tree = instantiateTemplate(clock);
		expect(byId(tree, 'dt-time')?.config.format).toBe('HHmm');
		expect(byId(tree, 'dt-day')?.config.locale).toBe('ja');
		expect(byId(tree, 'dt-date')?.config.locale).toBe('en');
		expect(byId(tree, 'dt-month')?.config.locale).toBe('en');
	});

	it('weekday and date languages are independent; dateLang drives BOTH date + month (targets[])', () => {
		const tree = instantiateTemplate(clock, { weekdayLang: 'zh', dateLang: 'ja' });
		expect(byId(tree, 'dt-day')?.config.locale).toBe('zh');
		expect(byId(tree, 'dt-date')?.config.locale).toBe('ja');
		expect(byId(tree, 'dt-month')?.config.locale).toBe('ja');
	});

	it('the time param writes the chosen dayjs format literal (12/24-hour × separator choices)', () => {
		const time = (v: string) =>
			byId(instantiateTemplate(clock, { time: v }), 'dt-time')?.config.format;
		expect(time('HH:mm')).toBe('HH:mm');
		expect(time('HH.mm')).toBe('HH.mm');
		expect(time('h:mm A')).toBe('h:mm A');
		expect(time('hmm A')).toBe('hmm A');
	});

	it('every clock param is a select whose target path actually hits a node (guards a tree reshuffle)', () => {
		for (const p of clock.params ?? []) {
			expect(p.choices?.length, `${p.key} has choices`).toBeGreaterThan(1);
			// Apply a NON-default choice; the instantiated tree must differ from the default tree —
			// proving the index path still resolves (setPath is fail-closed and would silently no-op).
			const other = p.choices?.find((c) => c.value !== p.default)?.value as string;
			const changed = instantiateTemplate(clock, { [p.key]: other });
			expect(JSON.stringify(changed), `param ${p.key} reaches its target`).not.toBe(
				JSON.stringify(instantiateTemplate(clock))
			);
		}
	});
});

describe('resolveTemplateOptions', () => {
	it('fills every param with its default when nothing is passed', () => {
		expect(resolveTemplateOptions(tplOf('clock-jp'))).toEqual({
			time: 'HHmm',
			weekdayLang: 'ja',
			dateLang: 'en'
		});
	});

	it('keeps valid overrides but drops invalid values and unknown keys', () => {
		expect(
			resolveTemplateOptions(tplOf('clock-jp'), { weekdayLang: 'zh', time: '13', bogus: 'x' })
		).toEqual({ weekdayLang: 'zh', dateLang: 'en', time: 'HHmm' });
	});

	it('resolves a template with no params to an empty map', () => {
		expect(resolveTemplateOptions(tplOf('system'))).toEqual({});
	});
});

describe('freshIds', () => {
	it('remaps every node/unit id (typed prefixes, leaf id mirrors unit id) without touching structure', () => {
		const src = treeOf('clock-jp');
		const out = freshIds(src);
		const srcIds = nodes(src).map((n) => n.id);
		const outIds = nodes(out).map((n) => n.id);
		expect(outIds).toHaveLength(srcIds.length);
		expect(new Set(outIds).size).toBe(outIds.length);
		expect(outIds.some((id) => srcIds.includes(id))).toBe(false);
		for (const l of nodes(out).filter(isLeaf)) expect(l.id).toBe(l.unit.id);
		// Structure (and configs) survive: same JSON modulo the ids.
		const strip = (n: LayoutNode): string => JSON.stringify(n, (k, v) => (k === 'id' ? 0 : v));
		expect(strip(out)).toBe(strip(src));
	});
});

describe('demoSeed (the default skin = the templates, single source of truth)', () => {
	it('seeds the system/network/nowplaying templates as floating groups + a demo button', () => {
		const seed = demoSeed();
		const groups = seed.filter((l) => isGroup(l.unit));
		expect(groups.map((l) => (isGroup(l.unit) ? l.unit.name : ''))).toEqual([
			'System monitor',
			'Network',
			'Now playing'
		]);
		// Each group is SELF-CONTAINED (inline child, no library def) and anchored via config x/y.
		for (const g of groups) {
			if (!isGroup(g.unit)) continue;
			expect(g.unit.def).toBeUndefined();
			expect(g.unit.child).toBeTruthy();
			expect(typeof g.unit.config?.x).toBe('number');
			expect(typeof g.unit.config?.y).toBe('number');
		}
		const button = seed.find((l) => !isGroup(l.unit) && l.unit.type === 'button');
		expect(button, 'interactive demo button present').toBeTruthy();
	});

	it('group contents mirror the actual templates (same widget types/sensors as the source trees)', () => {
		const shape = (n: LayoutNode): string[] =>
			leaves(n)
				.map((w) => `${w.type}:${w.sensor ?? ''}`)
				.sort();
		const seed = demoSeed();
		for (const [i, id] of ['system', 'network', 'nowplaying'].entries()) {
			const g = seed[i];
			if (!isLeaf(g) || !isGroup(g.unit) || !g.unit.child) throw new Error('expected a group');
			expect(shape(g.unit.child), id).toEqual(shape(treeOf(id)));
		}
	});

	it('every call yields fresh, non-colliding ids (including inside the group children)', () => {
		const ids = (ls: Leaf[]): string[] =>
			ls.flatMap((l) => [
				l.id,
				...(isGroup(l.unit) && l.unit.child ? nodes(l.unit.child).map((n) => n.id) : [])
			]);
		const a = ids(demoSeed());
		const b = ids(demoSeed());
		expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
	});
});
