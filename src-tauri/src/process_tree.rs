//! Spawn child processes so that cancelling a run stops everything the run started.
//!
//! Killing only the direct child leaves grandchildren (shell tools, test runners, dev
//! servers started by MagAgent) running after the user presses Stop. Each spawned child
//! therefore gets its own process tree boundary:
//!
//! - Unix: the child leads a new process group (`process_group(0)`). Cancelling sends
//!   `SIGTERM` to the whole group, waits up to a grace period for the group to exit, then
//!   sends `SIGKILL` to whatever is left.
//! - Windows: the child is assigned to a Job Object created with
//!   `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. Cancelling terminates the job; closing the last
//!   handle (when the run ends or the app exits) also terminates anything still in it.
use std::io;
use std::process::{Child, Command};
use std::sync::Arc;
use std::time::Duration;

/// How long a cancelled process group gets to exit after `SIGTERM` before `SIGKILL`.
pub const TERMINATE_GRACE: Duration = Duration::from_secs(3);

/// Marks a command so the spawned child becomes the root of its own killable tree.
pub fn prepare(command: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(not(unix))]
    {
        let _ = command;
    }
}

/// Spawns a prepared command and returns the child with a handle for its whole tree.
pub fn spawn(command: &mut Command) -> io::Result<(Child, TreeHandle)> {
    prepare(command);
    let child = command.spawn()?;
    let handle = TreeHandle::attach(&child);
    Ok((child, handle))
}

/// A cloneable handle that can stop a child and every process it started.
#[derive(Clone)]
pub struct TreeHandle {
    inner: Arc<Inner>,
}

struct Inner {
    #[cfg(unix)]
    pgid: i32,
    #[cfg(windows)]
    job: Option<windows::Job>,
    #[cfg(windows)]
    pid: u32,
}

impl TreeHandle {
    fn attach(child: &Child) -> Self {
        #[cfg(unix)]
        {
            // process_group(0) makes the child's PID its process group ID.
            TreeHandle {
                inner: Arc::new(Inner {
                    pgid: child.id() as i32,
                }),
            }
        }
        #[cfg(windows)]
        {
            TreeHandle {
                inner: Arc::new(Inner {
                    job: windows::Job::for_child(child),
                    pid: child.id(),
                }),
            }
        }
        #[cfg(not(any(unix, windows)))]
        {
            let _ = child;
            TreeHandle {
                inner: Arc::new(Inner {}),
            }
        }
    }

    /// Starts stopping the tree and returns immediately. On Unix a background thread
    /// escalates from `SIGTERM` to `SIGKILL` after `grace`. Returns false when no signal
    /// could be delivered (for example, the tree had already exited).
    pub fn terminate(&self, grace: Duration) -> bool {
        #[cfg(unix)]
        {
            if !unix::signal_group(self.inner.pgid, libc::SIGTERM) {
                return false;
            }
            let handle = self.clone();
            std::thread::spawn(move || handle.escalate(grace));
            true
        }
        #[cfg(not(unix))]
        {
            let _ = grace;
            self.kill_now()
        }
    }

    /// Stops the tree and blocks until it is gone or `SIGKILL` has been sent. Returns
    /// true when the tree is confirmed gone. Runs use the non-blocking `terminate`; the
    /// managed install (already on a worker thread) and tests use this to know the step
    /// is gone before cleaning up after it.
    pub fn terminate_blocking(&self, grace: Duration) -> bool {
        #[cfg(unix)]
        {
            if !unix::signal_group(self.inner.pgid, libc::SIGTERM) {
                return !unix::group_alive(self.inner.pgid);
            }
            self.escalate(grace)
        }
        #[cfg(not(unix))]
        {
            let _ = grace;
            self.kill_now()
        }
    }

    /// Kills the tree immediately, without a grace period.
    pub fn kill_now(&self) -> bool {
        #[cfg(unix)]
        {
            unix::signal_group(self.inner.pgid, libc::SIGKILL)
        }
        #[cfg(windows)]
        {
            match &self.inner.job {
                Some(job) => job.terminate(),
                None => windows::terminate_pid(self.inner.pid),
            }
        }
        #[cfg(not(any(unix, windows)))]
        {
            false
        }
    }

