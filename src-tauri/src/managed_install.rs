//! Managed MagAgent install (Phase 6, experimental).
//!
//! Instead of shipping Python inside the installer, Command Center can create a private
//! MagAgent runtime on request: `uv` provisions CPython, a virtual environment, and a
//! pinned `mag-agent` inside the app's local data folder (`managed-magent/`). Nothing is
//! added to `PATH` or to shell profiles, the user's own `uv` configuration is ignored,
//! and removing the folder removes everything.
//!
//! Layout under the root:
//! - `uv/uv[.exe]`: a pinned `uv`, downloaded only when no `uv` is installed;
//! - `python/`, `python-bin/`, `cache/`: uv-managed CPython, its shims, and uv's cache;
//! - `envs/<stamp>/`: one virtual environment per install (venvs are not relocatable, so
//!   upgrades build a new one and the old one is deleted after the switch);
//! - `managed.json`: the manifest, written last, which marks the install complete.
use crate::process_tree;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    env, fs,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Mutex, OnceLock,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};

/// The MagAgent version the managed install pins (the app's minimum supported version).
pub const PINNED_MAGENT: &str = "1.4.0";
/// The CPython series uv provisions for the private environment.
pub const PINNED_PYTHON: &str = "3.12";
/// The uv release downloaded when no `uv` is installed.
pub const PINNED_UV: &str = "0.6.14";
pub const PROGRESS_EVENT: &str = "managed-install-progress";
const MANIFEST: &str = "managed.json";
const SCHEMA: &str = "mag-command-center.managed-magent.v1";
const MAX_UV_ARCHIVE: usize = 64 * 1024 * 1024;
const STEP_TIMEOUT: Duration = Duration::from_secs(20 * 60);
pub const TOTAL_STEPS: usize = 5;

static ROOT: OnceLock<PathBuf> = OnceLock::new();
static RUNNING: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);

fn current_step() -> &'static Mutex<Option<process_tree::TreeHandle>> {
    static CURRENT: OnceLock<Mutex<Option<process_tree::TreeHandle>>> = OnceLock::new();
    CURRENT.get_or_init(|| Mutex::new(None))
}

/// Records the app-private root; called once from app setup.
pub fn init(app: &AppHandle) {
    if let Ok(directory) = app.path().app_local_data_dir() {
        let _ = ROOT.set(directory.join("managed-magent"));
    }
}

fn root() -> Result<&'static PathBuf, String> {
    ROOT.get()
        .ok_or_else(|| "The app data folder is not available.".to_string())
}

fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

