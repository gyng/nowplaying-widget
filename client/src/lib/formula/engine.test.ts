import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	__disposeFormulaEngine,
	evalExpr,
	initFormulaEngine,
	isFormulaEngineReady
} from './engine';
import { TEMPLATE_FUNCTIONS } from '../core/templateFns';

beforeAll(async () => {
	await initFormulaEngine();
});
afterAll(() => __disposeFormulaEngine());

describe('formula engine', () => {
	it('becomes ready after init', () => {
		expect(isFormulaEngineReady()).toBe(true);
	});

	it('evaluates arithmetic against namespaced sensor values', () => {
		expect(evalExpr('cpu.total / 2 + mem.used', { 'cpu.total': 50, 'mem.used': 10 })).toBe(35);
	});

	it('exposes math helpers (round / toDecimalPlace / clamp)', () => {
		expect(evalExpr('round(cpu.total, 2)', { 'cpu.total': 37.456 })).toBe(37.46);
		expect(evalExpr('toDecimalPlace(mem.used / 3, 1)', { 'mem.used': 100 })).toBe(33.3);
		expect(evalExpr('clamp(cpu.total, 0, 100)', { 'cpu.total': 150 })).toBe(100);
	});

	it('exposes format helpers reused from core/format (bytes / rate / percent)', () => {
		expect(evalExpr('bytes(mem.used)', { 'mem.used': 1024 })).toBe('1.0 KiB');
		expect(evalExpr('rate(net.down)', { 'net.down': 1024 })).toBe('1.0 KiB/s');
		expect(evalExpr('percent(cpu.total, 1)', { 'cpu.total': 37.45 })).toBe('37.5%');
	});

	// Drift guard for the generated templating docs: every helper documented in core/templateFns.ts
	// must actually be a callable function in the sandbox (catches a renamed/removed prelude/host fn).
	it('provides every documented TEMPLATE_FUNCTIONS helper', () => {
		for (const f of TEMPLATE_FUNCTIONS) {
			expect(evalExpr(`typeof ${f.name}`, {})).toBe('function');
		}
	});

	it('supports string-producing expressions and native JS', () => {
		expect(evalExpr(`cpu.total + '%'`, { 'cpu.total': 42 })).toBe('42%');
		expect(evalExpr('(mem.used).toFixed(2)', { 'mem.used': 3.14159 })).toBe('3.14');
	});

	it('returns null on a parse error, unknown reference, or non-finite result', () => {
		expect(evalExpr('cpu.total +', { 'cpu.total': 1 })).toBeNull(); // syntax error
		expect(evalExpr('does.not.exist', {})).toBeNull(); // ReferenceError-ish → TypeError
		expect(evalExpr('1 / 0', {})).toBeNull(); // Infinity → null
	});

	it('is sandboxed — host globals are not reachable', () => {
		expect(evalExpr('typeof process', {})).toBe('undefined');
		expect(evalExpr('typeof globalThis.fetch', {})).toBe('undefined');
	});

	it('kills a runaway expression via the per-eval deadline (no hang)', () => {
		expect(evalExpr('(function(){ while (true) {} })()', {})).toBeNull();
	});

	it('caps memory — a huge single allocation throws (caught → null) instead of ballooning', () => {
		expect(evalExpr(`'x'.repeat(1e8)`, {})).toBeNull(); // ~200 MiB string » 16 MiB cap
	});

	it('does not leak sensor values between evaluations', () => {
		expect(evalExpr('cpu.total', { 'cpu.total': 99 })).toBe(99);
		// A later eval that doesn't provide cpu must not see the previous 99.
		expect(evalExpr('typeof cpu', {})).toBe('undefined');
	});
});
