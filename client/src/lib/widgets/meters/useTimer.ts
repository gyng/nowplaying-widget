// Stateful tick for the self-sourcing Timer widget (the documented self-sourcing exception, like Clock
// drives its own time). Timestamp-anchored so it stays accurate despite interval drift; pure formatting
// lives in core/timer.ts.
import { useCallback, useEffect, useRef, useState } from 'react';

export type TimerMode = 'countdown' | 'stopwatch';
export type TimerConfig = { mode: TimerMode; duration: number; loop?: boolean };
export type TimerState = {
	/** Seconds remaining (countdown) or elapsed (stopwatch). */
	seconds: number;
	running: boolean;
	/** A countdown has reached zero. */
	done: boolean;
	start: () => void;
	pause: () => void;
	reset: () => void;
	toggle: () => void;
};

export function useTimer(cfg: TimerConfig): TimerState {
	const [running, setRunning] = useState(false);
	const [, bump] = useState(0); // re-render each tick
	const accumRef = useRef(0); // ms accumulated while paused
	const startRef = useRef<number | null>(null); // Date.now() at the last start

	const elapsedMs = (): number =>
		accumRef.current + (running && startRef.current != null ? Date.now() - startRef.current : 0);

	useEffect(() => {
		if (!running) return;
		const id = setInterval(() => bump((t) => t + 1), 250);
		return () => clearInterval(id);
	}, [running]);

	const start = useCallback(() => {
		setRunning((r) => {
			if (r) return r;
			startRef.current = Date.now();
			return true;
		});
	}, []);
	const pause = useCallback(() => {
		setRunning((r) => {
			if (!r) return r;
			accumRef.current += startRef.current != null ? Date.now() - startRef.current : 0;
			startRef.current = null;
			return false;
		});
	}, []);
	const reset = useCallback(() => {
		accumRef.current = 0;
		startRef.current = running ? Date.now() : null;
		bump((t) => t + 1);
	}, [running]);
	const toggle = useCallback(() => (running ? pause() : start()), [running, pause, start]);

	const elapsedSec = elapsedMs() / 1000;
	const seconds = cfg.mode === 'countdown' ? Math.max(0, cfg.duration - elapsedSec) : elapsedSec;
	const done = cfg.mode === 'countdown' && cfg.duration > 0 && seconds <= 0;

	// On a countdown reaching zero: loop (restart) or auto-stop, frozen exactly at 0.
	useEffect(() => {
		if (!done || !running) return;
		if (cfg.loop) {
			accumRef.current = 0;
			startRef.current = Date.now();
			bump((t) => t + 1);
		} else {
			startRef.current = null;
			accumRef.current = cfg.duration * 1000;
			setRunning(false);
		}
	}, [done, running, cfg.loop, cfg.duration]);

	return { seconds, running, done, start, pause, reset, toggle };
}
