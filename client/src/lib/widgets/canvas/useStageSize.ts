// bind:clientWidth/clientHeight (item 6): a ResizeObserver hook that writes the measured stage
// size (the canvas inset between the tool rails) into state. zoom-to-fit (useZoomFit) keys off a
// real measure, so fit never runs before the stage is measured.
import { useEffect, useRef, useState } from 'react';

export function useStageSize(): {
	ref: React.RefObject<HTMLDivElement | null>;
	stageW: number;
	stageH: number;
} {
	const ref = useRef<HTMLDivElement | null>(null);
	const [stageW, setStageW] = useState(0);
	const [stageH, setStageH] = useState(0);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(() => {
			// clientWidth/Height (content box) mirror Svelte's bind:clientWidth/Height.
			setStageW(el.clientWidth);
			setStageH(el.clientHeight);
		});
		ro.observe(el);
		// Initial synchronous measure (Svelte sets the bound vars on mount before paint).
		setStageW(el.clientWidth);
		setStageH(el.clientHeight);
		return () => ro.disconnect();
	}, []);

	return { ref, stageW, stageH };
}
