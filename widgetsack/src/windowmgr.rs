//! Foreign-window manager: enumerate other applications' top-level windows and snap them into
//! "landing zones" (FancyZones-style). This is the Win32 anti-corruption edge for the feature —
//! all `unsafe` and `windows::Win32::*` calls live here, mirroring `listener.rs` (gsmtc) and
//! `sensors.rs` (sysinfo/nvml): a thin I/O outer layer wrapping pure, unit-tested seams.
//!
//! What it can and cannot do (verified): a normal-integrity process CAN move/resize another
//! normal-integrity window via `SetWindowPos`, but CANNOT touch a window owned by a HIGHER-integrity
//! (elevated/admin) process — UIPI blocks it and `SetWindowPos` returns `ERROR_ACCESS_DENIED`. We
//! surface that as an `Err` and never panic. Placement compensates for the invisible DWM resize
//! border via `DWMWA_EXTENDED_FRAME_BOUNDS` and restores a maximized/minimized window first.
//!
//! Scope here is MVP1 (enumerate + snap a specific window to a rect). Live drag-to-zone (a
//! `SetWinEventHook` message-pump thread) and the studio zone editor build on these seams later.

use serde::Serialize;

use crate::clickthrough::ScreenRect;

/// A foreign top-level window. Mirrors the TS `WindowDescriptor` (client/src/lib/core/windowMatch.ts)
/// 1:1 across the bridge (AGENTS.md §5). `hwnd` is the raw handle as an i64 — opaque to the frontend,
/// passed back only to act on the window. It crosses to JS as a number (exact below 2^53, which all
/// real Win64 handle-table values are).
#[derive(Clone, Debug, Serialize)]
// REQUIRED for the TS bridge: the camelCase rename makes `class_name` serialize as `className`, which
// the mirror type `WindowDescriptor` in client/src/lib/core/windowMatch.ts expects. Dropping it would
// silently send `class_name`, leaving `win.className` undefined and breaking appOpen class matching.
#[serde(rename_all = "camelCase")]
pub struct WindowDescriptor {
    pub hwnd: i64,
    pub exe: String,
    pub class_name: String,
    pub title: String,
    pub rect: ScreenRect,
}

// ---- pure seams (cross-platform, unit-tested; the Win32 layer below feeds them real data) ----

/// The `EnumWindows` keep/skip predicate: a window is "arrangeable" only if it is a real, visible,
/// non-tool, non-cloaked, titled, top-level (unowned, non-child) window that we don't own. Pure so
/// it is table-tested without a desktop. (`cloaked` covers DWM-cloaked windows — other virtual
/// desktops / suspended UWP; `is_own` excludes widgetsack's own overlays/studio by PID; `owned`
/// excludes splash/installer/dialog popups that have an owner window or the WS_CHILD style.)
#[allow(clippy::too_many_arguments)]
pub fn is_arrangeable(
    visible: bool,
    toolwindow: bool,
    cloaked: bool,
    has_title: bool,
    width: i32,
    height: i32,
    is_own: bool,
    owned: bool,
) -> bool {
    visible && !toolwindow && !cloaked && has_title && width > 0 && height > 0 && !is_own && !owned
}

/// The largest plausible DWM invisible border (px). A real border is ~7-8px (≤ ~16 even at 200%
/// DPI); a larger computed delta means an inconsistent window-rect/frame-bounds read (e.g. a window
/// measured mid open/restore animation) — we treat it as bogus and skip compensation for that edge
/// rather than mis-snapping the window by ~100px (caught by the snap_moves_a_real_window smoke test).
const MAX_DWM_BORDER: f64 = 24.0;

/// The invisible DWM-border margins (left, right, bottom) — `window` (GetWindowRect) minus `frame`
/// (DWMWA_EXTENDED_FRAME_BOUNDS). Top is intentionally never compensated (it has ~1px and no
/// invisible border; subtracting a top margin would misplace the window). Out-of-range deltas
/// (negative — classic theme / DWM off / no frame; or implausibly large — a bad read) clamp to 0.
/// Twin of `frameMargins` in core/snapMath.ts.
fn frame_margins(window: ScreenRect, frame: Option<ScreenRect>) -> (f64, f64, f64) {
    let clamp = |m: f64| if (0.0..=MAX_DWM_BORDER).contains(&m) { m } else { 0.0 };
    match frame {
        None => (0.0, 0.0, 0.0),
        Some(f) => {
            let left = clamp(f.x - window.x);
            let right = clamp((window.x + window.w) - (f.x + f.w));
            let bottom = clamp((window.y + window.h) - (f.y + f.h));
            (left, right, bottom)
        }
    }
}

