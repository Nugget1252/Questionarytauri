#[cfg(any(
target_os = "linux",
target_os = "dragonfly",
target_os = "freebsd",
target_os = "netbsd",
target_os = "openbsd"
))]
pub fn setup_media_permissions(window: &tauri::WebviewWindow) {
    use webkit2gtk::{PermissionRequestExt, SettingsExt, WebViewExt};
    let _ = window.with_webview(|webview| {
        let view: webkit2gtk::WebView = webview.inner();

        if let Some(settings) = view.settings() {
            settings.set_enable_media_stream(true);
            settings.set_enable_webrtc(true);
            settings.set_enable_mediasource(true);
            settings.set_media_playback_allows_inline(true);
            settings.set_javascript_can_access_clipboard(true);
            settings.set_enable_developer_extras(true);
            settings.set_enable_mock_capture_devices(false);
            settings.set_enable_media_capabilities(true);
        }

        view.connect_permission_request(|_, req| {
            req.allow();
            true
        });
    });
}

#[cfg(not(any(
target_os = "linux",
target_os = "dragonfly",
target_os = "freebsd",
target_os = "netbsd",
target_os = "openbsd"
)))]
pub fn setup_media_permissions(_window: &tauri::WebviewWindow) {
    // No-op on Windows/macOS/Android/iOS
}
