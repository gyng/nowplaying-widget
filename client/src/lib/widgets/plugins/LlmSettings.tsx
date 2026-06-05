// The AI Provider plugin's settings pane (studio → Plugins → AI Provider). A container (AGENTS.md §6):
// owns the provider-config form and drives the Tauri commands via llm-commands.ts; the api_key is
// write-only (a blank save keeps the saved one). Below the form sit two consumers that prove the
// provider is usable across the app:
//   - the natural-language LAYOUT ASSISTANT (builds a prompt from the widget/sensor catalog + the live
//     tree, asks the model for edit ops, applies them to the editor via layoutAssistantBridge), and
//   - a quick streaming CHAT tester (useLlmChat).
import { useEffect, useRef, useState } from 'react';
import { useTelemetryHub } from '../telemetryContext';
import {
	PROVIDERS,
	buildLayoutSystemPrompt,
	buildLayoutUserPrompt,
	parseAssistantReply,
	providerMeta,
	type ChatMessage
} from '../../core/llm';
import { listMetas } from '../../core/widget';
import {
	applyLayoutAssistant,
	layoutAssistantMonitor,
	layoutAssistantReady
} from '../layoutAssistantBridge';
import { useLlmChat } from '../../llm/useLlmChat';
import { speak, ttsAvailable } from '../../tts';
import {
	controlStart,
	controlStop,
	llmComplete,
	llmConfigStatus,
	llmListModels,
	llmTestConnection,
	llmTranscribe,
	saveLlmConfig
} from './llm-commands';
import { sttAvailable, startRecording, type Recorder } from '../../stt';
import type { LlmModel } from './llm-types';

type TestState = { kind: 'idle' } | { kind: 'ok'; msg: string } | { kind: 'err'; msg: string };

