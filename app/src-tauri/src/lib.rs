mod youtube;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_agent::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            youtube::yt_get_transcript,
            youtube::yt_list_languages
        ]);

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    // relaunch() після встановлення оновлення — щоб застосунок сам
    // перезапустився в нову версію, а не чекав ручного рестарту.
    let builder = builder.plugin(tauri_plugin_process::init());

    #[cfg(debug_assertions)]
    let builder = builder.plugin(tauri_plugin_mcp_bridge::init());

    builder
        .setup(|app| {
            // Версія застосунку в заголовку вікна, щоб її було видно без About-діалогу
            #[cfg(desktop)]
            if let Some(window) = tauri::Manager::get_webview_window(app, "main") {
                let _ = window.set_title(&format!("myshare v{}", app.package_info().version));
            }

            // Dev-mode desktop builds aren't OS-registered as the `myshare://` handler
            // via bundling (that only happens for packaged installers) — register the
            // scheme explicitly so `myshare://oauth/callback` reaches this app during
            // `bun run start`. Verify this call against the installed
            // tauri-plugin-deep-link version before relying on it — its dev-registration
            // API has changed across releases.
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register("myshare");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
