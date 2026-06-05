# Application landing zones (FancyZones-style window snapping)

> Status: **all three layers built; zones are a WIDGET TYPE** (not a separate top-level concept —
> design decision locked with the user). A landing zone is a `zone` widget in `widgets.json`, drawn
> and sized on the studio canvas like any widget, with its match rule edited in the Inspector. It
> renders nothing on the live overlay (an outline + tag only while editing); the overlay's
> [`DragSnapLayer`](../client/src/lib/widgets/DragSnapLayer.tsx) reads the zone widgets to highlight
> and snap. This reuses the editor, Inspector, persistence, sacks, and multi-monitor machinery, and
> fixes a latent gap of the old model (a monitor with only zones got no overlay).
>
> The **snap engine is runtime-verified**: an `#[ignore]`d live smoke test
> (`windowmgr::manual_smoke::snap_moves_a_real_window`, `cargo test -p widgetsack -- --ignored --nocapture`)
> spawns a throwaway Notepad, snaps it, and asserts the real geometry landed on the target. It caught
> and fixed a real bug — measuring `GetWindowRect` vs `DWMWA_EXTENDED_FRAME_BOUNDS` mid open/restore
> animation reads an inconsistent pair and yields a bogus ~100px border — fixed with a restore-settle
> wait + a `MAX_DWM_BORDER` (24px) clamp on both sides. **Not runtime-verified**: the live-drag
> interaction (the `SetWinEventHook` hook + highlight + restore-on-drag-out) needs a manual
> `cargo tauri dev` drag — it can't be unit-tested.

## What it is

Define rect **zones** on the desktop, then:

- **(A) Author zones** — add a **Zone** widget from the palette and drag/size it on the canvas like
  any widget; its match rule (exe/class/title) is edited in the Inspector. Persisted in `widgets.json`.
- **(B) Drag → snap** — hold Shift and drag *any external app window* over a zone; on drop it
  resizes to fill it. Dragging a snapped window back out restores its previous size under the cursor.
- **(C) Auto-arrange** — tray ▸ **Arrange windows** matches running windows to zone rules and snaps
  them in place ("position windows into the space if found").

This is widgetsack doing what PowerToys **FancyZones** does, reusing the overlay/Win32/rect-editor
infrastructure the app already has. FancyZones (MIT) is the reference implementation throughout.

## Locked decisions

1. **Highlight surface — reuse the existing overlay.** Our per-monitor overlay is already
   `transparent + alwaysOnTop (WS_EX_TOPMOST) + click-through`. A window the user drags is almost
   always *non*-topmost, and a non-topmost window can never paint above a topmost one — so the
   overlay renders above the dragged window **by default**, and the FancyZones dragged-window
   50%-alpha (`WS_EX_LAYERED`) trick is **not** needed. Two caveats kept us from "unconditional":
   a blanket-topmost overlay also covers *other* legitimately-topmost windows during a highlight,
   and relative z-insertion (placing the overlay directly above the dragged HWND) needs a thin
   **native** `SetWindowPos(overlay, draggedHwnd, …, SWP_NOACTIVATE)` seam, since Tauri only exposes
   blanket always-on-top. So: reuse the overlay; add the native z-insert seam only if needed.
2. **Arming — held modifier.** Live snapping is armed by holding a modifier during the drag (the
   FancyZones default feel), not always-on. Avoids hijacking every window drag and clashing with
   the OS Snap Layouts.
3. **Drag detection — `SetWinEventHook`.** Use `EVENT_SYSTEM_MOVESIZESTART/END` (+ a transient
   `EVENT_OBJECT_LOCATIONCHANGE` for live preview), not polling. Precise start/stop + the dragged
   HWND, low overhead. Needs its own message-pump thread (see below). A `LOCATIONCHANGE`+cursor
   fallback covers custom-titlebar / Java / some Electron apps that don't emit MOVESIZE events.
4. **Scope — per-monitor, notice-only for elevated, v1.** Zones key by **monitor** (not virtual
   desktop). Elevated/admin target windows can't be moved by a non-elevated app (UIPI) — we **skip
   + notify**, no elevated helper in v1.

