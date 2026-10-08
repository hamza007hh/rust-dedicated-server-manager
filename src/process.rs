use crate::scheduler::CrashStatus;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::oneshot;
use tracing::{error, info, warn};

use crate::args::build_command_line;
use crate::config::{sync_server_cfg, ServerConfig};
use crate::discovery::discover_installation;
use crate::error::{LauncherError, Result};
use crate::log::{LogManager, LogSource};
use crate::net::check_server_ports;
use crate::rcon::RconController;
use crate::status::{ServerState, ServerStatus};

#[cfg(windows)]
use std::ptr::null_mut;
#[cfg(windows)]
use windows_sys::Win32::System::JobObjects::*;

pub struct JobGuard {
    #[cfg(windows)]
    handle: windows_sys::Win32::Foundation::HANDLE,
}

#[cfg(windows)]
unsafe impl Send for JobGuard {}
#[cfg(windows)]
unsafe impl Sync for JobGuard {}

impl JobGuard {
    pub fn new() -> Result<Self> {
        #[cfg(windows)]
        unsafe {
            let handle = CreateJobObjectW(null_mut(), null_mut());
            if handle.is_null() {
                return Err(LauncherError::JobObjectError("CreateJobObjectW failed".into()));
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let res = SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of_val(&info) as u32,
            );
            if res == 0 {
                return Err(LauncherError::JobObjectError("SetInformationJobObject failed".into()));
            }
            Ok(Self { handle })
        }
        #[cfg(not(windows))]
        Ok(Self {})
    }

    pub fn assign(&self, child: &Child) -> Result<()> {
        #[cfg(windows)]
        unsafe {
            if let Some(raw) = child.raw_handle() {
                let res = AssignProcessToJobObject(self.handle, raw as _);
                if res == 0 {
                    return Err(LauncherError::JobObjectError("AssignProcessToJobObject failed".into()));
                }
            }
        }
        Ok(())
    }
}

pub struct ServerProcessManager {
    stop_tx: Option<oneshot::Sender<()>>,
    state: ServerState,
    log_manager: LogManager,
    rcon: Option<Arc<RconController>>,
    _job_guard: JobGuard,
    child_pid: Option<u32>,
    started_at: Option<std::time::Instant>,
    last_cpu_sample: Arc<tokio::sync::Mutex<Option<(std::time::Instant, u64)>>>,
    pub crash_count: Arc<AtomicU32>,
    pub last_crash: Arc<tokio::sync::Mutex<Option<(u64, Option<i32>)>>>,
    pub auto_restart_active: Arc<AtomicBool>,
    pub is_in_crash_loop: Arc<AtomicBool>,
    recent_crashes: Arc<tokio::sync::Mutex<Vec<u64>>>,
}

impl ServerProcessManager {
    pub fn new() -> Result<Self> {
        let job_guard = JobGuard::new()?;
        Ok(Self {
            stop_tx: None,
            state: ServerState::new(),
            log_manager: LogManager::default(),
            rcon: None,
            _job_guard: job_guard,
            child_pid: None,
            started_at: None,
            last_cpu_sample: Arc::new(tokio::sync::Mutex::new(None)),
            crash_count: Arc::new(AtomicU32::new(0)),
            last_crash: Arc::new(tokio::sync::Mutex::new(None)),
            auto_restart_active: Arc::new(AtomicBool::new(true)),
            is_in_crash_loop: Arc::new(AtomicBool::new(false)),
            recent_crashes: Arc::new(tokio::sync::Mutex::new(Vec::new())),
        })
    }

    pub fn state(&self) -> &ServerState {
        &self.state
    }

    pub fn log_manager(&self) -> &LogManager {
        &self.log_manager
    }

    pub fn rcon(&self) -> Option<&RconController> {
        self.rcon.as_deref()
    }

