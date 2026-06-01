//! Per-widget click-through. A passive overlay is whole-window click-through, but
//! Windows overlays can't pass clicks through transparent pixels — so to host the
//! occasional clickable widget we run a cursor watcher: when the cursor is over an
//! interactive widget's rect, that window's ignore-cursor-events is turned off (so
//! the click lands on the widget); otherwise it stays on (clicks pass through).

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Manager, Runtime};

/// A widget's hit rect in physical screen pixels (computed and sent by the frontend).
#[derive(Clone, Copy, Debug, Deserialize)]
pub struct ScreenRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl ScreenRect {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x < self.x + self.w && y >= self.y && y < self.y + self.h
    }
}

/// Interactive hit rects per overlay window label.
#[derive(Default)]
pub struct InteractiveRects(pub Mutex<HashMap<String, Vec<ScreenRect>>>);

/// Frontend → backend: the interactive widgets' screen rects for `label`. An empty
/// list clears them (e.g. in edit mode, where the whole window is interactive).
#[tauri::command]
pub fn set_interactive_rects(
    state: tauri::State<'_, InteractiveRects>,
    label: String,
    rects: Vec<ScreenRect>,
) {
    let mut map = state.0.lock().unwrap();
    if rects.is_empty() {
        map.remove(&label);
    } else {
        map.insert(label, rects);
    }
}

/// Spawn the cursor watcher. Idles cheaply when no window has interactive rects;
/// otherwise polls ~60 Hz and toggles each window's ignore-cursor-events only on
/// transitions (entering/leaving that window's interactive rects).
pub fn run_clickthrough_watcher<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        let mut ignoring: HashMap<String, bool> = HashMap::new();
        loop {
            let map = {
                let guard = app.state::<InteractiveRects>();
                let map = guard.0.lock().unwrap();
                map.clone()
            };
            if map.is_empty() {
                ignoring.clear();
                std::thread::sleep(Duration::from_millis(200));
                continue;
            }
            std::thread::sleep(Duration::from_millis(16));

            let cursor = match app.cursor_position() {
                Ok(pos) => pos,
                Err(_) => continue,
            };
            for (label, rects) in &map {
                let over = rects.iter().any(|r| r.contains(cursor.x, cursor.y));
                let want_ignore = !over;
                if ignoring.get(label).copied() != Some(want_ignore) {
                    if let Some(win) = app.get_webview_window(label) {
                        let _ = win.set_ignore_cursor_events(want_ignore);
                        println!("clickthrough[{label}] ignore={want_ignore} over={over}");
                    }
                    ignoring.insert(label.clone(), want_ignore);
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::ScreenRect;

    #[test]
    fn contains_includes_origin_excludes_far_edge() {
        let r = ScreenRect {
            x: 10.0,
            y: 20.0,
            w: 100.0,
            h: 50.0,
        };
        assert!(r.contains(10.0, 20.0)); // top-left corner included
        assert!(r.contains(60.0, 40.0)); // inside
        assert!(!r.contains(110.0, 40.0)); // right edge (x + w) excluded
        assert!(!r.contains(60.0, 70.0)); // bottom edge (y + h) excluded
        assert!(!r.contains(5.0, 40.0)); // left of the rect
    }
}
