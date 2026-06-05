// Generate (or validate) the committed docs/ reference files from the code that defines them
// (the single source of truth):
//   docs/widgets.md     — every shipped widget type + its config schema (the widget registry)
//   docs/templating.md  — the formula/template language (helper fns, formats, expr fields)
//   npm run gen:docs    — (re)write both files
//   npm run check:docs  — exit non-zero if either committed file is stale (for CI / pre-commit)
// Importing core/widget registers the built-in (shipped) metas. Plugin widget types register at
// runtime in the webview (their import graph touches browser globals absent under vite-node), so the
// studio's "Copy widget reference" button is the way to get the complete set; this documents built-ins.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listMetas } from '../src/lib/core/widget';
import { widgetReferenceMarkdown } from '../src/lib/core/widgetDocs';
import { templatingReferenceMarkdown } from '../src/lib/core/templatingDocs';

const check = process.argv.includes('--check');
const metas = listMetas();
// Compare line-ending-insensitively so a CRLF checkout (git autocrlf) doesn't read as stale.
const norm = (s: string): string => s.replace(/\r\n/g, '\n');

const docs: { rel: string; md: string; label: string }[] = [
	{ rel: '../../docs/widgets.md', md: widgetReferenceMarkdown(metas), label: `${metas.length} built-in widgets` },
	{ rel: '../../docs/templating.md', md: templatingReferenceMarkdown(metas), label: 'templating language' }
];

let stale = false;
for (const doc of docs) {
	const out = fileURLToPath(new URL(doc.rel, import.meta.url));
	if (check) {
		const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
		if (norm(current) !== norm(doc.md)) {
			console.error(
				`✗ ${doc.rel.replace('../../', '')} is out of date.\n` +
					'  Run "npm run gen:docs" (in client/) and commit the result.'
			);
			stale = true;
		} else {
			console.log(`✓ ${doc.rel.replace('../../', '')} is up to date (${doc.label}).`);
		}
	} else {
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(out, doc.md);
		console.log(`wrote ${out} (${doc.label})`);
	}
}

if (check && stale) process.exit(1);
