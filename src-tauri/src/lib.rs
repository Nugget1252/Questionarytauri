use tauri;
use tauri::Manager;
use std::sync::Mutex;
use std::path::PathBuf;

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

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let cwd_db = std::env::current_dir()
        .map_err(|e| e.to_string())?
        .join("database.db");

    if cwd_db.exists() {
        return Ok(cwd_db);
    }

    app.path().resolve("database.db", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())
}

fn rows_to_tree(rows: Vec<(String, String, String, String, String)>) -> serde_json::Value {
    let mut root = serde_json::Map::new();

    for (year, class_name, term, subject, file_path) in rows {
        let year_entry = root.entry(year).or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
        let year_map = year_entry.as_object_mut().unwrap();

        let class_entry = year_map.entry(class_name).or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
        let class_map = class_entry.as_object_mut().unwrap();

        let term_entry = class_map.entry(term).or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
        let term_map = term_entry.as_object_mut().unwrap();

        term_map.insert(subject, serde_json::Value::String(file_path));
    }

    serde_json::Value::Object(root)
}

#[tauri::command]
fn get_papers(app: tauri::AppHandle, year: Option<String>, term: Option<String>, subject: Option<String>) -> Result<serde_json::Value, String> {
    let db_path = database_path(&app)?;
    let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut query = String::from("SELECT year, class_name, term, subject, file_path FROM papers WHERE 1=1");
    let mut params: Vec<String> = Vec::new();

    if let Some(value) = year {
        query.push_str(" AND year = ?");
        params.push(value);
    }
    if let Some(value) = term {
        query.push_str(" AND term = ?");
        params.push(value);
    }
    if let Some(value) = subject {
        query.push_str(" AND subject = ?");
        params.push(value);
    }

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let rows_iter = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut rows = Vec::new();
    for row in rows_iter {
        rows.push(row.map_err(|e| e.to_string())?);
    }

    Ok(serde_json::json!(rows))
}

#[tauri::command]
fn get_documents_tree(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let db_path = database_path(&app)?;
    let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT year, class_name, term, subject, file_path FROM papers ORDER BY year, class_name, term, subject").map_err(|e| e.to_string())?;
    let rows_iter = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut rows = Vec::new();
    for row in rows_iter {
        rows.push(row.map_err(|e| e.to_string())?);
    }

    Ok(rows_to_tree(rows))
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
        get_local_ips,
        get_papers,
        get_documents_tree
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
