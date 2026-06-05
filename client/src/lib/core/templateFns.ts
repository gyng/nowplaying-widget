// Single source of truth for the helper FUNCTIONS the formula sandbox injects (formula/engine.ts):
// `round`/`toDecimalPlace`/`clamp` come from the sandbox PRELUDE; `bytes`/`rate`/`percent` are host
// functions wrapping core/format. Pure data so the generated templating docs (core/templatingDocs.ts
// → docs/templating.md) can't drift — and the formula engine test (engine.test.ts) asserts every name
// listed here is actually callable in the sandbox. When you add/rename a sandbox helper, update both.

export type TemplateFn = {
	name: string;
	signature: string; // human-readable signature with default args
	summary: string;
	example: string; // a `{…}` template fragment
};

export const TEMPLATE_FUNCTIONS: TemplateFn[] = [
	{
		name: 'round',
		signature: 'round(x, places = 0)',
		summary: 'Round `x` to `places` decimal places.',
		example: '{round(cpu.total, 1)}'
	},
	{
		name: 'toDecimalPlace',
		signature: 'toDecimalPlace(x, places = 0)',
		summary: 'Alias of `round`.',
		example: '{toDecimalPlace(mem.used / 3, 1)}'
	},
	{
		name: 'clamp',
		signature: 'clamp(x, lo, hi)',
		summary: 'Constrain `x` to the range `[lo, hi]`.',
		example: '{clamp(cpu.total, 0, 100)}'
	},
	{
		name: 'bytes',
		signature: 'bytes(x, places = 1)',
		summary: 'Bytes as a binary-scaled size, e.g. `16.0 GiB`.',
		example: '{bytes(mem.used.bytes)}'
	},
	{
		name: 'rate',
		signature: 'rate(x, places = 1)',
		summary: 'Bytes/second as a size with a `/s` suffix, e.g. `1.0 KiB/s`.',
		example: '{rate(net.down)}'
	},
	{
		name: 'percent',
		signature: 'percent(x, places = 0)',
		summary: 'A number with a trailing `%`.',
		example: '{percent(cpu.total)}'
	}
];
