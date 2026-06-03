import { useMemo } from 'react';
import Canvas from './lib/widgets/Canvas';
import { isStudioWindow } from './lib/overlay';

// The studio window edits layouts; every other window is a live overlay. The legacy NowPlaying
// media widget used to be hard-injected on the primary overlay — removed; it returns as a
// registered `nowplaying` widget type.
export default function App() {
	const studio = useMemo(() => isStudioWindow(), []);
	return (
		<div className="app">
			<main>
				<section>
					<Canvas studio={studio} />
				</section>
			</main>
		</div>
	);
}