export default function LlmSettings() {
	const hub = useTelemetryHub();

	const [provider, setProvider] = useState('openai');
	const [baseUrl, setBaseUrl] = useState('');
	const [apiKey, setApiKey] = useState(''); // write-only; blank = keep saved
	const [model, setModel] = useState('');
	const [insecure, setInsecure] = useState(false);
	const [temperature, setTemperature] = useState(0.7);
	const [maxTokens, setMaxTokens] = useState(1024);
	const [hasKey, setHasKey] = useState(false);
	const [configured, setConfigured] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [test, setTest] = useState<TestState>({ kind: 'idle' });
	const [models, setModels] = useState<LlmModel[]>([]);
	const [agentControl, setAgentControl] = useState(false);

	// Auto-dismiss the "Saved ✓" tick like a toast (it otherwise lingers until the next edit).
	useEffect(() => {
		if (!saved) return;
		const t = setTimeout(() => setSaved(false), 2500);
		return () => clearTimeout(t);
	}, [saved]);

	const meta = providerMeta(provider);

	useEffect(() => {
		let alive = true;
		llmConfigStatus()
			.then((s) => {
				if (!alive) return;
				setProvider(s.provider || 'openai');
				setBaseUrl(s.baseUrl ?? '');
				setModel(s.model ?? '');
				setHasKey(s.hasKey);
				setConfigured(s.configured);
				setTemperature(s.temperature);
				setMaxTokens(s.maxTokens);
				setAgentControl(s.agentControl);
			})
			.catch(() => undefined);
		return () => {
			alive = false;
		};
	}, []);

	const dirtied = () => setSaved(false);
	const needsKey = meta.needsKey;
	const canSubmit = !saving && (!needsKey || hasKey || apiKey.trim().length > 0);

	const onSave = async () => {
		if (!canSubmit) return;
		setSaving(true);
		try {
			await saveLlmConfig({
				provider,
				baseUrl: baseUrl.trim(),
				apiKey, // blank keeps the saved one
				model: model.trim(),
				insecure,
				temperature,
				maxTokens,
				agentControl
			});
			if (apiKey.trim()) setHasKey(true);
			setApiKey(''); // back to write-only
			setConfigured(!needsKey || hasKey || apiKey.trim().length > 0);
			setSaved(true);
		} catch (err) {
			setTest({ kind: 'err', msg: `Save failed: ${String(err)}` });
		} finally {
			setSaving(false);
		}
	};

	// Agent control is INDEPENDENT of the LLM provider key (it actuates media/HA for an external MCP
	// agent, it doesn't call the provider), so the toggle applies + persists directly — NOT gated behind
	// the key-dependent Save button.
	const applyAgentControl = async (next: boolean) => {
		setAgentControl(next);
		try {
			await saveLlmConfig({
				provider,
				baseUrl: baseUrl.trim(),
				apiKey,
				model: model.trim(),
				insecure,
				temperature,
				maxTokens,
				agentControl: next
			});
			await (next ? controlStart() : controlStop());
		} catch (err) {
			setTest({ kind: 'err', msg: `Agent control: ${String(err)}` });
		}
	};

	const onTest = async () => {
		setTest({ kind: 'idle' });
		try {
			const r = await llmTestConnection(provider, baseUrl.trim(), apiKey, model.trim(), insecure);
			setTest({ kind: 'ok', msg: `${r.model} replied: “${r.reply}”` });
		} catch (err) {
			setTest({ kind: 'err', msg: String(err) });
		}
	};

	const onLoadModels = async () => {
		try {
			setModels(await llmListModels());
		} catch (err) {
			setTest({ kind: 'err', msg: `Could not list models: ${String(err)}` });
		}
	};

	return (
		<div className="has">
			<div className="has-statusline">
				<span className={`has-badge ${configured ? 'ok' : 'idle'}`}>
					● {configured ? 'configured' : 'not configured'}
				</span>
				<span className="has-state-dim">{meta.label}</span>
			</div>

			<div className="rp-hd">Provider</div>
			<div className="has-help">
				One AI provider, used across the app — the layout assistant, a briefing widget, and any
				chat. The API key stays on this machine (written to <code>plugins/llm.json</code>) and never
				crosses into the webview.
			</div>

			<label className="has-field">
				Provider
				<select
					value={provider}
					onChange={(e) => {
						setProvider(e.currentTarget.value);
						setModels([]);
						dirtied();
					}}
				>
					{PROVIDERS.map((p) => (
						<option key={p.id} value={p.id}>
							{p.label}
						</option>
					))}
				</select>
			</label>
			<div className="has-help">{meta.help}</div>

			<label className="has-field">
				Base URL
				<input
					type="text"
					autoComplete="off"
					placeholder={meta.defaultBaseUrl}
					value={baseUrl}
					onChange={(e) => {
						setBaseUrl(e.currentTarget.value);
						dirtied();
					}}
				/>
			</label>

			{needsKey && (
				<label className="has-field">
					API key
					<input
						type="password"
						autoComplete="off"
						placeholder={hasKey ? '•••••••• saved — leave blank to keep' : 'API key'}
						value={apiKey}
						onChange={(e) => {
							setApiKey(e.currentTarget.value);
							dirtied();
						}}
					/>
				</label>
			)}

			<div className="has-browser-bar">
				<label className="has-field" style={{ flex: 3 }}>
					Model
					<input
						type="text"
						list="llm-models"
						autoComplete="off"
						placeholder={meta.sampleModels[0]}
						value={model}
						onChange={(e) => {
							setModel(e.currentTarget.value);
							dirtied();
						}}
					/>
					<datalist id="llm-models">
						{models.map((m) => (
							<option key={m.id} value={m.id}>
								{m.label}
							</option>
						))}
						{models.length === 0 && meta.sampleModels.map((m) => <option key={m} value={m} />)}
					</datalist>
				</label>
				<button type="button" onClick={onLoadModels} title="List the provider's models">
					↻ Models
				</button>
			</div>

			<details className="has-advanced">
				<summary>Advanced</summary>
				<div className="has-browser-bar">
					<label className="has-field" style={{ flex: 1 }}>
						Temperature
						<input
							type="number"
							min={0}
							max={2}
							step={0.1}
							value={temperature}
							onChange={(e) => {
								setTemperature(Number(e.currentTarget.value));
								dirtied();
							}}
						/>
					</label>
					<label className="has-field" style={{ flex: 1 }}>
						Max tokens
						<input
							type="number"
							min={1}
							max={32000}
							value={maxTokens}
							onChange={(e) => {
								setMaxTokens(Number(e.currentTarget.value) || 1024);
								dirtied();
							}}
						/>
					</label>
				</div>
				<label className="has-check">
					<input
						type="checkbox"
						checked={insecure}
						onChange={(e) => {
							setInsecure(e.currentTarget.checked);
							dirtied();
						}}
					/>
					Allow self-signed / invalid TLS (a local endpoint behind a self-signed cert)
				</label>
				<label className="has-check">
					<input
						type="checkbox"
						checked={agentControl}
						onChange={(e) => void applyAgentControl(e.currentTarget.checked)}
					/>
					Enable agent control (local port for MCP media / Home Assistant actuation)
				</label>
				{agentControl && (
					<div className="has-warn">
						⚠ Opens a token-guarded server on 127.0.0.1 so an MCP agent can control media + Home
						Assistant. Off by default; only enable if you use the MCP integration.
					</div>
				)}
			</details>

			<div className="has-actions">
				<button
					type="button"
					className="has-primary"
					onClick={onSave}
					disabled={!canSubmit}
					aria-busy={saving}
				>
					{saving ? 'Saving…' : 'Save'}
				</button>
				<button type="button" onClick={onTest} disabled={saving}>
					Test
				</button>
				{saved && <span className="has-ok">Saved ✓</span>}
			</div>
			{test.kind === 'ok' && <div className="has-ok">{test.msg}</div>}
			{test.kind === 'err' && <div className="has-warn">⚠ {test.msg}</div>}

			<LayoutAssistant sensorIds={() => hub.sensorIds()} />
			<ChatTester />
		</div>
	);
}

