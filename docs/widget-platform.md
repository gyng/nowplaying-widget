# Widget platform plan

Turning the single-purpose now-playing app into a generic, Rainmeter-style widget
platform — so the existing Rainmeter skins under `C:\Users\gng\Documents\Rainmeter\Skins\gyng`
can move here, with **better layouting** for the Corsair Xeneon and **easier config**
than hand-editing `.ini` files.

> Status: planning. Nothing built yet except the `sysinfo` dependency line in `np/Cargo.toml`.

## Goals

- Replace Rainmeter with a homegrown, web-tech-themed widget system.
- **Better layouting** on the Xeneon; **easier editing/config** than `.ini`.
- Keep current wins: transparent borderless window, user-CSS theming, OBS capture,
  monitor management, now-playing via GSMTC.
- **Stay framework-portable**: a possible React port of the UI is wanted soon, so the
  rendering framework must be a thin, swappable layer over a framework-agnostic core.

## Migration target (the actual skins to replace)

Source: `C:\Users\gng\Documents\Rainmeter\Skins\gyng`

| Skin | Contents | Maps to |
| --- | --- | --- |
| **DateTime** | time `%H%M`, day-of-week (pictographic font via Substitute), date `%d`, month `%B` upper | `clock` / `text` meter, no backend |
| **System** | CPU avg (smoothed), **32 per-core** LINE graphs in an 8×4 grid, RAM %, Swap %, GPU load (UsageMonitor), dedicated VRAM (~10 GB card) | `cpu.total`, `cpu.core.N`, `mem.used`, `swap.used`, `gpu.util`, `gpu.vram` → gauge/bar/sparkline |
| **Network** | NetIn/NetOut mirrored histograms (one flipped) + autoscaled text | `net.down` / `net.up` → sparkline + text |
| **Music** | cover, progress bar, position/duration, title, artist | already covered by current NowPlaying widget |

**Palette:** white text `255,255,255`; pale-green labels `218,237,226`; teal accent `119,196,211`.
**Fonts:** DIN Engschrift Std; a pictographic day-of-week font in DateTime (see Risks → fonts).

## Decisions (locked)

- **Window model: A — full-monitor canvas overlay.** One transparent, normally
  click-through window **per monitor**; widgets positioned on a grid/canvas inside it.
  One webview per monitor (not one globally) = efficient even with 32 core graphs; best
  base for WYSIWYG layouting + a visual editor; no cross-window state sync. Built so
  peeling a skin into its own window later (hybrid model) is additive.
- **Editing: Both.** `widgets.json` + live reload is the foundation; an in-app visual
  editor (edit-mode toggle: drag/resize/snap, palette, inspector) is layered on top,
  reading/writing the same JSON.
- **GPU: NVIDIA (NVML) + generic perf-counter fallback.** NVML for clean
  load/VRAM/temp; Windows perf counters (PDH) as the vendor-agnostic fallback — the
  same source Rainmeter's UsageMonitor uses. Only NVIDIA is confirmed present.
- **Framework-portable core (React-ready).** All durable logic lives in a
  **framework-agnostic TypeScript core** with zero Svelte imports. Only the component
  layer (meters, canvas, editor) is Svelte. A React port reuses the core verbatim and
  reimplements components. See "Framework portability" below — this constrains every
  phase, not just the UI. React port: **reimplement components later, share `core/`
  only** (no web-component investment up front).
- **Z-order & input: always-on-top overlay, click-through by default, per-region
  interactivity required.** Some widgets (now-playing controls, the editor) must catch
  clicks while the rest passes through. This is **in scope, not deferred**, and must be
  **perf-conscious** (see Risks → click-through). WorkerW "on-desktop" z-order stays
  out of scope.
- **Multi-monitor from day one, no cross-monitor widgets (yet).** One overlay window
  per monitor on all monitors; each widget is bound to a single monitor; no
  spanning/dragging widgets across monitors initially.
- **Fonts: free by default, system fonts allowed for customization.** Bundle a free
  condensed grotesque as default; any widget can set `fontFamily` to a system-installed
  font, so the user's DIN Engschrift Std (and the day-pictograph font) resolve when
  installed. Avoids bundling/licensing those.
