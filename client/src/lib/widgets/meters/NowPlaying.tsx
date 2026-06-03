// Self-sourcing media widget (binds: 'none'): the highest-priority now-playing track. Renders
// STRUCTURE only — the default look (font / sizes / colors / fades) ships as the instance's editable
// `css` (NOWPLAYING_DEFAULT_CSS) so it's fully restylable. Cover sits above the title/artist and is
// contained to the box (no fixed aspect, never overflows the cell). The progress bar, timers and
// transport controls are present in the DOM but HIDDEN by default — un-hide them via css for
// players that expose a timeline (foobar2000 does not, so they stay idle there).
//
// Two visual behaviours ported from the original widget:
//   • play/pause fade — the root carries `data-playing`; the css dims it when paused (full on hover).
//   • crossfade — album art renders as stacked layers: a new track's cover fades in over the previous
//     one (removed once the new one has fully faded in), so a song change never flashes empty/black.
import {
	useEffect,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
	type TransitionEvent as ReactTransitionEvent
} from 'react';
import { mediaStore } from '../../../stores/stores';
import { useStore } from '../../../stores/createStore';
import { filterIgnored, sortSessionsByPriority } from '../../components/NowPlaying/priority';
import {
	getMediaCapabilities,
	startMediaSource,
	type MediaCaps
} from '../../components/NowPlaying/source';
import { convertByteArrayToObjectURL } from '../../components/NowPlaying/image';

type Props = {
	label?: string;
	// Transport buttons bubble a media control up; WidgetHost adds the widget identity and Canvas
	// makes the Tauri `media_control` call (the meter stays prop-only / Tauri-free, AGENTS.md §6).
	onControl?: (e: { domain: string; service: string; data?: Record<string, unknown> }) => void;
};

// Safety cap on stacked art layers. Normally a layer is dropped the moment the cover above it
// finishes fading in (transitionend), so at most two coexist; this only bounds the pathological case
// where the opacity transition never runs (e.g. a theme sets `transition: none`) and thus never ends.
const MAX_LAYERS = 6;
// Grace period before clearing the cover when a track has no art: long enough that a new track's art
// (which often lags its metadata) crossfades in instead, short enough that a genuinely art-less track
// doesn't keep showing the previous cover. If no art arrives in time, the stale cover fades out.
const NO_ART_GRACE_MS = 1200;

type ArtLayer = { id: number; url: string; loaded: boolean };

