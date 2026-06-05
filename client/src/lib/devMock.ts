// DEV-ONLY Tauri shim. Lets the SPA boot in a PLAIN browser (`npm run dev`, no Tauri runtime) so the
// layout + interactions can be driven/screenshotted by Playwright. It is installed ONLY in dev when
// there is no real Tauri context (the actual WebView always has `window.__TAURI_INTERNALS__`), and is
// stripped from production builds (`cargo tauri build` sets `import.meta.env.DEV` false → dead-code
// eliminated). It forces the STUDIO role and answers the boot commands with empty/canned data; the
// goal is a clean-booting editor to exercise, not real telemetry.
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';

const MONITOR = {
	name: 'Mock-1920',
	size: { width: 1920, height: 1080 },
	position: { x: 0, y: 0 },
	// workArea is required by @tauri-apps/api's mapMonitor (it reads workArea.position/.size); omitting
	// it makes primaryMonitor()/currentMonitor() throw "reading 'position'" → an 'overlay init failed' warn.
	workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1032 } },
	scaleFactor: 1
};

export function installDevMock(): void {
	// Current window label === 'studio' → App.isStudioWindow() picks the editor role.
	mockWindows('studio');

	let evtId = 0;
	mockIPC((cmd, args) => {
		switch (cmd) {
			// --- boot: persistence / themes / controls / fonts (empty so the studio opens blank) ---
			case 'load_layout':
			case 'load_controls':
			case 'load_theme':
			case 'read_sack':
				return null;
			case 'list_themes':
			case 'list_sacks':
			case 'get_logs':
			case 'system_fonts':
			case 'list_display_names':
				// 'list_display_names' (Windows-only friendly monitor names) has no real displays under the
				// mock, so the switcher falls back to the device tag — and the boot stays self-policing.
				return [];
			case 'current_work_area':
				return { x: 0, y: 0, w: MONITOR.size.width, h: MONITOR.size.height - 48 };

			// --- media (now-playing): no sessions / no caps ---
			case 'get_initial_sessions':
				return { sessions: {} };
			case 'media_capabilities':
				return null;

			// --- window / monitor plugin: one fake 1920×1080 monitor (empty list → no multi-monitor UI) ---
			case 'plugin:window|available_monitors':
				return [];
			case 'plugin:window|current_monitor':
			case 'plugin:window|primary_monitor':
				return MONITOR;

			// --- event plugin: listen returns a handle id; everything else resolves ---
			case 'plugin:event|listen':
				return ++evtId;

			// --- autostart ---
			case 'plugin:autostart|is_enabled':
				return false;

			// --- Home Assistant proxy: not configured, no entities. Catalogs MUST be [] (not null) —
			// ha-source caches the result and later .map()s it; a null would throw on the next read. ---
			case 'ha_connect':
			case 'ha_disconnect':
				return undefined;
			case 'list_ha_entities':
				// A few canned entities so the dev studio's sensor typeahead has something to filter/pick
				// (there's no live telemetry under the mock). Shape mirrors HaEntity (ha-types.ts).
				return [
					{ entity_id: 'sensor.cpu_load', state: '12', friendly_name: 'CPU Load', unit: '%' },
					{
						entity_id: 'sensor.cpu_temp',
						state: '54',
						friendly_name: 'CPU Temperature',
						unit: '°C'
					},
					{ entity_id: 'sensor.memory_used', state: '41', friendly_name: 'Memory Used', unit: '%' },
					{ entity_id: 'light.kitchen', state: 'on', friendly_name: 'Kitchen Light' }
				];
			case 'ha_config_status':
				return { configured: false, url: null, insecure: false, base_path: '' };
			case 'ha_registry_snapshot':
				return { areas: [], devices: [], entities: [] };
			case 'ha_test_connection':
				return { ha_version: null };

			// --- MQTT proxy: not configured, empty catalog (same []-not-null rule as HA). ---
			case 'mqtt_connect':
			case 'mqtt_disconnect':
				return undefined;
			case 'mqtt_catalog':
				return [];
			case 'mqtt_config_status':
				return {
					configured: false,
					host: '',
					port: 1883,
					username: '',
					topics: [],
					tls: false,
					insecure: false,
					discovery: false
				};

			// --- audio outputs (the Spectrum widget's device picker) ---
			case 'list_audio_outputs':
				return [];

			// --- stocks proxy: not configured (mirrors HA/MQTT; shape = StocksStatus). ---
			case 'stocks_connect':
			case 'stocks_disconnect':
				return undefined;
			case 'stocks_config_status':
				return { configured: false, provider: '', symbols: [], pollSeconds: 60 };

			// --- AI provider: not configured (shape = LlmStatus). `llm_complete` returns canned layout
			// ops so the layout assistant is exercisable under Playwright without a real model. ---
			case 'llm_config_status':
				return {
					configured: false,
					provider: 'openai',
					baseUrl: 'https://api.openai.com/v1',
					model: '',
					hasKey: false,
					temperature: 0.7,
					maxTokens: 1024,
					agentControl: false
				};
			case 'control_start':
			case 'control_stop':
				return undefined;
			case 'llm_test_connection':
				return { model: 'mock', reply: 'OK' };
			case 'llm_list_models':
				return [];
			case 'llm_complete':
				return '{"ops":[{"op":"addWidget","widgetType":"clock"}],"summary":"added a clock (mock)"}';
			case 'llm_stream':
			case 'llm_cancel':
				return undefined;
			case 'llm_transcribe':
				return 'add a clock to the top left'; // canned transcript so the mic flow is testable in dev

			// --- widget actuation (only fired by clicking a live control, never at boot) ---
			case 'media_control':
			case 'ha_call_service':
				return null;

			default:
				// Plugin no-ops (event unlisten, window setters), saves, devtools, set_* → resolve void.
				// HA/MQTT + anything unhandled → null (only called when those panels are opened). Log it so
				// a genuinely missing boot command is visible in the console during a Playwright run.
				if (
					cmd.startsWith('plugin:') ||
					cmd.startsWith('save_') ||
					cmd.startsWith('set_') ||
					cmd === 'open_devtools' ||
					cmd === 'write_sack'
				) {
					return undefined;
				}
				console.warn('[devMock] unhandled command', cmd, args);
				return null;
		}
	});
}
