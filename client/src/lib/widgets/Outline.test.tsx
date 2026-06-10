import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import Outline from './Outline';
import { emptyRoot, leaf, type Container } from '../core/layoutTree';
import type { WidgetInstance } from '../core/layout';

// A small flow tree: root(col) > [row > [a, b], c]
function tree(): Container {
	const w = (id: string): WidgetInstance => ({
		id,
		type: 'text',
		rect: { x: 0, y: 0, w: 10, h: 10 },
		config: {}
	});
	return {
		id: 'root',
		kind: 'col',
		children: [
			{
				id: 'r1',
				kind: 'row',
				children: [leaf(w('a')), leaf(w('b'))]
			} as Container,
			leaf(w('c'))
		]
	} as Container;
}

describe('Outline ARIA tree semantics', () => {
	it('exposes a tree with treeitems carrying level / selection', () => {
		const { getByRole, getAllByRole } = render(
			<Outline root={tree()} selectedId="a" onOp={() => undefined} />
		);
		expect(getByRole('tree')).toHaveAttribute('aria-label');
		const items = getAllByRole('treeitem');
		// root + r1 + a + b + c
		expect(items.length).toBe(5);
		// the row container sits at level 2 (depth 0); its leaf children sit deeper (level 3)
		const rowItem = items.find((el) => el.textContent?.includes('row'));
		expect(rowItem?.getAttribute('aria-level')).toBe('2');
		const deepLeaf = items.find((el) => el.getAttribute('aria-level') === '3');
		expect(deepLeaf).toBeTruthy();
		// the selected node is marked
		expect(items.some((el) => el.getAttribute('aria-selected') === 'true')).toBe(true);
	});

	it('gives every action button an accessible name (not glyph-only)', () => {
		const { getAllByLabelText } = render(
			<Outline root={tree()} selectedId="c" onOp={() => undefined} />
		);
		// these would be ✕ / ⤓ glyphs without an aria-label
		expect(getAllByLabelText('Remove').length).toBeGreaterThan(0);
		expect(getAllByLabelText('Float').length).toBeGreaterThan(0);
		expect(getAllByLabelText('Move up').length).toBeGreaterThan(0);
	});
});

describe('Outline leaf-drop feedback', () => {
	it('marks a leaf row as an invalid drop target on dragover (no reparent)', () => {
		const onOp = vi.fn();
		const { getAllByText } = render(<Outline root={tree()} onOp={onOp} />);
		const leafRow = getAllByText('• text', { selector: '.label' })[0].closest(
			'.row'
		) as HTMLElement;
		const data = {
			getData: () => 'a',
			dropEffect: '',
			effectAllowed: ''
		} as unknown as DataTransfer;
		fireEvent.dragOver(leafRow, { dataTransfer: data });
		expect(leafRow.className).toContain('dropno');
		// dropping on a leaf does not reparent
		fireEvent.drop(leafRow, { dataTransfer: data });
		expect(onOp).not.toHaveBeenCalledWith(expect.objectContaining({ op: 'reparent' }));
	});
});

describe('Outline empty root', () => {
	it('renders a tree even with no children', () => {
		const { getByRole } = render(<Outline root={emptyRoot()} onOp={() => undefined} />);
		expect(getByRole('tree')).toBeTruthy();
	});
});

describe('Outline row context menu', () => {
	it('claims right-click on a row (preventDefault) and reports the node id + position', () => {
		const onMenu = vi.fn();
		const { getAllByText } = render(
			<Outline root={tree()} onOp={() => undefined} onNodeContextMenu={onMenu} />
		);
		const row = getAllByText('• text', { selector: '.label' })[0].closest('.row') as HTMLElement;
		const ev = fireEvent.contextMenu(row, { clientX: 40, clientY: 60 });
		expect(onMenu).toHaveBeenCalledWith({ id: 'a', x: 40, y: 60 });
		expect(ev).toBe(false); // fireEvent returns false when preventDefault() was called
	});

	it('leaves right-click native when no handler is supplied (overlay / preview)', () => {
		const { getAllByText } = render(<Outline root={tree()} onOp={() => undefined} />);
		const row = getAllByText('• text', { selector: '.label' })[0].closest('.row') as HTMLElement;
		expect(fireEvent.contextMenu(row)).toBe(true); // not prevented
	});
});