/// The rect to feed `SetWindowPos` so the window's VISIBLE frame fills `zone`, expanding the target
/// by the invisible-border margins (L/R/B only). Twin of `computeSnapRect` in core/snapMath.ts so
/// both sides of the bridge agree. Physical px.
pub fn adjust_for_frame_bounds(
    zone: ScreenRect,
    window: ScreenRect,
    frame: Option<ScreenRect>,
) -> ScreenRect {
    let (left, right, bottom) = frame_margins(window, frame);
    ScreenRect {
        x: (zone.x - left).round(),
        y: zone.y.round(), // top margin is always 0 — never shift the top up
        w: (zone.w + left + right).round(),
        h: (zone.h + bottom).round(),
    }
}

/// Lowercased final path segment of an exe path; tolerates `\` and `/` and a bare basename.
/// Twin of `exeBasename` in core/windowMatch.ts.
pub fn exe_basename(path: &str) -> String {
    let cut = path.rfind(['\\', '/']).map(|i| i + 1).unwrap_or(0);
    path[cut..].to_ascii_lowercase()
}

/// New top-left for a window being dragged OUT of a zone: as it resizes from its snapped size
/// (`snapped`) back to `restore_w`×`restore_h`, keep the cursor at the same PROPORTIONAL point on the
/// window so the grabbed title bar stays under the cursor. Pure seam (the restore reposition math).
pub fn restore_top_left(
    snapped: ScreenRect,
    cursor: (f64, f64),
    restore_w: f64,
    restore_h: f64,
) -> (f64, f64) {
    let rel_x = (cursor.0 - snapped.x) / snapped.w.max(1.0);
    let rel_y = (cursor.1 - snapped.y) / snapped.h.max(1.0);
    (cursor.0 - rel_x * restore_w, cursor.1 - rel_y * restore_h)
}

// ---- Tauri command surface (cross-platform; delegates to the cfg-split helpers below) ----

/// Foreign-window manipulation is powerful and has NO Tauri capability/sandbox gate (the moves are
/// raw Win32), so the access control is restricting these commands to our own windows — the same
/// label-guard shape `ha.rs` / `mqtt.rs` use. Enumeration (`list_windows`) and actuation
/// (`snap_window`) are both reachable from the studio AND the overlays: the overlay runs the live
/// drag-to-zone snap and the conditional-container "is app X open" poll.
///
/// The studio OR an overlay (main / overlay-N) — the windows allowed to manage foreign windows.
fn require_app_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    let label = window.label();
    if label == "studio" || label == "main" || label.starts_with("overlay-") {
        Ok(())
    } else {
        Err("window management is not allowed from this window".to_string())
    }
}

/// List the arrangeable top-level windows. Used by the studio's window picker AND by the overlay's
/// conditional-container poller ("is app X open"), so it's allowed from any app window (not just the
/// studio) — same trust boundary as `snap_window`. It only enumerates window metadata we already
/// surface in the studio; no new capability is exposed to web content.
#[tauri::command]
pub fn list_windows(window: tauri::WebviewWindow) -> Result<Vec<WindowDescriptor>, String> {
    require_app_window(&window)?;
    list_arrangeable()
}

/// Snap the window `hwnd` so its visible frame fills `rect` (physical px). Restores a maximized /
/// minimized window first and compensates the DWM border. Returns an error (rather than panicking)
/// when the target is an elevated window UIPI won't let us touch. Studio-only.
#[tauri::command]
pub fn snap_window(
    window: tauri::WebviewWindow,
    hwnd: i64,
    rect: ScreenRect,
) -> Result<(), String> {
    require_app_window(&window)?;
    snap(hwnd, rect)
}

// ---- live drag detection (MVP2): a SetWinEventHook message-pump thread + a pointer probe ----

/// Pointer state for the drag-to-zone highlight: cursor in PHYSICAL px + whether Shift is held (the
/// modifier that ARMS snapping — snapping only engages while Shift is down). The overlay polls this
/// between `win_drag_start` and `win_drag_end`.
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointerState {
    pub x: f64,
    pub y: f64,
    pub shift: bool,
}

