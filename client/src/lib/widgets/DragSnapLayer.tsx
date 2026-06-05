// Overlay-role live drag-to-zone + on-demand auto-arrange (MVP2/3). Zones are authored as `zone`
// WIDGETS (widgets.json); this reads the floating zone widgets for THIS overlay's monitor, converts
// their local logical-px rects to physical px, and: (a) while a foreign window is dragged with Shift
// held, highlights the zone under the cursor and snaps the window into it on release; (b) on an
// `arrange_zones` event, snaps every open window that matches a zone's rule. Self-contained — mounted
// only on overlay windows (not the studio). Outer-ring wiring around the pure core/dragSnap + arrange.
import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { currentMonitor } from '@tauri-apps/api/window';
import type { Rect } from '../core/layout';
import { DEFAULT_MONITOR } from '../core/layout';
import type { Zone, ZoneMatch } from '../core/zones';
import { armedZone, localToPhysical } from '../core/dragSnap';
import { planArrangement } from '../core/arrange';
import { parseLayoutAny } from '../core/migration';
import { isGroup } from '../core/layoutTree';
import { loadLayoutRaw, pointerProbe, snapWindow, listWindows, monitorParam } from '../overlay';
import './DragSnapLayer.css';

const POLL_MS = 33; // ~30Hz cursor poll while a drag is in progress

type DragPayload = { hwnd: number };
type Mon = { pos: { x: number; y: number }; scale: number };
type ZoneSet = { phys: Zone[]; localById: Map<string, Rect> };

/** Build a ZoneMatch from a zone widget's config (matchExe/matchClass/matchTitle), or undefined when
 * none is set. Field names map onto windowMatch's ZoneRule (exe/className/title). */
function matchOf(config: Record<string, unknown>): ZoneMatch | undefined {
	const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
	const exe = s(config.matchExe);
	const className = s(config.matchClass);
	const title = s(config.matchTitle);
	return exe || className || title ? { exe, className, title } : undefined;
}

/** Parse widgets.json → the floating `zone` widgets for `key`, as physical-px zones (+ a local-rect
 * map for the highlight). Non-zone widgets, groups, and flow-tree leaves are ignored. */
function readZones(raw: string | null, key: string, mon: Mon): ZoneSet {
	const phys: Zone[] = [];
	const localById = new Map<string, Rect>();
	if (!raw) return { phys, localById };
	let layout = null;
	try {
		layout = parseLayoutAny(JSON.parse(raw));
	} catch {
		layout = null;
	}
	const monitor = layout?.monitors[key];
	if (!monitor) return { phys, localById };
	for (const lf of monitor.floating) {
		const unit = lf.unit;
		if (isGroup(unit) || unit.type !== 'zone') continue;
		localById.set(unit.id, unit.rect);
		phys.push({
			id: unit.id,
			rect: localToPhysical(unit.rect, mon.pos, mon.scale),
			match: matchOf(unit.config)
		});
	}
	return { phys, localById };
}

export default function DragSnapLayer() {
	const [highlight, setHighlight] = useState<Rect | null>(null);
	const physRef = useRef<Zone[]>([]);
	const localRef = useRef<Map<string, Rect>>(new Map());
	const hoveredRef = useRef<Zone | null>(null);
	const pollRef = useRef<number | null>(null);
	const busyRef = useRef(false);

	// This overlay's monitor geometry + its zone widgets; reload on layout_changed.
	useEffect(() => {
		let alive = true;
		const key = monitorParam() ?? DEFAULT_MONITOR;
		let mon: Mon = { pos: { x: 0, y: 0 }, scale: 1 };

		const reload = async () => {
			const raw = await loadLayoutRaw();
			if (!alive) return;
			const set = readZones(raw, key, mon);
			physRef.current = set.phys;
			localRef.current = set.localById;
		};

		currentMonitor().then((m) => {
			if (!alive) return;
			if (m) mon = { pos: { x: m.position.x, y: m.position.y }, scale: m.scaleFactor };
			reload();
		});

		const unlisten = listen('layout_changed', reload);
		return () => {
			alive = false;
			unlisten.then((u) => u());
		};
	}, []);

	// Drag lifecycle: poll the cursor between win_drag_start and win_drag_end; highlight + snap.
	// Plus arrange_zones: snap every matching open window into its zone.
	useEffect(() => {
		const stopPoll = () => {
			if (pollRef.current !== null) {
				window.clearInterval(pollRef.current);
				pollRef.current = null;
			}
		};

		const tick = async () => {
			if (busyRef.current) return; // don't overlap probes if one is slow
			busyRef.current = true;
			try {
				const z = armedZone(physRef.current, await pointerProbe());
				hoveredRef.current = z;
				setHighlight(z ? localRef.current.get(z.id) ?? null : null);
			} finally {
				busyRef.current = false;
			}
		};

		const startP = listen<DragPayload>('win_drag_start', () => {
			hoveredRef.current = null;
			stopPoll();
			pollRef.current = window.setInterval(tick, POLL_MS);
		});

		const endP = listen<DragPayload>('win_drag_end', async (e) => {
			stopPoll();
			const zone = hoveredRef.current;
			hoveredRef.current = null;
			setHighlight(null);
			if (zone) await snapWindow(e.payload.hwnd, zone.rect);
		});

		const arrangeP = listen('arrange_zones', async () => {
			const plans = planArrangement(physRef.current, await listWindows());
			for (const p of plans) await snapWindow(p.hwnd, p.rect);
		});

		return () => {
			stopPoll();
			startP.then((u) => u());
			endP.then((u) => u());
			arrangeP.then((u) => u());
		};
	}, []);

	return highlight ? (
		<div
			className="zone-drag-highlight"
			style={{
				left: highlight.x,
				top: highlight.y,
				width: highlight.w,
				height: highlight.h
			}}
		/>
	) : null;
}