- **Sensor cadence: per-sensor configurable interval, 1 Hz default.**
- **Rename `np` → `widgetsack`.** Product identity change; staged as its own commit
  (Phase R) given the build-path blast radius — see Environment notes.

## Architecture

```
Rust (np/)                          Framework-AGNOSTIC core (client/src/lib/core/, no Svelte)
┌──────────────────────────┐       ┌──────────────────────────────────────────┐
│ sensors: trait + sched    │ emit  │ telemetry client: 1 listener → per-sensor  │
│  - system  (sysinfo)      │"tele- │   latest + ring-buffer history             │
│  - gpu     (nvml/PDH)     │ metry"│   subscribe(id,cb)->unsub  +  getSnapshot  │
│  - media   (gsmtc, push)  │──────▶│ layout: schema + validate + migrate        │
│ commands:                 │       │ sensors: id catalog + metadata             │
│  list_sensors             │◀─────▶│ format: clock / byte-rate autoscale / %    │
│  load_layout/save_layout  │invoke │ geometry: snap / align / rect              │
└──────────────────────────┘       └───────────────┬────────────────────────────┘
        │                                           │ (consumed via tiny adapter)
   widgets.json (app data dir)          ┌───────────┴───────────────┐
   notify file-watch → live reload      │ Svelte layer (swappable)   │  ← React port
                                         │  stores ← core.subscribe   │     replaces only
                                         │  registry: type → cmpt     │     this box
                                         │  Canvas (per monitor)      │
                                         │   └ WidgetHost × instances │
                                         │      └ meters, editor      │
                                         └────────────────────────────┘
```

## Stable contracts (the framework-agnostic API)

These three contracts are the platform. They must not depend on any UI framework; a
React port keeps them unchanged.

### 1. Telemetry event (Rust → frontend)

One `telemetry` event per tick carrying a **batch** (cheaper than one event per sensor;
32 cores = 1 event/tick, not 32). Media is push-based and emits its own samples on
change. Backend only runs sensors referenced by the active layout (subscription), so
NVML/PDH don't spin when no GPU widget exists.

```ts
type SensorValue =
  | { kind: 'scalar'; value: number }
  | { kind: 'text';   value: string }
  | { kind: 'series'; value: number[] }
  | { kind: 'json';   value: unknown };   // media session payload, etc.

type SensorSample = { sensor: string; tsMs: number; value: SensorValue };
type TelemetryBatch = SensorSample[];     // payload of the `telemetry` event
```

```rust
enum SensorValue { Scalar(f64), Text(String), Series(Vec<f64>), Json(Value) }
struct SensorSample { sensor: String, ts_ms: u64, value: SensorValue }
```

### 2. Layout JSON (`widgets.json`, versioned)

```ts
type WidgetInstance = {
  id: string;
  type: string;                     // 'clock'|'gauge'|'bar'|'sparkline'|'text'|'nowplaying'
  sensor?: string;                  // 'cpu.total','cpu.core.3','net.down',... (omit if self-sourcing)
  rect: { x: number; y: number; w: number; h: number };  // per-monitor logical px
  layer?: 'top' | 'desktop';        // z-layer (3c); routes widget to that layer's overlay window. default 'top'
  config: Record<string, unknown>;  // min,max,format,color,historyLen,unit,...
  css?: string;                     // per-widget style override (current ThemeInjector)
};
type Layout = {
  version: number;                                        // for migrations
  monitors: Record<string, { widgets: WidgetInstance[] }>; // key = monitor id
};
```

Meters are either **sensor-bound** (gauge → `cpu.total`) or **self-sourcing** (clock →
local `Date`); `sensor` is therefore optional. Each per-monitor overlay window is labelled
with its monitor id and renders only `layout.monitors[<its id>]`.

### 3. Commands (frontend → Rust)

```ts
type SensorMeta = {
  id: string;                       // 'cpu.total','net.down',...
  kind: SensorValue['kind'];        // scalar|text|series|json
  unit?: string;                    // '%','B/s','MiB',...
  min?: number; max?: number;       // suggested gauge/bar bounds
  available: boolean;               // false e.g. GPU sensor with no NVIDIA driver
};
```

