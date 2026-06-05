# AGENTS.md

Guidance for AI agents and humans working in this repository. Read this before making
changes. The practices below (TDD, concentric architecture, atomic design, agentic
workflow) are mapped onto the **actual** structure of this project, not described in the
abstract.

---

## 1. What this project is

`widgetsack` (crate name `widgetsack`) is a themable, **Rainmeter-style desktop widget
overlay for Windows**. It puts system meters (CPU total + per-core/freq, GPU/VRAM/clocks/power,
memory + swap totals, disks, network, uptime, battery), clocks, the currently-playing media
track, and Home Assistant controls on a
transparent, click-through overlay across every monitor — and lets you arrange them with a
built-in visual editor (the **studio**).

> Evolved from `nowplaying-widget` (crate `np`). The now-playing widget is still built in,
> now as one registered widget type among many. If you find a stale `np` / `nowplaying-widget`
> reference, it predates the rename.

- **Backend** — Rust crate in [widgetsack/](widgetsack/), Tauri v2, edition 2024 (Rust 1.90+).
  Media comes from `win-gsmtc`; system sensors from `sysinfo` + `nvml-wrapper` (NVIDIA,
  best-effort); Home Assistant via `tokio-tungstenite` + `reqwest`. All Windows-only.
- **Frontend** — React 19 + TypeScript in [client/](client/), built with Vite, tested with
  Vitest. Ships as a static SPA loaded by the Tauri webview.
- **Bridge** — Tauri `invoke` (commands) + `emit`/`listen` (events) connect the two.

### Two window roles (memorize this)

Both roles render the **same** [Canvas.tsx](client/src/lib/widgets/Canvas.tsx) component;
[App.tsx](client/src/App.tsx) picks the role via `isStudioWindow()` (window label `studio`):

- **Overlay** — transparent, always-on-top, click-through, borderless. One per monitor; the
  primary is the `main` window, secondaries spawn on demand ([overlay.ts](client/src/lib/overlay.ts)
  `reconcileOverlays`). Renders the saved layout passively.
- **Studio** — a normal decorated window (`label === 'studio'`) for the layout designer,
  widget designer, theme editor, and sack import/export. Opened from the tray, the
  `open_studio` event, or `openStudio()`.

### Data flow — media (now playing)

```
Windows GSMTC
   │  ManagerEvent / SessionUpdateEvent  (external gsmtc types)
   ▼
listener.rs ── wraps into ──▶ ManagerEventWrapper / SessionUpdateEventWrapper / NpSessionEvent
   │  mpsc channel
   ▼
state.rs::updater(sessions, event) ──▶ (event_type, Option<SessionRecord>)   ← pure reducer
   │     event_type ∈ { "session_create", "session_update", "session_delete", "unsupported" }
   ▼
event.rs::emit_to_bridge ── tauri emit(event_type, record) ──▶ webview
   │
   ▼
lib/components/NowPlaying/source.ts ── listen("session_update"|"session_delete") ──▶ stores.ts
   │   invoke("get_initial_sessions") at startup     │  handleUpdate / handleDelete
   └──────────────────────────────────────▶  mediaStore (external store, localStorage-backed)
                                                  │  useStore / subscribe
                                                  ▼
                              sortSessionsByPriority ──▶ NowPlaying meter (presentational)
```

### Data flow — sensors / telemetry

```
sysinfo / nvml-wrapper (CPU, mem, swap, net, GPU)        Home Assistant (WebSocket + REST)
   │  sensors.rs::run_system_sensors (1 Hz loop)            │  ha.rs::run_ha_client
   ▼                                                        ▼
   └────────────▶ Vec<SensorSample { sensor, ts_ms, value: SensorValue }> ◀──── state_to_samples
                              │  tauri emit(TELEMETRY_EVENT = "telemetry", batch)
                              ▼
            lib/telemetry/source.ts ── listen("telemetry") ──▶ core/telemetry.ts TelemetryHub
                              │  (provided via React context, telemetryContext.ts)
                              ▼
                      useSensor(id) hook ──▶ meter components (Gauge / Bar / Sparkline / Cpu / …)
```