/// Cursor position (physical px) + Shift state. Not studio-gated — it is read-only and the overlay
/// (not the studio) polls it during a drag.
#[tauri::command]
pub fn pointer_probe(app: tauri::AppHandle) -> PointerState {
    let (x, y) = app.cursor_position().map(|p| (p.x, p.y)).unwrap_or((0.0, 0.0));
    PointerState { x, y, shift: shift_held() }
}

/// Payload for `win_drag_start` / `win_drag_end`.
#[cfg(target_os = "windows")]
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DragEvent {
    hwnd: i64,
}

#[cfg(target_os = "windows")]
fn shift_held() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_SHIFT};
    (unsafe { GetAsyncKeyState(VK_SHIFT.0 as i32) } as u16 & 0x8000) != 0
}

#[cfg(not(target_os = "windows"))]
fn shift_held() -> bool {
    false
}

/// Spawn the live-drag watcher: a dedicated thread that installs a `SetWinEventHook` for the window
/// move/size modal loop and runs a Windows MESSAGE PUMP (required for WINEVENT_OUTOFCONTEXT delivery
/// — the clickthrough watcher is a sleep loop with no pump, so this MUST be its own thread). Emits
/// `win_drag_start` / `win_drag_end` (with the dragged HWND); the overlay polls `pointer_probe`
/// between them to highlight the hovered zone and snap on release. No-op off Windows. NOTE: only the
/// standard OS move/size loop fires these — custom-titlebar/Java/Electron apps need an
/// EVENT_OBJECT_LOCATIONCHANGE fallback (deferred).
#[cfg(target_os = "windows")]
pub fn run_drag_watcher(app: tauri::AppHandle) {
    if DRAG_APP.set(app).is_err() {
        return; // already running
    }
    std::thread::spawn(|| unsafe {
        use windows::Win32::UI::Accessibility::SetWinEventHook;
        use windows::Win32::UI::WindowsAndMessaging::{
            DispatchMessageW, GetMessageW, EVENT_SYSTEM_MOVESIZEEND, EVENT_SYSTEM_MOVESIZESTART, MSG,
            WINEVENT_OUTOFCONTEXT,
        };
        let hook = SetWinEventHook(
            EVENT_SYSTEM_MOVESIZESTART,
            EVENT_SYSTEM_MOVESIZEEND,
            None,
            Some(win_event_proc),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        );
        if hook.is_invalid() {
            return;
        }
        // OUTOFCONTEXT callbacks are delivered while this thread retrieves messages.
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).0 > 0 {
            let _ = DispatchMessageW(&msg);
        }
    });
}

#[cfg(not(target_os = "windows"))]
pub fn run_drag_watcher(_app: tauri::AppHandle) {}

#[cfg(target_os = "windows")]
static DRAG_APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// hwnd → pre-snap outer size (w, h). Populated by `snap` (first snap only) and consumed by
/// `restore_on_drag_out` so dragging a snapped window out of its zone pops it back to its prior size.
#[cfg(target_os = "windows")]
static SNAPPED: std::sync::LazyLock<std::sync::Mutex<std::collections::HashMap<i64, (i32, i32)>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));

