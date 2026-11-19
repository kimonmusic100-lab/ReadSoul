pub mod search;
pub mod workspace;

use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use workspace::{SharedWorkspace, Workspace};

struct StartupFileOpened(AtomicBool);
struct PendingOpenFiles(Mutex<Vec<String>>);

fn resolve_cli_files<I, S>(args: I, base_dir: Option<&Path>) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let mut out = Vec::new();
    for arg in args.into_iter().skip(1) {
        let raw = PathBuf::from(arg.as_ref());
        let text = raw.to_string_lossy();
        if text.is_empty() || text.starts_with('-') {
            continue;
        }
        let candidate = if raw.is_absolute() {
            raw
        } else if let Some(base) = base_dir {
            base.join(raw)
        } else {
            raw
        };
        if !candidate.is_file() {
            continue;
        }
        let canonical = std::fs::canonicalize(&candidate).unwrap_or(candidate);
        let raw_str = canonical.to_string_lossy();
        let norm = raw_str.strip_prefix(r"\\?\").unwrap_or(&raw_str).to_string();
        if !out.contains(&norm) {
            out.push(norm);
        }
    }
    out
}

#[tauri::command]
fn readsoul_call(
    state: tauri::State<'_, SharedWorkspace>,
    method: String,
    args: Vec<Value>,
    locale: Option<String>,
) -> Result<Value, String> {
    let mut ws = state.lock().map_err(|e| e.to_string())?;
    let loc = locale.unwrap_or_else(|| "zh-Hans".to_string());
    ws.handle_rpc(&method, &args, &loc)
}

#[tauri::command]
fn readsoul_consume_startup_file(state: tauri::State<'_, StartupFileOpened>) -> bool {
    state.0.swap(false, Ordering::SeqCst)
}

#[tauri::command]
fn readsoul_take_pending_files(state: tauri::State<'_, PendingOpenFiles>) -> Vec<String> {
    if let Ok(mut pending) = state.0.lock() {
        std::mem::take(&mut *pending)
    } else {
        Vec::new()
    }
}

#[tauri::command]
async fn readsoul_pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || {
        Ok(app.dialog().file().blocking_pick_folder().map(|p| {
            let s = p.to_string();
            s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn readsoul_reveal_path(path: String) -> Result<(), String> {
    let target = PathBuf::from(path.trim());
    if !target.exists() {
        return Err("路径不存在".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        if target.is_dir() {
            std::process::Command::new("explorer")
                .arg(&target)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            std::process::Command::new("explorer")
                .arg(format!("/select,{}", target.to_string_lossy()))
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = target;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let paths = resolve_cli_files(argv, Some(Path::new(&cwd)));
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            if !paths.is_empty() {
                if let Some(pending) = app.try_state::<PendingOpenFiles>() {
                    if let Ok(mut queue) = pending.0.lock() {
                        for p in &paths {
                            if !queue.contains(p) {
                                queue.push(p.clone());
                            }
                        }
                    }
                }
                let _ = app.emit("readsoul://open-files", ());
            }
        }))
        .setup(|app| {
            let root = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from(".readsoul-data"));
            let mut ws = Workspace::open_workspace(root)
                .expect("Failed to open ReadSoul workspace");
            let mut opened_from_cli = false;
            for file in resolve_cli_files(std::env::args_os(), None) {
                if ws.open_file_path(Path::new(&file), "zh-Hans").is_ok() {
                    opened_from_cli = true;
                }
            }
            app.manage(Mutex::new(ws));
            app.manage(StartupFileOpened(AtomicBool::new(opened_from_cli)));
            app.manage(PendingOpenFiles(Mutex::new(Vec::new())));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            readsoul_call,
            readsoul_consume_startup_file,
            readsoul_take_pending_files,
            readsoul_pick_folder,
            readsoul_reveal_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running ReadSoul Tauri application");
}
