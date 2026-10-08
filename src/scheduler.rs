use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchedulerConfig {
    pub enabled: bool,
    pub restart_time: String,
    pub interval_hours: u32,
    pub warn_15m: bool,
    pub warn_5m: bool,
    pub warn_1m: bool,
}

impl Default for SchedulerConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            restart_time: "04:00".into(),
            interval_hours: 24,
            warn_15m: true,
            warn_5m: true,
            warn_1m: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchedulerStatus {
    pub enabled: bool,
    pub restart_time: String,
    pub next_restart_timestamp_millis: Option<u64>,
    pub seconds_until_restart: Option<u64>,
    pub last_warning_sent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrashStatus {
    pub crash_count: u32,
    pub last_crash_timestamp_millis: Option<u64>,
    pub auto_restart_active: bool,
    pub is_in_crash_loop: bool,
    pub last_exit_code: Option<i32>,
}

pub fn calculate_next_restart_millis(restart_time_str: &str) -> u64 {
    let parts: Vec<&str> = restart_time_str.split(':').collect();
    let target_hour: u32 = parts.get(0).and_then(|s| s.parse().ok()).unwrap_or(4);
    let target_min: u32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let sec_in_day = 86400;
    let current_day_sec = now_secs % sec_in_day;
    let target_day_sec = (target_hour * 3600 + target_min * 60) as u64;

    let diff = if target_day_sec > current_day_sec {
        target_day_sec - current_day_sec
    } else {
        (sec_in_day - current_day_sec) + target_day_sec
    };

    (now_secs + diff) * 1000
}
