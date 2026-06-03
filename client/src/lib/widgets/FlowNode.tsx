// FlowNode — the native-CSS renderer for the flow tree (the CSS-layout pivot, phase B). It walks
// the SAME tree the solver walks (solveNode/collectRenderables) but emits nested DOM with the CSS
// from flowStyle, so the browser lays everything out instead of solve.ts computing rects. The
// editor + click-through then read rects back by MEASURING this DOM (useMeasuredRects).
//
// The single load-bearing invariant: every emitted element carries `data-id` exactly matching the
// solver's Map keys — containers/leaves by `prefix + node.id`, group descendants prefixed by the
// group leaf id + '/'. If these drift, the measured map mis-keys and every consumer silently misses
// (FlowNode.test.tsx guards this against collectRenderables/collectContainerRects).
//
// `renderLeaf` is injected so Canvas owns the WidgetHost wiring (sensor subscription, drag, etc.);
// FlowNode stays a thin structural+style shell.

import type { CSSProperties, ReactNode } from 'react';
import {
	isContainer,
	isGroup,
	type Container,
	type LayoutNode,
	type Leaf,
	type Library
} from '../core/layoutTree';
import { containerStyle, itemStyle, overlapChildStyle } from '../core/flowStyle';
import { resolveGroup } from '../core/solve';

// Render a primitive leaf into its (already positioned) flow slot. `id` is the namespaced data-id.
export type RenderLeaf = (leaf: Leaf, id: string, parentKind: Container['kind']) => ReactNode;

type Props = {
	node: LayoutNode;
	parentKind: Container['kind']; // the flow axis this node sits in (its parent's kind)
	renderLeaf: RenderLeaf;
	library?: Library;
	prefix?: string; // id namespace from enclosing group leaves (matches the solver's keying)
	parentOverlap?: boolean; // parent is an overlap (stacking) container → occupy the shared cell
};

const merge = (...parts: Record<string, string | number>[]): CSSProperties =>
	Object.assign({}, ...parts) as CSSProperties;

export default function FlowNode({
	node,
	parentKind,
	renderLeaf,
	library,
	prefix = '',
	parentOverlap = false
}: Props) {
	const id = prefix + node.id;
	const self = itemStyle(node, parentKind);
	const overlap = parentOverlap ? overlapChildStyle() : {};

	if (isContainer(node)) {
		return (
			<div
				data-id={id}
				data-kind={node.kind}
				style={merge(self, overlap, containerStyle(node), { boxSizing: 'border-box' })}
			>
				{node.children.map((child) => (
					<FlowNode
						key={child.id}
						node={child}
						parentKind={node.kind}
						renderLeaf={renderLeaf}
						library={library}
						prefix={prefix}
						parentOverlap={!!node.overlap}
					/>
				))}
			</div>
		);
	}

	const leaf = node as Leaf;
	if (isGroup(leaf.unit)) {
		const { child } = resolveGroup(leaf.unit, library);
		// The group box: a flex column its def child grows to fill, namespaced so descendants' ids
		// match the solver (prefix + leaf.id + '/').
		return (
			<div
				data-id={id}
				data-group=""
				style={merge(self, overlap, {
					display: 'flex',
					flexDirection: 'column',
					boxSizing: 'border-box',
					overflow: 'hidden'
				})}
			>
				{child ? (
					<FlowNode
						node={child}
						parentKind="col"
						renderLeaf={renderLeaf}
						library={library}
						prefix={`${id}/`}
					/>
				) : null}
			</div>
		);
	}

	// A primitive widget: the slot div owns the flow position/size; the widget fills it.
	return (
		<div data-id={id} style={merge(self, overlap, { boxSizing: 'border-box', overflow: 'hidden' })}>
			{renderLeaf(leaf, id, parentKind)}
		</div>
	);
}
