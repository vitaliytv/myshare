mod youtube;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Завантажуємо app/src-tauri/.env (опціонально — на desktop dev). На Android
    // env вантажиться інакше; .env лишається лише для dev-ергономіки.
    let _ = dotenvy::dotenv();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![youtube::yt_get_transcript]);

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