const fmtTime = (v: number): string => {
	const s = Math.max(0, Math.floor(v));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function NowPlaying({ label, onControl }: Props) {
	useEffect(() => {
		startMediaSource();
	}, []);

	const state = useStore(mediaStore);
	const session = sortSessionsByPriority(
		filterIgnored(state.sessions, state.ignoreList),
		state.sourcePriority
	).at(0);
	const source = session?.source;
	// Metadata (title/artist/album/art) comes from the MEDIA update; playback + timeline come from the
	// MODEL update — that's the one that fires on play/pause/seek, while the media update's copy stays
	// stale until the next track change. Fall back to the media model before any model update arrives.
	const mediaModel = session?.last_media_update?.Media?.[0];
	const liveModel = session?.last_model_update?.Model ?? mediaModel;
	const media = mediaModel?.media;
	const title = media?.title ?? label ?? '';
	const artist = media?.artist ?? '';
	const timeline = liveModel?.timeline;
	const position = timeline?.position ?? 0;
	const duration = timeline?.end ?? 0;
	const progress = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
	const playback = liveModel?.playback;
	const playing = playback?.status === 'Playing';
	const shuffle = playback?.shuffle ?? false;
	const repeatMode = playback?.auto_repeat ?? 'None';
	// Cycle None → Track → List → None (the value the backend maps to MediaPlaybackAutoRepeatMode).
	const nextRepeat = repeatMode === 'None' ? 1 : repeatMode === 'Track' ? 2 : 0;
	const thumbBytes = session?.last_media_update?.Media?.[1];

	// --- album-art crossfade ---
	// A cheap signature of the current cover bytes: changes when the ART changes (new track / late-
	// arriving art), but NOT on play/pause re-sends of the same image — so we only crossfade on a real
	// art change. Read the bytes themselves from a ref so the effect depends on the signature alone.
	const thumbBytesRef = useRef(thumbBytes);
	thumbBytesRef.current = thumbBytes;
	const artKey =
		thumbBytes?.data && thumbBytes.data.length
			? `${thumbBytes.content_type ?? ''}:${thumbBytes.data.length}:${thumbBytes.data[0]}:${
					thumbBytes.data[thumbBytes.data.length - 1]
			  }`
			: '';

	const [layers, setLayers] = useState<ArtLayer[]>([]);
	const layersRef = useRef(layers);
	layersRef.current = layers;
	const seqRef = useRef(0);
	const clearTimerRef = useRef<number | null>(null);
	const hasSession = !!session;

	useEffect(() => {
		// This render supersedes any pending no-art teardown.
		if (clearTimerRef.current !== null) {
			clearTimeout(clearTimerRef.current);
			clearTimerRef.current = null;
		}
		// Player gone → clear (revoke) every layer now. A paused/idle session keeps its cover up.
		if (!hasSession) {
			setLayers((prev) => {
				prev.forEach((l) => URL.revokeObjectURL(l.url));
				return [];
			});
			return;
		}
		const data = thumbBytesRef.current?.data;
		if (!data || data.length === 0) {
			// No art *right now* — usually a track change whose cover just lags its metadata, so KEEP the
			// previous cover up so the new one can crossfade in over it. Guard against a genuinely art-
			// less track, though: if no art arrives within the grace window, fade the stale cover out.
			if (layersRef.current.length > 0) {
				clearTimerRef.current = window.setTimeout(() => {
					clearTimerRef.current = null;
					setLayers((prev) => {
						// Drop never-shown layers outright (nothing to fade); fade the visible one(s) out —
						// loaded:false runs the reverse transition, and each self-removes on transitionend.
						prev.filter((l) => !l.loaded).forEach((l) => URL.revokeObjectURL(l.url));
						return prev.filter((l) => l.loaded).map((l) => ({ ...l, loaded: false }));
					});
				}, NO_ART_GRACE_MS);
			}
			return;
		}
		const url = convertByteArrayToObjectURL(data, thumbBytesRef.current?.content_type ?? '');
		const id = seqRef.current + 1;
		seqRef.current = id;
		setLayers((prev) => {
			// Start fading the current cover(s) out IMMEDIATELY on the track transition (don't wait for
			// the new image to decode); the incoming layer fades in on load. Outgoing layers self-remove
			// on their transitionend — together a true simultaneous crossfade that also keeps a larger
			// old cover from peeking around a smaller new one.
			const fadingOut = prev.map((l) => ({ ...l, loaded: false }));
			const next = [...fadingOut, { id, url, loaded: false }];
			// Drop+revoke anything beyond the cap (oldest first) — a leak guard only (see MAX_LAYERS).
			const overflow = next.length - MAX_LAYERS;
			if (overflow > 0) {
				next.slice(0, overflow).forEach((l) => URL.revokeObjectURL(l.url));
				return next.slice(overflow);
			}
			return next;
		});
	}, [artKey, hasSession]);

	// On unmount: cancel any pending no-art timer and revoke outstanding blob URLs.
	useEffect(
		() => () => {
			if (clearTimerRef.current !== null) clearTimeout(clearTimerRef.current);
			layersRef.current.forEach((l) => URL.revokeObjectURL(l.url));
		},
		[]
	);

	// Image decoded → fade THIS layer in. (The previous cover already began fading out the moment the
	// new art was pushed — see the effect — so the two cross over.) rAF so the opacity:0 start state is
	// painted before flipping to opacity:1, else a fast (blob) decode collapses it into an instant swap.
	const onLayerLoad = (id: number) =>
		requestAnimationFrame(() =>
			setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, loaded: true } : l)))
		);

	// A layer finished its opacity transition. If it faded OUT (loaded:false — crossed over by a newer
	// cover, or cleared by the no-art guard), remove just itself. If it faded IN, it now fully covers
	// everything beneath, so drop those. Driven by the real transitionend (not a timer), so a cover is
	// never removed before its fade has completed, at any css duration.
	const onLayerShown = (id: number, e: ReactTransitionEvent<HTMLImageElement>) => {
		if (e.propertyName !== 'opacity') return;
		setLayers((prev) => {
			const me = prev.find((l) => l.id === id);
			if (me && !me.loaded) {
				URL.revokeObjectURL(me.url);
				return prev.filter((l) => l.id !== id);
			}
			prev.filter((l) => l.id < id).forEach((l) => URL.revokeObjectURL(l.url));
			return prev.filter((l) => l.id >= id);
		});
	};

	// Which controls the current session supports — buttons it doesn't are hidden. null = unknown
	// (no backend / no session / not yet fetched): show everything rather than hide the basics.
	const [caps, setCaps] = useState<MediaCaps | null>(null);
	useEffect(() => {
		let alive = true;
		getMediaCapabilities(source).then((c) => {
			if (alive) setCaps(c);
		});
		return () => {
			alive = false;
		};
		// Re-query when the session or track changes (next/prev availability tracks the queue).
	}, [source, title]);
	const can = (k: keyof MediaCaps): boolean => (caps ? caps[k] : true);

	const send = (service: string, value?: number) =>
		onControl?.({
			domain: 'media',
			service,
			// Target the session this widget shows; backend falls back to the current session.
			data: { ...(source ? { source } : {}), ...(value !== undefined ? { value } : {}) }
		});

	// stopPropagation so a button press in passive mode doesn't also hit the widget behind it.
	const act = (e: ReactMouseEvent, service: string, value?: number) => {
		e.stopPropagation();
		send(service, value);
	};

	const seekable = can('seek');
	const seek = (e: ReactMouseEvent<HTMLDivElement>) => {
		e.stopPropagation();
		if (!duration) return;
		const r = e.currentTarget.getBoundingClientRect();
		const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
		send('seek', frac * duration);
	};

	return (
		<div className="np-nowplaying" data-part="root" data-playing={playing}>
			{(title || layers.length > 0) && (
				<>
					{/* Crossfade stack: each art change pushes a layer that fades in over the previous one. */}
					<div className="np-thumb-stack" data-part="thumb-stack">
						{layers.map((l) => (
							<img
								key={l.id}
								className="np-thumb"
								data-part="thumb"
								data-loaded={l.loaded}
								src={l.url}
								alt=""
								onLoad={() => onLayerLoad(l.id)}
								onTransitionEnd={(e) => onLayerShown(l.id, e)}
							/>
						))}
					</div>
					<span className="np-title" data-part="title">
						{title}
					</span>
					{artist && (
						<span className="np-artist" data-part="artist">
							{artist}
						</span>
					)}
					{/* Hidden by default (un-hide via css). Idle for players without a timeline (e.g. fb2k).
					    When the session supports seeking, click anywhere on the track to jump there. */}
					<div
						className="np-progress"
						data-part="progress"
						data-seekable={seekable}
						onClick={seekable ? seek : undefined}
						style={seekable ? { cursor: 'pointer' } : undefined}
					>
						<div
							className="np-progress-fill"
							data-part="progress-fill"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<div className="np-times" data-part="times">
						<span className="np-position" data-part="position">
							{fmtTime(position)}
						</span>
						<span className="np-duration" data-part="duration">
							{fmtTime(duration)}
						</span>
					</div>
					<div className="np-controls" data-part="controls">
						{can('shuffle') && (
							<button
								type="button"
								className="np-shuffle"
								data-part="shuffle"
								data-active={shuffle}
								aria-label="Shuffle"
								aria-pressed={shuffle}
								onClick={(e) => act(e, 'shuffle', shuffle ? 0 : 1)}
							>
								🔀
							</button>
						)}
						{can('previous') && (
							<button
								type="button"
								className="np-prev"
								data-part="prev"
								aria-label="Previous"
								onClick={(e) => act(e, 'previous')}
							>
								⏮
							</button>
						)}
						{can('playpause') && (
							<button
								type="button"
								className="np-playpause"
								data-part="playpause"
								aria-label="Play/pause"
								onClick={(e) => act(e, 'playpause')}
							>
								{playing ? '⏸' : '▶'}
							</button>
						)}
						{can('stop') && (
							<button
								type="button"
								className="np-stop"
								data-part="stop"
								aria-label="Stop"
								onClick={(e) => act(e, 'stop')}
							>
								⏹
							</button>
						)}
						{can('next') && (
							<button
								type="button"
								className="np-next"
								data-part="next"
								aria-label="Next"
								onClick={(e) => act(e, 'next')}
							>
								⏭
							</button>
						)}
						{can('repeat') && (
							<button
								type="button"
								className="np-repeat"
								data-part="repeat"
								data-mode={repeatMode}
								aria-label={`Repeat: ${repeatMode}`}
								onClick={(e) => act(e, 'repeat', nextRepeat)}
							>
								{repeatMode === 'Track' ? '🔂' : '🔁'}
							</button>
						)}
					</div>
				</>
			)}
		</div>
	);
}
