import { describe, it, expect } from 'vitest';
import { emptyRoot, isContainer, isLeaf, isGroup, type MonitorLayout } from './layoutTree';
import {
	applyAssistantOps,
	applyDelta,
	buildAssistantMessages,
	buildBriefingMessages,
	buildTranslateMessages,
	buildLayoutSystemPrompt,
	describeLayout,
	emptyChat,
	formatReadings,
	parseAssistantReply,
	providerMeta,
	startTurn,
	type AssistantOp
} from './llm';
import { listMetas } from './widget';

const monitor = (): MonitorLayout => ({ root: emptyRoot(), floating: [] });

// A deterministic id generator for the pure applier (the editor passes a rand-based one).
function counter(): (type: string) => string {
	let n = 0;
	return (type: string) => `${type}-${++n}`;
}

describe('providers', () => {
	it('resolves known providers and falls back to openai', () => {
		expect(providerMeta('ollama').needsKey).toBe(false);
		expect(providerMeta('anthropic').needsKey).toBe(true);
		expect(providerMeta('nonsense').id).toBe('openai');
	});
});

describe('chat reducer (applyDelta)', () => {
	it('streams tokens into the matching turn and finalizes on done', () => {
		let s = startTurn(emptyChat(), 'r1');
		s = applyDelta(s, { requestId: 'r1', token: 'Hel', done: false });
		s = applyDelta(s, { requestId: 'r1', token: 'lo', done: false });
		expect(s.turns[0].content).toBe('Hello');
		expect(s.turns[0].streaming).toBe(true);
		s = applyDelta(s, { requestId: 'r1', token: '', done: true });
		expect(s.turns[0].streaming).toBe(false);
	});

	it('records an error frame and stops streaming', () => {
		let s = startTurn(emptyChat(), 'r1');
		s = applyDelta(s, { requestId: 'r1', token: '', done: true, error: 'bad key' });
		expect(s.turns[0].error).toBe('bad key');
		expect(s.turns[0].streaming).toBe(false);
	});

	it('seeds a turn for an unknown id rather than dropping the token', () => {
		const s = applyDelta(emptyChat(), { requestId: 'x', token: 'hi', done: false });
		expect(s.turns).toHaveLength(1);
		expect(s.turns[0].content).toBe('hi');
	});

	it('returns the SAME state for a no-op frame (duplicate done / done for unknown id)', () => {
		const base = applyDelta(startTurn(emptyChat(), 'r1'), {
			requestId: 'r1',
			token: 'hi',
			done: true
		});
		// a second terminal done for the now-finalized turn changes nothing → same reference (no re-render)
		expect(applyDelta(base, { requestId: 'r1', token: '', done: true })).toBe(base);
		// a done for an id we never opened is also a no-op
		expect(applyDelta(base, { requestId: 'ghost', token: '', done: true })).toBe(base);
	});
});

describe('parseAssistantReply', () => {
	it('parses a bare ops object', () => {
		const r = parseAssistantReply('{"ops":[{"op":"clear"}],"summary":"cleared"}');
		expect(r?.ops).toEqual([{ op: 'clear' }]);
		expect(r?.summary).toBe('cleared');
	});

	it('tolerates markdown fences and surrounding prose', () => {
		const reply =
			'Sure!\n```json\n{ "ops": [ { "op": "addWidget", "widgetType": "gauge" } ], "summary": "added a gauge" }\n```\nDone.';
		const r = parseAssistantReply(reply);
		expect(r?.ops).toHaveLength(1);
		expect((r?.ops[0] as { widgetType: string }).widgetType).toBe('gauge');
	});

	it('drops ops with an unknown verb and returns the valid ones', () => {
		const r = parseAssistantReply('{"ops":[{"op":"nuke"},{"op":"clear"}]}');
		expect(r?.ops).toEqual([{ op: 'clear' }]);
	});

	it('skips a leading sibling object (reasoning envelope) and finds the ops object', () => {
		const reply =
			'{"thinking":"let me plan {nested}"}\n{"ops":[{"op":"clear"}],"summary":"cleared"}';
		const r = parseAssistantReply(reply);
		expect(r?.ops).toEqual([{ op: 'clear' }]);
		expect(r?.summary).toBe('cleared');
	});

	it('returns null on non-JSON / missing ops', () => {
		expect(parseAssistantReply('no json here')).toBeNull();
		expect(parseAssistantReply('{"summary":"x"}')).toBeNull();
	});
});

describe('briefing', () => {
	it('formats a readings snapshot and drops blanks', () => {
		expect(formatReadings({ 'cpu.total': 42, 'gpu.util': 7, 'net.adapter': '' })).toBe(
			'cpu.total=42, gpu.util=7'
		);
		expect(formatReadings({})).toBe('(no readings available)');
	});

	it('builds a system + user briefing message pair', () => {
		const m = buildBriefingMessages({ 'cpu.total': 90 });
		expect(m).toHaveLength(2);
		expect(m[0].role).toBe('system');
		expect(m[1].content).toContain('cpu.total=90');
	});

	it('builds an assistant message pair from a custom prompt + readings', () => {
		const m = buildAssistantMessages('Are we OK?', { 'cpu.total': 50 });
		expect(m[0].role).toBe('system');
		expect(m[1].content).toContain('Are we OK?');
		expect(m[1].content).toContain('cpu.total=50');
	});

	it('builds translate messages targeting a language', () => {
		const m = buildTranslateMessages('hello', 'Spanish');
		expect(m[0].content).toContain('Spanish');
		expect(m[1].content).toBe('hello');
		// blank target falls back to English
		expect(buildTranslateMessages('hi', '  ')[0].content).toContain('English');
	});
});

