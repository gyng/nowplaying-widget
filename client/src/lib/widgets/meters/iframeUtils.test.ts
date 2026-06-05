import { describe, expect, it } from 'vitest';
import { normalizeUrl, safeReferrerPolicy, sandboxValue } from './iframeUtils';

describe('normalizeUrl', () => {
	it('returns empty for blank / whitespace input', () => {
		expect(normalizeUrl('')).toBe('');
		expect(normalizeUrl('   ')).toBe('');
		// @ts-expect-error — guards against undefined sneaking in from config
		expect(normalizeUrl(undefined)).toBe('');
	});

	it('prefixes https:// to bare domains and host:port', () => {
		expect(normalizeUrl('example.com')).toBe('https://example.com/');
		// host:port must NOT be mistaken for a scheme:opaque URL
		expect(normalizeUrl('home-assistant.local:8123/lovelace')).toBe(
			'https://home-assistant.local:8123/lovelace'
		);
		expect(normalizeUrl('localhost:3000')).toBe('https://localhost:3000/');
	});

	it('keeps http:// (LAN dashboards) and https:// as-is', () => {
		expect(normalizeUrl('http://ha.local:8123/')).toBe('http://ha.local:8123/');
		expect(normalizeUrl('https://grafana.local/d/abc?orgId=1')).toBe(
			'https://grafana.local/d/abc?orgId=1'
		);
	});

	it('trims surrounding whitespace', () => {
		expect(normalizeUrl('  https://example.com/  ')).toBe('https://example.com/');
	});

	it('normalizes a protocol-relative URL to https', () => {
		expect(normalizeUrl('//example.com')).toBe('https://example.com/');
	});

	it('rejects script / data / file schemes (any casing)', () => {
		expect(normalizeUrl('javascript:alert(1)')).toBe('');
		expect(normalizeUrl('jAvAsCrIpT:alert(1)')).toBe('');
		expect(normalizeUrl('  javascript:alert(1)')).toBe('');
		expect(normalizeUrl('vbscript:msgbox(1)')).toBe('');
		expect(normalizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
		expect(normalizeUrl('file:///C:/Windows/win.ini')).toBe('');
		expect(normalizeUrl('about:blank')).toBe('');
	});

	it('rejects other non-http(s) schemes instead of wrapping them in https://', () => {
		// Regression: these are NOT in a blocklist but must still be rejected (not turned into
		// https://ftp://… etc.). A real scheme that isn't http/https is invalid for a frame.
		expect(normalizeUrl('ftp://example.com')).toBe('');
		expect(normalizeUrl('mailto:test@example.com')).toBe('');
		expect(normalizeUrl('gopher://example.com')).toBe('');
		expect(normalizeUrl('chrome://settings')).toBe('');
	});

	it('strips embedded credentials so they never reach the DOM src', () => {
		expect(normalizeUrl('https://user:p%40ss@grafana.local/d/x')).toBe('https://grafana.local/d/x');
		expect(normalizeUrl('http://admin:secret@192.168.1.5:8123/')).toBe('http://192.168.1.5:8123/');
	});

	it('rejects unparseable input', () => {
		expect(normalizeUrl('http://')).toBe('');
	});
});

describe('safeReferrerPolicy', () => {
	it('keeps valid policies', () => {
		expect(safeReferrerPolicy('no-referrer')).toBe('no-referrer');
		expect(safeReferrerPolicy('origin')).toBe('origin');
		expect(safeReferrerPolicy('strict-origin-when-cross-origin')).toBe(
			'strict-origin-when-cross-origin'
		);
	});

	it('falls back to no-referrer for invalid / empty values', () => {
		expect(safeReferrerPolicy('orgin')).toBe('no-referrer');
		expect(safeReferrerPolicy('')).toBe('no-referrer');
		expect(safeReferrerPolicy(undefined)).toBe('no-referrer');
	});
});

describe('sandboxValue', () => {
	it('grants only allow-scripts when enabled (opaque origin, no same-origin)', () => {
		expect(sandboxValue(true)).toBe('allow-scripts');
		expect(sandboxValue(true)).not.toContain('allow-same-origin');
	});

	it('returns "" when disabled (caller omits the attribute entirely)', () => {
		expect(sandboxValue(false)).toBe('');
	});
});