    /// Full lifecycle server startup conforming to Crucible specifications.
    pub async fn start(&mut self, config: &ServerConfig) -> Result<()> {
        if self.state.is_running() {
            return Err(LauncherError::AlreadyRunning);
        }

        // 1. Port Availability Check
        check_server_ports(config.port, config.resolved_query_port(), config.rcon_port)?;

        // 2. Discover and Validate Installation
        let install = discover_installation(&config.install_path)?;

        // 3. Synchronize server.cfg non-destructively
        let cfg_file = sync_server_cfg(config)?;
        info!("Synchronized configuration to: {}", cfg_file.display());
        self.log_manager.append(LogSource::System, format!("Configuration generated: {}", cfg_file.display()));

        // 3b. Synchronize users.cfg
        if !config.admins.is_empty() {
            let _ = crate::admins::AdminManager::save_admins(&config.install_path, &config.identity, &config.admins);
        }

        // 4. Build Launch Arguments
        let args = build_command_line(config)?;
        info!("Launching RustDedicated from: {}", install.executable.display());
        info!("Complete argument list: {:?}", args);
        let masked_args = args.iter().enumerate().map(|(i, a)| {
            if i > 0 && args[i - 1] == "+rcon.password" {
                "******"
            } else {
                a.as_str()
            }
        }).collect::<Vec<_>>().join(" ");
        self.log_manager.append(
            LogSource::System,
            format!("Launching: {} {}", install.executable.display(), masked_args),
        );

        // 5. Spawn Subprocess
        let mut cmd = Command::new(&install.executable);
        cmd.args(&args)
            .current_dir(&install.root)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW: completely hides console window

        let mut child = cmd.spawn().map_err(|e| LauncherError::ProcessSpawnError(e.to_string()))?;
        let pid = child.id().unwrap_or(0);
        self._job_guard.assign(&child)?;
        self.child_pid = Some(pid);
        let start_instant = std::time::Instant::now();
        self.started_at = Some(start_instant);

        // Immediate liveness check
        match child.try_wait() {
            Ok(Some(status)) => {
                error!("Process exited immediately upon spawning with status: {}", status);
                self.state.set_status(ServerStatus::Stopped);
                self.log_manager.append(
                    LogSource::System,
                    format!("RustDedicated process exited immediately with status: {}", status),
                );
                return Err(LauncherError::ProcessSpawnError(format!(
                    "RustDedicated process exited immediately with status: {}",
                    status
                )));
            }
            Ok(None) => {
                info!("RustDedicated process verified alive (PID: {})", pid);
                self.state.set_status(ServerStatus::Starting);
                self.log_manager.append(
                    LogSource::System,
                    format!("Server process spawned and verified alive (PID: {})", pid),
                );
            }
            Err(e) => {
                warn!("Could not immediately query process status: {}", e);
                self.state.set_status(ServerStatus::Starting);
            }
        }

        // 6. Spawn Asynchronous Stdout Log Streamer
        if let Some(stdout) = child.stdout.take() {
            let state_clone = self.state.clone();
            let log_mgr = self.log_manager.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if line.contains("Server startup complete") {
                        info!("Server signaled startup completion via stdout!");
                        state_clone.set_status(ServerStatus::Running);
                        log_mgr.append(LogSource::System, "Server status -> Running (Startup Complete)");
                    }
                    log_mgr.append(LogSource::Stdout, line);
                }
            });
        }

        // 6b. Spawn Asynchronous Log File Streamer (Unity directs console output to logfile)
        let log_file_name = config.log_file.clone().unwrap_or_else(|| "output.log".into());
        let log_file_path = install.root.join(&log_file_name);
        let state_logfile = self.state.clone();
        let log_mgr_file = self.log_manager.clone();
        tokio::spawn(async move {
            let mut file = None;
            for _ in 0..60 {
                if let Ok(f) = tokio::fs::File::open(&log_file_path).await {
                    file = Some(f);
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            }

            if let Some(f) = file {
                use tokio::io::AsyncSeekExt;
                let mut reader = BufReader::new(f);
                // Seek to current end to capture newly generated lines
                let _ = reader.seek(std::io::SeekFrom::End(0)).await;
                let mut line = String::new();
                loop {
                    line.clear();
                    match reader.read_line(&mut line).await {
                        Ok(0) => {
                            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                        }
                        Ok(_) => {
                            let trimmed = line.trim_end_matches(&['\r', '\n'][..]);
                            if !trimmed.is_empty() {
                                if trimmed.contains("Server startup complete") {
                                    info!("Server signaled startup completion in log file!");
                                    state_logfile.set_status(ServerStatus::Running);
                                    log_mgr_file.append(
                                        LogSource::System,
                                        "Server startup complete (Server signaled startup completion)",
                                    );
                                }
                                log_mgr_file.append(LogSource::Stdout, trimmed);
                            }
                        }
                        Err(_) => {
                            break;
                        }
                    }
                }
            }
        });

        // 7. Spawn Asynchronous Stderr Log Streamer
        if let Some(stderr) = child.stderr.take() {
            let log_mgr = self.log_manager.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    error!("[STDERR] {}", line);
                    log_mgr.append(LogSource::Stderr, line);
                }
            });
        }

        // 8. Initialize RCON Controller with retry loop and state management
        let rcon_ctrl = Arc::new(RconController::spawn(
            config.rcon_port,
            config.rcon_password.clone(),
            self.state.clone(),
            self.log_manager.clone(),
        ));
        self.rcon = Some(rcon_ctrl.clone());

        // 9. Supervisor task: handles process termination and unexpected exits
        let (stop_tx, mut stop_rx) = oneshot::channel::<()>();
        self.stop_tx = Some(stop_tx);

        let state_supervisor = self.state.clone();
        let log_supervisor = self.log_manager.clone();
        let rcon_supervisor = rcon_ctrl;
        let crash_count_clone = self.crash_count.clone();
        let last_crash_clone = self.last_crash.clone();
        let auto_restart_clone = self.auto_restart_active.clone();
        let is_loop_clone = self.is_in_crash_loop.clone();
        let recent_crashes_clone = self.recent_crashes.clone();

        tokio::spawn(async move {
            tokio::select! {
                _ = &mut stop_rx => {
                    info!("Supervisor received stop command; terminating server child process (PID {}).", pid);
                    let _ = child.kill().await;
                    let _ = child.wait().await;
                }
                exit_res = child.wait() => {
                    let now_ts = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);
                    let lifetime_secs = start_instant.elapsed().as_secs_f64();
                    let exit_code = match &exit_res {
                        Ok(st) => {
                            warn!("Server process (PID {}) terminated after {:.2}s with exit status: {}", pid, lifetime_secs, st);
                            log_supervisor.append(
                                LogSource::System,
                                format!("Server process (PID {}) terminated after {:.2}s with exit status: {}", pid, lifetime_secs, st),
                            );
                            st.code()
                        }
                        Err(e) => {
                            error!("Error waiting on server child process (PID {}): {}", pid, e);
                            log_supervisor.append(LogSource::System, format!("Server wait error: {}", e));
                            None
                        }
                    };

                    crash_count_clone.fetch_add(1, Ordering::SeqCst);
                    *last_crash_clone.lock().await = Some((now_ts, exit_code));

                    let mut recent = recent_crashes_clone.lock().await;
                    recent.retain(|&ts| now_ts.saturating_sub(ts) < 300_000);
                    recent.push(now_ts);

                    if recent.len() >= 3 {
                        is_loop_clone.store(true, Ordering::SeqCst);
                        auto_restart_clone.store(false, Ordering::SeqCst);
                        warn!("Crash loop detected: 3 terminations within 5 minutes. Auto-restart disabled.");
                        log_supervisor.append(LogSource::System, "CRASH PROTECTION: 3 crashes within 5 minutes. Auto-restart disabled to protect save data.");
                    }

                    // Transition lifecycle state to Stopped
                    state_supervisor.set_status(ServerStatus::Stopped);
                    log_supervisor.append(
                        LogSource::System,
                        format!("Server status -> Stopped (Process exited with code: {:?})", exit_code),
                    );

                    // Cleanly shut down RCON
                    rcon_supervisor.shutdown().await;
                }
            }
        });

        Ok(())
    }

    /// Stops the server cleanly: closes RCON, requests exit, and cleans up.
    pub async fn stop(&mut self) -> Result<()> {
        if !self.state.is_running() {
            return Err(LauncherError::NotRunning);
        }

        self.state.set_status(ServerStatus::Stopping);
        self.log_manager.append(LogSource::System, "Initiating server shutdown (Stopping)");
        info!("Stopping RustDedicated.exe...");

        // 1. Cleanly send quit via RCON if connected
        if let Some(rcon) = &self.rcon {
            if rcon.is_connected() {
                let _ = rcon.send_command("quit").await;
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            }
        }

        // 2. Trigger termination via supervisor
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }

        // 3. Cleanly shut down RCON controller
        if let Some(rcon) = self.rcon.take() {
            rcon.shutdown().await;
        }

        self.child_pid = None;
        self.started_at = None;
        self.state.set_status(ServerStatus::Stopped);
        self.log_manager.append(LogSource::System, "Server status -> Stopped");
        Ok(())
    }

    pub fn pid(&self) -> Option<u32> {
        self.child_pid
    }

    pub fn uptime_seconds(&self) -> u64 {
        if self.state.is_running() {
            self.started_at.map(|t| t.elapsed().as_secs()).unwrap_or(0)
        } else {
            0
        }
    }


    pub async fn get_crash_status(&self) -> CrashStatus {
        let count = self.crash_count.load(Ordering::SeqCst);
        let auto_active = self.auto_restart_active.load(Ordering::SeqCst);
        let is_loop = self.is_in_crash_loop.load(Ordering::SeqCst);
        let last = *self.last_crash.lock().await;
        CrashStatus {
            crash_count: count,
            last_crash_timestamp_millis: last.map(|(ts, _)| ts),
            auto_restart_active: auto_active,
            is_in_crash_loop: is_loop,
            last_exit_code: last.and_then(|(_, code)| code),
        }
    }

    pub fn reset_crash_count(&self) {
        self.crash_count.store(0, Ordering::SeqCst);
        self.is_in_crash_loop.store(false, Ordering::SeqCst);
    }

    pub fn set_auto_restart(&self, enabled: bool) {
        self.auto_restart_active.store(enabled, Ordering::SeqCst);
    }

    pub async fn get_resource_metrics(&self) -> (f32, f32) {
        #[cfg(windows)]
        {
            if let Some(pid) = self.child_pid {
                if self.state.is_running() {
                    let mut lock = self.last_cpu_sample.lock().await;
                    let (mem, cpu, next_sample) = query_windows_metrics(pid, *lock);
                    *lock = next_sample;
                    return (mem, cpu);
                }
            }
        }
        (0.0, 0.0)
    }
}

