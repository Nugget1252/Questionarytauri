#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::env;

fn main() {
    env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    // Also disable webkit's notorious buggy DMA-Buf to avoid Wayland crashes
    env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    questionary_lib::run()
}
