// Presentational meter (atom): embeds a web page in an <iframe>. Pure / props-only — WidgetHost feeds
// the config as props (binds:'none', no sensor); the only state is LOCAL view-state (load/blocked
// flags + the auto-refresh remount key), so no store, no Tauri, no useSensor (AGENTS.md §6). Niceties:
// empty/invalid-URL placeholder, a loading spinner, a blocked hint, auto-refresh, secure-by-default
// sandbox + referrer, and decorative-vs-interactive click-through (the 0×0 sentinel — see below).
//
// Blocked detection is a load-timeout heuristic, not onError: a frame refused by X-Frame-Options /
// CSP frame-ancestors fails SILENTLY (the browser shows its own error page as a "load", or nothing
// fires — React doesn't even dispatch onError for iframes), so a timeout the real load cancels is the
// only reliable signal.
import {
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type HTMLAttributeReferrerPolicy
} from 'react';
import { normalizeUrl, safeReferrerPolicy, sandboxValue } from './iframeUtils';
import './Iframe.css';

type Props = {
	url?: string;
	refresh?: number; // auto-reload interval in seconds; 0 = off
	scroll?: boolean; // allow scrolling inside the frame
	interact?: boolean; // catch clicks in the passive overlay (vs. pass them through to the desktop)
	sandbox?: boolean; // apply the opaque-origin sandbox (recommended)
	referrerPolicy?: string; // what Referer the embedded page sees
	title?: string; // a11y label for the frame
	timeoutMs?: number; // how long to wait for a load before showing the blocked hint
};

export default function Iframe({
	url = '',
	refresh = 0,
	scroll = false,
	interact = false,
	sandbox = true,
	referrerPolicy = 'no-referrer',
	title = '',
	timeoutMs = 6000
}: Props) {
	const src = normalizeUrl(url);
	const [reloadKey, setReloadKey] = useState(0);
	const [loaded, setLoaded] = useState(false);
	const [blocked, setBlocked] = useState(false);
	const timerRef = useRef<number | null>(null);

	const clearTimer = () => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	};

	// Auto-refresh: bump the remount key on an interval so the frame fully reloads. Re-armed when the
	// URL or interval changes; off when either is empty / non-positive.
	useEffect(() => {
		if (!src || refresh <= 0) return;
		const id = setInterval(() => setReloadKey((k) => k + 1), refresh * 1000);
		return () => clearInterval(id);
	}, [src, refresh]);

	// Each load cycle (new URL, or a refresh remount): reset the load/blocked flags and arm the
	// blocked-timeout. onLoad clears it; if it fires first we assume the page refused framing / is
	// unreachable. reloadKey is a dep so a refresh re-runs the whole cycle.
	useEffect(() => {
		if (!src) return;
		setLoaded(false);
		setBlocked(false);
		clearTimer();
		timerRef.current = window.setTimeout(() => {
			timerRef.current = null;
			setBlocked(true);
		}, Math.max(0, timeoutMs));
		return clearTimer;
	}, [src, reloadKey, timeoutMs]);

	const onLoad = () => {
		clearTimer();
		setLoaded(true);
		setBlocked(false);
	};

	if (!src) {
		return (
			<div className="np-iframe" data-part="root" data-empty="true">
				<div className="np-iframe-msg" data-part="placeholder">
					{url.trim() ? 'Invalid URL' : 'Add a URL in config'}
				</div>
			</div>
		);
	}

	const sandboxAttr = sandboxValue(!!sandbox);
	const frameStyle: CSSProperties = { pointerEvents: interact ? 'auto' : 'none' };

	return (
		<div
			className="np-iframe"
			data-part="root"
			data-loading={!loaded && !blocked}
			data-blocked={blocked}
		>
			<iframe
				key={reloadKey}
				className="np-iframe-frame"
				data-part="frame"
				src={src}
				title={title.trim() || 'Embedded web page'}
				loading="lazy"
				referrerPolicy={safeReferrerPolicy(referrerPolicy) as HTMLAttributeReferrerPolicy}
				style={frameStyle}
				onLoad={onLoad}
				// Default frames already scroll (auto), so only the OFF case needs the (legacy-but-only)
				// `scrolling` attribute — there is no CSS way to stop a cross-origin frame scrolling.
				{...(scroll ? {} : { scrolling: 'no' })}
				{...(sandboxAttr ? { sandbox: sandboxAttr } : {})}
				// Interactive: tag the frame so passive click-through gives it a catch rect (its full box).
				// Omitted entirely when decorative — a literal data-interactive="false" would still match.
				{...(interact ? { 'data-interactive': true } : {})}
			/>
			{/* Decorative click-through: a 0×0 aria-hidden [data-interactive] sentinel. Canvas's catch-rect
			    scan then finds a matching target (so it skips the whole-box fallback) whose 0-area rect is
			    filtered out — yielding NO catch rect, so passive clicks pass through to the desktop. In
			    interactive mode the sentinel is absent and the frame above is the (full-box) catch target. */}
			{!interact && <span className="np-iframe-sentinel" data-interactive aria-hidden="true" />}
			{!loaded && !blocked && <div className="np-iframe-spinner" data-part="spinner" />}
			{blocked && (
				<div className="np-iframe-msg" data-part="blocked" role="status">
					Content blocked or unreachable
				</div>
			)}
		</div>
	);
}