#[cfg(windows)]
fn query_windows_metrics(pid: u32, last_sample: Option<(std::time::Instant, u64)>) -> (f32, f32, Option<(std::time::Instant, u64)>) {
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME};
    use windows_sys::Win32::System::ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
    use windows_sys::Win32::System::Threading::{GetProcessTimes, OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ};

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid);
        if handle.is_null() {
            return (0.0, 0.0, None);
        }

        let mut mem_mb = 0.0f32;
        let mut counters: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
        counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;

        if K32GetProcessMemoryInfo(handle, &mut counters as *mut _ as *mut _, counters.cb) != 0 {
            mem_mb = (counters.WorkingSetSize as f64 / (1024.0 * 1024.0)) as f32;
        }

        let mut creation = std::mem::zeroed();
        let mut exit = std::mem::zeroed();
        let mut kernel: FILETIME = std::mem::zeroed();
        let mut user: FILETIME = std::mem::zeroed();

        let mut cpu_percent = 0.0f32;
        let mut new_sample = last_sample;

        if GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user) != 0 {
            let kernel_ticks = ((kernel.dwHighDateTime as u64) << 32) | (kernel.dwLowDateTime as u64);
            let user_ticks = ((user.dwHighDateTime as u64) << 32) | (user.dwLowDateTime as u64);
            let total_process_ticks = kernel_ticks + user_ticks;
            let now = std::time::Instant::now();

            if let Some((prev_time, prev_ticks)) = last_sample {
                let elapsed_millis = now.duration_since(prev_time).as_millis() as f64;
                if elapsed_millis > 200.0 && total_process_ticks >= prev_ticks {
                    let ticks_diff = (total_process_ticks - prev_ticks) as f64;
                    let process_millis = ticks_diff / 10_000.0;
                    let num_cpus = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1) as f64;
                    cpu_percent = ((process_millis / (elapsed_millis * num_cpus)) * 100.0).clamp(0.0, 100.0) as f32;
                    new_sample = Some((now, total_process_ticks));
                }
            } else {
                new_sample = Some((now, total_process_ticks));
            }
        }

        CloseHandle(handle);
        (mem_mb, cpu_percent, new_sample)
    }
}
