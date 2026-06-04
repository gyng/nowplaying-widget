//! System sensors: sample hardware metrics on an interval and emit them to the
//! webview as a `telemetry` batch event.
//!
//! `sysinfo` is kept at this edge (an adapter, like `listener.rs` for gsmtc); the
//! `SensorValue` / `SensorSample` domain types below cross the bridge and mirror the
//! TS types in `client/src/lib/core/telemetry.ts`. Keep both sides in sync.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use nvml_wrapper::{enum_wrappers::device::TemperatureSensor, Nvml};
use serde::Serialize;
use sysinfo::{Networks, System};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::log;

/// The `telemetry` event name on the Tauri bridge.
pub const TELEMETRY_EVENT: &str = "telemetry";

/// A single metric value. Mirrors `SensorValue` in `core/telemetry.ts`.
///
/// Variants beyond `Scalar` are part of the bridge contract and are produced in
/// later phases (text clocks, per-core series, media JSON), hence `dead_code` is
/// allowed here.
#[allow(dead_code)]
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum SensorValue {
    Scalar(f64),
    Text(String),
    Series(Vec<f64>),
    Json(serde_json::Value),
}

/// One sample from one sensor. Mirrors `SensorSample` in `core/telemetry.ts`.
#[derive(Clone, Debug, Serialize)]
pub struct SensorSample {
    pub sensor: String,
    pub ts_ms: u64,
    pub value: SensorValue,
}