/// If `hwnd` was previously snapped by us, resize it back to its remembered pre-snap size — keeping
/// the grabbed title bar under the cursor — and forget it. Called on MOVESIZESTART, so dragging a
/// snapped window out of its zone restores its prior dimensions (Windows-Snap behavior). No-op for a
/// window we never snapped.
#[cfg(target_os = "windows")]
unsafe fn restore_on_drag_out(hwnd: windows::Win32::Foundation::HWND) {
    use windows::Win32::Foundation::{POINT, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetWindowRect, SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
    };

    let id = hwnd.0 as isize as i64;
    let size = SNAPPED.lock().unwrap_or_else(|e| e.into_inner()).remove(&id);
    let Some((rw, rh)) = size else { return };
    if rw <= 0 || rh <= 0 {
        return;
    }

    let mut rc = RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut rc) }.is_err() {
        return;
    }
    let mut cur = POINT::default();
    if unsafe { GetCursorPos(&mut cur) }.is_err() {
        return;
    }
    let snapped = ScreenRect {
        x: rc.left as f64,
        y: rc.top as f64,
        w: (rc.right - rc.left) as f64,
        h: (rc.bottom - rc.top) as f64,
    };
    let (nx, ny) = restore_top_left(snapped, (cur.x as f64, cur.y as f64), rw as f64, rh as f64);
    let _ =
        unsafe { SetWindowPos(hwnd, None, nx as i32, ny as i32, rw, rh, SWP_NOACTIVATE | SWP_NOZORDER) };
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn win_event_proc(
    _hook: windows::Win32::UI::Accessibility::HWINEVENTHOOK,
    event: u32,
    hwnd: windows::Win32::Foundation::HWND,
    id_object: i32,
    _id_child: i32,
    _thread: u32,
    _time: u32,
) {
    use tauri::Emitter;
    use windows::Win32::UI::WindowsAndMessaging::OBJID_WINDOW;
    use windows::Win32::UI::WindowsAndMessaging::{EVENT_SYSTEM_MOVESIZEEND, EVENT_SYSTEM_MOVESIZESTART};
    // Only the window itself (OBJID_WINDOW), not its caret/child accessible objects.
    if id_object != OBJID_WINDOW.0 {
        return;
    }
    let Some(app) = DRAG_APP.get() else {
        return;
    };
    let payload = DragEvent { hwnd: hwnd.0 as isize as i64 };
    match event {
        EVENT_SYSTEM_MOVESIZESTART => {
            // Dragging a snapped window out of its zone pops it back to its pre-snap size first.
            unsafe { restore_on_drag_out(hwnd) };
            let _ = app.emit("win_drag_start", payload);
        }
        EVENT_SYSTEM_MOVESIZEEND => {
            let _ = app.emit("win_drag_end", payload);
        }
        _ => {}
    }
}

// ---- Windows implementation ----

#[cfg(target_os = "windows")]
fn list_arrangeable() -> Result<Vec<WindowDescriptor>, String> {
    use std::ffi::c_void;
    use std::mem::size_of;
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetClassNameW, GetWindow, GetWindowLongW, GetWindowRect, GetWindowTextW,
        GetWindowThreadProcessId, IsWindowVisible, GWL_EXSTYLE, GWL_STYLE, GW_OWNER,
        WS_CHILD, WS_EX_TOOLWINDOW,
    };

    // Collect raw HWNDs first (do nothing heavy inside the enum callback). The body is push-only and
    // cannot panic, so no `catch_unwind` is needed across the `extern "system"` FFI boundary.
    extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
        // Safety: `lparam` carries a &mut Vec<HWND> for the lifetime of EnumWindows (below).
        let acc = unsafe { &mut *(lparam.0 as *mut Vec<HWND>) };
        acc.push(hwnd);
        true.into()
    }

    let mut hwnds: Vec<HWND> = Vec::new();
    unsafe {
        EnumWindows(Some(collect), LPARAM(&mut hwnds as *mut _ as isize))
            .map_err(|e| format!("EnumWindows failed: {e}"))?;
    }

    let own_pid = std::process::id();
    let mut out = Vec::new();
    for hwnd in hwnds {
        unsafe {
            let visible = IsWindowVisible(hwnd).as_bool();

            let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
            let toolwindow = ex_style & WS_EX_TOOLWINDOW.0 != 0;

            // On the rare failure path `cloaked` stays 0 (treated as not-cloaked → included), a safe
            // default; `cb = size_of::<u32>()` is the attribute's size.
            let mut cloaked: u32 = 0;
            let _ = DwmGetWindowAttribute(
                hwnd,
                DWMWA_CLOAKED,
                &mut cloaked as *mut _ as *mut c_void,
                size_of::<u32>() as u32,
            );

            let mut title_buf = [0u16; 512];
            let n = GetWindowTextW(hwnd, &mut title_buf);
            let title = String::from_utf16_lossy(&title_buf[..n as usize]);

            let mut rc = RECT::default();
            if GetWindowRect(hwnd, &mut rc).is_err() {
                continue;
            }
            let width = rc.right - rc.left;
            let height = rc.bottom - rc.top;

            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            let is_own = pid == own_pid;

            // Owned (has an owner window) or child windows are splash/installer/dialog popups, not
            // top-level app windows — skip them. GetWindow(GW_OWNER) errors → no owner (null).
            let has_owner = !GetWindow(hwnd, GW_OWNER).unwrap_or_default().0.is_null();
            let is_child = GetWindowLongW(hwnd, GWL_STYLE) as u32 & WS_CHILD.0 != 0;

            if !is_arrangeable(
                visible,
                toolwindow,
                cloaked != 0,
                !title.is_empty(),
                width,
                height,
                is_own,
                has_owner || is_child,
            ) {
                continue;
            }

            let mut class_buf = [0u16; 256];
            let cn = GetClassNameW(hwnd, &mut class_buf);
            let class_name = String::from_utf16_lossy(&class_buf[..cn as usize]);

            out.push(WindowDescriptor {
                hwnd: hwnd.0 as isize as i64,
                exe: exe_path(pid).unwrap_or_default(),
                class_name,
                title,
                rect: ScreenRect {
                    x: rc.left as f64,
                    y: rc.top as f64,
                    w: width as f64,
                    h: height as f64,
                },
            });
        }
    }
    Ok(out)
}

