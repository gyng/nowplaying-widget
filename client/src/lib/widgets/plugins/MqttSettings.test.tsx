import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';

// Mock the MQTT command adapter (the source it drives uses these too). Password is write-only.
vi.mock('./mqtt-commands', () => ({
	mqttConfigStatus: vi.fn(() =>
		Promise.resolve({
			configured: true,
			host: 'broker.local',
			port: 1883,
			username: 'u',
			topics: ['zigbee2mqtt/#', 'tasmota/SENSOR'],
			tls: false,
			insecure: false,
			discovery: true
		})
	),
	saveMqttConfig: vi.fn(() => Promise.resolve()),
	mqttConnect: vi.fn(() => Promise.resolve()),
	mqttDisconnect: vi.fn(() => Promise.resolve()),
	mqttCatalog: vi.fn(() =>
		Promise.resolve([
			{ id: 'mqtt.zigbee2mqtt/temp', topic: 'zigbee2mqtt/temp', label: 'Temp', unit: '°C' }
		])
	)
}));
vi.mock('../../overlay', () => ({ copyToClipboard: vi.fn(() => Promise.resolve(true)) }));

import MqttSettings from './MqttSettings';
import { mqttConfigStatus, mqttDisconnect, saveMqttConfig } from './mqtt-commands';
import { copyToClipboard } from '../../overlay';
import { createTelemetryHub, type TelemetryHub } from '../../core/telemetry';
import { TelemetryHubContext } from '../telemetryContext';

let hub: TelemetryHub;

function renderPanel() {
	hub = createTelemetryHub();
	return render(
		<TelemetryHubContext.Provider value={hub}>
			<MqttSettings />
		</TelemetryHubContext.Provider>
	);
}

beforeEach(() => vi.clearAllMocks());

describe('MqttSettings', () => {
	it('prefills the broker form and never shows a password', async () => {
		const { container } = renderPanel();
		const host = container.querySelector('input[type="text"]') as HTMLInputElement;
		await waitFor(() => expect(host.value).toBe('broker.local'));
		const pw = container.querySelector('input[type="password"]') as HTMLInputElement;
		expect(pw.value).toBe('');
	});

	it('saves the parsed topic list then reconnects', async () => {
		const { getByText, container } = renderPanel();
		const host = container.querySelector('input[type="text"]') as HTMLInputElement;
		await waitFor(() => expect(host.value).toBe('broker.local'));
		fireEvent.click(getByText('Save & connect'));
		await waitFor(() =>
			expect(saveMqttConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					host: 'broker.local',
					topics: ['zigbee2mqtt/#', 'tasmota/SENSOR'],
					discovery: true
				})
			)
		);
		await waitFor(() => expect(mqttDisconnect).toHaveBeenCalled());
	});

	it('lists catalog topics and copies the mqtt.<topic> id', async () => {
		const { findByText, getByLabelText } = renderPanel();
		await findByText('Temp');
		fireEvent.click(getByLabelText('Copy sensor id mqtt.zigbee2mqtt/temp'));
		expect(copyToClipboard).toHaveBeenCalledWith('mqtt.zigbee2mqtt/temp');
	});

	it('reflects the live mqtt.status sample in the badge', async () => {
		const { getByText } = renderPanel();
		await waitFor(() => expect(mqttConfigStatus).toHaveBeenCalled());
		act(() => {
			hub.ingest({ sensor: 'mqtt.status', ts_ms: 0, value: { kind: 'text', value: 'connected' } });
		});
		expect(getByText(/Connected/)).toBeTruthy();
	});
});
