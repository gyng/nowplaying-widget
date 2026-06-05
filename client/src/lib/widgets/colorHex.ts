// Best-effort conversion of any CSS colour string to a `#rrggbb` hex — the only form a native
// `<input type="color">` swatch accepts. Handles #rgb / #rgba / #rrggbb / #rrggbbaa and
// rgb()/rgba() (numbers or %). Anything else (named colours, hsl, var(), gradients) returns null —
// the caller falls back to a neutral swatch and keeps the text field as the source of truth (so an
// rgba alpha or a named colour the swatch can't show still round-trips through the text input).
// Pure; co-located tests in colorHex.test.ts.

const clamp255 = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
const hex2 = (n: number): string => clamp255(n).toString(16).padStart(2, '0');

export function toHexColor(value: string): string | null {
	const v = (value ?? '').trim().toLowerCase();
	if (!v) return null;

	const hex = /^#([0-9a-f]{3,8})$/.exec(v);
	if (hex) {
		const d = hex[1];
		// #rgb / #rgba → expand each nibble; #rrggbb / #rrggbbaa → take the rgb, drop any alpha.
		if (d.length === 3 || d.length === 4) return `#${d[0]}${d[0]}${d[1]}${d[1]}${d[2]}${d[2]}`;
		if (d.length === 6 || d.length === 8) return `#${d.slice(0, 6)}`;
		return null; // 5/7 hex digits are invalid
	}

	const fn = /^rgba?\(([^)]+)\)$/.exec(v);
	if (fn) {
		const parts = fn[1].split(/[,/\s]+/).filter(Boolean);
		if (parts.length < 3) return null;
		const chan = (s: string): number =>
			s.endsWith('%') ? (parseFloat(s) / 100) * 255 : parseFloat(s);
		const [r, g, b] = [chan(parts[0]), chan(parts[1]), chan(parts[2])];
		if ([r, g, b].some((n) => Number.isNaN(n))) return null;
		return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
	}

	return null;
}