fn venv_bin(venv: &Path, name: &str) -> PathBuf {
    if cfg!(windows) {
        venv.join("Scripts").join(exe(name))
    } else {
        venv.join("bin").join(name)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Manifest {
    pub schema: String,
    pub magent_version: String,
    pub env: String,
    pub python: String,
    pub uv: String,
    pub uv_source: String,
    pub requirements: Vec<String>,
    pub installed_at: u64,
}

pub fn read_manifest(root: &Path) -> Option<Manifest> {
    let text = fs::read_to_string(root.join(MANIFEST)).ok()?;
    let manifest: Manifest = serde_json::from_str(&text).ok()?;
    (manifest.schema == SCHEMA).then_some(manifest)
}

/// The managed `magent` in `root`, when a completed install exists and is inside it.
pub fn managed_magent_in(root: &Path) -> Option<PathBuf> {
    let manifest = read_manifest(root)?;
    let env_dir = root.join("envs").join(&manifest.env);
    let binary = venv_bin(&env_dir, "magent");
    (Path::new(&manifest.env).components().count() == 1 && binary.is_file()).then_some(binary)
}

/// The managed `magent`, for binary resolution.
pub fn managed_magent() -> Option<PathBuf> {
    ROOT.get().and_then(|root| managed_magent_in(root))
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Progress {
    pub step: &'static str,
    pub index: usize,
    pub total: usize,
    pub label: String,
    pub state: &'static str,
    pub line: Option<String>,
}

/// Test and support overrides, read from the app's own environment (never the renderer).
#[derive(Default, Clone, Debug)]
pub struct Options {
    /// `MCC_UV_BIN`: use this `uv`.
    pub uv: Option<PathBuf>,
    /// `MCC_MANAGED_PYTHON`: base the venv on this interpreter instead of uv-managed CPython.
    pub python: Option<String>,
    /// `MCC_MANAGED_MAGENT_SPEC`: whitespace-separated requirements instead of the pin.
    pub requirements: Vec<String>,
    /// Look for an installed `uv` before downloading one (always true in the app).
    pub use_system_uv: bool,
    /// Tests only: accept a locally built archive. The app always uses the pinned digest.
    pub expected_uv_sha256: Option<String>,
}

impl Options {
    pub fn from_env() -> Self {
        let value = |name: &str| env::var(name).ok().filter(|v| !v.trim().is_empty());
        Options {
            uv: value("MCC_UV_BIN").map(PathBuf::from),
            python: value("MCC_MANAGED_PYTHON"),
            requirements: requirements_from(value("MCC_MANAGED_MAGENT_SPEC")),
            use_system_uv: true,
            expected_uv_sha256: None,
        }
    }
}

pub fn requirements_from(spec: Option<String>) -> Vec<String> {
    match spec {
        Some(spec) => spec.split_whitespace().map(str::to_string).collect(),
        None => vec![format!("mag-agent=={PINNED_MAGENT}")],
    }
}

/// The uv release asset for a platform, or `None` where uv publishes none.
pub fn uv_asset(os: &str, arch: &str) -> Option<&'static str> {
    Some(match (os, arch) {
        ("linux", "x86_64") => "uv-x86_64-unknown-linux-gnu.tar.gz",
        ("linux", "aarch64") => "uv-aarch64-unknown-linux-gnu.tar.gz",
        ("macos", "x86_64") => "uv-x86_64-apple-darwin.tar.gz",
        ("macos", "aarch64") => "uv-aarch64-apple-darwin.tar.gz",
        ("windows", "x86_64") => "uv-x86_64-pc-windows-msvc.zip",
        ("windows", "aarch64") => "uv-aarch64-pc-windows-msvc.zip",
        _ => return None,
    })
}

pub fn uv_url(asset: &str) -> String {
    format!("https://github.com/astral-sh/uv/releases/download/{PINNED_UV}/{asset}")
}

/// SHA-256 of each uv 0.6.14 release archive, pinned in source (from the release's
/// published `.sha256` files, recorded 2026-09-27). The download is accepted only when it
/// matches, so a changed release asset or a compromised mirror cannot substitute a binary.
pub fn pinned_uv_sha256(asset: &str) -> Option<&'static str> {
    Some(match asset {
        "uv-x86_64-unknown-linux-gnu.tar.gz" => {
            "0aaf451c391d3913823bfb8ed354b446dcfd0553a32ed8266611e4181c61fd51"
        }
        "uv-aarch64-unknown-linux-gnu.tar.gz" => {
            "ea25597354af186bdd55aee0de431e16d45d82951a4f41f065a8e4dc27885265"
        }
        "uv-x86_64-apple-darwin.tar.gz" => {
            "1d8ecb2eb3b68fb50e4249dc96ac9d2458dc24068848f04f4c5b42af2fd26552"
        }
        "uv-aarch64-apple-darwin.tar.gz" => {
            "4ea4731010fbd1bc8e790e07f199f55a5c7c2c732e9b77f85e302b0bee61b756"
        }
        "uv-x86_64-pc-windows-msvc.zip" => {
            "93b29fc234758e381df461d7638ff73d0f08bdf3a0dc37923b1ee0b9e442ca3f"
        }
        "uv-aarch64-pc-windows-msvc.zip" => {
            "7b0b3367c4060c9b47b961201ceb4252e97496c890ad1bd13c664bf5b0744d57"
        }
        _ => return None,
    })
}

pub fn verify_sha256(bytes: &[u8], expected: &str) -> Result<(), String> {
    let actual: String = Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    if actual == expected {
        Ok(())
    } else {
        Err(format!(
            "The downloaded uv does not match its published checksum (expected {expected}, got {actual})."
        ))
    }
}

/// Writes only the `uv` executable from a release archive to `target`; other entries,
/// and any path structure in the archive, are ignored.
pub fn extract_uv(archive: &[u8], zip: bool, target: &Path) -> Result<(), String> {
    let wanted = exe("uv");
    let bytes = if zip {
        extract_from_zip(archive, &wanted)?
    } else {
        let mut entries = tar::Archive::new(flate2::read::GzDecoder::new(archive));
        let mut found = None;
        for entry in entries.entries().map_err(|error| error.to_string())? {
            let mut entry = entry.map_err(|error| error.to_string())?;
            let name = entry
                .path()
                .ok()
                .and_then(|path| path.file_name().map(|n| n.to_string_lossy().to_string()));
            if name.as_deref() == Some(wanted.as_str()) && entry.header().entry_type().is_file() {
                let mut bytes = Vec::new();
                entry
                    .read_to_end(&mut bytes)
                    .map_err(|error| error.to_string())?;
                found = Some(bytes);
                break;
            }
        }
        found.ok_or_else(|| "The uv archive has no uv executable.".to_string())?
    };
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    // Stage in a fresh file (create_new never follows or reuses an existing path), then
    // rename over the target; rename replaces a symlink rather than writing through it.
    let partial = target.with_extension(format!(
        "partial-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o755);
    }
    let written = options.open(&partial).and_then(|mut file| {
        use std::io::Write;
        file.write_all(&bytes)?;
        file.sync_all()
    });
    if let Err(error) = written {
        let _ = fs::remove_file(&partial);
        return Err(error.to_string());
    }
    fs::rename(&partial, target).map_err(|error| {
        let _ = fs::remove_file(&partial);
        error.to_string()
    })
}

#[cfg(windows)]
fn extract_from_zip(archive: &[u8], wanted: &str) -> Result<Vec<u8>, String> {
    let mut zip =
        zip::ZipArchive::new(std::io::Cursor::new(archive)).map_err(|error| error.to_string())?;
    for index in 0..zip.len() {
        let mut file = zip.by_index(index).map_err(|error| error.to_string())?;
        let name = Path::new(file.name())
            .file_name()
            .map(|n| n.to_string_lossy().to_string());
        if file.is_file() && !file.is_symlink() && name.as_deref() == Some(wanted) {
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes)
                .map_err(|error| error.to_string())?;
            return Ok(bytes);
        }
    }
    Err("The uv archive has no uv executable.".to_string())
}

#[cfg(not(windows))]
fn extract_from_zip(_archive: &[u8], _wanted: &str) -> Result<Vec<u8>, String> {
    Err("Zip archives are only used on Windows.".to_string())
}

/// An installed `uv`, looking where GUI apps (with a minimal `PATH`) would miss it.
pub fn find_system_uv() -> Option<PathBuf> {
    let name = exe("uv");
    let mut candidates: Vec<PathBuf> = env::var_os("PATH")
        .map(|paths| env::split_paths(&paths).map(|d| d.join(&name)).collect())
        .unwrap_or_default();
    if let Some(home) = env::var_os("HOME").or_else(|| env::var_os("USERPROFILE")) {
        let home = PathBuf::from(home);
        candidates.push(home.join(".local/bin").join(&name));
        candidates.push(home.join(".cargo/bin").join(&name));
    }
    candidates.push(PathBuf::from("/opt/homebrew/bin/uv"));
    candidates.push(PathBuf::from("/usr/local/bin/uv"));
    candidates.into_iter().find(|path| path.is_file())
}

/// A command for one uv step with the private folders and without user configuration.
pub fn uv_command(uv: &Path, root: &Path, args: &[String]) -> Command {
    let mut command = Command::new(uv);
    command
        .arg("--no-config")
        .args(args)
        .env("UV_CACHE_DIR", root.join("cache"))
        .env("UV_PYTHON_INSTALL_DIR", root.join("python"))
        .env("UV_PYTHON_BIN_DIR", root.join("python-bin"))
        .env_remove("VIRTUAL_ENV")
        .env_remove("UV_PYTHON")
        .env_remove("UV_INDEX_URL")
        .env_remove("UV_EXTRA_INDEX_URL")
        .env_remove("PIP_INDEX_URL")
        .env_remove("CONDA_PREFIX");
    command
}

/// The argument lists for the python, venv, and install steps.
pub fn plan(env_dir: &Path, options: &Options) -> (Option<Vec<String>>, Vec<String>, Vec<String>) {
    let python_install = options
        .python
        .is_none()
        .then(|| vec!["python".into(), "install".into(), PINNED_PYTHON.into()]);
    let mut venv = vec!["venv".to_string(), env_dir.display().to_string()];
    match &options.python {
        Some(python) => venv.extend(["--python".into(), python.clone()]),
        None => venv.extend([
            "--python".into(),
            PINNED_PYTHON.into(),
            "--python-preference".into(),
            "only-managed".into(),
        ]),
    }
    let mut install = vec![
        "pip".to_string(),
        "install".to_string(),
        "--python".to_string(),
        venv_bin(env_dir, "python").display().to_string(),
    ];
    install.extend(options.requirements.iter().cloned());
    (python_install, venv, install)
}

/// Runs one step, relaying output lines, until it exits, is cancelled, or times out.
fn run_step(
    mut command: Command,
    on_line: &mut dyn FnMut(String),
    cancel: &AtomicBool,
) -> Result<String, String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let (mut child, handle) =
        process_tree::spawn(&mut command).map_err(|error| error.to_string())?;
    *current_step().lock().unwrap() = Some(handle.clone());
    let (sender, receiver) = mpsc::channel::<(bool, String)>();
    let mut readers = Vec::new();
    for (is_stdout, stream) in [
        (
            true,
            child
                .stdout
                .take()
                .map(|s| Box::new(s) as Box<dyn Read + Send>),
        ),
        (
            false,
            child
                .stderr
                .take()
                .map(|s| Box::new(s) as Box<dyn Read + Send>),
        ),
    ] {
        if let Some(stream) = stream {
            let sender = sender.clone();
            readers.push(std::thread::spawn(move || {
                for line in BufReader::new(stream).lines().map_while(Result::ok) {
                    let _ = sender.send((is_stdout, line));
                }
            }));
        }
    }
    drop(sender);
    let started = Instant::now();
    let mut stdout = String::new();
    let mut handle_line = |(is_stdout, line): (bool, String), stdout: &mut String| {
        if is_stdout {
            stdout.push_str(&line);
            stdout.push('\n');
        }
        if !line.trim().is_empty() {
            on_line(line);
        }
    };
    let outcome = loop {
        match receiver.recv_timeout(Duration::from_millis(100)) {
            Ok(item) => handle_line(item, &mut stdout),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                break child.wait().map_err(|error| error.to_string());
            }
        }
        if cancel.load(Ordering::SeqCst) {
            handle.terminate_blocking(process_tree::TERMINATE_GRACE);
            let _ = child.wait();
            break Err("Cancelled.".to_string());
        }
        if started.elapsed() > STEP_TIMEOUT {
            handle.terminate_blocking(process_tree::TERMINATE_GRACE);
            let _ = child.wait();
            break Err("The step took longer than 20 minutes and was stopped.".to_string());
        }
    };
    for reader in readers {
        let _ = reader.join();
    }
    while let Ok(item) = receiver.try_recv() {
        handle_line(item, &mut stdout);
    }
    *current_step().lock().unwrap() = None;
    let status = outcome?;
    if status.success() {
        Ok(stdout)
    } else {
        Err(format!(
            "exited with status {}",
            status.code().unwrap_or(-1)
        ))
    }
}

