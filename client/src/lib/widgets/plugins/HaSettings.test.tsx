import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';

// Mock the Tauri command adapter so the panel (and the ha-source it drives) can be exercised
// without a backend. Each fn is a spy so we can assert call args + ordering (Save must save →
// disconnect → connect). listHaEntities feeds the entity browser via ha-source.refreshHaCatalog.
vi.mock('./ha-commands', () => ({
	haConfigStatus: vi.fn(() =>
		Promise.resolve({ configured: true, url: 'http://ha:8123', insecure: false, base_path: '' })
	),
	saveHaConfig: vi.fn(() => Promise.resolve()),
	haConnect: vi.fn(() => Promise.resolve()),
	haDisconnect: vi.fn(() => Promise.resolve()),
	haTestConnection: vi.fn(() => Promise.resolve({ ha_version: '2026.6.0' })),
	listHaEntities: vi.fn(() =>
		Promise.resolve([
			{ entity_id: 'light.kitchen', state: 'on', friendly_name: 'Kitchen Light' },
			{ entity_id: 'sensor.temp', state: '21.4', friendly_name: 'Temp', unit: '°C' }
		])
	),
	haRegistrySnapshot: vi.fn(() =>
		Promise.resolve({
			areas: [{ area_id: 'living', name: 'Living Room' }],
			devices: [{ id: 'd1', name: 'Lamp', area_id: 'living', manufacturer: null, model: null }],
			entities: [
				{
					entity_id: 'light.kitchen',
					device_id: 'd1',
					area_id: null,
					name: null,
					original_name: 'Kitchen',
					platform: 'hue'
				},
				{
					entity_id: 'sensor.temp',
					device_id: null,
					area_id: null,
					name: null,
					original_name: 'Temp',
					platform: 'x'
				}
			]
		})
	)
}));
vi.mock('../../overlay', () => ({ copyToClipboard: vi.fn(() => Promise.resolve(true)) }));

import HaSettings from './HaSettings';
import {
	haConfigStatus,
	haConnect,
	haDisconnect,
	haTestConnection,
	saveHaConfig
} from './ha-commands';
import { copyToClipboard } from '../../overlay';
import { haExposedStore } from './ha-exposed-store';
import { createTelemetryHub, type TelemetryHub } from '../../core/telemetry';
import { TelemetryHubContext } from '../telemetryContext';

let hub: TelemetryHub;

function renderPanel() {
	hub = createTelemetryHub();
	return render(
		<TelemetryHubContext.Provider value={hub}>
			<HaSettings />
		</TelemetryHubContext.Provider>
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	haExposedStore.set([]); // reset the persisted allowlist between tests
	vi.mocked(haConfigStatus).mockResolvedValue({
		configured: true,
		url: 'http://ha:8123',
		insecure: false,
		base_path: ''
	});
});

