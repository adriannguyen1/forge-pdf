#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

struct ServerState {
    port: u16,
    child: Mutex<Option<CommandChild>>,
}

#[tauri::command]
fn get_server_port(state: tauri::State<ServerState>) -> u16 {
    state.port
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_server_port])
        .setup(|app| {
            // Pick a free port for the sidecar server
            let port = portpicker::pick_unused_port().expect("No free port available");

            // Resolve paths
            let resource_dir = app.path().resource_dir().expect("Failed to get resource dir");
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");

            // Create uploads directory in app data
            let uploads_dir = app_data_dir.join("uploads");
            std::fs::create_dir_all(&uploads_dir).expect("Failed to create uploads dir");

            // Path to bundled Chromium (platform-specific layout)
            let chromium_path = if cfg!(target_os = "macos") {
                resource_dir
                    .join("chromium")
                    .join("chrome-mac-arm64")
                    .join("Google Chrome for Testing.app")
                    .join("Contents")
                    .join("MacOS")
                    .join("Google Chrome for Testing")
            } else if cfg!(target_os = "windows") {
                resource_dir
                    .join("chromium")
                    .join("chrome-win64")
                    .join("chrome.exe")
            } else {
                resource_dir
                    .join("chromium")
                    .join("chrome-linux64")
                    .join("chrome")
            };

            // Spawn the sidecar server
            let shell = app.shell();
            let sidecar_cmd = shell
                .sidecar("server")
                .expect("Failed to create sidecar command")
                .env("PORT", port.to_string())
                .env("UPLOADS_DIR", uploads_dir.to_string_lossy().to_string())
                .env(
                    "CHROMIUM_PATH",
                    chromium_path.to_string_lossy().to_string(),
                );

            let (mut rx, child) = sidecar_cmd.spawn().expect("Failed to spawn server sidecar");

            // Store state for cleanup and IPC
            app.manage(ServerState {
                port,
                child: Mutex::new(Some(child)),
            });

            // Log sidecar output
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let text = String::from_utf8_lossy(&line);
                            println!("[server] {}", text);
                        }
                        CommandEvent::Stderr(line) => {
                            let text = String::from_utf8_lossy(&line);
                            eprintln!("[server:err] {}", text);
                        }
                        CommandEvent::Terminated(payload) => {
                            eprintln!("[server] terminated: {:?}", payload);
                        }
                        _ => {}
                    }
                }
            });

            println!("Sidecar server starting on port {}", port);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle();
                if let Some(state) = app.try_state::<ServerState>() {
                    if let Ok(mut guard) = state.child.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                            println!("Sidecar server killed");
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