pub type Downloader<'a> = &'a dyn Fn(&str) -> Result<Vec<u8>, String>;

fn send(
    report: &mut dyn FnMut(Progress),
    step: &'static str,
    index: usize,
    label: &str,
    state: &'static str,
    line: Option<String>,
) {
    report(Progress {
        step,
        index,
        total: TOTAL_STEPS,
        label: label.to_string(),
        state,
        line,
    });
}

/// Runs a step and forwards each output line as a `running` progress event.
fn relay(
    report: &mut dyn FnMut(Progress),
    step: &'static str,
    index: usize,
    label: &str,
    command: Command,
    cancel: &AtomicBool,
) -> Result<String, String> {
    send(report, step, index, label, "running", None);
    let result = run_step(
        command,
        &mut |line| send(report, step, index, label, "running", Some(line)),
        cancel,
    );
    if result.is_ok() {
        send(report, step, index, label, "done", None);
    }
    result
}

fn locate_uv(
    root: &Path,
    options: &Options,
    download: Downloader,
    report: &mut dyn FnMut(Progress),
) -> Result<(PathBuf, &'static str), String> {
    let private_uv = root.join("uv").join(exe("uv"));
    if let Some(path) = options.uv.clone() {
        return Ok((path, "configured"));
    }
    if private_uv.is_file() {
        return Ok((private_uv, "downloaded"));
    }
    if options.use_system_uv {
        if let Some(path) = find_system_uv() {
            return Ok((path, "system"));
        }
    }
    let asset = uv_asset(env::consts::OS, env::consts::ARCH).ok_or_else(|| {
        "uv has no build for this platform; install uv yourself, then retry.".to_string()
    })?;
    send(
        report,
        "uv",
        1,
        &format!("Downloading uv {PINNED_UV}"),
        "running",
        None,
    );
    let expected = match &options.expected_uv_sha256 {
        Some(digest) => digest.clone(),
        None => pinned_uv_sha256(asset)
            .ok_or_else(|| "No pinned checksum for this uv build.".to_string())?
            .to_string(),
    };
    let archive = download(&uv_url(asset))?;
    verify_sha256(&archive, &expected)?;
    extract_uv(&archive, asset.ends_with(".zip"), &private_uv)?;
    Ok((private_uv, "downloaded"))
}

