//! System sensors: sample hardware metrics on an interval and emit them to the
//! webview as a `telemetry` batch event.
//!
//! `sysinfo` is kept at this edge (an adapter, like `listener.rs` for gsmtc); the
//! `SensorValue` / `SensorSample` domain types below cross the bridge and mirror the
//! TS types in `client/src/lib/core/telemetry.ts`. Keep both sides in sync.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sysinfo::{Networks, System};
use tauri::{AppHandle, Emitter, Runtime};

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

/// Poll system sensors on an interval and emit a `telemetry` batch each tick.
///
/// Phase 1a: `cpu.total`, `mem.used`, `swap.used` (percentages) and
/// `net.down` / `net.up` (bytes/sec, summed across interfaces). CPU usage needs
/// two refreshes spaced apart to be non-zero, so the first tick primes it. Runs
/// until the app exits.
pub async fn run_system_sensors<R: Runtime>(app: AppHandle<R>) {
    let mut sys = System::new();
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    let mut networks = Networks::new_with_refreshed_list();

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

        if let Err(err) = app.emit(TELEMETRY_EVENT, &batch) {
            eprintln!("failed to emit telemetry: {err}");
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
}
