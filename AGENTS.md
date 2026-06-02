# AGENTS.md

Guidance for AI agents and humans working in this repository. Read this before making
changes. The practices below (TDD, concentric architecture, atomic design, agentic
workflow) are mapped onto the **actual** structure of this project, not described in the
abstract.

---

## 1. What this project is

`nowplaying-widget` (crate name `np`) is a small, themable desktop widget for **Windows**
that shows the currently-playing media track. It reads Windows' Global System Media
Transport Controls (GSMTC) and renders the active session in a transparent,
draggable/resizable window.

- **Backend** — Rust crate in [np/](np/), Tauri v2, edition 2024 (Rust 1.90+).
  Media comes from the `win-gsmtc` crate (Windows-only).
- **Frontend** — SvelteKit (Svelte 3) + TypeScript in [client/](client/), built with Vite,
  tested with Vitest. Ships as a static SPA (`adapter-static`, `prerender = true`,
  `ssr = false`).
- **Bridge** — Tauri `invoke` (commands) + `emit`/`listen` (events) connect the two.

### Data flow (memorize this)

```
Windows GSMTC
   │  ManagerEvent / SessionUpdateEvent  (external gsmtc types)
   ▼
listener.rs ── wraps into ──▶ ManagerEventWrapper / SessionUpdateEventWrapper / NpSessionEvent
   │  mpsc channel
   ▼
state.rs::updater(sessions, event) ──▶ (event_type, Option<SessionRecord>)   ← pure reducer
   │
   ▼
event.rs::emit_to_bridge ── tauri emit("session_update" | "session_delete", record) ──▶ webview
   │
   ▼
NowPlaying.svelte  ── tauriEvent.listen ──▶ stores.ts::handleUpdate/handleDelete
   │                                              │
   │  invoke("get_initial_sessions")              ▼
   └──────────────────────────────────────▶  mediaStore (writable, localStorage-backed)
                                                  │  subscribe
                                                  ▼
                              sortSessionsByPriority ──▶ DefaultNowPlaying.svelte (presentational)
```

---

## 2. Repository layout

```
np/                         Rust / Tauri backend (the workspace member)
  src/
    main.rs                 Entry point, AppState, wires channels + Tauri builder
    listener.rs             GSMTC adapter: listens, wraps external types (From impls)
    event.rs                NpSessionEvent model + emit_to_bridge (Tauri adapter)
    state.rs                SessionRecord + updater() — the pure state reducer
    command.rs              #[tauri::command] handlers (get_initial_sessions)
  tauri.conf.json           Window config, build hooks, bundle settings
  Cargo.toml
client/                     SvelteKit frontend
  src/
    routes/                 SvelteKit pages (+page.svelte, +layout.svelte) — thin
    lib/
      components/NowPlaying/
        NowPlaying.svelte           Stateful container (organism)
        priority.ts + .test.ts      Pure sort logic (domain) + tests
        image.ts                    Byte-array → object URL helper
        themes/
          DefaultNowPlaying.svelte  Presentational, props-driven (molecule)
          ThemeInjector.svelte      Injects user CSS/HTML
          *.test.ts                 Component tests (Testing Library)
      utils/monitor.ts        Tauri window/monitor adapter helpers
    stores/stores.ts          mediaStore + TS types mirroring Rust + handle* reducers
Cargo.toml                  Workspace root
.github/workflows/          CI: test.yml (build+test+clippy+client), build.yml (release)
```

Generated / vendored — **do not hand-edit**: `client/node_modules/`, `target/`,
`np/gen/`, `np/capabilities/migrated.json`, `client/.svelte-kit/`, `Cargo.lock`,
`client/package-lock.json` (only via the package manager).

---

## 3. Commands