## Architecture (concentric rings)

### Pure domain — `client/src/lib/core/` (tested on the client CI gate, any OS)

- [`snapMath.ts`](../client/src/lib/core/snapMath.ts) — `frameMargins`, `computeSnapRect`. The
  DWM invisible-border compensation (expand the target by the L/R/B margins, never the top) +
  optional work-area clamp. **Rust twin:** `windowmgr::adjust_for_frame_bounds`.
- [`zones.ts`](../client/src/lib/core/zones.ts) — slim interchange `Zone`/`ZoneMatch` types +
  `hitTestZone` (origin-inclusive/far-edge-exclusive, same convention as `ScreenRect::contains`).
  Zones are NOT a stored schema here — they're derived from `zone` widgets.
- [`dragSnap.ts`](../client/src/lib/core/dragSnap.ts) — `armedZone` (Shift-gated hit-test) +
  `localToPhysical` (a zone widget's local logical-px rect → global physical px).
- [`arrange.ts`](../client/src/lib/core/arrange.ts) — `zoneRules` + `planArrangement` (windows ×
  zones → snap plan) over `matchWindowToZone`.
- [`windowMatch.ts`](../client/src/lib/core/windowMatch.ts) — `WindowDescriptor` (mirrors the Rust
  struct), `ZoneRule`, `exeBasename`, `globMatch`, `matchWindowToZone` (exe basename primary →
  class/title glob refiners → priority → earliest; fieldless rule matches nothing).

### The `zone` widget (React)

- Meta in [`widget.ts`](../client/src/lib/core/widget.ts) (`type:'zone'`, `binds:'none'`, config
  `matchExe`/`matchClass`/`matchTitle` as `ConfigField`s the Inspector auto-renders) +
  [`meters/Zone.tsx`](../client/src/lib/widgets/meters/Zone.tsx), registered in `registry.tsx`. The
  `Zone` meter renders an outline + tag **only when `editMode`** (studio, or an overlay toggled into
  edit) and `null` otherwise — invisible on the passive overlay. `WidgetHost` passes `editMode` to
  the meter. The overlay [`DragSnapLayer`](../client/src/lib/widgets/DragSnapLayer.tsx) loads
  `widgets.json`, reads the floating `zone` widgets for its monitor, converts each `unit.rect` to
  physical px (`localToPhysical`), then highlights/snaps (drag) and auto-arranges (`arrange_zones`).

### Win32 edge — [`widgetsack/src/windowmgr.rs`](../widgetsack/src/windowmgr.rs)

Anti-corruption layer (peer to `clickthrough.rs` / `sensors.rs` / `listener.rs`): all `unsafe` and
`windows::Win32::*` here, returning widgetsack-owned types (`ScreenRect`, `WindowDescriptor`). Pure
seams `is_arrangeable` / `adjust_for_frame_bounds` / `exe_basename` are `#[cfg(test)]`-tested; the
Win32 functions (`list_arrangeable`, `snap`, `exe_path`) are `#[cfg(windows)]` with non-Windows
stubs. Placement: `SW_RESTORE` a maximized/minimized window → `DWMWA_EXTENDED_FRAME_BOUNDS`
compensation → `SetWindowPos(SWP_NOACTIVATE | SWP_NOZORDER)`; an elevated/UIPI-blocked target
returns `Err` (surfaced for an in-UI notice), never a panic.

### Bridge

- **Commands** (registered in `main.rs` `generate_handler!`; no capability JSON — app commands are
  auto-allowed): `windowmgr::list_windows` (**studio-only**), `windowmgr::snap_window` (studio **or
  overlay** via `require_app_window` — the overlay performs the drag-snap), `windowmgr::pointer_probe`
  (cursor + Shift, read-only). Zones persist in `widgets.json` via the existing
  `load_layout`/`save_layout`/`watch_layout` — **no zone-specific commands**. Frontend adapters in
  [`overlay.ts`](../client/src/lib/overlay.ts): `listWindows`, `snapWindow`, `pointerProbe`, `loadLayoutRaw`.
- **Events**: `win_drag_start` / `win_drag_end` (emitted by the `SetWinEventHook` thread),
  `arrange_zones` (tray ▸ Arrange windows), and `layout_changed` (zone reload, reused from the layout).
- **Cargo** (`widgetsack/Cargo.toml`, windows-rs 0.61): `Win32_UI_WindowsAndMessaging`,
  `Win32_UI_Accessibility` (`SetWinEventHook`), `Win32_System_Threading`, `Win32_Graphics_Dwm`. No new
  crates. (`Win32_UI_HiDpi` only if per-thread DPI awareness is added later.)

## Phased plan

| Phase | Build | Tests | Retires |
|---|---|---|---|
| **Snap engine** *(runtime-verified)* | placement engine + window enumeration + bridge (`list_windows`/`snap_window`) | `snapMath.test.ts` ✓ ; Rust seam tests ✓ ; `snap_moves_a_real_window` live smoke ✓ | DWM-border / restore / placement correctness; "can we move a foreign window at all" |
| **Zone widget + drag-snap** *(built; live drag needs a manual pass)* | `zone` widget meta + editor-only `Zone` meter; `DragSnapLayer` reads zone widgets, highlights the Shift-armed zone, snaps on drop; `run_drag_watcher` (`SetWinEventHook` + pump thread) + `pointer_probe`; **restore-on-drag-out** (`SNAPPED` map + `restore_top_left` on MOVESIZESTART) | `dragSnap.test.ts` (armedZone/localToPhysical) ✓ ; `meters/Zone.test.tsx` editor-only ✓ ; `DragSnapLayer.test.tsx` wiring ✓ ; `restore_top_left` seam ✓ | hook/pump lifetime; z-order (overlay already topmost → no extra work); modifier-arm. **Not runtime-verified**: hook + highlight + restore need a manual `cargo tauri dev` drag. |
| **Auto-arrange** *(done)* | `core/arrange.ts` (`zoneRules`/`planArrangement`) over `matchWindowToZone`; tray ▸ **Arrange windows** → `arrange_zones` → each overlay snaps its monitor's matching windows | `arrange.test.ts` ✓ ; `windowMatch.test.ts` Chromium/UWP disambiguation ✓ ; `DragSnapLayer.test.tsx` arrange wiring ✓ | cloaked/UWP false-positives; multi-window-per-app ambiguity |

## Risk register (carryover)

| Risk | Mitigation |
|---|---|
| Elevated/admin windows (UIPI) | `snap` returns `Err` (`ERROR_ACCESS_DENIED`); skip + in-UI notice; no elevated helper in v1 |
| Overlay covers other topmost windows during highlight | native `SetWindowPos(overlay, draggedHwnd, …, SWP_NOACTIVATE)` z-insert seam if blanket-topmost is unacceptable |
| Activating overlay/dragged window kills the OS move/size loop | every `SetWindowPos` uses `SWP_NOACTIVATE`; overlay never takes focus |
| `MOVESIZE` events missed (custom-titlebar/Java/Electron) | `EVENT_OBJECT_LOCATIONCHANGE` + cursor fallback |
| DWM border / maximized / DPI | frame-bounds delta (L/R/B only); `SW_RESTORE` first; physical px; per-monitor DPI thread if cross-DPI snapping misbehaves |
| Low-level/WinEvent hook AV/EDR + `LOCATIONCHANGE` flood | out-of-context WinEvent over `WH_MOUSE_LL`; install only when zones exist; gate redraws on zone-change |
| Cloaked/UWP windows; multi-window-per-app | `is_arrangeable` skips `DWMWA_CLOAKED`; exe primary + title disambiguation; explicit N-match policy |

## Reference

PowerToys FancyZones (`src/modules/fancyzones/FancyZonesLib/`): `WindowUtils.cpp` (snap math +
frame-bounds compensation + restore loop), `FancyZones.cpp` (WinEvent dispatch via a hidden tool
window), `WorkArea.cpp`/`ZonesOverlay.cpp` (topmost highlight + redraw gating),
`AppZoneHistory.cpp` (per-app rules). OBS `window-helpers.c` `window_rating` informs the
exe→class→title match scoring.
