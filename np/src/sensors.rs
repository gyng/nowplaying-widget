//! System sensors: sample hardware metrics on an interval and emit them to the
//! webview as a `telemetry` batch event.
//!
//! `sysinfo` is kept at this edge (an adapter, like `listener.rs` for gsmtc); the
//! `SensorValue` / `SensorSample` domain types below cross the bridge and mirror the
//! TS types in `client/src/lib/core/telemetry.ts`. Keep both sides in sync.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sysinfo::System;
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

/// Poll system sensors on an interval and emit a `telemetry` batch each tick.
///
/// Phase S: only `cpu.total`. CPU usage needs two refreshes spaced apart to be
/// non-zero, so the first tick primes it and real values start on the next tick.
/// Runs until the app exits.
pub async fn run_system_sensors<R: Runtime>(app: AppHandle<R>) {
    let mut sys = System::new();
    sys.refresh_cpu_usage();

    let mut ticker = tokio::time::interval(Duration::from_millis(1000));
    loop {
        ticker.tick().await;
        sys.refresh_cpu_usage();

        let batch = vec![SensorSample::scalar(
            "cpu.total",
            now_ms(),
            f64::from(sys.global_cpu_usage()),
        )];

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
}