/// Resolve a PID to its full executable path (best-effort). `PROCESS_QUERY_LIMITED_INFORMATION` is
/// least-privilege and succeeds across the normal/elevated boundary; it is denied only for PPL /
/// protected processes — those return None and matching falls back to class/title.
#[cfg(target_os = "windows")]
fn exe_path(pid: u32) -> Option<String> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 260];
        let mut len = buf.len() as u32;
        let res = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &mut len,
        );
        let _ = CloseHandle(handle);
        res.ok()?;
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

#[cfg(target_os = "windows")]
fn snap(hwnd: i64, zone: ScreenRect) -> Result<(), String> {
    use std::ffi::c_void;
    use std::mem::size_of;
    use std::thread::sleep;
    use std::time::Duration;
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowRect, IsIconic, IsZoomed, SetWindowPos, ShowWindow, SWP_NOACTIVATE, SWP_NOZORDER,
        SW_RESTORE,
    };

    let hwnd_id = hwnd;
    let hwnd = HWND(hwnd as isize as *mut c_void);
    let read_rect = |h: HWND| -> Option<RECT> {
        let mut rc = RECT::default();
        unsafe { GetWindowRect(h, &mut rc) }.ok().map(|_| rc)
    };
    let same = |a: &Option<RECT>, b: &Option<RECT>| match (a, b) {
        (Some(x), Some(y)) => {
            x.left == y.left && x.top == y.top && x.right == y.right && x.bottom == y.bottom
        }
        _ => false
    };
    unsafe {
        // A maximized/minimized window ignores SetWindowPos (it snaps back), so restore it first —
        // then WAIT for the restore animation to settle. Measuring the window rect + DWM frame bounds
        // mid-animation reads an inconsistent pair and yields a bogus (~100px) border margin, which
        // mis-snaps the window horizontally (caught by the snap_moves_a_real_window smoke test). Poll
        // until two consecutive rects match and it's no longer zoomed/iconic (cap ~360ms).
        if IsZoomed(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
            let mut prev = read_rect(hwnd);
            for _ in 0..12 {
                sleep(Duration::from_millis(30));
                let cur = read_rect(hwnd);
                if same(&cur, &prev) && !IsZoomed(hwnd).as_bool() && !IsIconic(hwnd).as_bool() {
                    break;
                }
                prev = cur;
            }
        }

        let mut rc = RECT::default();
        GetWindowRect(hwnd, &mut rc).map_err(|e| format!("GetWindowRect failed: {e}"))?;
        let window = ScreenRect {
            x: rc.left as f64,
            y: rc.top as f64,
            w: (rc.right - rc.left) as f64,
            h: (rc.bottom - rc.top) as f64,
        };

        // Remember the pre-snap outer size so dragging the window OUT of its zone restores it
        // (restore_on_drag_out). `or_insert` keeps the ORIGINAL size across re-snaps into other zones.
        SNAPPED
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .entry(hwnd_id)
            .or_insert((rc.right - rc.left, rc.bottom - rc.top));

        let mut fb = RECT::default();
        let frame = DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut fb as *mut _ as *mut c_void,
            size_of::<RECT>() as u32,
        )
        .is_ok()
        .then(|| ScreenRect {
            x: fb.left as f64,
            y: fb.top as f64,
            w: (fb.right - fb.left) as f64,
            h: (fb.bottom - fb.top) as f64,
        });

        let t = adjust_for_frame_bounds(zone, window, frame);
        SetWindowPos(
            hwnd,
            None,
            t.x as i32,
            t.y as i32,
            t.w as i32,
            t.h as i32,
            SWP_NOACTIVATE | SWP_NOZORDER,
        )
        .map_err(|e| format!("SetWindowPos failed (the target window may be elevated): {e}"))
    }
}