// --- the natural-language layout assistant ---------------------------------------------------

function LayoutAssistant({ sensorIds }: { sensorIds: () => string[] }) {
	const [prompt, setPrompt] = useState('');
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState('');
	const [recording, setRecording] = useState(false);
	const recorderRef = useRef<Recorder | null>(null);
	const startingRef = useRef(false);

	// Release the mic if the panel unmounts mid-recording (selecting another plugin closes it).
	useEffect(
		() => () => {
			recorderRef.current?.cancel();
			recorderRef.current = null;
		},
		[]
	);

	// Push-to-talk dictation: first click starts the mic; second stops + transcribes into the prompt.
	const onMic = async () => {
		if (recording) {
			const rec = recorderRef.current;
			recorderRef.current = null;
			setRecording(false);
			if (!rec) return;
			setMsg('Transcribing…');
			try {
				const { bytes, mime } = await rec.stop();
				const text = (await llmTranscribe(bytes, mime)).trim();
				setPrompt((p) => (p ? `${p} ${text}` : text).trim());
				setMsg('');
			} catch (err) {
				setMsg(`Voice failed: ${String(err)}`);
			}
			return;
		}
		if (startingRef.current) return; // a getUserMedia is already pending — ignore a rapid 2nd click
		startingRef.current = true;
		try {
			recorderRef.current = await startRecording();
			setRecording(true);
			setMsg('● Listening… click the mic again to stop.');
		} catch (err) {
			setMsg(`Mic unavailable: ${String(err)}`);
		} finally {
			startingRef.current = false;
		}
	};

	const onGenerate = async () => {
		const instruction = prompt.trim();
		if (!instruction) return;
		if (!layoutAssistantReady()) {
			setMsg('Open the studio canvas first — the assistant edits the live layout.');
			return;
		}
		const monitor = layoutAssistantMonitor();
		if (!monitor) {
			setMsg('No layout to edit yet.');
			return;
		}
		setBusy(true);
		setMsg('');
		try {
			const system = buildLayoutSystemPrompt(listMetas(), sensorIds());
			const user = buildLayoutUserPrompt(instruction, monitor);
			const messages: ChatMessage[] = [
				{ role: 'system', content: system },
				{ role: 'user', content: user }
			];
			const reply = await llmComplete(messages, { temperature: 0 });
			const parsed = parseAssistantReply(reply);
			if (!parsed) {
				setMsg('The model did not return valid layout ops. Try rephrasing.');
				return;
			}
			const res = applyLayoutAssistant(parsed.ops);
			const tail = res.errors.length ? ` (${res.errors.join('; ')})` : '';
			setMsg(
				`${parsed.summary || 'Done'} — ${res.applied} change${res.applied === 1 ? '' : 's'}${tail}`
			);
			setPrompt('');
		} catch (err) {
			setMsg(`Failed: ${String(err)}`);
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<div className="rp-hd">Layout assistant</div>
			<div className="has-help">
				Describe a change in plain language — e.g.{' '}
				<em>“add a CPU gauge and a GPU gauge in a row”</em> — and the model edits your canvas. One
				undo step; review and Ctrl+Z if you don’t like it.
			</div>
			<label className="has-field">
				<textarea
					className="has-search"
					rows={2}
					spellCheck={false}
					placeholder="add a clock top-left and a memory bar under it"
					value={prompt}
					onChange={(e) => setPrompt(e.currentTarget.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void onGenerate();
					}}
				/>
			</label>
			<div className="has-actions">
				<button
					type="button"
					className="has-primary"
					onClick={onGenerate}
					disabled={busy || prompt.trim().length === 0}
				>
					{busy ? 'Thinking…' : 'Generate (⌘/Ctrl+↵)'}
				</button>
				{sttAvailable() && (
					<button
						type="button"
						className={recording ? 'has-primary' : ''}
						onClick={onMic}
						title="Dictate the request (speech-to-text)"
					>
						{recording ? '■ Stop' : '🎤 Speak'}
					</button>
				)}
			</div>
			{msg && <div className="has-help">{msg}</div>}
		</>
	);
}

// --- a quick streaming chat tester -----------------------------------------------------------

function ChatTester() {
	const { chat, send, reset } = useLlmChat();
	const [input, setInput] = useState('');
	const logRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
	}, [chat]);

	const onSend = () => {
		const text = input.trim();
		if (!text) return;
		void send(text);
		setInput('');
	};

	return (
		<>
			<div className="rp-hd">Chat</div>
			<div className="has-help">A quick test of the configured provider (streamed).</div>
			{chat.turns.length > 0 && (
				<div className="has-entities" ref={logRef} style={{ maxHeight: 180, overflowY: 'auto' }}>
					{chat.turns.map((t) => (
						<div key={t.id} className="has-entity" style={{ display: 'block' }}>
							<span className="has-state-dim">{t.role === 'user' ? 'you' : 'ai'}</span>{' '}
							<span>{t.error ? `⚠ ${t.error}` : t.content || (t.streaming ? '…' : '')}</span>
							{t.role === 'assistant' && t.content && !t.streaming && ttsAvailable() && (
								<button
									type="button"
									className="has-copy"
									title="Read aloud"
									aria-label="Read aloud"
									onClick={() => speak(t.content)}
								>
									🔊
								</button>
							)}
						</div>
					))}
				</div>
			)}
			<div className="has-browser-bar">
				<label className="has-field" style={{ flex: 3 }}>
					<input
						type="text"
						autoComplete="off"
						placeholder="Ask anything…"
						value={input}
						onChange={(e) => setInput(e.currentTarget.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') onSend();
						}}
					/>
				</label>
				<button type="button" className="has-primary" onClick={onSend} disabled={!input.trim()}>
					Send
				</button>
				{chat.turns.length > 0 && (
					<button type="button" onClick={reset} title="Clear the transcript">
						Clear
					</button>
				)}
			</div>
		</>
	);
}