impl SensorSample {
    pub fn scalar(sensor: impl Into<String>, ts_ms: u64, value: f64) -> Self {
        SensorSample {
            sensor: sensor.into(),
            ts_ms,
            value: SensorValue::Scalar(value),
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Base sampling interval. Per-sensor intervals arrive later in Phase 1.
const INTERVAL_MS: u64 = 1000;

/// `used / total` as a 0..100 percentage. Returns 0 when `total` is 0.
fn percent(used: u64, total: u64) -> f64 {
    if total == 0 {
        0.0
    } else {
        used as f64 * 100.0 / total as f64
    }
}

/// Convert a per-tick byte delta into a bytes-per-second rate.
fn rate_per_sec(bytes: u64, interval_ms: u64) -> f64 {
    if interval_ms == 0 {
        0.0
    } else {
        bytes as f64 * 1000.0 / interval_ms as f64
    }
}

/// Stable sensor id for a per-core CPU usage reading (zero-indexed).
fn core_sensor_id(index: usize) -> String {
    format!("cpu.core.{index}")
}

/// Per-window record of which sensor ids are currently being consumed, keyed by
/// `window.label()`. Demand-gating reads this to decide whether the expensive NVML
/// queries are worth running this tick (see `gpu_wanted`).
///
/// A plain `std::sync::Mutex` (locks are brief and synchronous — never held across an
/// `.await`). Managed in `main.rs` and updated by the `set_active_sensors` command.
#[derive(Default)]
pub struct ActiveSensors(pub Mutex<HashMap<String, HashSet<String>>>);

/// The three GPU sensor ids the NVML block produces.
const GPU_SENSOR_IDS: [&str; 3] = ["gpu.util", "gpu.vram", "gpu.temp"];

/// Record the set of sensor ids window `window.label()` is currently consuming.
///
/// The frontend calls `invoke("set_active_sensors", { ids })` whenever its set of
/// mounted sensors changes; a set containing `"*"` is a sentinel meaning "everything".
#[tauri::command]
pub async fn set_active_sensors<R: Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<'_, ActiveSensors>,
    ids: Vec<String>,
) -> Result<(), ()> {
    let mut map = state.0.lock().unwrap_or_else(|e| e.into_inner());
    map.insert(window.label().to_string(), ids.into_iter().collect());
    Ok(())
}

/// Should the GPU be sampled this tick? Default-ON for safety: GPU is wanted iff the
/// union of every window's reported set is EMPTY (nobody has reported yet), OR any
/// window asked for everything (`"*"`), OR any window asked for one of the `gpu.*` ids.
fn gpu_wanted(active: &HashMap<String, HashSet<String>>) -> bool {
    // Nobody has reported a set yet → sample everything (don't blank out GPU at startup).
    if active.values().all(|ids| ids.is_empty()) {
        return true;
    }
    active
        .values()
        .any(|ids| ids.contains("*") || GPU_SENSOR_IDS.iter().any(|gpu| ids.contains(*gpu)))
}

/// Poll system sensors on an interval and emit a `telemetry` batch each tick.
///
/// `cpu.total`, `cpu.core.N`, `mem.used`, `swap.used` (percentages),
/// `net.down` / `net.up` (bytes/sec) and — when an NVIDIA GPU is present —
/// `gpu.util`, `gpu.vram`, `gpu.temp`. CPU usage needs two refreshes spaced
/// apart to be non-zero, so the first tick primes it. NVML is optional: if init
/// fails (no NVIDIA driver) GPU sensors are skipped without erroring. Runs until
/// the app exits.
pub async fn run_system_sensors<R: Runtime>(app: AppHandle<R>) {
    let mut sys = System::new();
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    let mut networks = Networks::new_with_refreshed_list();

    // GPU is best-effort: degrade gracefully on machines without NVML/NVIDIA.
    let nvml = match Nvml::init() {
        Ok(nvml) => Some(nvml),
        Err(err) => {
            log::warn("sensors", "GPU sensors disabled (NVML init failed)")
                .field("error", err)
                .emit();
            None
        }
    };
    let gpu = nvml.as_ref().and_then(|nvml| nvml.device_by_index(0).ok());

    let mut ticker = tokio::time::interval(Duration::from_millis(INTERVAL_MS));
    loop {
        ticker.tick().await;
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        networks.refresh(true);

        let ts = now_ms();
        let down: u64 = networks.values().map(|data| data.received()).sum();
        let up: u64 = networks.values().map(|data| data.transmitted()).sum();

        let mut batch = vec![
            SensorSample::scalar("cpu.total", ts, f64::from(sys.global_cpu_usage())),
            SensorSample::scalar("mem.used", ts, percent(sys.used_memory(), sys.total_memory())),
            SensorSample::scalar("swap.used", ts, percent(sys.used_swap(), sys.total_swap())),
            SensorSample::scalar("net.down", ts, rate_per_sec(down, INTERVAL_MS)),
            SensorSample::scalar("net.up", ts, rate_per_sec(up, INTERVAL_MS)),
        ];

        for (i, cpu) in sys.cpus().iter().enumerate() {
            batch.push(SensorSample::scalar(core_sensor_id(i), ts, f64::from(cpu.cpu_usage())));
        }

        // Demand-gate the expensive NVML queries: cpu/mem/swap/net/per-core above are cheap
        // and always emit, but utilization_rates/memory_info/temperature are not. Lock the
        // ActiveSensors map only long enough to compute the gate, then DROP it before any NVML
        // I/O — the std Mutex must never be held across an await or a blocking driver call.
        let wanted = {
            let active: tauri::State<ActiveSensors> = app.state();
            let g = active.0.lock().unwrap_or_else(|e| e.into_inner());
            gpu_wanted(&g)
        };
        if wanted && let Some(device) = &gpu {
            if let Ok(util) = device.utilization_rates() {
                batch.push(SensorSample::scalar("gpu.util", ts, f64::from(util.gpu)));
            }
            if let Ok(mem) = device.memory_info() {
                batch.push(SensorSample::scalar("gpu.vram", ts, percent(mem.used, mem.total)));
            }
            if let Ok(temp) = device.temperature(TemperatureSensor::Gpu) {
                batch.push(SensorSample::scalar("gpu.temp", ts, f64::from(temp)));
            }
        }

        if let Err(err) = app.emit(TELEMETRY_EVENT, &batch) {
            log::error("sensors", "failed to emit telemetry")
                .field("error", err)
                .emit();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scalar_sample_serializes_to_bridge_contract() {
        let sample = SensorSample::scalar("cpu.total", 1_700_000_000_000, 12.5);
        let json = serde_json::to_value(&sample).unwrap();

        assert_eq!(json["sensor"], "cpu.total");
        assert_eq!(json["ts_ms"], 1_700_000_000_000u64);
        assert_eq!(json["value"]["kind"], "scalar");
        assert_eq!(json["value"]["value"], 12.5);
    }

    #[test]
    fn percent_handles_zero_total() {
        assert_eq!(percent(0, 0), 0.0);
        assert_eq!(percent(5, 0), 0.0);
    }

    #[test]
    fn percent_computes_ratio() {
        assert_eq!(percent(50, 200), 25.0);
        assert_eq!(percent(8, 16), 50.0);
    }

    #[test]
    fn rate_per_sec_scales_to_one_second() {
        assert_eq!(rate_per_sec(1000, 1000), 1000.0);
        assert_eq!(rate_per_sec(2000, 500), 4000.0);
        assert_eq!(rate_per_sec(100, 0), 0.0);
    }

    #[test]
    fn core_sensor_id_is_zero_indexed() {
        assert_eq!(core_sensor_id(0), "cpu.core.0");
        assert_eq!(core_sensor_id(7), "cpu.core.7");
    }

    /// Build an `ActiveSensors` map from `(label, &[ids])` pairs.
    fn active(entries: &[(&str, &[&str])]) -> HashMap<String, HashSet<String>> {
        let mut map = HashMap::new();
        for (label, ids) in entries {
            let set: HashSet<String> = ids.iter().map(|s| s.to_string()).collect();
            map.insert(label.to_string(), set);
        }
        map
    }

    #[test]
    fn gpu_wanted_defaults_on_when_nobody_reported() {
        // Empty map: no window has reported yet → sample everything for safety.
        assert!(gpu_wanted(&HashMap::new()));
        // A window that reported an empty set is treated like "not reported yet".
        assert!(gpu_wanted(&active(&[("main", &[])])));
    }

    #[test]
    fn gpu_wanted_false_when_only_cheap_sensors() {
        assert!(!gpu_wanted(&active(&[("main", &["cpu.total"])])));
        assert!(!gpu_wanted(&active(&[
            ("main", &["cpu.total", "mem.used"]),
            ("overlay-1", &["net.down"])
        ])));
    }

    #[test]
    fn gpu_wanted_true_when_a_gpu_id_present() {
        assert!(gpu_wanted(&active(&[("main", &["gpu.util"])])));
        assert!(gpu_wanted(&active(&[("main", &["gpu.vram"])])));
        assert!(gpu_wanted(&active(&[("main", &["gpu.temp"])])));
    }

    #[test]
    fn gpu_wanted_true_for_star_sentinel() {
        assert!(gpu_wanted(&active(&[("studio", &["*"])])));
    }

    #[test]
    fn gpu_wanted_true_when_union_has_gpu() {
        // Multi-window union: one consumer asking for a gpu sensor wins.
        assert!(gpu_wanted(&active(&[
            ("main", &["cpu.total"]),
            ("overlay-1", &["gpu.temp"])
        ])));
    }
}
