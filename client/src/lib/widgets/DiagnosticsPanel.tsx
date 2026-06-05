// Studio Diagnostics panel (settings → Diagnostics): polls every window over the diag bridge and shows
// each one's JS heap, retained now-playing sessions + album-art bytes, sensor counts, and DOM size —
// so a memory leak shows up as a climbing heap (and a climbing "art" total is the media-store
// fingerprint). For overlays it also exposes the debug controls you can't reach on a click-through
// window: open its devtools, and toggle click-through off so you can interact with / right-click it.
// All cross-window plumbing lives in lib/diag.ts; the folds/shapes in core/diagnostics.ts.
import { useEffect, useState } from 'react';
import { heapUsedFraction, mergeReport, pruneStale, type WindowDiag } from '../core/diagnostics';
import { formatBytes } from '../core/format';
import { formatDuration } from '../core/timer';
import {
	getProcessDiagnostics,
	listenDiagReports,
	requestDiagnostics,
	sendDiagCommand,
	type ProcessDiag
} from '../diag';
import './DiagnosticsPanel.css';

const POLL_MS = 1500;
// Drop a window that's missed several polls (closed / crashed) so it doesn't linger as a ghost row.
const STALE_MS = 6000;

export default function DiagnosticsPanel() {
	const [reports, setReports] = useState<Record<string, WindowDiag>>({});
	// The native (Rust host) process's CPU% + memory — polled by command, not the per-window bridge.
	const [proc, setProc] = useState<ProcessDiag | null>(null);
	// Local mirror of the click-through toggle we last sent each overlay (the overlay owns the truth;
	// this just reflects the control state).
	const [interactive, setInteractive] = useState<Record<string, boolean>>({});

	useEffect(() => {
		let alive = true;
		const offReports = listenDiagReports((r) => {
			if (!alive) return;
			// Re-stamp arrival on the STUDIO clock — each window's performance.now() is its own domain, so
			// the reporter's `at` isn't comparable across windows; the studio clock makes pruning valid.
			setReports((prev) => mergeReport(prev, { ...r, at: performance.now() }));
		});
		// Poll the native process alongside the per-window heap poll (CPU% needs the repeated call to
		// build a delta, so the first tick reads ~0 and settles after one interval).
		const pollProc = () =>
			void getProcessDiagnostics().then((p) => {
				if (alive && p) setProc(p);
			});
		requestDiagnostics();
		pollProc();
		const poll = window.setInterval(() => {
			requestDiagnostics();
			pollProc();
		}, POLL_MS);
		const prune = window.setInterval(
			() => setReports((prev) => pruneStale(prev, performance.now(), STALE_MS)),
			POLL_MS
		);
		return () => {
			alive = false;
			void offReports.then((un) => un());
			clearInterval(poll);
			clearInterval(prune);
		};
	}, []);

	const rows = Object.values(reports).sort((a, b) => a.label.localeCompare(b.label));

	const toggleInteractive = (label: string, value: boolean): void => {
		setInteractive((m) => ({ ...m, [label]: value }));
		sendDiagCommand(label, { action: 'interactive', value });
	};

	return (
		<div className="diag">
			{proc && (
				<div className="diag-win diag-proc">
					<div className="diag-win-hd">
						<span className="diag-label">native process</span>
						<span className="dim">
							Rust host · pid {proc.pid} · {proc.cpus} cpus
						</span>
					</div>
					<div className="diag-stats">
						<span title="Host-process CPU as a % of the whole machine (WebView2 renderers are separate processes — their JS heap is the rows below)">
							cpu {proc.cpuPercent.toFixed(1)}%
						</span>
						<span title="Resident set size (physical memory) of the Rust host process">
							rss {formatBytes(proc.memBytes)}
						</span>
						<span title="Virtual memory size of the host process">
							virt {formatBytes(proc.virtualBytes)}
						</span>
						<span title="How long the host process has been running">
							up {formatDuration(proc.uptimeSecs)}
						</span>
					</div>
				</div>
			)}
			{rows.length === 0 ? (
				<div className="rp-stub">Polling windows…</div>
			) : (
				rows.map((r) => {
					const frac = heapUsedFraction(r.heap);
					return (
						<div className="diag-win" key={r.label}>
							<div className="diag-win-hd">
								<span className="diag-label">{r.label}</span>
								<span className="dim">
									{r.role}
									{r.monitor != null ? ` · mon ${r.monitor}` : ''}
								</span>
							</div>
							<div className="diag-stats">
								<span title="JS heap used / limit (Chromium estimate)">
									heap{' '}
									{r.heap
										? `${formatBytes(r.heap.usedBytes)} / ${formatBytes(r.heap.limitBytes)}`
										: 'n/a'}
									{frac != null ? ` · ${Math.round(frac * 100)}%` : ''}
								</span>
								<span title="now-playing sessions retained, and total album-art bytes held">
									sessions {r.sessions} · art {formatBytes(r.artBytes)}
								</span>
								<span title="sensors active / total seen by this window's hub">
									sensors {r.activeSensors}/{r.sensors}
								</span>
								<span title="DOM element count">dom {r.domNodes}</span>
							</div>
							{r.widgets.length > 0 && (
								<div
									className="diag-widgets"
									title="DOM nodes owned per widget type (heaviest first) — a climbing total is a per-widget DOM leak"
								>
									{r.widgets.slice(0, 6).map((w) => (
										<span key={w.type} className="diag-widget">
											{w.type}
											{w.count > 1 ? `×${w.count}` : ''} <b>{w.nodes}</b>
										</span>
									))}
								</div>
							)}
							{r.role !== 'studio' && (
								<div className="diag-actions">
									<button
										type="button"
										onClick={() => sendDiagCommand(r.label, { action: 'devtools' })}
									>
										⌗ Devtools
									</button>
									<label
										className="diag-toggle"
										title="Disable click-through so you can interact with / right-click this overlay (then open devtools). Toggle off when done."
									>
										<input
											type="checkbox"
											checked={!!interactive[r.label]}
											onChange={(e) => toggleInteractive(r.label, e.currentTarget.checked)}
										/>
										interactive
									</label>
								</div>
							)}
						</div>
					);
				})
			)}
			<div className="rp-stub diag-note">
				Watch an overlay’s heap climb to confirm a leak; a steadily-rising “art” total is the
				media-store fingerprint. “Interactive” disables click-through so you can open that overlay’s
				devtools — toggle it back off when done.
			</div>
		</div>
	);
}