### Data flow — layout persistence

```
Studio editor (useEditorModel reducer)              widgets.json (app config dir)
   │  usePersistence: invoke("save_layout", json)      │
   ▼                                                    ▼
backend command.rs writes widgets.json ──▶ notify file watcher ──▶ emit("layout_changed")
                                                                       │
                                            useStudioInit.ts listens ──┘ ──▶ overlays reload
```

Themes (`themes/*.css`) follow the same write → watch → `themes_changed` → reload pattern.

---

## 2. Repository layout

```
widgetsack/                 Rust / Tauri backend (the workspace member)
  src/
    main.rs                 Entry point, AppState, wires channels + Tauri builder + tray + hotkey
    listener.rs             GSMTC adapter: listens, wraps external types (From impls)
    event.rs                NpSessionEvent model + emit_to_bridge (Tauri adapter)
    state.rs                SessionRecord + updater() — the pure session reducer
    sensors.rs              System sensor poll loop (CPU/mem/net/GPU) → "telemetry"; pure seams
    ha.rs                   Home Assistant proxy (WS + REST); token stays server-side; pure seams
    clickthrough.rs         Per-widget interactive rects + click-through cursor watcher
    command.rs              #[tauri::command] handlers (layout/theme/sack I/O, fonts, devtools)
  tauri.conf.json           Window config, build hooks, bundle settings (product "widgetsack")
  capabilities/             Tauri capability files
  Cargo.toml
client/                     React frontend
  src/
    main.tsx                React root bootstrap (no StrictMode — Tauri effects aren't idempotent)
    App.tsx                 Picks studio vs overlay role; mounts <Canvas studio={…} />
    lib/
      core/                 Framework-agnostic DOMAIN — pure, NO React/Tauri imports, all tested
        layout.ts / layoutTree.ts   v1 + v2 (tree) layout grammar
        layoutEdit.ts               pure tree edit ops (insert/move/remove …)
        solve.ts                    layout solver → rects + renderables
        widget.ts                   widget meta API (ConfigField, getMeta, registerMeta)
        sack.ts                     shareable bundles (pack/unpack/mergeLibrary)
        telemetry.ts                TelemetryHub + SensorValue/SensorSample types
        sensors.ts / templates.ts / plugin.ts / tokens.ts / style.ts
        geometry.ts / align.ts / format.ts / migration.ts
        *.test.ts                   co-located tests for every module above
      widgets/              REACT layer
        Canvas.tsx                  the organism — studio/overlay root, owns editor state
        WidgetHost.tsx              container — sensor wiring, drag/resize, selection
        Inspector.tsx / Outline.tsx / NavRail.tsx / SensorList.tsx / StyleLayer.tsx
        registry.tsx                widget type → component map
        useSensor.ts / telemetryContext.ts / meterProps.ts / ops.ts
        meters/                     presentational widgets (props-only): Gauge, Bar, Sparkline,
                                    Clock, Text, Button, Cpu, NowPlaying, Ha*  (+ *.test.tsx)
        canvas/                     editor hooks: useEditorModel, usePersistence, useKeyboard,
                                    useStudioInit, dragIntent, dropPlacement, … (+ *.test.ts)
        plugins/                    home-assistant.ts, ha-source.ts
      components/NowPlaying/
        source.ts                   Tauri media adapter (listen/invoke)
        priority.ts + .test.ts      pure source-priority sort (domain) + tests
        image.ts                    byte-array → object URL helper
      telemetry/source.ts   Tauri "telemetry" adapter → TelemetryHub
      overlay.ts            Tauri window/monitor + file bridge (isStudioWindow, reconcileOverlays…)
      utils/monitor.ts      monitor helpers
    stores/
      stores.ts             mediaStore + TS types mirroring Rust + handle* reducers
      createStore.ts        external-store adapter (useSyncExternalStore) — replaces svelte/store
Cargo.toml                  Workspace root (members = ["widgetsack"])
docs/                       Architecture & roadmap notes (widget-platform.md, ideas.md)
.github/workflows/          CI: test.yml (build+test+clippy+client), build.yml (release)
```

