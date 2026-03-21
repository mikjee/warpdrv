#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use std::thread;

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Manager,
};

// Track the server child process
struct ServerProcess(Mutex<Option<Child>>);

// Check if the server is already running on the given port
fn is_server_running(port: u16) -> bool {
    std::net::TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", port).parse().unwrap(),
        Duration::from_millis(500),
    )
    .is_ok()
}

// Spawn the WarpCore server as a child process
fn spawn_server() -> Option<Child> {
    // Try to find the server entrypoint relative to the executable
    // In dev: run tsx directly
    // In production: the server would be bundled as a sidecar or run via node
    let child = Command::new("npx")
        .args(["tsx", "packages/server/src/index.ts"])
        .current_dir(env!("CARGO_MANIFEST_DIR").to_string() + "/../..")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn();

    match child {
        Ok(c) => {
            println!("[WarpCore Desktop] Server spawned with PID {}", c.id());
            Some(c)
        }
        Err(e) => {
            eprintln!("[WarpCore Desktop] Failed to spawn server: {}", e);
            None
        }
    }
}

// Wait for server to become ready
fn wait_for_server(port: u16, timeout_secs: u64) -> bool {
    let start = std::time::Instant::now();
    while start.elapsed() < Duration::from_secs(timeout_secs) {
        if is_server_running(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(500));
    }
    false
}

fn main() {
    let server_port: u16 = 4400;

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerProcess(Mutex::new(None)))
        .setup(move |app| {
            // Spawn server if not already running
            if !is_server_running(server_port) {
                let child = spawn_server();
                if let Some(c) = child {
                    *app.state::<ServerProcess>().0.lock().unwrap() = Some(c);
                }

                // Wait for server to be ready before showing window
                let ready = wait_for_server(server_port, 30);
                if !ready {
                    eprintln!("[WarpCore Desktop] Server did not start within 30s");
                }
            } else {
                println!("[WarpCore Desktop] Server already running on port {}", server_port);
            }

            // Build tray menu
            let open_item = MenuItemBuilder::with_id("open", "Open WarpCore")
                .build(app)?;
            let hide_item = MenuItemBuilder::with_id("hide", "Hide Window")
                .build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit")
                .build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&open_item)
                .item(&hide_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::with_id("warpcore-tray")
                .icon(Image::from_bytes(include_bytes!("../icons/icon.png"))?)
                .menu(&menu)
                .menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => {
                        // Kill server process if we spawned it
                        if let Some(mut child) = app
                            .state::<ServerProcess>()
                            .0
                            .lock()
                            .unwrap()
                            .take()
                        {
                            let _ = child.kill();
                            println!("[WarpCore Desktop] Server process killed");
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button, .. } = event {
                        if button == tauri::tray::MouseButton::Left {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    }
                })
                .build(app)?;

            // Show window once ready
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running WarpCore Desktop");
}