> **Build platform: Windows only.** `win-gsmtc` is `cfg`-gated to Windows; a full Tauri
> build/run requires Windows + [Tauri prerequisites](https://tauri.app/start/prerequisites/).
> The Svelte client and its tests run on any OS.

Shell here is **PowerShell** — chain with `;` or `&&` (pwsh 7 supports both). Avoid `cd`
inside compound commands when using the agent Bash tool (it can trigger a prompt); prefer
the working-directory-aware tools.

### Frontend (`client/`)
| Task | Command |
|------|---------|
| Install deps | `npm ci` (CI) / `npm i` (local) |
| Dev server (browser only) | `npm run dev` |
| Type-check | `npm run check` |
| Lint (must pass with **0 warnings**) | `npm run lint` |
| Auto-fix lint + format | `npm run lint:fix` |
| Format only | `npm run format` |
| Unit/component tests (Vitest) | `npm run test:unit` |
| Production build → `client/build` | `npm run build` |

### Backend (repo root)
| Task | Command |
|------|---------|
| Build | `cargo build` |
| Test | `cargo test` |
| Lint | `cargo clippy` |
| Run full app (dev) | `cargo tauri dev` |
| Release build → `target/release/np.exe` | `cargo tauri build` |

> ⚠️ **Build order gotcha:** Tauri embeds `client/build` (`frontendDist`), so the frontend
> must be built **before** any `cargo build` / `cargo test` / `cargo clippy`. CI does
> `cd client && npm ci && npm run build` first for exactly this reason. `cargo tauri dev`
> handles this for you via `beforeDevCommand`.

### Before you call a change "done"
Run the same gates CI runs ([.github/workflows/test.yml](.github/workflows/test.yml)):
- Client: `npm run check && npm run lint && npm run test:unit && npm run build`
- Backend (Windows, after building the client): `cargo test && cargo clippy`

---

## 4. Test-Driven Development (TDD)

This codebase already follows a test-first-friendly shape; keep it that way.

**The loop:** Red → Green → Refactor. Write a failing test that states the intent, make it
pass with the simplest code, then refactor under green.

**What this looks like here:**
- **Push logic into pure functions and test those.** The best examples are
  [priority.ts](client/src/lib/components/NowPlaying/priority.ts) (sorting) tested in
  [priority.test.ts](client/src/lib/components/NowPlaying/priority.test.ts), and
  [state.rs](np/src/state.rs)'s `updater` (a pure `(state, event) -> (kind, delta)`
  reducer). Pure functions are trivially testable without Tauri, GSMTC, or a window.
- **Co-locate tests** next to source as `*.test.ts` (Vitest: `describe`/`it`/`expect`).
  Rust unit tests go in a `#[cfg(test)] mod tests` block in the same file.
- **Component tests** use `@testing-library/svelte` with `happy-dom` (see
  [DefaultNowPlaying.test.ts](client/src/lib/components/NowPlaying/themes/DefaultNowPlaying.test.ts)).
  Test observable behavior (rendered text / DOM), not internals.
- When fixing a bug, **first write a test that reproduces it**, then fix.
- Prefer adding a focused test over a manual GSMTC repro — most logic (priority, state
  transitions, serialization shape) can be exercised without real media playing.

`state.rs::updater` currently has no Rust tests — it is the prime candidate for new ones
if you touch it.

---

## 5. Concentric (clean / onion) architecture

Think in concentric rings. **The dependency rule: source dependencies point inward.**
Inner rings know nothing about outer rings — the domain must not import frameworks.

```
        ┌─────────────────────────────────────────────┐
        │  Infrastructure / Adapters (outermost)        │
        │  • listener.rs (gsmtc), emit_to_bridge        │
        │  • From<gsmtc::*> wrapper impls               │
        │  • monitor.ts (Tauri window API)              │
        │  • tauri invoke/listen, localStorage          │
        │   ┌───────────────────────────────────────┐   │
        │   │  Application / Orchestration           │   │
        │   │  • main.rs (wires channels + builder)  │   │
        │   │  • command.rs (#[tauri::command])      │   │
        │   │  • stores.ts handle*() + mediaStore    │   │
        │   │  • NowPlaying.svelte (container)       │   │
        │   │   ┌───────────────────────────────┐    │   │
        │   │   │  Domain / Core (innermost)     │    │   │
        │   │   │  • SessionRecord, updater()    │    │   │
        │   │   │  • NpSessionEvent model        │    │   │
        │   │   │  • priority.ts sort logic      │    │   │
        │   │   │  • TS types in stores.ts       │    │   │
        │   │   └───────────────────────────────┘    │   │
        │   └───────────────────────────────────────┘   │
        └─────────────────────────────────────────────┘
```

**Rules for this repo:**
- **Keep external types at the edge.** The `ManagerEventWrapper` / `SessionUpdateEventWrapper`
  / `ImageWrapper` types with their `From<gsmtc::*>` impls in
  [listener.rs](np/src/listener.rs) are an *anti-corruption layer* — they stop the
  `gsmtc` dependency from leaking inward. Preserve this: domain code (`updater`, the event
  model) deals in `np`'s own types, never raw `gsmtc::*`.
- **Domain stays pure.** `state::updater` and `priority::sortSessionsByPriority` take data
  in and return data out — no I/O, no Tauri, no DOM. New business logic belongs here and
  should be unit-tested directly.