`list_sensors() -> SensorMeta[]`, `load_layout() -> Layout`, `save_layout(Layout)`.
The backend **owns the layout file**, so on load/save it derives the set of referenced
sensor ids and runs only those (no NVML/PDH spin-up when unused). Live reload is driven by
a `notify` file-watch on `widgets.json` emitting a `layout_changed` event the frontend
listens for.

## Framework portability (React-ready)

The pivot that makes a React port cheap: **Svelte's store contract and React's
`useSyncExternalStore` both consume `subscribe(cb) => unsubscribe`.** So the core exposes
a minimal notify-based observable per sensor; each framework adds a ~5-line adapter.

```ts
// core/telemetry.ts — no framework imports
interface SensorObservable {
  subscribe(cb: () => void): () => void;   // notify-only
  getSnapshot(): { value: SensorValue; history: number[] };
}
```

```ts
// svelte: stores.ts  — Svelte store = { subscribe(run) }
const sensorStore = (id) => ({
  subscribe: (run) => { const o = core.sensor(id); run(o.getSnapshot());
                        return o.subscribe(() => run(o.getSnapshot())); }
});
```

```tsx
// react (future): useSensor.ts
const useSensor = (id) => { const o = core.sensor(id);
  return useSyncExternalStore(o.subscribe, o.getSnapshot); };
```

**Repo structure to enforce the boundary**

- `client/src/lib/core/` — telemetry, layout, sensors, format, geometry, commands.
  **Zero `.svelte` / Svelte imports.** Unit-tested with vitest (no DOM).
- `client/src/lib/widgets/` — Svelte: registry, `WidgetHost`, meters, `Canvas`, editor.
- Future `client-react/` (or a `packages/` split) imports `core/` unchanged.

Rule of thumb: **if it would be rewritten for React, it must not live in `core/`; if it
would be copy-pasted, it must.** Meters are the gray area — kept in the Svelte layer for
now; revisit web-components only if the React timeline firms up (see Open decisions).

## Key technical risks & mitigations