/// Installs (or upgrades to) the pinned MagAgent in `root`. Emits progress through
/// `report`, honours `cancel`, and writes the manifest only after verification.
pub fn install(
    root: &Path,
    options: &Options,
    download: Downloader,
    report: &mut dyn FnMut(Progress),
    cancel: &AtomicBool,
) -> Result<Manifest, String> {
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    // Owner-only: other local accounts cannot read the environment or swap the private uv.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(root, fs::Permissions::from_mode(0o700))
            .map_err(|error| error.to_string())?;
    }

    // 1. uv
    send(report, "uv", 1, "Finding uv", "running", None);
    let (uv, uv_source) = locate_uv(root, options, download, report)?;
    send(
        report,
        "uv",
        1,
        &format!("Using uv at {} ({uv_source})", uv.display()),
        "done",
        None,
    );

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let env_name = format!("env-{stamp}");
    let env_dir = root.join("envs").join(&env_name);
    let (python_install, venv_args, install_args) = plan(&env_dir, options);
    let discard = |error: String| {
        let _ = fs::remove_dir_all(&env_dir);
        error
    };

    // 2. Python
    match python_install {
        Some(args) => {
            relay(
                report,
                "python",
                2,
                &format!("Installing Python {PINNED_PYTHON}"),
                uv_command(&uv, root, &args),
                cancel,
            )
            .map_err(|error| format!("Python install failed: {error}"))?;
        }
        None => send(
            report,
            "python",
            2,
            &format!(
                "Using Python at {}",
                options.python.as_deref().unwrap_or("")
            ),
            "done",
            None,
        ),
    }

    // 3. Virtual environment
    relay(
        report,
        "venv",
        3,
        "Creating the private environment",
        uv_command(&uv, root, &venv_args),
        cancel,
    )
    .map_err(|error| discard(format!("Creating the environment failed: {error}")))?;

    // 4. MagAgent
    relay(
        report,
        "magent",
        4,
        &format!("Installing {}", options.requirements.join(" ")),
        uv_command(&uv, root, &install_args),
        cancel,
    )
    .map_err(|error| {
        discard(format!(
            "Installing MagAgent failed: {error}. MagAgent {PINNED_MAGENT} must be published on PyPI for the managed install to work."
        ))
    })?;

    // 5. Verify
    let mut version = Command::new(venv_bin(&env_dir, "magent"));
    version.arg("--version");
    let output = relay(
        report,
        "verify",
        5,
        "Checking magent --version",
        version,
        cancel,
    )
    .map_err(|error| discard(format!("The installed magent did not run: {error}")))?;
    if cancel.load(Ordering::SeqCst) {
        return Err(discard("Cancelled.".into()));
    }
    let magent_version = output
        .split_whitespace()
        .last()
        .unwrap_or_default()
        .to_string();

    let previous = read_manifest(root);
    let manifest = Manifest {
        schema: SCHEMA.to_string(),
        magent_version,
        env: env_name.clone(),
        python: options
            .python
            .clone()
            .unwrap_or_else(|| PINNED_PYTHON.to_string()),
        uv: uv.display().to_string(),
        uv_source: uv_source.to_string(),
        requirements: options.requirements.clone(),
        installed_at: (stamp / 1000) as u64,
    };
    let partial = root.join(format!("{MANIFEST}.partial"));
    fs::write(
        &partial,
        serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
    )
    .map_err(|error| discard(error.to_string()))?;
    fs::rename(&partial, root.join(MANIFEST)).map_err(|error| discard(error.to_string()))?;
    if let Some(previous) = previous {
        if previous.env != env_name && Path::new(&previous.env).components().count() == 1 {
            let _ = fs::remove_dir_all(root.join("envs").join(previous.env));
        }
    }
    // The package cache is only useful during the install (and is a full duplicate when
    // uv cannot hardlink), so it is dropped to keep the footprint to Python plus the env.
    let _ = fs::remove_dir_all(root.join("cache"));
    send(
        report,
        "done",
        TOTAL_STEPS,
        &format!("MagAgent {} is installed", manifest.magent_version),
        "done",
        None,
    );
    Ok(manifest)
}