    #[cfg(unix)]
    fn escalate(&self, grace: Duration) -> bool {
        let pgid = self.inner.pgid;
        let deadline = std::time::Instant::now() + grace;
        // A zombie group leader still counts as a member until its parent reaps it, so
        // the caller's wait loop must keep reaping while this polls.
        while std::time::Instant::now() < deadline {
            if !unix::group_alive(pgid) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        unix::signal_group(pgid, libc::SIGKILL);
        let settle = std::time::Instant::now() + Duration::from_secs(2);
        while std::time::Instant::now() < settle {
            if !unix::group_alive(pgid) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        !unix::group_alive(pgid)
    }
}

#[cfg(unix)]
mod unix {
    /// Sends `signal` to every process in the group. Returns false if nothing received it.
    pub fn signal_group(pgid: i32, signal: i32) -> bool {
        if pgid <= 1 {
            return false;
        }
        // SAFETY: kill(2) with a negative PID only signals the given process group.
        unsafe { libc::kill(-pgid, signal) == 0 }
    }

    /// True while any process (including an unreaped zombie) remains in the group.
    pub fn group_alive(pgid: i32) -> bool {
        if pgid <= 1 {
            return false;
        }
        // SAFETY: signal 0 performs permission and existence checks only.
        let result = unsafe { libc::kill(-pgid, 0) };
        result == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
    }
}

#[cfg(windows)]
mod windows {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};

    /// An owned Job Object handle. Closing it kills every process still in the job.
    pub struct Job(HANDLE);

    // SAFETY: a job handle is a kernel object reference that may be used from any thread.
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    impl Job {
        /// Creates a kill-on-close job and assigns the child to it. Processes the child
        /// starts afterwards join the job automatically. Returns None if the platform
        /// refuses (the caller then falls back to terminating the direct child).
        pub fn for_child(child: &Child) -> Option<Self> {
            // SAFETY: plain Win32 calls on handles owned by this function or by `child`.
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle.is_null() {
                    return None;
                }
                let job = Job(handle);
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                if SetInformationJobObject(
                    job.0,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const core::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                ) == 0
                {
                    return None;
                }
                if AssignProcessToJobObject(job.0, child.as_raw_handle() as HANDLE) == 0 {
                    return None;
                }
                Some(job)
            }
        }

        pub fn terminate(&self) -> bool {
            // SAFETY: the handle is valid for the lifetime of `self`.
            unsafe { TerminateJobObject(self.0, 1) != 0 }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            // SAFETY: the handle was created by CreateJobObjectW and is closed once.
            unsafe {
                CloseHandle(self.0);
            }
        }
    }

