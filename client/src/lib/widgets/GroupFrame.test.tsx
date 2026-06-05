import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import GroupFrame from './GroupFrame';

// happy-dom doesn't implement pointer capture; stub it so begin()'s setPointerCapture won't throw.
beforeAll(() => {
	Element.prototype.setPointerCapture = () => undefined;
});

const rect = { x: 10, y: 20, w: 100, h: 60 };
const box = (el: HTMLElement) => el.querySelector('[data-id="grp-1"]') as HTMLElement;
const overlay = (el: HTMLElement) => el.querySelector('.drag-overlay') as HTMLElement;

describe('GroupFrame', () => {
	it('renders its children inside one measurable, .widget-styled group box', () => {
		const { container, getByText } = render(
			<GroupFrame id="grp-1" rect={rect}>
				<span>inner</span>
			</GroupFrame>
		);
		expect(getByText('inner')).toBeTruthy();
		const b = box(container);
		expect(b.classList.contains('widget')).toBe(true);
		expect(b.classList.contains('floating-group')).toBe(true);
		expect(b.style.left).toBe('10px');
		expect(b.style.width).toBe('100px');
	});

	it('drags the whole group as one unit — move fires onChange(id), commit on release', () => {
		const onChange = vi.fn();
		const onCommit = vi.fn();
		const onSelect = vi.fn();
		const { container } = render(
			<GroupFrame
				id="grp-1"
				rect={rect}
				editMode
				selected
				onChange={onChange}
				onCommit={onCommit}
				onSelect={onSelect}
			/>
		);
		const ov = overlay(container);
		fireEvent.pointerDown(ov, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
		expect(onSelect).not.toHaveBeenCalled(); // deferred → a multi-selection survives the press
		fireEvent.pointerMove(ov, { pointerId: 1, clientX: 40, clientY: 10 }); // past DRAG_SLOP
		expect(onChange).toHaveBeenCalled();
		const arg = onChange.mock.calls.at(-1)?.[0] as { id: string; rect: { x: number } };
		expect(arg.id).toBe('grp-1');
		expect(arg.rect.x).toBeGreaterThan(rect.x); // moved right
		fireEvent.pointerUp(ov, { pointerId: 1, clientX: 40, clientY: 10 });
		expect(onCommit).toHaveBeenCalled();
		expect(onSelect).not.toHaveBeenCalled(); // a real drag never re-selects
	});

	it('selects on press when the group is not already selected', () => {
		const onSelect = vi.fn();
		const { container } = render(
			<GroupFrame id="grp-1" rect={rect} editMode onSelect={onSelect} />
		);
		fireEvent.pointerDown(overlay(container), {
			button: 0,
			pointerId: 1,
			clientX: 10,
			clientY: 10
		});
		expect(onSelect).toHaveBeenCalledWith({ id: 'grp-1' });
	});

	it('resizes via a handle — collapses selection on press, then onChange fires', () => {
		const onSelect = vi.fn();
		const onChange = vi.fn();
		const { container } = render(
			<GroupFrame
				id="grp-1"
				rect={rect}
				editMode
				selected
				onSelect={onSelect}
				onChange={onChange}
			/>
		);
		const handle = container.querySelector('.handle.se') as HTMLElement;
		fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 110, clientY: 80 });
		expect(onSelect).toHaveBeenCalledWith({ id: 'grp-1' }); // resize selects immediately (single unit)
		fireEvent.pointerMove(handle, { pointerId: 1, clientX: 140, clientY: 110 });
		expect(onChange).toHaveBeenCalled();
	});

	it('renders no edit overlay when not in edit mode (passive overlay)', () => {
		const { container } = render(<GroupFrame id="grp-1" rect={rect} />);
		expect(container.querySelector('.drag-overlay')).toBeNull();
		expect(container.querySelector('.handle')).toBeNull();
	});
});
