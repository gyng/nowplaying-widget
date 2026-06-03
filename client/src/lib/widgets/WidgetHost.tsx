// Container (organism): positions one widget and wires its sensor to the presentational meter.
// The meter stays prop-only; all subscription lives here. In edit mode a transparent overlay drags
// the widget and corner/edge handles resize it; both report rect changes up via the `onChange`
// callback. The seven Svelte dispatch events become seven callback props.
import {
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent
} from 'react';
import type { TelemetryHub } from '../core/telemetry';
import type { Rect, WidgetInstance } from '../core/layout';
import { moveRect, resizeRect, type ResizeHandle } from '../core/geometry';
import { getMeta } from '../core/widget';
import { registry } from './registry';
import { useSensor } from './useSensor';
import './WidgetHost.css';

type Props = {
	hub: TelemetryHub;
	instance: WidgetInstance;
	editMode?: boolean;
	selected?: boolean;
	grid?: number;
	// Zoom factor of the surrounding world layer; pointer deltas (screen px) are divided by it.
	scale?: number;
	// Absolute rect to render at (the solver's result); defaults to instance.rect (floating).
	rect?: Rect;
	// Floating widgets free-move/resize; in-flow widgets are solver-positioned (select-only here).
	movable?: boolean;
	// What clicking selects (a group's descendants select the group), defaults to this widget.
	selectId?: string;
	// Styling hooks: the unique DOM id + the group/def this widget belongs to (data-w/def/group).
	domId?: string;
	defId?: string;
	groupId?: string;
	onChange?: (e: { id: string; rect: Rect }) => void;
	onCommit?: () => void;
	onSelect?: (e: { id: string }) => void;
	onDragOver?: (e: { id: string; x: number; y: number }) => void;
	onDrop?: (e: { id: string; x: number; y: number }) => void;
	onContextMenu?: (e: { id: string; x: number; y: number }) => void;
	onControl?: (e: { id: string; sensor?: string; domain: string; service: string }) => void;
};

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
// A press only becomes a drag past this screen-px slop; below it the press is a click that just
// selects. Without this, clicking an in-flow widget dispatches a `drop` = moves it to a slot.
const DRAG_SLOP = 3;