- **Side effects live in adapters.** Tauri `emit`/`invoke`/`listen`, `localStorage`
  persistence (in `stores.ts`), and window/monitor manipulation (`monitor.ts`) are all
  outer-ring concerns. Don't sprinkle them into domain functions.
- **Svelte mirror:** presentational components are inner (pure, props-only); the container
  and stores are the orchestration ring; Tauri API calls are the outer ring. See §6.
- **Type-mirroring is a domain contract.** The TS types in
  [stores.ts](client/src/stores/stores.ts) mirror the serde-serialized Rust structs in
  [state.rs](np/src/state.rs) / [listener.rs](np/src/listener.rs). When you change a struct
  that crosses the bridge, **update both sides in the same change.**

---

## 6. Atomic design (frontend components)

Organize Svelte components by composition level, and **separate container (stateful) from
presentational (pure) components**. Current code already models the key split:

| Atomic level | In this repo | Rule |
|--------------|--------------|------|
| **Pages** | `routes/+page.svelte`, `+layout.svelte` | Thin. Just mount the top organism; no business logic. |
| **Organisms** (containers) | `NowPlaying.svelte` | Subscribe to `mediaStore`, wire Tauri events, own state, pass plain props down. |
| **Molecules** (presentational) | `themes/DefaultNowPlaying.svelte`, `ThemeInjector.svelte` | Driven entirely by `export let` props; no store access, no Tauri calls. |
| **Atoms** | *(not yet formalized)* | Buttons, status badges, etc. Extract when reused. |

**Guidelines:**
- **Presentational components stay pure and stateless.** `DefaultNowPlaying.svelte` takes a
  `session` prop and renders it — it does not read the store or call Tauri. Keep new theme
  components this way: a theme is a swappable presentational layer over the same
  `SessionRecord`.
- **Containers own the wiring.** Subscriptions, `invoke`, `listen`, monitor controls, and
  `localStorage` belong in the container/organism (`NowPlaying.svelte`) or the store, not
  in leaf components.
- **Adding a new theme** = add a presentational component under
  `lib/components/NowPlaying/themes/` that consumes `SessionRecord` via props, plus a
  co-located test. Don't reach into the store from it.
- **Extract an atom** as soon as a small UI piece (button, label, status message) is reused
  or worth testing in isolation.

---

## 7. Conventions

### Formatting & linting
- **Frontend:** Prettier config ([.prettierrc](client/.prettierrc)) — **tabs**, single
  quotes, **no trailing commas**, `printWidth: 100`. ESLint extends `eslint:recommended`,
  `@typescript-eslint/recommended`, `svelte/recommended`, `prettier`. **Lint must pass with
  zero warnings** (`--max-warnings 0`). Run `npm run format` / `npm run lint:fix` before
  committing.
- **TypeScript:** `strict` mode, `checkJs` on. No new `any` — the few existing ones are
  explicitly eslint-disabled inline; follow that pattern only when truly necessary.
- **Rust:** standard `rustfmt`; keep `cargo clippy` clean (it's a CI gate). Match the
  existing wrapper/`From`-impl style.

### Naming & idioms
- Match the surrounding code's idioms, comment density, and naming. New code should read
  like the file it lives in.
- Rust enums + `match` are the norm for event handling; prefer exhaustive matches.
- Frontend logging goes through the gated `debug(...)` helper in `NowPlaying.svelte` (only
  logs when `debugMode`); backend uses `println!`/`eprintln!` freely for trace output.

### Commits
- **Conventional Commits** — observed history: `feat:`, `fix:`, `chore:`. Keep using them.
- **Do not commit or push unless the user asks.** When you do commit, work on a branch if
  on `main`.

---

## 8. Agentic coding workflow

1. **Explore before editing.** Read the relevant files (and this doc's data-flow diagram)
   before changing anything. Trace a change end-to-end across the Rust↔TS bridge.
2. **Plan for non-trivial work.** State the approach, the files involved, and the test you
   will add first.
3. **TDD.** Write/extend the failing test, then implement (§4).
4. **Keep both sides of the bridge in sync.** Any change to an emitted/returned Rust struct
   must be reflected in [stores.ts](client/src/stores/stores.ts) types, and vice versa
   (§5). Event name strings (`"session_update"`, `"session_delete"`, command names like
   `"get_initial_sessions"`) must match on both ends.
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
- [ ] New logic extracted into a pure function with a test, rather than buried in a `.svelte` file?
- [ ] Presentational components still prop-driven (no store/Tauri access)?
- [ ] `npm run lint` clean (zero warnings) and `cargo clippy` clean?
- [ ] Didn't commit/push unless asked?