#[cfg(not(target_os = "windows"))]
fn list_arrangeable() -> Result<Vec<WindowDescriptor>, String> {
    Err("window management is only available on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
fn snap(_hwnd: i64, _zone: ScreenRect) -> Result<(), String> {
    Err("window management is only available on Windows".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clickthrough::ScreenRect;

    fn rect(x: f64, y: f64, w: f64, h: f64) -> ScreenRect {
        ScreenRect { x, y, w, h }
    }

    #[test]
    fn is_arrangeable_requires_visible_titled_real_unowned_window() {
        assert!(is_arrangeable(true, false, false, true, 800, 600, false, false));
        assert!(!is_arrangeable(false, false, false, true, 800, 600, false, false)); // hidden
        assert!(!is_arrangeable(true, true, false, true, 800, 600, false, false)); // tool window
        assert!(!is_arrangeable(true, false, true, true, 800, 600, false, false)); // cloaked
        assert!(!is_arrangeable(true, false, false, false, 800, 600, false, false)); // no title
        assert!(!is_arrangeable(true, false, false, true, 0, 600, false, false)); // zero width
        assert!(!is_arrangeable(true, false, false, true, 800, 600, true, false)); // our own window
        assert!(!is_arrangeable(true, false, false, true, 800, 600, false, true)); // owned/child popup
    }

    #[test]
    fn adjust_returns_zone_unchanged_without_a_frame() {
        let zone = rect(100.0, 200.0, 800.0, 600.0);
        assert_eq!(adjust_for_frame_bounds(zone, rect(0.0, 0.0, 800.0, 600.0), None), zone);
    }

    #[test]
    fn adjust_expands_by_lrb_margins_and_never_the_top() {
        // 7px invisible border L/R/B; the frame's top coincides with the window top.
        let zone = rect(100.0, 200.0, 800.0, 600.0);
        let window = rect(0.0, 0.0, 814.0, 607.0);
        let frame = Some(rect(7.0, 0.0, 800.0, 600.0));
        assert_eq!(adjust_for_frame_bounds(zone, window, frame), rect(93.0, 200.0, 814.0, 607.0));
    }

    #[test]
    fn adjust_ignores_a_top_inset() {
        let zone = rect(0.0, 50.0, 400.0, 300.0);
        let window = rect(0.0, 0.0, 414.0, 357.0);
        let frame = Some(rect(7.0, 7.0, 400.0, 343.0)); // pretend a 7px top inset — must be ignored
        assert_eq!(adjust_for_frame_bounds(zone, window, frame).y, 50.0);
    }

    #[test]
    fn adjust_ignores_an_implausibly_large_border_read() {
        // A window measured mid open/restore animation yields a bogus ~100px left margin — clamped
        // to 0 so the window lands flush on the zone rather than ~100px off (the smoke-test bug).
        let zone = rect(200.0, 200.0, 800.0, 600.0);
        let window = rect(0.0, 0.0, 1920.0, 1000.0);
        let frame = Some(rect(102.0, 0.0, 1818.0, 1000.0)); // 102px left delta (bogus), rest 0
        assert_eq!(adjust_for_frame_bounds(zone, window, frame), zone);
    }

    #[test]
    fn exe_basename_lowercases_and_strips_dir() {
        assert_eq!(exe_basename("C:\\Program Files\\Spotify\\Spotify.exe"), "spotify.exe");
        assert_eq!(exe_basename("/usr/bin/Foo"), "foo");
        assert_eq!(exe_basename("Code.exe"), "code.exe");
    }

    #[test]
    fn restore_top_left_keeps_cursor_proportional() {
        // Snapped to the left half (0,0,960,1080), grabbed near the top-center of the title bar.
        let snapped = rect(0.0, 0.0, 960.0, 1080.0);
        let (x, y) = restore_top_left(snapped, (480.0, 10.0), 800.0, 600.0);
        assert!((x - 80.0).abs() < 1e-9); // rel_x=0.5 → 480 - 0.5*800 = 80
        assert!(y > 0.0 && y < 10.0); // title bar stays just under the cursor (rel_y ≈ 0.009)
    }

    #[test]
    fn restore_top_left_guards_zero_size_snapped() {
        // Degenerate snapped size must not divide by zero.
        let (x, y) = restore_top_left(rect(5.0, 5.0, 0.0, 0.0), (5.0, 5.0), 800.0, 600.0);
        assert_eq!((x, y), (5.0, 5.0));
    }
}

/// Opt-in LIVE smoke test of the real `SetWindowPos` path (the one thing the pure seams can't cover):
/// spawn a throwaway Notepad, snap it into a target rect, read its real geometry back to prove it
/// moved, then close it. `#[ignore]` so normal `cargo test` / CI never spawns a GUI window — run it
/// explicitly:  `cargo test -p widgetsack -- --ignored --nocapture snap_moves_a_real_window`.
/// The window is identified by DIFFING the arrangeable-window set across the spawn, so it can never
/// hijack a window you already had open, and it is closed before any assertion (so a failure never
/// leaves it behind).
#[cfg(all(test, target_os = "windows"))]
mod manual_smoke {
    use super::*;
    use std::collections::HashSet;
    use std::process::Command;
    use std::thread::sleep;
    use std::time::{Duration, Instant};

    fn arrangeable() -> Vec<WindowDescriptor> {
        list_arrangeable().unwrap_or_default()
    }

    fn rect_of(hwnd: i64) -> Option<ScreenRect> {
        arrangeable().into_iter().find(|w| w.hwnd == hwnd).map(|w| w.rect)
    }

    fn close_window(hwnd: i64) {
        use std::ffi::c_void;
        use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
        use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, WM_CLOSE};
        let h = HWND(hwnd as isize as *mut c_void);
        let _ = unsafe { PostMessageW(Some(h), WM_CLOSE, WPARAM(0), LPARAM(0)) };
    }

    #[test]
    #[ignore = "spawns + moves a real Notepad window; run explicitly with --ignored"]
    fn snap_moves_a_real_window() {
        let before: HashSet<i64> = arrangeable().into_iter().map(|w| w.hwnd).collect();
        let mut child = Command::new("notepad.exe").spawn().expect("failed to spawn notepad.exe");

        // Wait for a NEW arrangeable window (ours) — prefer one whose exe is notepad.exe.
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut hwnd = None;
        while Instant::now() < deadline && hwnd.is_none() {
            sleep(Duration::from_millis(150));
            let cur = arrangeable();
            hwnd = cur
                .iter()
                .find(|w| !before.contains(&w.hwnd) && exe_basename(&w.exe) == "notepad.exe")
                .or_else(|| cur.iter().find(|w| !before.contains(&w.hwnd)))
                .map(|w| w.hwnd);
        }
        let hwnd = match hwnd {
            Some(h) => h,
            None => {
                let _ = child.kill();
        let _ = child.wait(); // reap the process so clippy's zombie_processes lint is satisfied
                panic!("no new window appeared within 5s — did Notepad open?");
            }
        };

        let start = rect_of(hwnd);
        let target = ScreenRect { x: 200.0, y: 200.0, w: 800.0, h: 600.0 };
        let snapped = snap(hwnd, target);
        sleep(Duration::from_millis(250));
        let end = rect_of(hwnd);

        // Clean up BEFORE asserting so a failed assertion never leaves the window on screen.
        close_window(hwnd);
        let _ = child.kill();
        let _ = child.wait(); // reap the process so clippy's zombie_processes lint is satisfied

        println!("snap result: {snapped:?}");
        println!("target: {target:?}");
        println!("before: {start:?}");
        println!("after:  {end:?}");

        snapped.expect("snap returned Err");
        let end = end.expect("could not read the window rect after snapping");
        // The VISIBLE frame fills ~the target; the window rect sits within a small DWM border of it.
        assert!((end.x - target.x).abs() < 16.0, "x off target: {} vs {}", end.x, target.x);
        assert!((end.y - target.y).abs() < 16.0, "y off target: {} vs {}", end.y, target.y);
        assert!((end.w - target.w).abs() < 32.0, "w off target: {} vs {}", end.w, target.w);
    }
}