export default function WidgetHost({
	hub,
	instance,
	editMode = false,
	selected = false,
	grid = 8,
	scale = 1,
	rect: rectProp,
	movable = true,
	selectId: selectIdProp,
	domId: domIdProp,
	defId,
	groupId,
	onChange,
	onCommit,
	onSelect,
	onDragOver,
	onDrop,
	onContextMenu,
	onControl
}: Props) {
	const rect = rectProp ?? instance.rect;
	const selectId = selectIdProp ?? instance.id;
	const domId = domIdProp ?? instance.id;

	// A sentinel id keeps the hook valid for self-sourcing widgets (no sensor).
	const sensorState = useSensor(hub, instance.sensor ?? '__none__');
	const Comp = registry[instance.type];
	// How this widget binds to its sensor drives the meter's value-shape (Phase 8).
	const binds = getMeta(instance.type)?.binds ?? 'scalar';
	const scalar =
		sensorState.value && sensorState.value.kind === 'scalar' ? sensorState.value.value : null;
	const rawValue = sensorState.value ? sensorState.value.value : null;
	const history = sensorState.history;

	// Authoritative drag bookkeeping in a ref (read synchronously by move/end — no stale closures);
	// only the render-affecting bits (active class + ghost transform) live in state.
	const drag = useRef<{
		action: 'move' | 'flow' | ResizeHandle | null;
		startX: number;
		startY: number;
		startRect: Rect;
		moved: boolean;
	}>({ action: null, startX: 0, startY: 0, startRect: instance.rect, moved: false });
	const [action, setAction] = useState<'move' | 'flow' | ResizeHandle | null>(null);
	const [ghost, setGhost] = useState({ dx: 0, dy: 0 });

	// A plugin widget (e.g. an HA light) asks to actuate; the host adds its identity and bubbles up —
	// the side-effecting Tauri call lives in the container (Canvas), not here (AGENTS.md §5/§6).
	const handleControl = (e: { domain: string; service: string }) =>
		onControl?.({ id: instance.id, sensor: instance.sensor, ...e });

	const handleContextMenu = (e: ReactMouseEvent) => {
		if (!editMode) return;
		e.preventDefault();
		e.stopPropagation();
		onSelect?.({ id: selectId });
		onContextMenu?.({ id: selectId, x: e.clientX, y: e.clientY });
	};

	function begin(kind: 'move' | ResizeHandle, e: ReactPointerEvent) {
		if (e.button !== 0) return; // left-button only; middle-drag is reserved for panning
		if (!editMode) return;
		onSelect?.({ id: selectId });
		const d = drag.current;
		d.moved = false;
		if (!movable) {
			// In-flow widgets ghost-drag to reorder/reparent; the solver owns their base position, so
			// we translate a ghost and only mutate the tree on drop (5e).
			d.action = 'flow';
			d.startX = e.clientX;
			d.startY = e.clientY;
			setAction('flow');
			setGhost({ dx: 0, dy: 0 });
			e.currentTarget.setPointerCapture(e.pointerId);
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		d.action = kind;
		d.startX = e.clientX;
		d.startY = e.clientY;
		d.startRect = rect;
		setAction(kind);
		e.currentTarget.setPointerCapture(e.pointerId);
		e.preventDefault();
		e.stopPropagation();
	}

	function move(e: ReactPointerEvent) {
		const d = drag.current;
		if (d.action === null) return;
		// Below the slop the press is still a click-to-select: don't ghost, move, resize or preview.
		if (!d.moved) {
			if (
				Math.abs(e.clientX - d.startX) <= DRAG_SLOP &&
				Math.abs(e.clientY - d.startY) <= DRAG_SLOP
			)
				return;
			d.moved = true;
		}
		if (d.action === 'flow') {
			setGhost({ dx: (e.clientX - d.startX) / scale, dy: (e.clientY - d.startY) / scale });
			onDragOver?.({ id: selectId, x: e.clientX, y: e.clientY });
			return;
		}
		const dx = (e.clientX - d.startX) / scale;
		const dy = (e.clientY - d.startY) / scale;
		const next =
			d.action === 'move'
				? moveRect(d.startRect, dx, dy, grid)
				: resizeRect(d.startRect, d.action, dx, dy, grid);
		onChange?.({ id: instance.id, rect: next });
		// A floating widget dragged over the flow tree can dock there (checked on commit).
		if (d.action === 'move') onDragOver?.({ id: selectId, x: e.clientX, y: e.clientY });
	}

	function end(e: ReactPointerEvent) {
		const d = drag.current;
		if (d.action === null) return;
		const wasFlow = d.action === 'flow';
		const didMove = d.moved;
		d.action = null;
		setAction(null);
		if (wasFlow) {
			setGhost({ dx: 0, dy: 0 });
			// A click (no real movement) just selects — only an actual drag reparents/reorders.
			if (didMove) onDrop?.({ id: selectId, x: e.clientX, y: e.clientY });
			return;
		}
		// Likewise a click on a floating widget selects without a no-op move/commit.
		if (didMove) onCommit?.();
	}

	const cls = ['widget'];
	if (editMode) cls.push('editable');
	if (selected) cls.push('selected');
	if (action !== null) cls.push('active');
	if (!editMode && instance.interactive) cls.push('catch');
	if (action === 'flow') cls.push('dragging');

	return (
		<div
			className={cls.join(' ')}
			style={{
				left: `${rect.x}px`,
				top: `${rect.y}px`,
				width: `${rect.w}px`,
				height: `${rect.h}px`,
				transform: `translate(${ghost.dx}px, ${ghost.dy}px)`
			}}
			data-w={domId}
			data-type={instance.type}
			data-sensor={instance.sensor}
			data-def={defId}
			data-group={groupId}
			onContextMenu={handleContextMenu}
		>
			{Comp ? (
				!instance.sensor || binds === 'none' ? (
					<Comp {...instance.config} onControl={handleControl} />
				) : binds === 'json' || binds === 'text' ? (
					<Comp value={rawValue} {...instance.config} onControl={handleControl} />
				) : (
					<Comp value={scalar} history={history} {...instance.config} onControl={handleControl} />
				)
			) : (
				<div className="missing">?{instance.type}</div>
			)}

			{editMode && (
				<>
					<button
						type="button"
						className="drag-overlay"
						aria-label={`Move ${instance.type} widget`}
						onPointerDown={(e) => begin('move', e)}
						onPointerMove={move}
						onPointerUp={end}
					/>
					{movable &&
						HANDLES.map((handle) => (
							<button
								key={handle}
								type="button"
								className={`handle ${handle}`}
								aria-label={`Resize ${handle}`}
								onPointerDown={(e) => begin(handle, e)}
								onPointerMove={move}
								onPointerUp={end}
							/>
						))}
				</>
			)}
		</div>
	);
}