describe('buildLayoutSystemPrompt', () => {
	it('lists real widget types and the supplied sensors', () => {
		const prompt = buildLayoutSystemPrompt(listMetas(), ['cpu.total', 'gpu.util']);
		expect(prompt).toContain('gauge');
		expect(prompt).toContain('cpu.total');
		expect(prompt).toContain('gpu.util');
		// the op grammar is taught
		expect(prompt).toContain('addWidget');
	});
});

describe('applyAssistantOps', () => {
	it('adds a sensor-bound widget into the root', () => {
		const ops: AssistantOp[] = [
			{ op: 'addWidget', widgetType: 'gauge', sensor: 'cpu.total', config: { label: 'CPU' } }
		];
		const res = applyAssistantOps(monitor(), ops, counter());
		expect(res.applied).toBe(1);
		expect(res.errors).toHaveLength(0);
		const items = describeLayout(res.monitor);
		expect(items).toHaveLength(1);
		expect(items[0].type).toBe('gauge');
		expect(items[0].sensor).toBe('cpu.total');
		// the config override landed
		const leafNode = res.monitor.root.children[0];
		expect(isLeaf(leafNode) && !isGroup(leafNode.unit) && leafNode.unit.config.label).toBe('CPU');
	});

	it('rejects a sensor on a self-sourcing widget but still places it', () => {
		const res = applyAssistantOps(
			monitor(),
			[{ op: 'addWidget', widgetType: 'clock', sensor: 'cpu.total' }],
			counter()
		);
		expect(res.applied).toBe(1);
		expect(res.errors.join(' ')).toMatch(/self-sourcing/);
		expect(describeLayout(res.monitor)[0].sensor).toBeUndefined();
	});

	it('setSensor enforces the self-sourcing gate too (a clock cannot be given a sensor)', () => {
		let res = applyAssistantOps(monitor(), [{ op: 'addWidget', widgetType: 'clock' }], counter());
		const id = res.addedIds[0];
		res = applyAssistantOps(res.monitor, [{ op: 'setSensor', id, sensor: 'cpu.total' }], counter());
		expect(res.applied).toBe(0);
		expect(res.errors.join(' ')).toMatch(/self-sourcing/);
		expect(describeLayout(res.monitor)[0].sensor).toBeUndefined();
	});

	it('setSensor rebinds a sensor-bound widget', () => {
		let res = applyAssistantOps(
			monitor(),
			[{ op: 'addWidget', widgetType: 'gauge', sensor: 'cpu.total' }],
			counter()
		);
		const id = res.addedIds[0];
		res = applyAssistantOps(res.monitor, [{ op: 'setSensor', id, sensor: 'gpu.util' }], counter());
		expect(res.applied).toBe(1);
		expect(describeLayout(res.monitor)[0].sensor).toBe('gpu.util');
	});

	it('a sensor-bound widget added with no sensor keeps its type default (intentional)', () => {
		// addWidget gauge with no `sensor` inherits the meta default (cpu.total) — a useful starting
		// point the user can rebind, rather than an unbound placeholder. Pinned so it can't drift silently.
		const res = applyAssistantOps(monitor(), [{ op: 'addWidget', widgetType: 'gauge' }], counter());
		expect(describeLayout(res.monitor)[0].sensor).toBe('cpu.total');
	});

	it('reports an unknown widget type without aborting the batch', () => {
		const res = applyAssistantOps(
			monitor(),
			[
				{ op: 'addWidget', widgetType: 'definitely-not-real' },
				{ op: 'addWidget', widgetType: 'clock' }
			],
			counter()
		);
		expect(res.applied).toBe(1); // only the clock
		expect(res.errors.join(' ')).toMatch(/unknown widget type/);
		expect(describeLayout(res.monitor)).toHaveLength(1);
	});

	it('removes, reconfigures, and clears', () => {
		let res = applyAssistantOps(
			monitor(),
			[{ op: 'addWidget', widgetType: 'gauge', sensor: 'cpu.total' }],
			counter()
		);
		const id = res.addedIds[0];
		res = applyAssistantOps(
			res.monitor,
			[{ op: 'setConfig', id, config: { max: 200 } }],
			counter()
		);
		const node = res.monitor.root.children[0];
		expect(isLeaf(node) && !isGroup(node.unit) && node.unit.config.max).toBe(200);

		res = applyAssistantOps(res.monitor, [{ op: 'removeWidget', id }], counter());
		expect(describeLayout(res.monitor)).toHaveLength(0);

		// clear is a no-op-safe reset
		const cleared = applyAssistantOps(res.monitor, [{ op: 'clear' }], counter());
		expect(isContainer(cleared.monitor.root)).toBe(true);
		expect(cleared.monitor.root.children).toHaveLength(0);
	});

	it('nests into a created container', () => {
		let res = applyAssistantOps(monitor(), [{ op: 'addContainer', kind: 'row' }], counter());
		const containerId = res.addedIds[0];
		res = applyAssistantOps(
			res.monitor,
			[{ op: 'addWidget', widgetType: 'clock', parent: containerId }],
			counter()
		);
		const item = describeLayout(res.monitor).find((i) => i.type === 'clock');
		expect(item?.container).toBe(containerId);
	});

	it('does not mutate the input monitor', () => {
		const m = monitor();
		const before = JSON.stringify(m);
		applyAssistantOps(m, [{ op: 'addWidget', widgetType: 'clock' }], counter());
		expect(JSON.stringify(m)).toBe(before);
	});
});
