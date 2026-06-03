import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
	container,
	group,
	leaf,
	type Library,
	type MonitorLayout,
	type WidgetInstance
} from '../core/layoutTree';
import { collectContainerRects, collectRenderables, solveMonitor } from '../core/solve';
import FlowNode, { type RenderLeaf } from './FlowNode';

const prim = (id: string, w = 10, h = 10): WidgetInstance => ({
	id,
	type: 'gauge',
	rect: { x: 0, y: 0, w, h },
	config: {}
});

// A trivial leaf renderer that tags the slot so we can find primitives if needed.
const renderLeaf: RenderLeaf = (_lf, id) => <span data-prim={id} />;

// A tree exercising row/col/grid + an inline group (to check id namespacing).
function tree(): MonitorLayout {
	return {
		root: container(
			'root',
			'col',
			[
				container('row1', 'row', [leaf(prim('A'), { fr: 1 }), leaf(prim('B'))], {
					align: 'stretch'
				}),
				leaf(group('G', { w: 40, h: 40 }, container('gcol', 'col', [leaf(prim('C'))]))),
				container('grid1', 'grid', [leaf(prim('D'))], { cols: 2 })
			],
			{ align: 'stretch' }
		),
		floating: []
	};
}

const wa = { x: 0, y: 0, w: 800, h: 600 };
const lib: Library = { version: 1, defs: [] };

describe('FlowNode — data-id parity with the solver (drop-in guard)', () => {
	it('renders a data-id for every solver Map key (renderables + container boxes)', () => {
		const mon = tree();
		const view = render(
			<FlowNode node={mon.root} parentKind="col" renderLeaf={renderLeaf} library={lib} />
		);
		const rendered = new Set(
			Array.from(view.container.querySelectorAll('[data-id]')).map((el) =>
				el.getAttribute('data-id')
			)
		);

		const solved = solveMonitor(mon, wa, lib);
		const leafKeys = collectRenderables(mon, solved, lib).map((r) => r.id);
		const containerKeys = collectContainerRects(mon, solved).map((c) => c.id);

		// Every key the editor/click-through looks up must exist in the rendered DOM to be measured.
		for (const k of [...leafKeys, ...containerKeys]) {
			expect(rendered.has(k), `missing data-id "${k}"`).toBe(true);
		}
		// The group descendant is namespaced exactly like the solver (G/C).
		expect(rendered.has('G/C')).toBe(true);
	});
});

describe('FlowNode — emitted CSS', () => {
	it('a row container emits display:flex + flex-direction:row', () => {
		const view = render(
			<FlowNode
				node={container('r', 'row', [leaf(prim('A'))], { align: 'center' })}
				parentKind="col"
				renderLeaf={renderLeaf}
			/>
		);
		const el = view.container.querySelector('[data-id="r"]') as HTMLElement;
		expect(el.style.display).toBe('flex');
		expect(el.style.flexDirection).toBe('row');
		expect(el.style.alignItems).toBe('center');
	});

	it('an fr leaf slot grows; an auto leaf slot is content-sized', () => {
		const mon = container('r', 'row', [leaf(prim('A'), { fr: 1 }), leaf(prim('B'))], {
			align: 'stretch'
		});
		const view = render(<FlowNode node={mon} parentKind="col" renderLeaf={renderLeaf} />);
		const a = view.container.querySelector('[data-id="A"]') as HTMLElement;
		const b = view.container.querySelector('[data-id="B"]') as HTMLElement;
		expect(a.style.flexGrow).toBe('1');
		expect(b.style.flexGrow).toBe('0');
		expect(b.style.flexBasis).toBe('auto');
	});

	it('a grid container emits grid template columns', () => {
		const view = render(
			<FlowNode
				node={container('g', 'grid', [leaf(prim('A'))], { cols: 3 })}
				parentKind="col"
				renderLeaf={renderLeaf}
			/>
		);
		const el = view.container.querySelector('[data-id="g"]') as HTMLElement;
		expect(el.style.display).toBe('grid');
		expect(el.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
	});
});
