// Framework-agnostic formatting helpers (no Svelte/Tauri). Pure and unit-tested;
// reused as-is by a future React port.

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

/** Human-readable bytes with binary (1024) scaling. */
export function formatBytes(bytes: number, decimals = 1): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${BYTE_UNITS[0]}`;
	const i = Math.min(
		BYTE_UNITS.length - 1,
		Math.max(0, Math.floor(Math.log(bytes) / Math.log(1024)))
	);
	const scaled = bytes / 1024 ** i;
	return `${scaled.toFixed(i === 0 ? 0 : decimals)} ${BYTE_UNITS[i]}`;
}

/** Bytes-per-second as a human-readable rate. */
export function formatRate(bytesPerSec: number, decimals = 1): string {
	return `${formatBytes(bytesPerSec, decimals)}/s`;
}

/** A percentage with fixed decimals. */
export function formatPercent(value: number, decimals = 0): string {
	return `${value.toFixed(decimals)}%`;
}

/** Format a scalar sensor value by a named format. */
export function formatScalar(value: number | null, format: string): string {
	if (value === null) return '–';
	switch (format) {
		case 'percent':
			return formatPercent(value);
		case 'rate':
			return formatRate(value);
		case 'bytes':
			return formatBytes(value);
		case 'integer':
			return Math.round(value).toString();
		default:
			return value.toString();
	}
}

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];
const MONTHS_SHORT = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad2 = (n: number): string => n.toString().padStart(2, '0');

const CLOCK_TOKEN = /\[([^\]]*)\]|YYYY|MMMM|MMM|MM|M|dddd|ddd|DD|D|HH|H|hh|h|mm|m|ss|s|A|a/g;

/** Format a Date with a moment-like token string. Wrap literals in [brackets]. */
export function formatClock(date: Date, format: string): string {
	const h24 = date.getHours();
	const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
	const tokens: Record<string, string> = {
		YYYY: date.getFullYear().toString(),
		MMMM: MONTHS[date.getMonth()],
		MMM: MONTHS_SHORT[date.getMonth()],
		MM: pad2(date.getMonth() + 1),
		M: (date.getMonth() + 1).toString(),
		dddd: DAYS[date.getDay()],
		ddd: DAYS_SHORT[date.getDay()],
		DD: pad2(date.getDate()),
		D: date.getDate().toString(),
		HH: pad2(h24),
		H: h24.toString(),
		hh: pad2(h12),
		h: h12.toString(),
		mm: pad2(date.getMinutes()),
		m: date.getMinutes().toString(),
		ss: pad2(date.getSeconds()),
		s: date.getSeconds().toString(),
		A: h24 < 12 ? 'AM' : 'PM',
		a: h24 < 12 ? 'am' : 'pm'
	};
	return format.replace(CLOCK_TOKEN, (match: string, literal: string | undefined) =>
		literal !== undefined ? literal : tokens[match]
	);
}
