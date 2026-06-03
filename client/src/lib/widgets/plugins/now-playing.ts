// The Now Playing plugin: the GSMTC media widget, a media->hub data source, and a settings panel,
// registered as a first-class plugin (like Home Assistant). The widget renders the active track; the
// `npSource` bridges the media feed (mediaStore) into the telemetry hub so the track's values are
// also bindable as `np.*` sensors by other widgets. Importing this module registers the `nowplaying`
// widget type + the source + the settings panel; Canvas side-effect-imports it. The default LOOK
// ships as the instance's editable css (NOWPLAYING_DEFAULT_CSS, kept in core/widget so layout
// templates can seed it too).

import { registerPlugin } from '../plugin';
import { NOWPLAYING_DEFAULT_CSS } from '../../core/widget';
import NowPlaying from '../meters/NowPlaying';
import NowPlayingSettings from './NowPlayingSettings';
import { npSource } from '../../components/NowPlaying/np-source';
import type { MeterComponent } from '../registry';

registerPlugin({
	id: 'now-playing',
	name: 'Now Playing',
	description: 'Currently-playing media (Windows GSMTC) with a source-priority + ignore list.',
	widgets: [
		{
			meta: {
				// Self-sourcing media widget: subscribes to the GSMTC media feed internally (binds:none).
				type: 'nowplaying',
				binds: 'none',
				label: 'Now Playing',
				defaultSize: { w: 160, h: 200 },
				defaultConfig: {},
				defaultCss: NOWPLAYING_DEFAULT_CSS,
				// Catches clicks in passive mode so the transport buttons work (un-hide them via css).
				interactive: true,
				configFields: [{ key: 'label', label: 'label (when idle)', kind: 'text' }]
			},
			component: NowPlaying as unknown as MeterComponent
		}
	],
	sources: [npSource],
	settings: NowPlayingSettings
});
