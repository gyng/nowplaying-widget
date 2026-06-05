import { describe, expect, it } from 'vitest';
import { templatingReferenceMarkdown } from './templatingDocs';
import { TEMPLATE_FUNCTIONS } from './templateFns';
import { SCALAR_FORMATS } from './format';
import type { WidgetMeta } from './widget';

const metas: WidgetMeta[] = [
	{
		type: 'text',
		label: 'Text',
		configFields: [
			{ key: 'value', label: 'value (formula)', kind: 'expr', result: 'text', help: 'a template' },
			{ key: 'minExpr', label: 'min', kind: 'expr', result: 'number', target: 'min' }
		]
	}
];

describe('templatingReferenceMarkdown', () => {
	const md = templatingReferenceMarkdown(metas);

	it('has the generated banner + the language sections', () => {
		expect(md).toContain('# Templating & formulas');
		expect(md).toContain('> **Generated**');
		expect(md).toContain('## Template syntax');
		expect(md).toContain('## Helper functions');
		expect(md).toContain('## Named value formats');
		expect(md).toContain('## Where formulas & templates are accepted');
	});

	it('renders every helper function signature (from the registry)', () => {
		for (const f of TEMPLATE_FUNCTIONS) expect(md).toContain(f.signature);
	});

	it('renders every named scalar format (from the registry)', () => {
		for (const f of SCALAR_FORMATS) expect(md).toContain(`\`${f.name}\``);
	});

	it('enumerates expr config fields, distinguishing template from formula', () => {
		expect(md).toContain('| `text` | `value` | template → text |');
		expect(md).toContain('| `text` | `minExpr` | formula → number | overrides `min` |');
	});

	it('documents brace escaping and the – fallback', () => {
		expect(md).toContain('{{');
		expect(md).toContain('–');
	});
});
