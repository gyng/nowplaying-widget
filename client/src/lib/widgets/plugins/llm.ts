// The AI Provider plugin: one LLM provider (Anthropic / OpenAI-compatible / local Ollama) configured
// server-side (widgetsack/src/llm.rs, plugins/llm.json) and used ACROSS THE APP — the settings panel's
// layout assistant + chat tester, and the `assistant` briefing widget. Importing this module (Canvas
// side-effect-imports it) registers the settings panel + the briefing source + the Assistant widget.
import { registerPlugin } from '../plugin';
import LlmSettings from './LlmSettings';
import Assistant from '../meters/Assistant';
import Transcribe from '../meters/Transcribe';
import type { MeterComponent } from '../registry';

registerPlugin({
	id: 'ai-provider',
	name: 'AI Provider',
	description:
		'Configure one LLM provider (Anthropic, OpenAI-compatible, or local Ollama) used across the app — the natural-language layout assistant, the AI briefing widget, and a chat tester. The API key stays server-side.',
	settings: LlmSettings,
	widgets: [
		{
			meta: {
				// Self-sourcing: generates its own text on a schedule (binds:'none'). interactive so the
				// refresh control catches clicks in the passive overlay.
				type: 'assistant',
				binds: 'none',
				interactive: true,
				label: 'AI Briefing',
				description:
					'A self-updating, LLM-generated briefing from your live sensors. Configure the prompt and a schedule (interval like 5m, or a cron expression). Auto-refreshes on the overlay; manual refresh in the studio. Needs an AI provider configured.',
				defaultSize: { w: 280, h: 96 },
				defaultConfig: {
					prompt: 'Summarize my system status in one short, friendly sentence.',
					schedule: '10m',
					sensors: 'auto',
					speak: false,
					label: 'AI',
					color: ''
				},
				configFields: [
					{
						key: 'prompt',
						label: 'prompt',
						kind: 'text',
						help: 'what to ask the AI (your live sensors are included automatically)'
					},
					{
						key: 'schedule',
						label: 'schedule',
						kind: 'text',
						help: 'how often to refresh: an interval (30s, 5m, 2h), a cron expr (e.g. 0 9 * * *), or "manual"'
					},
					{
						key: 'sensors',
						label: 'sensors',
						kind: 'text',
						help: 'comma-separated sensor ids to feed the prompt, or "auto"'
					},
					{ key: 'speak', label: 'read aloud', kind: 'toggle', help: 'speak each update (TTS)' },
					{ key: 'label', label: 'label', kind: 'text', help: 'header text' },
					{ key: 'color', label: 'color', kind: 'color', help: 'text colour (blank = theme)' }
				]
			},
			component: Assistant as unknown as MeterComponent
		},
		{
			meta: {
				// Push-to-talk speech-to-text, optionally translated. Self-sourcing + interactive (the
				// mic must catch clicks in the passive overlay).
				type: 'transcribe',
				binds: 'none',
				interactive: true,
				label: 'Transcribe / Translate',
				description:
					'Push-to-talk speech-to-text, optionally translated to another language and read aloud, via the AI provider. Click the mic to record, click again to stop and transcribe. Needs an OpenAI-compatible provider (Whisper) configured.',
				defaultSize: { w: 320, h: 120 },
				defaultConfig: {
					mode: 'transcribe',
					targetLang: 'English',
					sourceLang: 'auto',
					model: '',
					audioSource: '',
					speak: false,
					label: '',
					color: ''
				},
				configFields: [
					{
						key: 'mode',
						label: 'mode',
						kind: 'select',
						options: ['transcribe', 'translate'],
						help: 'transcribe speech, or transcribe then translate. Click the mic to talk (push-to-talk — never always-listening).'
					},
					{
						key: 'targetLang',
						label: 'translate to',
						kind: 'text',
						help: 'target language for translate mode (e.g. English, Spanish, 日本語)'
					},
					{
						key: 'sourceLang',
						label: 'spoken language',
						kind: 'text',
						help: 'a hint for accuracy, or "auto" to detect (e.g. auto, en, ja, es)'
					},
					{
						key: 'audioSource',
						label: 'microphone',
						kind: 'select',
						options: [],
						catalog: 'microphones',
						help: 'which microphone to record from (blank = system default)'
					},
					{
						key: 'model',
						label: 'transcription model',
						kind: 'text',
						help: 'blank = provider default (whisper-1); e.g. gpt-4o-transcribe, gpt-4o-mini-transcribe'
					},
					{ key: 'speak', label: 'read aloud', kind: 'toggle', help: 'speak the result (TTS)' },
					{ key: 'label', label: 'label', kind: 'text', help: 'header text' },
					{ key: 'color', label: 'color', kind: 'color', help: 'text colour (blank = theme)' }
				]
			},
			component: Transcribe as unknown as MeterComponent
		}
	]
});