#[derive(Serialize, Debug)]
pub struct Status {
    pub root: String,
    pub installed: Option<Manifest>,
    pub magent: Option<String>,
    pub running: bool,
    pub system_uv: Option<String>,
    pub uv_download_available: bool,
    pub pinned_magent: String,
    pub pinned_python: String,
    pub pinned_uv: String,
}

#[tauri::command]
pub fn managed_install_status() -> Result<Status, String> {
    let root = root()?;
    Ok(Status {
        root: root.display().to_string(),
        installed: read_manifest(root),
        magent: managed_magent_in(root).map(|path| path.display().to_string()),
        running: RUNNING.load(Ordering::SeqCst),
        system_uv: find_system_uv().map(|path| path.display().to_string()),
        uv_download_available: uv_asset(env::consts::OS, env::consts::ARCH).is_some(),
        pinned_magent: PINNED_MAGENT.to_string(),
        pinned_python: PINNED_PYTHON.to_string(),
        pinned_uv: PINNED_UV.to_string(),
    })
}

async fn fetch(url: String) -> Result<Vec<u8>, String> {
    if !url.starts_with("https://github.com/astral-sh/uv/releases/download/") {
        return Err("Refusing to download from an unexpected address.".to_string());
    }
    let client = reqwest::Client::builder()
        .https_only(true)
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|error| format!("Download failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Download failed: {error}"))?;
    if response.content_length().unwrap_or(0) as usize > MAX_UV_ARCHIVE {
        return Err("The uv download is larger than expected.".to_string());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Download failed: {error}"))?;
    if bytes.len() > MAX_UV_ARCHIVE {
        return Err("The uv download is larger than expected.".to_string());
    }
    Ok(bytes.to_vec())
}