Generated / vendored — **do not hand-edit**: `client/node_modules/`, `target/`,
`widgetsack/gen/`, `widgetsack/capabilities/migrated.json`, `Cargo.lock`,
`client/package-lock.json` (only via the package manager). There is no longer a
`client/.svelte-kit/` — the SvelteKit migration is complete.

---

## 3. Commands

> **Build platform: Windows only.** `win-gsmtc` and the Win32/sensor code are `cfg`-gated to
> Windows; a full Tauri build/run requires Windows + [Tauri prerequisites](https://tauri.app/start/prerequisites/).
> The React client and its tests run on any OS.

Shell here is **PowerShell** — chain with `;` or `&&` (pwsh 7 supports both). Avoid `cd`
inside compound commands when using the agent Bash tool (it can trigger a prompt); prefer
the working-directory-aware tools.

### Frontend (`client/`)
| Task | Command |
|------|---------|
| Install deps | `npm ci` (CI) / `npm i` (local) |
| Dev server (browser only) | `npm run dev` |
| Type-check (`tsc --noEmit`) | `npm run check` |
| Lint (must pass with **0 warnings**) | `npm run lint` |
| Auto-fix lint + format | `npm run lint:fix` |
| Format only | `npm run format` |
| Unit/component tests (Vitest) | `npm run test:unit` |
| E2E layout/interaction tests (Playwright, real browser) | `npm run test:e2e` |
| Production build → `client/build` | `npm run build` |

### Backend (repo root)
| Task | Command |
|------|---------|
| Build | `cargo build` |
| Test | `cargo test` |
| Lint | `cargo clippy` |
| Run full app (dev) | `cargo tauri dev` |
| Release build → `target/release/widgetsack.exe` | `cargo tauri build` |

> ⚠️ **Build order gotcha:** Tauri embeds `client/build` (`frontendDist`), so the frontend
> must be built **before** any `cargo build` / `cargo test` / `cargo clippy`. CI does
> `cd client && npm ci && npm run build` first for exactly this reason. `cargo tauri dev`
> handles this for you via `beforeDevCommand` (`cd ../client && npm run dev`); the dev server
> is pinned to port **1420** (`strictPort`) to match `devUrl` in
> [tauri.conf.json](widgetsack/tauri.conf.json).

### Before you call a change "done"
Run the same gates CI runs ([.github/workflows/test.yml](.github/workflows/test.yml)):
- Client: `npm run check && npm run lint && npm run test:unit && npm run build`
- Docs freshness (if you touched a widget meta): `npm run check:docs` — fails when
  [docs/widgets.md](docs/widgets.md) drifts from the widget registry; run `npm run gen:docs` to refresh.
- Client E2E (if you touched the studio UI/layout): `npm run test:e2e` — Playwright drives the
  studio in a real browser via the dev Tauri mock ([devMock.ts](client/src/lib/devMock.ts)); it
  catches layout/interaction regressions happy-dom can't. First run: `npx playwright install chromium`.
- Backend (Windows, after building the client): `cargo test && cargo clippy`

---

## 4. Test-Driven Development (TDD)

This codebase already follows a test-first-friendly shape; keep it that way.

**The loop:** Red → Green → Refactor. Write a failing test that states the intent, make it
pass with the simplest code, then refactor under green.

**What this looks like here:**
- **Push logic into pure functions and test those.** The whole of
  [lib/core/](client/src/lib/core/) is framework-agnostic domain code with a co-located
  `*.test.ts` for every module — `layoutEdit`, `solve`, `widget`, `sack`, `telemetry`,
  `geometry`, `align`, `format`, `migration`, `tokens`, `style`, `templates`, `sensors`.
  Other good examples: [priority.ts](client/src/lib/components/NowPlaying/priority.ts)
  (sorting) and [sparklineMath.ts](client/src/lib/widgets/meters/sparklineMath.ts). On the
  Rust side, [state.rs](widgetsack/src/state.rs)'s `updater` is a pure
  `(state, event) -> (kind, delta)` reducer. Pure functions are trivially testable without
  Tauri, GSMTC, sensors, or a window.
- **Co-locate tests** next to source as `*.test.ts` / `*.test.tsx` (Vitest:
  `describe`/`it`/`expect`, globals enabled). Rust unit tests go in a
  `#[cfg(test)] mod tests` block in the same file — see [sensors.rs](widgetsack/src/sensors.rs)
  (`percent`, `rate_per_sec`, `core_sensor_id`, sample serialization),
  [ha.rs](widgetsack/src/ha.rs) (`ws_url_from`, `state_to_samples`, `entity_from_state`),
  and [clickthrough.rs](widgetsack/src/clickthrough.rs) (`ScreenRect::contains`).
- **Component tests** use `@testing-library/react` with `happy-dom` (setup in
  [test-setup.ts](client/src/test-setup.ts); see
  [WidgetHost.test.tsx](client/src/lib/widgets/WidgetHost.test.tsx) and
  [meters/ha.test.tsx](client/src/lib/widgets/meters/ha.test.tsx)). Test observable behavior
  (rendered text / DOM), not internals.
- When fixing a bug, **first write a test that reproduces it**, then fix.
- Prefer adding a focused test over a manual repro — most logic (priority, layout edits,
  the solver, sensor math, serialization shape) can be exercised without real media,
  hardware, or a window.

`state.rs::updater` still has no Rust tests — it is the prime candidate for new ones if you
touch it. Pure-seam tests in `sensors.rs` / `ha.rs` show the pattern to follow.

---

## 5. Concentric (clean / onion) architecture

Think in concentric rings. **The dependency rule: source dependencies point inward.**
Inner rings know nothing about outer rings — the domain must not import frameworks.

```
        ┌──────────────────────────────────────────────────┐
        │  Infrastructure / Adapters (outermost)            │
        │  • listener.rs (gsmtc), sensors.rs, ha.rs, event  │
        │  • From<gsmtc::*> wrapper impls                    │
        │  • overlay.ts, components/NowPlaying/source.ts,    │
        │    telemetry/source.ts (Tauri invoke/listen)      │
        │  • createStore.ts localStorage, monitor.ts        │
        │   ┌────────────────────────────────────────────┐  │
        │   │  Application / Orchestration                │  │
        │   │  • main.rs (wires channels + builder)       │  │
        │   │  • command.rs (#[tauri::command])           │  │
        │   │  • stores.ts handle*() + mediaStore         │  │
        │   │  • Canvas.tsx + canvas/ hooks (container)   │  │
        │   │   ┌─────────────────────────────────────┐   │  │
        │   │   │  Domain / Core (innermost)           │   │  │
        │   │   │  • SessionRecord, updater()          │   │  │
        │   │   │  • SensorSample/Value, pure seams    │   │  │
        │   │   │  • lib/core/* (layout, solve, sack,  │   │  │
        │   │   │    widget, telemetry, geometry, …)   │   │  │
        │   │   │  • priority.ts; TS types in stores   │   │  │
        │   │   └─────────────────────────────────────┘   │  │
        │   └────────────────────────────────────────────┘  │
        └──────────────────────────────────────────────────┘
```

**Rules for this repo:**
- **Keep external types at the edge.** The `ManagerEventWrapper` /
  `SessionUpdateEventWrapper` / `ImageWrapper` types with their `From<gsmtc::*>` impls in
  [listener.rs](widgetsack/src/listener.rs) are an *anti-corruption layer* — they stop the
  `gsmtc` dependency from leaking inward. `sensors.rs` (wrapping `sysinfo`/`nvml`) and
  `ha.rs` follow the same shape: a thin I/O outer layer plus **pure seam** functions
  (`ws_url_from`, `state_to_samples`, `entity_from_state`, `percent`, `rate_per_sec`) that
  hold the logic and the tests. Preserve this: domain code deals in `widgetsack`'s own
  types and `SensorSample`, never raw `gsmtc::*` / `sysinfo::*` / HA JSON.
- **Domain stays pure.** Everything in [lib/core/](client/src/lib/core/), `priority.ts`, and
  `state::updater` takes data in and returns data out — **no I/O, no Tauri, no React, no DOM**.
  New business logic belongs here and should be unit-tested directly. If you reach for
  `invoke`, `listen`, `window`, or a React import inside `lib/core/`, you're in the wrong ring.
- **Side effects live in adapters.** Tauri `emit`/`invoke`/`listen` (`overlay.ts`,
  `components/NowPlaying/source.ts`, `telemetry/source.ts`), `localStorage`
  (`createStore.ts`/`stores.ts`), and window/monitor manipulation (`overlay.ts`,
  `monitor.ts`) are all outer-ring concerns. Don't sprinkle them into domain functions.
- **React mirror:** presentational meters are inner (pure, props-only); `Canvas.tsx`, the
  `canvas/` hooks, and stores are the orchestration ring; Tauri API calls are the outer
  ring. See §6.
- **Type-mirroring is a domain contract.** The TS types in
  [stores.ts](client/src/stores/stores.ts) mirror serde-serialized Rust structs in
  [state.rs](widgetsack/src/state.rs) / [listener.rs](widgetsack/src/listener.rs), and the
  `SensorSample`/`SensorValue` types in [core/telemetry.ts](client/src/lib/core/telemetry.ts)
  mirror [sensors.rs](widgetsack/src/sensors.rs). Layout/widget/sack JSON is **frontend-owned**
  (`lib/core/`) — the backend only does dumb file I/O for `widgets.json`, `themes/*.css`, and
  `sacks/*.sack.json`. When you change a struct that crosses the bridge, **update both sides
  in the same change.**

---

## 6. Atomic design (frontend components)

Organize React components by composition level, and **separate container (stateful) from
presentational (pure) components**. Current code already models the key split:

| Atomic level | In this repo | Rule |
|--------------|--------------|------|
| **Pages** | [App.tsx](client/src/App.tsx) (studio vs overlay role) | Thin. Just pick the role and mount `<Canvas>`; no business logic. |
| **Organisms** (containers) | [Canvas.tsx](client/src/lib/widgets/Canvas.tsx) + `canvas/` hooks | Own editor state (`useEditorModel`), wire Tauri events (`useStudioInit`), persist (`usePersistence`), pass plain props down. |
| **Molecules** (containers) | [WidgetHost.tsx](client/src/lib/widgets/WidgetHost.tsx), `Inspector`, `Outline`, `NavRail` | Wire one widget's sensor (`useSensor`), drag/resize, selection — then render a pure meter. |
| **Atoms** (presentational) | `meters/*` (`Gauge`, `Bar`, `Sparkline`, `Clock`, `Text`, `Cpu`, `NowPlaying`, `Ha*`) | Driven entirely by props; no store access, no Tauri, no `useSensor`. |

**Guidelines:**
- **Presentational meters stay pure and stateless.** A meter takes its value(s) and config
  as props and renders — it does not read a store, call Tauri, or subscribe to a sensor. The
  container (`WidgetHost`) does the `useSensor` subscription and feeds the meter plain props.
- **Containers own the wiring.** Subscriptions, `invoke`, `listen`, monitor/window controls,
  and persistence belong in `Canvas.tsx`, the `canvas/` hooks, the Tauri adapters, or the
  store — not in leaf meters.
- **Adding a new widget type** = (1) add a presentational meter under
  [meters/](client/src/lib/widgets/meters/) consuming props, with a co-located test;
  (2) register it in [registry.tsx](client/src/lib/widgets/registry.tsx); (3) declare its
  config/sensor metadata via the [widget.ts](client/src/lib/core/widget.ts) meta API. Keep
  the meter prop-driven; let `WidgetHost` bind the sensor.
- **Hooks** carry reusable stateful logic and live next to their consumer (`use*` naming,
  e.g. `useSensor.ts`, `canvas/useKeyboard.ts`). Pure helpers a hook leans on (e.g.
  `dragIntent`, `dropPlacement`, `menuPosition`) live as plain modules with their own tests.

---

## 7. Conventions

### Formatting & linting
- **Frontend:** Prettier config ([.prettierrc](client/.prettierrc)) — **tabs**, single
  quotes, **no trailing commas**, `printWidth: 100`. ESLint
  ([.eslintrc.cjs](client/.eslintrc.cjs)) extends `eslint:recommended`,
  `@typescript-eslint/recommended`, and the React + React-Hooks plugins, with `prettier`.
  **Lint must pass with zero warnings** (`--max-warnings 0`). Run `npm run format` /
  `npm run lint:fix` before committing.
- **TypeScript:** `strict` mode, `checkJs` on, React JSX transform. No new `any` — the few
  existing ones are explicitly eslint-disabled inline; follow that pattern only when truly
  necessary.
- **Rust:** standard `rustfmt`; keep `cargo clippy` clean (it's a CI gate). Match the
  existing wrapper/`From`-impl and pure-seam style.

### Naming & idioms
- Match the surrounding code's idioms, comment density, and naming. New code should read
  like the file it lives in.
- Components are `PascalCase.tsx` with a sibling `Component.css`; hooks are `use*.ts`; pure
  logic is `camelCase.ts` with a co-located `*.test.ts`.
- Rust enums + `match` are the norm for event handling; prefer exhaustive matches.
- Backend uses `println!`/`eprintln!` freely for trace output; frontend uses `console.*`
  (gate noisy logs behind a debug check).

### Commits
- **Conventional Commits** — observed history: `feat:`, `fix:`, `chore:`. Keep using them.
- **Do not commit or push unless the user asks.** When you do commit, work on a branch if
  on `main`.

---

## 8. Agentic coding workflow

1. **Explore before editing.** Read the relevant files (and this doc's data-flow diagrams)
   before changing anything. Trace a change end-to-end across the Rust↔TS bridge, and know
   whether it touches the studio role, the overlay role, or both.
2. **Plan for non-trivial work.** State the approach, the files involved, and the test you
   will add first.
3. **TDD.** Write/extend the failing test, then implement (§4). Favour putting new logic in
   `lib/core/` or a Rust pure seam so it's testable without a window.
4. **Keep both sides of the bridge in sync.** Any change to an emitted/returned Rust struct
   must be reflected in the matching TS types ([stores.ts](client/src/stores/stores.ts) for
   sessions, [core/telemetry.ts](client/src/lib/core/telemetry.ts) for sensors), and vice
   versa (§5). Event-name strings (`"session_update"`, `"session_delete"`, `"telemetry"`,
   `"layout_changed"`, `"themes_changed"`, `"toggle_edit"`, `"open_studio"`) and command
   names (`"get_initial_sessions"`, `"load_layout"`, `"save_layout"`, `"list_themes"`,
   `"ha_call_service"`, …) must match on both ends.
5. **Make small, focused diffs.** Don't reformat untouched code. Don't add dependencies
   without a clear need — this is a deliberately lean app.
6. **Verify.** Run the gates in §3. If you can't run the Rust side (non-Windows), say so
   explicitly rather than claiming it passed; the client gates still run anywhere.
7. **Report honestly.** If a test fails, show the output. If a step was skipped (e.g.
   Windows-only build), state it. Don't mark something verified that you didn't verify.
8. **Respect generated/vendored paths** (§2) and the Windows-only build constraint (§3).

### Gotchas checklist
- [ ] Built the frontend before running `cargo build/test/clippy`?
- [ ] Updated TS types when a Rust serde struct changed (and event/command name strings)?
- [ ] New logic extracted into a pure `lib/core/` module (or Rust seam) with a test, rather than buried in a `.tsx` file?
- [ ] Presentational meters still prop-driven (no store/Tauri/`useSensor` access)?
- [ ] New widget type registered in `registry.tsx` and given `widget.ts` meta?
- [ ] `npm run lint` clean (zero warnings) and `cargo clippy` clean?
- [ ] Didn't commit/push unless asked?
