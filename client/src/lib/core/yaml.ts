// A tiny, dependency-free JSON→YAML emitter for the studio's Inspector "Data" tab (a read-only,
// agent-friendly view of a layout node). It covers exactly the value shapes a layout node holds —
// null, booleans, numbers, strings (incl. multi-line, e.g. a widget's `css`), arrays, and plain
// objects — and is deliberately NOT a parser (the JSON view is the editable one). Pure + unit-tested.

const INDENT = '  ';

// A scalar that YAML can render bare (no quotes / block). Anything ambiguous (empty, edge whitespace,
// an indicator char, a `: ` / ` #`, or something that would re-parse as a bool/null/number) is quoted.
function isPlainSafe(s: string): boolean {
	if (s === '') return false;
	if (/[\n\t]/.test(s)) return false;
	if (/^\s|\s$/.test(s)) return false;
	if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return false;
	if (/:(\s|$)/.test(s) || /\s#/.test(s)) return false;
	if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return false;
	if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return false;
	return true;
}

function quote(s: string): string {
	return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\t/g, '\\t')}"`;
}

function scalar(value: unknown): string {
	if (value === null || value === undefined) return 'null';
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
	const s = String(value);
	return isPlainSafe(s) ? s : quote(s);
}

const yamlKey = (k: string): string => (isPlainSafe(k) && !k.startsWith('-') ? k : quote(k));

const isScalar = (v: unknown): boolean => v === null || v === undefined || typeof v !== 'object';

// Render `prefix value` at `indent`, where prefix is a `key:` or a `-`. Scalars sit inline; a
// multi-line string becomes a block scalar; nested objects/arrays go on following indented lines —
// except an array item that IS an object, whose first key sits inline after the `- ` (idiomatic YAML).
function emitEntry(prefix: string, value: unknown, indent: number): string {
	const pad = INDENT.repeat(indent);
	if (isScalar(value)) {
		if (typeof value === 'string' && value.includes('\n')) {
			const childPad = INDENT.repeat(indent + 1);
			const body = value
				.replace(/\n$/, '')
				.split('\n')
				.map((l) => (l ? childPad + l : ''))
				.join('\n');
			return `${pad}${prefix} |-\n${body}`;
		}
		return `${pad}${prefix} ${scalar(value)}`;
	}
	if (Array.isArray(value)) {
		if (value.length === 0) return `${pad}${prefix} []`;
		return `${pad}${prefix}\n${emitArray(value, indent + 1)}`;
	}
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj);
	if (keys.length === 0) return `${pad}${prefix} {}`;
	if (prefix === '-') {
		// Array item object: first key inline after `- `, the rest aligned under it.
		const childIndent = indent + 1;
		const childPad = INDENT.repeat(childIndent);
		const lines = keys.map((k) => emitEntry(`${yamlKey(k)}:`, obj[k], childIndent));
		const first = lines[0].slice(childPad.length);
		return `${pad}- ${first}${lines.length > 1 ? '\n' + lines.slice(1).join('\n') : ''}`;
	}
	return `${pad}${prefix}\n${emitObject(obj, indent + 1)}`;
}

function emitObject(obj: Record<string, unknown>, indent: number): string {
	return Object.keys(obj)
		.map((k) => emitEntry(`${yamlKey(k)}:`, obj[k], indent))
		.join('\n');
}

function emitArray(arr: unknown[], indent: number): string {
	return arr.map((v) => emitEntry('-', v, indent)).join('\n');
}

/** Serialize a JSON-ish value as YAML. Read-only view (not a round-trip parser). */
export function toYaml(value: unknown): string {
	if (isScalar(value)) return scalar(value);
	if (Array.isArray(value)) return value.length ? emitArray(value, 0) : '[]';
	const obj = value as Record<string, unknown>;
	return Object.keys(obj).length ? emitObject(obj, 0) : '{}';
}
