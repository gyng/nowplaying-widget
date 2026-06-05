// Presentational atom: the full-monitor "wallpaper" effect rendered BEHIND every widget. Pure /
// props-only (AGENTS.md §6) — no store, no Tauri, no sensor. The container (Canvas) decides whether
// to mount it (studio always previews; an overlay only when it sits below windows) and injects
// `resolveSrc` to turn a wallpapers/ filename into an asset URL (image/video). Color/web use the
// spec's `src` verbatim.
import type { CSSProperties, ReactNode } from 'react';
import { fitBackgroundProps, fitObjectFit, isMediaKind } from '../core/background';
import type { BackgroundSpec } from '../core/layoutTree';
import './BackgroundLayer.css';

type Props = {
	spec?: BackgroundSpec;
	// Resolve an image/video wallpapers/ filename → a usable URL (convertFileSrc on the absolute path).
	// Defaults to identity so the component is testable without the Tauri asset bridge.
	resolveSrc?: (name: string) => string;
};

export default function BackgroundLayer({ spec, resolveSrc = (s) => s }: Props) {
	if (!spec) return null;
	const opacity = spec.opacity ?? 1;
	// image/video: the src is a wallpapers/ filename that must resolve to an asset URL; until it does
	// (dir not yet known) there's nothing to show.
	const url = spec.src ? (isMediaKind(spec.kind) ? resolveSrc(spec.src) : spec.src) : '';

	let media: ReactNode = null;
	if (spec.kind === 'color' && spec.src) {
		media = <div className="bg-fill" style={{ background: spec.src, opacity }} />;
	} else if (spec.kind === 'image' && url) {
		media = (
			<div
				className="bg-fill"
				style={{ backgroundImage: `url("${url}")`, ...fitBackgroundProps(spec.fit), opacity }}
			/>
		);
	} else if (spec.kind === 'video' && url) {
		media = (
			<video
				className="bg-media"
				src={url}
				autoPlay
				loop={spec.loop ?? true}
				muted={spec.mute ?? true}
				playsInline
				// A non-muted video can't autoplay (browser policy); the editor keeps mute on by default.
				style={{ objectFit: fitObjectFit(spec.fit) as CSSProperties['objectFit'], opacity }}
			/>
		);
	} else if (spec.kind === 'web' && url) {
		media = (
			<iframe
				className="bg-media"
				src={url}
				title="Background"
				// Scripts only, opaque origin (no allow-same-origin) — a web/shader wallpaper can run but
				// can't reach the app. pointer-events are off via CSS so it never steals desktop clicks.
				sandbox="allow-scripts"
			/>
		);
	}

	if (!media) return null;
	return (
		<div className="bg-layer" aria-hidden="true">
			{media}
			{spec.dim ? (
				<div className="bg-dim" style={{ background: `rgba(0,0,0,${spec.dim})` }} />
			) : null}
		</div>
	);
}
