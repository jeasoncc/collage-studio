#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_native_save::init())
        .plugin(tauri::plugin::Builder::<_, ()>::new("local-navigation")
            .on_navigation(|webview, url| {
                #[cfg(dev)]
                use tauri::Manager;
                let local = (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                    || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost"));
                if local { return true; }
                #[cfg(dev)]
                if let Some(dev_url) = &webview.app_handle().config().build.dev_url {
                    return url.origin() == dev_url.origin();
                }
                let _ = webview;
                false
            })
            .build())
        .run(tauri::generate_context!())
        .expect("failed to run 拼贴时光");
}