- **Per-region click-through (headline risk, in scope).** `set_ignore_cursor_events`
  is all-or-nothing per window; Tauri has **no native per-region hit-testing**
  ([#2090](https://github.com/tauri-apps/tauri/issues/2090),
  [#9250](https://github.com/tauri-apps/tauri/issues/9250)). Modes:
  - Normal + no interactive widgets → window fully click-through; **no watcher runs**.
  - Edit mode → window fully interactive (ignore-cursor off); no per-frame work.
  - Normal + ≥1 interactive widget → cursor watcher hit-tests against the interactive
    rects (synced frontend→Rust only on layout/edit-state change, not per frame).
  - **Perf rules** (the "perf considerations"):
    - Watcher only exists when the active layout has an interactive widget.
    - `GetCursorPos` is ~free; the cost is `set_ignore_cursor_events` (webview IPC) — so
      **toggle only on state transitions**, never per frame, with edge hysteresis to
      avoid flapping.
    - Short-circuit with a precomputed **union bbox** of interactive rects before
      per-rect tests.
    - Pause the watcher when the overlay is hidden/occluded.
    - Start with a gated `GetCursorPos` poll (~60 Hz only while needed); if CPU shows
      up, switch to an event-driven `WH_MOUSE_LL` low-level hook (≈0 CPU when idle).
- **Z-order / "stay on desktop."** Always-on-top is a one-call toggle. True
  Rainmeter-style "pinned to desktop, below windows" needs WorkerW/Progman parenting
  (wallpaper-engine technique) — complex and Windows-specific. Scope: ship
  always-on-top + normal now; WorkerW is a Phase 4 stretch, flagged as optional.
- **GPU.** NVML (`nvml-wrapper`) loads `nvml.dll` at runtime → no build dep; must
  **degrade gracefully** if absent (no NVIDIA driver) and fall back to PDH counters
  (`windows` crate) or disable GPU sensors. VRAM math mirrors the skin
  (`dedicated / total`).
- **DPI / multi-monitor.** Overlay must cover each monitor exactly; Tauri mixes
  physical/logical px and per-monitor scale factors. Reuse existing `monitor.ts` logic;
  store rects in per-monitor logical px.
- **Fonts.** Bundle a free condensed grotesque as the default (avoids DIN Engschrift Std
  licensing). Widgets expose a `fontFamily` config that resolves **system-installed**
  fonts via CSS, so the user's DIN and the custom day-pictograph font work when present;
  fall back to default/text when absent.
- **Phase 0 refactor risk.** Moving all window/monitor/settings logic out of
  `NowPlaying.svelte` and onto the canvas is the riskiest change. Mitigation: keep the
  current page working behind a flag/route until the canvas reaches parity; don't delete
  the old path until then.
- **Sparkline rendering.** 32 sparklines @ ~1 Hz: SVG is fine and simplest. Switch to
  `<canvas>` only if update rate climbs. Decide per-meter, not globally.
- **Media event weight.** Thumbnails are sent as byte arrays in events today; folding
  media into `telemetry` must not fatten every batch. Keep media push-only-on-change and
  consider a `get_thumbnail(sessionId)` command instead of inlining bytes (revisit).

## Phased plan

### Phase S — vertical slice (prove the pipe) ✅ code complete, gates green
- [x] `sysinfo` dep + `np/src/sensors.rs`: loop emits `telemetry` batch with `cpu.total` (+ serde-contract test).
- [x] Wire sensor loop into `main.rs` setup.
- [x] `core/telemetry.ts`: framework-agnostic hub (per-sensor observable, ring buffer) + tests.
- [x] Svelte `sensorStore` adapter + `Gauge` meter (pure `gaugeFraction` + tests) + `Canvas`/`WidgetHost`/registry; CPU gauge mounted on the page.
- [x] All gates green: `npm run check`/`lint`/`test:unit`/`build`, `cargo test`/`clippy`.
- [ ] Visual confirm: `cargo tauri dev` → live CPU gauge (run by user). Checkpoint.

### Phase R — rename np → widgetsack (own commit, low-risk first)
Blast radius (keep the **identifier** `io.github.gyng` unchanged so the app data dir and
saved window state/settings are not orphaned):
- [ ] `np/Cargo.toml`: `name`/`default-run`/description `np` → `widgetsack`.
- [ ] root `Cargo.toml` workspace member; rename dir `np/` → `widgetsack/` (relative paths
      inside `tauri.conf.json` are unaffected).
- [ ] `tauri.conf.json`: `productName` → `widgetsack`, window `title` → `WidgetSack`.
- [ ] `.github/workflows/*.yml`: paths + binary name (`np.exe` → `widgetsack.exe`).
- [ ] README + docs. (localStorage key `_mediaStore` can stay or migrate in Phase 3.)

### Phase 0 — refactor seam (+ core boundary)
- [ ] Establish `core/` (zero Svelte) vs `widgets/` (Svelte) split; move types into `core/`.
- [ ] Widget registry + `WidgetHost` (`<svelte:component>`), instance-as-data.
- [ ] Make NowPlaying one registered widget; extract window/monitor/settings off it (behind flag).
- [ ] Canvas becomes the main view; nothing lost.

### Phase 1 — sensors
- [x] sysinfo: `mem.used`, `swap.used` (%), `net.up`/`net.down` (B/s) — Phase 1a, with pure `percent`/`rate_per_sec` tests; CPU + RAM gauges wired on the canvas.
- [x] sysinfo: `cpu.core.N` per-core scalars (Phase 2a) — one ring-buffered sensor per core.
- [x] GPU: NVML `gpu.util` / `gpu.vram` / `gpu.temp` with graceful degrade (NVML init fails → skipped, no crash) — Phase 1b. PDH fallback for non-NVIDIA still pending.
- [ ] Media (GSMTC) re-expressed as a push sensor emitting `Json` under the same contract.
- [ ] `list_sensors` command + per-sensor interval (1 Hz default); sensors run only if in the layout.

### Phase 2 — meters
- [x] `Gauge` (Phase S) + `Sparkline` (Phase 2a, pure geometry + tests); per-core CPU row + net sparkline on the canvas.
- [x] `Text` (byte-rate/percent formatters) + `Clock` (moment-like tokens, `[literal]` escaping) — Phase 2b, pure formatters + tests; clock/date + net up/down readouts on the canvas.
- [x] `Bar` meter (horizontal/vertical fill; shares pure `fraction` scale with Gauge) — Phase 2c. Core meter set complete.
- [ ] Carry palette + fonts (system `fontFamily` override). Rebuild DateTime / System / Network as instances; reach parity.

### Phase 3 — layout + config (the stated priority)
- [x] `widgets.json` in app config dir; `load_layout`/`save_layout` commands + pure `parseLayout` validation (Phase 3a, tested). Canvas loads it on mount, falling back to the demo default.
- [x] `notify` file-watch on widgets.json → `layout_changed`; Canvas live-reloads external edits (ignored while actively editing) — Phase 3b.
- [ ] **3c-1 (single overlay):** main window → transparent, borderless, always-on-top,
      skip-taskbar overlay sized to its monitor; `setIgnoreCursorEvents(true)` normally,
      `false` in edit mode (whole-window click-through). Edit toggled by **global hotkey
      (Ctrl+Alt+E) + tray menu** — a click-through window can't receive in-app keys. Add
      `layer` field (default `top`); relocate the NowPlaying hover settings/debug panel into
      edit mode / a settings window. Capabilities for set-ignore-cursor / always-on-top.
      Note: supersedes the saved-position window behavior (positions live in widgets.json).
- [ ] **3c-2 (multi-monitor):** one overlay window per monitor, created from the layout's
      monitor map (configurable which monitors are active); each renders `?monitor=<id>`.
      Runtime window creation + capability updates; widgets bound to one monitor.
- [x] Visual editor v1: Ctrl+E edit mode, drag-to-move with snap-to-grid (tested geometry), save-on-drop to widgets.json — Phase 3d.
- [x] Editor: corner/edge resize handles with tested `resizeRect` — Phase 3d-2.
- [x] Editor: widget palette (add) + inspector (sensor / x/y/w/h / config JSON) + select + remove — Phase 3d-3.
- [ ] Editor nicety: alignment guides / snap-to-other-widgets.
- [ ] Per-monitor layouts; Xeneon arrangement. Migrate existing localStorage settings.

### Phase 4 — polish / stretch
- [ ] **3c-3 (desktop layer):** a second overlay window per monitor pinned to the wallpaper
      via WorkerW/Progman; widgets with `layer: 'desktop'` route to it. Fragile / Windows-
      version-specific — opt-in, additive (routing by `layer` is already in the model).
- [ ] Per-widget click-through: cursor-poll hit-testing for widgets needing clicks in normal
      mode (now-playing controls). Deferred — whole-window click-through ships first.
- [ ] Editor nicety: alignment guides / snap-to-other-widgets.
- [ ] PDH GPU fallback for non-NVIDIA; temps/fans via HWiNFO/LHM shared memory (optional).

## Resolved decisions (2026-06-01)

1. **Z-order/input (3c, refined):** **whole-window click-through** (fully passive normally,
   interactive in edit mode) on an **always-on-top** overlay. Per-widget `layer: top|desktop`
   field added now; **always-on-top layer first**, WorkerW **desktop layer later** (Phase 4).
   Per-widget click-through deferred. Edit toggled by **global hotkey + tray**. Overlays
   **per monitor, configurable** via the layout map.
2. **Monitors:** multi-monitor overlays from day one; **no cross-monitor widgets** to start.
3. **Fonts:** free bundled default; `fontFamily` override resolves **system fonts** (user's
   DIN, day pictographs) for customization.
4. **React:** reimplement components later; **share `core/` only** (no web components now).
5. **Sensor interval:** **configurable per sensor, 1 Hz default.**
6. **Name:** **rename `np` → `widgetsack`** (Phase R).

## Environment notes

- Svelte 3.54 (`export let` / `on:` idiom), SvelteKit 1.5 + adapter-static
  (`ssr=false`, `prerender=true`), Tauri 2.8, Rust edition 2024.
- Capabilities are scoped to window label `main`; multi-window + fs access will need
  additions under `np/capabilities/`.
- Dynamic arbitrary-widget-code loading is **not** required — a fixed registry of
  built-in meter types configured by data covers 100% of the listed skins.
</content>
