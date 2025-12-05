#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_prevent_default::{
    Builder as PreventBuilder,
    KeyboardShortcut,
    ModifierKey::CtrlKey,
};
use tauri_plugin_updater::Builder as UpdaterBuilder;

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
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