struct RunningGuard;
impl Drop for RunningGuard {
    fn drop(&mut self) {
        RUNNING.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
pub async fn managed_install_start(app: AppHandle) -> Result<Manifest, String> {
    let root = root()?.clone();
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("A managed install is already running.".to_string());
    }
    CANCEL.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = RunningGuard;
        let download = |url: &str| tauri::async_runtime::block_on(fetch(url.to_string()));
        let mut report = |progress: Progress| {
            let _ = app.emit(PROGRESS_EVENT, progress);
        };
        let result = install(&root, &Options::from_env(), &download, &mut report, &CANCEL);
        if let Err(error) = &result {
            report(Progress {
                step: "error",
                index: 0,
                total: TOTAL_STEPS,
                label: error.clone(),
                state: if CANCEL.load(Ordering::SeqCst) {
                    "cancelled"
                } else {
                    "failed"
                },
                line: None,
            });
        }
        result
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn managed_install_cancel() -> bool {
    CANCEL.store(true, Ordering::SeqCst);
    if let Some(handle) = current_step().lock().unwrap().clone() {
        handle.terminate(process_tree::TERMINATE_GRACE);
    }
    RUNNING.load(Ordering::SeqCst)
}

/// Deletes the whole managed folder. The renderer confirms first; the path is fixed here.
#[tauri::command]
pub fn managed_install_remove() -> Result<(), String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Err("Cancel the running install first.".to_string());
    }
    let root = root()?;
    if root.exists() {
        fs::remove_dir_all(root).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_root(name: &str) -> PathBuf {
        let root = env::temp_dir().join(format!("mcc-managed-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn pin_matches_the_app_minimum_version() {
        let package: serde_json::Value =
            serde_json::from_str(include_str!("../../package.json")).unwrap();
        assert_eq!(
            package["magAgentCompatibility"]["minimumVersion"],
            PINNED_MAGENT
        );
        assert_eq!(requirements_from(None), vec!["mag-agent==1.4.0"]);
        assert_eq!(
            requirements_from(Some("/src/aais /src/MagAgent".into())),
            vec!["/src/aais", "/src/MagAgent"]
        );
    }

    #[test]
    fn uv_assets_and_checksums() {
        assert_eq!(
            uv_asset("linux", "x86_64"),
            Some("uv-x86_64-unknown-linux-gnu.tar.gz")
        );
        assert_eq!(
            uv_asset("windows", "x86_64"),
            Some("uv-x86_64-pc-windows-msvc.zip")
        );
        assert_eq!(uv_asset("freebsd", "x86_64"), None);
        assert!(uv_url("a.tar.gz")
            .starts_with("https://github.com/astral-sh/uv/releases/download/0.6.14/"));
        for os in ["linux", "macos", "windows"] {
            for arch in ["x86_64", "aarch64"] {
                let digest = pinned_uv_sha256(uv_asset(os, arch).unwrap()).unwrap();
                assert!(digest.len() == 64 && digest.chars().all(|c| c.is_ascii_hexdigit()));
            }
        }
        let expected = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
        assert!(verify_sha256(b"hello", expected).is_ok());
        assert!(verify_sha256(b"hellp", expected).is_err());
    }

    fn tar_gz(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut builder = tar::Builder::new(flate2::write::GzEncoder::new(
            Vec::new(),
            flate2::Compression::fast(),
        ));
        for (path, data) in entries {
            let mut header = tar::Header::new_gnu();
            header.set_size(data.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            builder.append_data(&mut header, path, *data).unwrap();
        }
        builder.into_inner().unwrap().finish().unwrap()
    }

    #[cfg(unix)]
    #[test]
    fn extracts_only_the_uv_executable() {
        let root = temp_root("extract");
        let archive = tar_gz(&[
            ("uv-x86_64-unknown-linux-gnu/uvx", b"uvx"),
            ("uv-x86_64-unknown-linux-gnu/uv", b"#!/bin/sh\necho uv\n"),
        ]);
        let target = root.join("uv/uv");
        extract_uv(&archive, false, &target).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"#!/bin/sh\necho uv\n");
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(&target).unwrap().permissions().mode() & 0o777,
            0o755
        );
        assert!(!root.join("uv/uvx").exists());
        assert!(extract_uv(&tar_gz(&[("x/readme", b"x")]), false, &root.join("b/uv")).is_err());
        let _ = fs::remove_dir_all(root);
    }

    /// A symlink planted where the extracted uv is staged must not redirect the write.
    #[cfg(unix)]
    #[test]
    fn extraction_does_not_follow_a_planted_symlink() {
        let root = temp_root("symlink");
        let victim = root.join("victim.txt");
        fs::write(&victim, "original").unwrap();
        fs::create_dir_all(root.join("uv")).unwrap();
        std::os::unix::fs::symlink(&victim, root.join("uv/uv.partial")).unwrap();
        let archive = tar_gz(&[("uv-dir/uv", b"#!/bin/sh\n")]);
        let _ = extract_uv(&archive, false, &root.join("uv/uv"));
        assert_eq!(fs::read_to_string(&victim).unwrap(), "original");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn plans_keep_everything_in_the_private_folder() {
        let root = Path::new("/data/managed-magent");
        let env_dir = root.join("envs/env-1");
        let options = Options {
            requirements: requirements_from(None),
            ..Options::default()
        };
        let (python, venv, install) = plan(&env_dir, &options);
        assert_eq!(python.unwrap(), vec!["python", "install", "3.12"]);
        assert!(venv.contains(&"only-managed".to_string()));
        assert_eq!(venv[1], env_dir.display().to_string());
        assert_eq!(install.last().unwrap(), "mag-agent==1.4.0");
        assert!(install[3].starts_with("/data/managed-magent/envs/env-1"));

        let command = uv_command(Path::new("uv"), root, &install);
        let args: Vec<_> = command
            .get_args()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        assert_eq!(args[0], "--no-config");
        let envs: std::collections::HashMap<_, _> = command
            .get_envs()
            .map(|(k, v)| {
                (
                    k.to_string_lossy().to_string(),
                    v.map(|v| v.to_string_lossy().to_string()),
                )
            })
            .collect();
        assert_eq!(
            envs["UV_CACHE_DIR"].as_deref(),
            Some("/data/managed-magent/cache")
        );
        assert_eq!(
            envs["UV_PYTHON_INSTALL_DIR"].as_deref(),
            Some("/data/managed-magent/python")
        );
        assert_eq!(
            envs["UV_PYTHON_BIN_DIR"].as_deref(),
            Some("/data/managed-magent/python-bin")
        );
        assert_eq!(envs["VIRTUAL_ENV"], None);
        assert_eq!(envs["UV_INDEX_URL"], None);

        let custom = Options {
            python: Some("/usr/bin/python3".into()),
            requirements: vec!["/src/MagAgent".into()],
            ..Options::default()
        };
        let (python, venv, _) = plan(&env_dir, &custom);
        assert!(python.is_none());
        assert!(!venv.contains(&"only-managed".to_string()));
    }

    #[test]
    fn only_a_complete_manifest_activates_the_managed_binary() {
        let root = temp_root("manifest");
        assert_eq!(managed_magent_in(&root), None);
        let binary = venv_bin(&root.join("envs/env-1"), "magent");
        fs::create_dir_all(binary.parent().unwrap()).unwrap();
        fs::write(&binary, "").unwrap();
        assert_eq!(managed_magent_in(&root), None, "no manifest yet");
        let manifest = Manifest {
            schema: SCHEMA.into(),
            magent_version: "1.4.0".into(),
            env: "env-1".into(),
            python: "3.12".into(),
            uv: "uv".into(),
            uv_source: "system".into(),
            requirements: requirements_from(None),
            installed_at: 1,
        };
        fs::write(root.join(MANIFEST), serde_json::to_vec(&manifest).unwrap()).unwrap();
        assert_eq!(managed_magent_in(&root), Some(binary));
        let escaping = Manifest {
            env: "../../elsewhere".into(),
            ..manifest
        };
        fs::write(root.join(MANIFEST), serde_json::to_vec(&escaping).unwrap()).unwrap();
        assert_eq!(managed_magent_in(&root), None);
        let _ = fs::remove_dir_all(root);
    }

    /// A fake `uv` that records its arguments lets the whole flow, including the
    /// checksum-verified download, run offline.
    #[cfg(unix)]
    #[test]
    fn install_downloads_uv_verifies_and_writes_the_manifest_last() {
        let root = temp_root("flow");
        let script = format!(
            "#!/bin/sh\necho \"$@\" >> {log}\ncase \"$2\" in\n  venv) mkdir -p \"$3/bin\"; printf '#!/bin/sh\\necho MagAgent 1.4.0\\n' > \"$3/bin/magent\"; chmod 755 \"$3/bin/magent\";;\n  pip) mkdir -p \"$UV_CACHE_DIR/archive\"; echo Installed 1 package;;\nesac\n",
            log = root.join("calls.log").display()
        );
        let archive = tar_gz(&[("uv-dir/uv", script.as_bytes())]);
        let digest: String = Sha256::digest(&archive)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        let download = |url: &str| -> Result<Vec<u8>, String> {
            assert!(url.starts_with("https://github.com/astral-sh/uv/releases/download/0.6.14/"));
            Ok(archive.clone())
        };
        // Without the test override, the locally built archive fails the pinned digest.
        let pinned_only = Options {
            requirements: requirements_from(None),
            use_system_uv: false,
            ..Options::default()
        };
        let refused = install(
            &root,
            &pinned_only,
            &download,
            &mut |_| {},
            &AtomicBool::new(false),
        )
        .unwrap_err();
        assert!(refused.contains("does not match"), "{refused}");
        assert!(!root.join("uv/uv").exists());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&root).unwrap().permissions().mode() & 0o777,
                0o700
            );
        }
        let options = Options {
            expected_uv_sha256: Some(digest.clone()),
            ..pinned_only
        };
        let mut events = Vec::new();
        let cancel = AtomicBool::new(false);
        let manifest =
            install(&root, &options, &download, &mut |p| events.push(p), &cancel).unwrap();
        assert_eq!(manifest.magent_version, "1.4.0");
        assert_eq!(manifest.uv_source, "downloaded");
        let calls = fs::read_to_string(root.join("calls.log")).unwrap();
        assert!(calls.contains("--no-config python install 3.12"));
        assert!(calls.contains("mag-agent==1.4.0"));
        assert!(events.iter().any(|e| e.label == "Downloading uv 0.6.14"));
        assert!(managed_magent_in(&root).is_some());
        assert!(!root.join("cache").exists(), "the package cache is dropped");
        assert!(events
            .iter()
            .any(|e| e.line.as_deref() == Some("Installed 1 package")));
        assert_eq!(events.last().unwrap().state, "done");

        // An upgrade builds a new env and removes the old one after the switch.
        std::thread::sleep(Duration::from_millis(5));
        let second = install(&root, &options, &download, &mut |_| {}, &cancel).unwrap();
        assert_ne!(second.env, manifest.env);
        assert!(!root.join("envs").join(&manifest.env).exists());
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn a_failed_step_leaves_no_manifest_and_no_env() {
        let root = temp_root("fail");
        let uv = root.join("fake-uv");
        let mut file = fs::File::create(&uv).unwrap();
        writeln!(file, "#!/bin/sh\nif [ \"$2\" = pip ]; then echo 'No solution for mag-agent==1.4.0' >&2; exit 1; fi\n[ \"$2\" = venv ] && mkdir -p \"$3/bin\"\nexit 0").unwrap();
        drop(file);
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&uv, fs::Permissions::from_mode(0o755)).unwrap();
        let options = Options {
            uv: Some(uv),
            python: Some("/usr/bin/python3".into()),
            requirements: requirements_from(None),
            use_system_uv: false,
            expected_uv_sha256: None,
        };
        let mut lines = Vec::new();
        let error = install(
            &root,
            &options,
            &|_| Err("no network in tests".into()),
            &mut |p| lines.extend(p.line),
            &AtomicBool::new(false),
        )
        .unwrap_err();
        assert!(error.contains("must be published on PyPI"), "{error}");
        assert!(lines.iter().any(|l| l.contains("No solution")));
        assert!(read_manifest(&root).is_none());
        assert_eq!(fs::read_dir(root.join("envs")).unwrap().count(), 0);
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn cancel_stops_the_running_step() {
        let root = temp_root("cancel");
        let cancel = std::sync::Arc::new(AtomicBool::new(false));
        let flag = cancel.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(300));
            flag.store(true, Ordering::SeqCst);
        });
        let mut command = Command::new("sh");
        command.args(["-c", "sleep 30"]);
        let started = Instant::now();
        let error = run_step(command, &mut |_| {}, &cancel).unwrap_err();
        assert_eq!(error, "Cancelled.");
        assert!(started.elapsed() < Duration::from_secs(10));
        let _ = fs::remove_dir_all(root);
    }

    /// Real end-to-end install with a real `uv`. Opt-in: set MCC_TEST_MANAGED_INSTALL=1,
    /// and for offline-safe runs MCC_MANAGED_PYTHON (an existing interpreter) and
    /// MCC_MANAGED_MAGENT_SPEC (local MagAgent sources); MCC_UV_BIN picks the uv.
    #[test]
    fn installs_a_real_magent_with_uv() {
        if env::var("MCC_TEST_MANAGED_INSTALL").is_err() {
            eprintln!("skipped: set MCC_TEST_MANAGED_INSTALL=1");
            return;
        }
        let root = temp_root("real");
        let options = Options::from_env();
        let mut steps = Vec::new();
        let manifest = install(
            &root,
            &options,
            &|_| Err("downloads disabled in this test".into()),
            &mut |p| {
                if p.line.is_none() {
                    eprintln!("[{}/{}] {} {}", p.index, p.total, p.state, p.label);
                    steps.push(p.step);
                }
            },
            &AtomicBool::new(false),
        )
        .unwrap();
        eprintln!("installed MagAgent {}", manifest.magent_version);
        let magent = managed_magent_in(&root).unwrap();
        let output = Command::new(magent).arg("--version").output().unwrap();
        assert!(output.status.success());
        assert!(steps.contains(&"verify"));
        if env::var("MCC_TEST_KEEP").is_err() {
            let _ = fs::remove_dir_all(root);
        }
    }
}
