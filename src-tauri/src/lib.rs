use tauri;
use tauri::Manager;
use std::sync::Mutex;

mod ws_relay;

// Only compile the media_linux module when building for Linux
#[cfg(target_os = "linux")]
mod media_linux;

#[cfg(desktop)]
use tauri_plugin_prevent_default::{
    Builder as PreventBuilder,
    KeyboardShortcut,
    ModifierKey::CtrlKey,
};

// ── Tauri State ──────────────────────────────────────────────

struct AppState {
    ws_server: Mutex<Option<ws_relay::WsServer>>,
}

// ── Commands ─────────────────────────────────────────────────

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Start the WebSocket relay server (called by the room host).
/// Returns `{ "port": <u16>, "ips": ["x.x.x.x", …] }`.
#[tauri::command]
async fn start_study_server(
    password: String,
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // Stop any existing server first
    {
        let mut guard = state.ws_server.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut srv) = *guard {
            srv.stop();
        }
        *guard = None;
    }

    let server = ws_relay::WsServer::start(password).await?;
    let port = server.port();
    let ips = ws_relay::get_local_ips();

    state
    .ws_server
    .lock()
    .map_err(|e| e.to_string())?
    .replace(server);

    Ok(serde_json::json!({ "port": port, "ips": ips }))
}

/// Stop the WebSocket relay server.
#[tauri::command]
fn stop_study_server(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.ws_server.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut srv) = *guard {
        srv.stop();
    }
    *guard = None;
    Ok(())
}

/// Return the machine's LAN IP addresses.
#[tauri::command]
fn get_local_ips() -> Vec<String> {
    ws_relay::get_local_ips()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
    .manage(AppState {
        ws_server: Mutex::new(None),
    })
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_http::init());

    #[cfg(desktop)]
    let builder = builder.plugin(
        PreventBuilder::new()
        .shortcut(KeyboardShortcut::with_modifiers("W", &[CtrlKey]))
        .build()
    );

    builder
    .setup(|app| {
        let window = app.get_webview_window("main").expect("no main window");

        // Only show the window explicitly if we are on a desktop platform
        #[cfg(desktop)]
        let _ = window.show();

        // Only execute media permissions logic if we are running natively on a Linux desktop
        #[cfg(target_os = "linux")]
        {
            media_linux::setup_media_permissions(&window);
        }

        Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        greet,
        start_study_server,
        stop_study_server,
        get_local_ips
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