describe('HaSettings', () => {
	it('prefills the URL from ha_config_status and never shows a token', async () => {
		const { container } = renderPanel();
		const url = container.querySelector('input[type="text"]') as HTMLInputElement;
		await waitFor(() => expect(url.value).toBe('http://ha:8123'));
		// The token field is write-only: it stays empty even though HA is configured.
		const token = container.querySelector('input[type="password"]') as HTMLInputElement;
		expect(token.value).toBe('');
		// Ensures the live feed is running in the studio window for the badge.
		expect(haConnect).toHaveBeenCalled();
	});

	it('saves then reconnects in order (save → disconnect → connect)', async () => {
		const { getByText, container } = renderPanel();
		const url = container.querySelector('input[type="text"]') as HTMLInputElement;
		await waitFor(() => expect(url.value).toBe('http://ha:8123')); // wait for the async prefill
		const token = container.querySelector('input[type="password"]') as HTMLInputElement;
		fireEvent.change(token, { target: { value: 'secret-token' } });
		fireEvent.click(getByText('Save & connect'));

		await waitFor(() =>
			expect(saveHaConfig).toHaveBeenCalledWith('http://ha:8123', 'secret-token', false, '')
		);
		await waitFor(() => expect(haDisconnect).toHaveBeenCalled());
		// Disconnect-first is mandatory: ha_connect is idempotent and would no-op against the old task.
		const save = vi.mocked(saveHaConfig).mock.invocationCallOrder[0];
		const disc = vi.mocked(haDisconnect).mock.invocationCallOrder[0];
		const conn = vi.mocked(haConnect).mock.invocationCallOrder.at(-1) as number;
		expect(save).toBeLessThan(disc);
		expect(disc).toBeLessThan(conn);
		// Token is cleared back to write-only after a successful save.
		await waitFor(() => expect(token.value).toBe(''));
	});

	it('tests the connection and reports the HA version', async () => {
		const { getByText, findByText, container } = renderPanel();
		const url = container.querySelector('input[type="text"]') as HTMLInputElement;
		await waitFor(() => expect(url.value).toBe('http://ha:8123'));
		fireEvent.click(getByText('Test connection'));
		expect(haTestConnection).toHaveBeenCalled();
		expect(await findByText(/Home Assistant 2026\.6\.0/)).toBeTruthy();
	});

	it('shows the connection error message when the test rejects', async () => {
		vi.mocked(haTestConnection).mockRejectedValueOnce('auth_invalid: bad token');
		const { getByText, findByText, container } = renderPanel();
		const url = container.querySelector('input[type="text"]') as HTMLInputElement;
		await waitFor(() => expect(url.value).toBe('http://ha:8123'));
		fireEvent.click(getByText('Test connection'));
		expect(await findByText(/auth_invalid: bad token/)).toBeTruthy();
	});

	it('reflects the live ha.status sample in the badge', async () => {
		const { getByText } = renderPanel();
		await waitFor(() => expect(haConfigStatus).toHaveBeenCalled());
		act(() => {
			hub.ingest({ sensor: 'ha.status', ts_ms: 0, value: { kind: 'text', value: 'connected' } });
		});
		expect(getByText(/Connected/)).toBeTruthy();
	});

	it('lists entities (friendly name) and toggling Expose updates the allowlist', async () => {
		const { findByText, getByLabelText } = renderPanel();
		// Entities arrive from ha-source.refreshHaCatalog → listHaEntities (mocked).
		expect(await findByText('Kitchen Light')).toBeTruthy();
		const box = getByLabelText('Expose Kitchen Light') as HTMLInputElement;
		expect(box.checked).toBe(false);
		fireEvent.click(box);
		expect(haExposedStore.getSnapshot()).toEqual(['ha.light.kitchen']);
		// Clicking again un-exposes it.
		fireEvent.click(box);
		expect(haExposedStore.getSnapshot()).toEqual([]);
	});

	it('filters the entity list by the search box', async () => {
		const { findByText, queryByText, getByLabelText } = renderPanel();
		await findByText('Kitchen Light');
		fireEvent.change(getByLabelText('Filter entities'), { target: { value: 'temp' } });
		expect(queryByText('Kitchen Light')).toBeNull();
		expect(queryByText('Temp')).toBeTruthy();
	});

	it('copies the ha.<entity_id> sensor id', async () => {
		const { findByText, getByLabelText } = renderPanel();
		await findByText('Kitchen Light');
		fireEvent.click(getByLabelText('Copy sensor id ha.light.kitchen'));
		expect(copyToClipboard).toHaveBeenCalledWith('ha.light.kitchen');
	});

	it('groups entities by area > device when "Group by area" is enabled', async () => {
		const { findByText, getByLabelText } = renderPanel();
		await findByText('Kitchen Light'); // flat list populated first
		fireEvent.click(getByLabelText('Group by area'));
		// Area + device headers from the (mocked) registry snapshot.
		expect(await findByText('Living Room')).toBeTruthy();
		expect(await findByText('Lamp')).toBeTruthy();
		// The device-less entity lands under the Unassigned bucket.
		expect(await findByText('Unassigned')).toBeTruthy();
	});
});
