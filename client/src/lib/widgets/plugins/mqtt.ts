// The MQTT plugin — a generic broker source registered as a peer to Home Assistant. Importing this
// module (Canvas side-effect-imports it) registers the source + the settings panel. MQTT values
// bind to the built-in Text / Gauge / Bar / Sparkline meters via their `mqtt.<topic>` sensor ids,
// so the plugin contributes no widgets of its own.

import { registerPlugin } from '../plugin';
import { mqttSource } from './mqtt-source';
import MqttSettings from './MqttSettings';

registerPlugin({
	id: 'mqtt',
	name: 'MQTT',
	description:
		'Subscribe to MQTT topics (zigbee2mqtt, Tasmota, ESPHome, your own publishers) and bind them as mqtt.<topic> sensors. Optional Home Assistant MQTT discovery. Configured in this panel.',
	sources: [mqttSource],
	settings: MqttSettings
});