    pub fn terminate_pid(pid: u32) -> bool {
        // SAFETY: the process handle is opened, used, and closed within this function.
        unsafe {
            let process = OpenProcess(PROCESS_TERMINATE, 0, pid);
            if process.is_null() {
                return false;
            }
            let ok = TerminateProcess(process, 1) != 0;
            CloseHandle(process);
            ok
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::process::Stdio;
    use std::time::Instant;

    fn read_grandchild_pid(child: &mut Child) -> u32 {
        // The first non-empty line is the pid; skip blank lines a console host may emit.
        let stdout = child.stdout.take().expect("piped stdout");
        let mut reader = BufReader::new(stdout);
        loop {
            let mut line = String::new();
            let read = reader.read_line(&mut line).expect("grandchild pid line");
            assert!(read > 0, "stdout closed before the grandchild pid");
            if !line.trim().is_empty() {
                return line.trim().parse().expect("numeric grandchild pid");
            }
        }
    }

    #[cfg(target_os = "linux")]
    fn process_gone(pid: u32) -> bool {
        // An orphaned grandchild is reparented and reaped by init; until then it is a
        // zombie, which no longer runs anything.
        match std::fs::read_to_string(format!("/proc/{pid}/stat")) {
            Ok(stat) => stat
                .rsplit(')')
                .next()
                .map(|rest| rest.trim_start().starts_with('Z'))
                .unwrap_or(false),
            Err(_) => true,
        }
    }

    #[cfg(all(unix, not(target_os = "linux")))]
    fn process_gone(pid: u32) -> bool {
        // SAFETY: signal 0 checks existence only.
        unsafe { libc::kill(pid as i32, 0) != 0 }
    }

    #[cfg(unix)]
    fn wait_until_gone(pid: u32) -> bool {
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if process_gone(pid) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        false
    }

    /// Runs `terminate_blocking` while reaping the direct child, as the stream loop does.
    #[cfg(unix)]
    fn terminate_and_reap(mut child: Child, handle: TreeHandle, grace: Duration) -> bool {
        let reaper = std::thread::spawn(move || child.wait());
        let gone = handle.terminate_blocking(grace);
        reaper.join().expect("reaper thread").expect("child wait");
        gone
    }

    #[cfg(unix)]
    #[test]
    fn cancel_stops_grandchildren_that_honor_sigterm() {
        let mut command = Command::new("sh");
        command
            .args(["-c", "sleep 60 & echo $!; wait"])
            .stdout(Stdio::piped());
        let (mut child, handle) = spawn(&mut command).expect("spawn shell");
        let grandchild = read_grandchild_pid(&mut child);
        assert!(!process_gone(grandchild), "grandchild should be running");

        let started = Instant::now();
        assert!(terminate_and_reap(child, handle, Duration::from_secs(5)));
        assert!(wait_until_gone(grandchild), "grandchild survived SIGTERM");
        assert!(
            started.elapsed() < Duration::from_secs(4),
            "SIGTERM path should not wait for the SIGKILL escalation"
        );
    }

    #[cfg(unix)]
    #[test]
    fn cancel_escalates_to_sigkill_when_the_tree_ignores_sigterm() {
        let mut command = Command::new("sh");
        // An ignored disposition is inherited across fork and exec, so both the shell
        // and the sleeping grandchild ignore SIGTERM.
        command
            .args(["-c", "trap '' TERM; sleep 60 & echo $!; wait"])
            .stdout(Stdio::piped());
        let (mut child, handle) = spawn(&mut command).expect("spawn shell");
        let grandchild = read_grandchild_pid(&mut child);

        let started = Instant::now();
        assert!(terminate_and_reap(
            child,
            handle,
            Duration::from_millis(300)
        ));
        assert!(started.elapsed() >= Duration::from_millis(300));
        assert!(wait_until_gone(grandchild), "grandchild survived SIGKILL");
    }

    #[cfg(unix)]
    #[test]
    fn terminating_an_exited_tree_reports_nothing_to_signal() {
        let mut command = Command::new("sh");
        command.args(["-c", "exit 0"]);
        let (mut child, handle) = spawn(&mut command).expect("spawn shell");
        child.wait().expect("wait");
        assert!(!handle.terminate(Duration::from_millis(10)));
        assert!(handle.terminate_blocking(Duration::from_millis(10)));
    }

    #[cfg(windows)]
    #[test]
    fn cancel_stops_grandchildren_through_the_job_object() {
        use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
        use windows_sys::Win32::System::Threading::{
            GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
        };

        fn running(pid: u32) -> bool {
            unsafe {
                let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                if process.is_null() {
                    return false;
                }
                let mut code = 0u32;
                let ok = GetExitCodeProcess(process, &mut code) != 0;
                CloseHandle(process);
                ok && code == STILL_ACTIVE as u32
            }
        }

        let mut command = Command::new("powershell");
        command
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "$p = Start-Process -PassThru -NoNewWindow -FilePath powershell -ArgumentList '-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 60'; [Console]::Out.WriteLine($p.Id); [Console]::Out.Flush(); Wait-Process -Id $p.Id",
            ])
            .stdout(Stdio::piped());
        let (mut child, handle) = spawn(&mut command).expect("spawn powershell");
        let grandchild = read_grandchild_pid(&mut child);
        assert!(running(grandchild), "grandchild should be running");

        assert!(handle.terminate(TERMINATE_GRACE));
        child.wait().expect("wait");
        let deadline = Instant::now() + Duration::from_secs(10);
        while running(grandchild) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(!running(grandchild), "grandchild survived job termination");
    }
}
