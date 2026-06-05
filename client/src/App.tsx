import { useMemo } from 'react';
import Canvas from './lib/widgets/Canvas';
import DragSnapLayer from './lib/widgets/DragSnapLayer';
import { isStudioWindow } from './lib/overlay';
import { SpectrumContext } from './lib/widgets/spectrumContext';
import { spectrumSource } from './lib/audio/source';

// The studio window edits layouts; every other window is a live overlay. The legacy NowPlaying
// media widget used to be hard-injected on the primary overlay — removed; it returns as a
// registered `nowplaying` widget type.
//
// SpectrumContext is provided here (not inside Canvas like the per-Canvas telemetry hub) because the
// audio spectrum source is a process-wide singleton: one WASAPI loopback capture per window, shared
// by every Spectrum meter. The Spectrum meter reads it from context (self-sourcing, like Cpu).
export default function App() {
	const studio = useMemo(() => isStudioWindow(), []);
	return (
		<SpectrumContext.Provider value={spectrumSource}>
			<div className={studio ? 'app studio' : 'app'}>
				<main>
					<section>
						<Canvas studio={studio} />
						{/* Overlay-only: live drag-to-zone snapping + highlight (MVP2). */}
						{!studio && <DragSnapLayer />}
					</section>
				</main>
			</div>
		</SpectrumContext.Provider>
	);
}
