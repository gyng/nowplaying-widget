// The layout outline (edit mode): a flattened, indented tree of the flow `root` plus
// the floating layer. Structural editing only — select, reorder (↑/↓), reparent
// (⟸ out / ⟹ in), dock (⤒) / float (⤓), remove (✕), and add containers. All changes
// go up as a single `op` event; the Canvas applies them via core/layoutEdit.
import { useMemo, useState, type DragEvent as ReactDragEvent } from 'react';
import { isContainer, type Container, type LayoutNode, type Leaf } from '../core/layoutTree';
import { isGroup } from '../core/layoutTree';
import { outlineRows } from '../core/layoutEdit';
import type { LayoutOp } from './ops';
import './Outline.css';

type Props = {
	root: Container;
	floating?: Leaf[];
	selectedId?: string | null;
	// In the studio this panel docks as the full-height left rail (vs a floating box on an
	// overlay). The rail size + bar height come from the canvas's shared custom properties.
	docked?: boolean;
	onOp?: (op: LayoutOp) => void;
};

export default function Outline({
	root,
	floating = [],
	selectedId = null,
	docked = false,
	onOp
}: Props) {
	const op = (o: LayoutOp) => onOp?.(o);

	const rows = useMemo(() => outlineRows(root), [root]);

	function rowLabel(node: LayoutNode): string {
		if (isContainer(node)) return `▦ ${node.kind} · ${node.id}`;
		return `• ${isGroup(node.unit) ? `group ${node.unit.name ?? node.id}` : node.unit.type}`;
	}

	// Drag-and-drop into the tree (no canvas coords): drag a row (or a palette widget from the
	// inspector) onto a CONTAINER row to nest it there. Containers are the only drop targets;
	// leaves reject (no preventDefault). `dragOverId` highlights the hovered target.
	const [dragOverId, setDragOverId] = useState<string | null>(null);

	function onRowDragStart(e: ReactDragEvent, id: string) {
		e.dataTransfer?.setData('text/x-node-id', id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
	function onRowDragOver(e: ReactDragEvent, node: LayoutNode) {
		if (!isContainer(node)) return; // only containers accept drops
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		setDragOverId(node.id);
	}
	function onRowDrop(e: ReactDragEvent, node: LayoutNode) {
		if (!isContainer(node)) return;
		e.preventDefault();
		setDragOverId(null);
		const wt = e.dataTransfer?.getData('text/x-widget-type');
		if (wt) {
			op({ op: 'dropWidget', containerId: node.id, widgetType: wt });
			return;
		}
		const nid = e.dataTransfer?.getData('text/x-node-id');
		if (nid && nid !== node.id) op({ op: 'reparent', id: nid, containerId: node.id });
	}
	const onRowDragLeave = () => setDragOverId(null);

	const outlineCls = ['outline'];
	if (docked) outlineCls.push('docked');

	const rootRowCls = ['row', 'root'];
	if (selectedId === root.id) rootRowCls.push('sel');
	if (dragOverId === root.id) rootRowCls.push('dropok');

	return (
		<div className={outlineCls.join(' ')}>
			<div className="hd">
				Outline
				<span className="add">
					<button type="button" onClick={() => op({ op: 'addContainer', kind: 'row' })}>
						+Row
					</button>
					<button type="button" onClick={() => op({ op: 'addContainer', kind: 'col' })}>
						+Col
					</button>
					<button type="button" onClick={() => op({ op: 'addContainer', kind: 'grid' })}>
						+Grid
					</button>
				</span>
			</div>

			<button
				type="button"
				className={rootRowCls.join(' ')}
				onClick={() => op({ op: 'select', id: root.id })}
				onDragOver={(e) => onRowDragOver(e, root)}
				onDrop={(e) => onRowDrop(e, root)}
				onDragLeave={onRowDragLeave}
			>
				▦ root ({root.kind})
			</button>

			{rows.map((r) => {
				const rowCls = ['row'];
				if (selectedId === r.node.id) rowCls.push('sel');
				if (dragOverId === r.node.id) rowCls.push('dropok');
				return (
					<div
						key={r.node.id}
						className={rowCls.join(' ')}
						style={{ paddingLeft: `${6 + r.depth * 12}px` }}
						draggable
						onDragStart={(e) => onRowDragStart(e, r.node.id)}
						onDragOver={(e) => onRowDragOver(e, r.node)}
						onDrop={(e) => onRowDrop(e, r.node)}
						onDragLeave={onRowDragLeave}
					>
						<button
							type="button"
							className="label"
							onClick={() => op({ op: 'select', id: r.node.id })}
						>
							{rowLabel(r.node)}
						</button>
						<span className="btns">
							<button
								type="button"
								title="Move up"
								disabled={r.index === 0}
								onClick={() => op({ op: 'moveUp', id: r.node.id })}
							>
								↑
							</button>
							<button
								type="button"
								title="Move down"
								disabled={r.index === r.siblingCount - 1}
								onClick={() => op({ op: 'moveDown', id: r.node.id })}
							>
								↓
							</button>
							<button
								type="button"
								title="Move out"
								disabled={r.parentId === root.id}
								onClick={() => op({ op: 'outdent', id: r.node.id })}
							>
								⟸
							</button>
							{r.index > 0 && (
								<button
									type="button"
									title="Move in"
									onClick={() => op({ op: 'indent', id: r.node.id })}
								>
									⟹
								</button>
							)}
							{!isContainer(r.node) && (
								<button
									type="button"
									title="Float"
									onClick={() => op({ op: 'float', id: r.node.id })}
								>
									⤓
								</button>
							)}
							<button
								type="button"
								title="Remove"
								onClick={() => op({ op: 'remove', id: r.node.id })}
							>
								✕
							</button>
						</span>
					</div>
				);
			})}

			{floating.length > 0 && (
				<>
					<div className="hd2">Floating</div>
					{floating.map((lf) => {
						const lfCls = ['row'];
						if (selectedId === lf.id) lfCls.push('sel');
						return (
							<div
								key={lf.id}
								className={lfCls.join(' ')}
								draggable
								onDragStart={(e) => onRowDragStart(e, lf.id)}
							>
								<button
									type="button"
									className="label"
									onClick={() => op({ op: 'select', id: lf.id })}
								>
									{rowLabel(lf)}
								</button>
								<span className="btns">
									<button
										type="button"
										title="Dock into root"
										onClick={() => op({ op: 'dock', id: lf.id })}
									>
										⤒
									</button>
									<button
										type="button"
										title="Remove"
										onClick={() => op({ op: 'remove', id: lf.id })}
									>
										✕
									</button>
								</span>
							</div>
						);
					})}
				</>
			)}
		</div>
	);
}
