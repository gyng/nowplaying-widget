// Self-sourcing media widget (binds: 'none'): the highest-priority now-playing track. Renders
// STRUCTURE only — the default look (font / sizes / colors) ships as the instance's editable `css`
// (NOWPLAYING_DEFAULT_CSS) so it's fully restylable. Cover sits above the title/artist and is
// contained to the box (no fixed aspect, never overflows the cell). The progress bar, timers and
// transport controls are present in the DOM but HIDDEN by default — un-hide them via css for
// players that expose a timeline (foobar2000 does not, so they stay idle there).
import { useEffect, useMemo } from 'react';
import { mediaStore } from '../../../stores/stores';
import { useStore } from '../../../stores/createStore';
import { sortSessionsByPriority } from '../../components/NowPlaying/priority';
import { startMediaSource } from '../../components/NowPlaying/source';
import { convertByteArrayToObjectURL } from '../../components/NowPlaying/image';

type Props = { label?: string };

const fmtTime = (v: number): string => {
	const s = Math.max(0, Math.floor(v));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function NowPlaying({ label }: Props) {
	useEffect(() => {
		startMediaSource();
	}, []);

	const state = useStore(mediaStore);
	const session = sortSessionsByPriority(state.sessions, state.sourcePriority).at(0);
	const model = session?.last_media_update?.Media?.[0];
	const media = model?.media;
	const title = media?.title ?? label ?? '';
	const artist = media?.artist ?? '';
	const timeline = model?.timeline;
	const position = timeline?.position ?? 0;
	const duration = timeline?.end ?? 0;
	const progress = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
	const playing = model?.playback?.status === 'Playing';
	const thumbBytes = session?.last_media_update?.Media?.[1];

	// Derive the cover object URL from the byte payload, and revoke it when it changes / on unmount
	// (the Svelte version called createObjectURL every render and never revoked — a blob-URL leak).
	const thumb = useMemo(() => {
		if (!thumbBytes?.data) return null;
		return convertByteArrayToObjectURL(thumbBytes.data ?? [], thumbBytes.content_type ?? '');
	}, [thumbBytes?.data, thumbBytes?.content_type]);
	useEffect(() => {
		return () => {
			if (thumb) URL.revokeObjectURL(thumb);
		};
	}, [thumb]);

	return (
		<div className="np-nowplaying" data-part="root">
			{(title || thumb) && (
				<>
					{/* Always rendered (src swaps in place) so the box is stable — no layout shift when the
					    art loads on a track change. */}
					<img className="np-thumb" data-part="thumb" src={thumb || undefined} alt="" />
					<span className="np-title" data-part="title">
						{title}
					</span>
					{artist && (
						<span className="np-artist" data-part="artist">
							{artist}
						</span>
					)}
					{/* Hidden by default (un-hide via css). Idle for players without a timeline (e.g. fb2k). */}
					<div className="np-progress" data-part="progress">
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
						<button type="button" className="np-prev" data-part="prev" aria-label="Previous">
							⏮
						</button>
						<button
							type="button"
							className="np-playpause"
							data-part="playpause"
							aria-label="Play/pause"
						>
							{playing ? '⏸' : '▶'}
						</button>
						<button type="button" className="np-next" data-part="next" aria-label="Next">
							⏭
						</button>
					</div>
				</>
			)}
		</div>
	);
}
