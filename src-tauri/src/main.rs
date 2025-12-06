#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_prevent_default::{
    Builder as PreventBuilder,
    KeyboardShortcut,
    ModifierKey::CtrlKey,
};
use tauri_plugin_updater::Builder as UpdaterBuilder;

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_updater::UpdaterExt;
    
    let updater = app.updater().map_err(|e| e.to_string())?;
    
    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            // Prompt user to install
            if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
                return Err(format!("Failed to install update: {}", e));
            }
            Ok(format!("Update {} installed! Please restart the app.", version))
        }
        Ok(None) => Ok("You're already on the latest version!".to_string()),
        Err(e) => Err(format!("Failed to check for updates: {}", e)),
    }
}

fn main() {
  tauri::Builder::default()
    // Auto‑update plugin
    .plugin(UpdaterBuilder::new().build())
    // Block Ctrl+W
    .plugin(
      PreventBuilder::new()
        .shortcut(KeyboardShortcut::with_modifiers("W", &[CtrlKey]))
        .build()
    )
    .invoke_handler(tauri::generate_handler![check_for_updates])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
