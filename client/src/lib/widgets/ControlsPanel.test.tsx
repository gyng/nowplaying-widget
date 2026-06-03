import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, within } from '@testing-library/react';
import '../core/controls.defaults'; // register the built-in inventory
import ControlsPanel from './ControlsPanel';

const noop = () => undefined;

afterEach(() => vi.restoreAllMocks());

describe('ControlsPanel', () => {
	it('lists controls with their formatted bindings + the read-only system shortcut', () => {
		const { getByText } = render(
			<ControlsPanel overrides={{}} onRebind={noop} onReset={noop} onResetAll={noop} />
		);
		expect(() => getByText('Save draft')).not.toThrow();
		expect(() => getByText('Ctrl+S')).not.toThrow();
		expect(() => getByText('Ctrl+Alt+E')).not.toThrow();
	});

	it('captures the next chord on Rebind and reports the new key trigger', () => {
		const onRebind = vi.fn();
		const { getByText } = render(
			<ControlsPanel overrides={{}} onRebind={onRebind} onReset={noop} onResetAll={noop} />
		);
		const row = getByText('Save draft').closest('.cp-row') as HTMLElement;
		fireEvent.click(within(row).getByText('Rebind'));
		act(() => {
			window.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true })
			);
		});
		expect(onRebind).toHaveBeenCalledWith('studio.save', {
			type: 'key',
			key: 'k',
			ctrl: true,
			shift: true
		});
	});

	it('offers a per-row reset only for overridden controls', () => {
		const onReset = vi.fn();
		const { getByText } = render(
			<ControlsPanel
				overrides={{ 'studio.save': { triggers: [{ type: 'key', key: 'k', ctrl: true }] } }}
				onRebind={noop}
				onReset={onReset}
				onResetAll={noop}
			/>
		);
		const row = getByText('Save draft').closest('.cp-row') as HTMLElement;
		fireEvent.click(within(row).getByTitle('Reset to default'));
		expect(onReset).toHaveBeenCalledWith('studio.save');
	});

	it('Reset all fires the bulk reset', () => {
		const onResetAll = vi.fn();
		const { getByText } = render(
			<ControlsPanel overrides={{}} onRebind={noop} onReset={noop} onResetAll={onResetAll} />
		);
		fireEvent.click(getByText('Reset all'));
		expect(onResetAll).toHaveBeenCalledTimes(1);
	});
});
