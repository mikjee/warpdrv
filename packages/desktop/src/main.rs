#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use std::thread;

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter,
    Manager,
};

struct ServerProcess(Mutex<Option<Child>>);
struct ServerPort(u16);

fn is_server_running(port: u16) -> bool {
    std::net::TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", port).parse().unwrap(),
        Duration::from_millis(500),
    )
    .is_ok()
}

fn spawn_server() -> Option<Child> {
    let child = Command::new("npx")
        .args(["tsx", "packages/server/src/index.ts"])
        .current_dir(env!("CARGO_MANIFEST_DIR").to_string() + "/../..")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn();

    match child {
        Ok(c) => {
            println!("[WarpCore] Server spawned with PID {}", c.id());
            Some(c)
        }
        Err(e) => {
            eprintln!("[WarpCore] Failed to spawn server: {}", e);
            None
        }
    }
}

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
        .manage(ServerPort(server_port))
        .setup(move |app| {
            // Spawn server if not already running
            if !is_server_running(server_port) {
                let child = spawn_server();
                if let Some(c) = child {
                    *app.state::<ServerProcess>().0.lock().unwrap() = Some(c);
                }
                let ready = wait_for_server(server_port, 30);
                if !ready {
                    eprintln!("[WarpCore] Server did not start within 30s");
                }
            } else {
                println!("[WarpCore] Server already running on port {}", server_port);
            }

            // Health monitor — background thread detects server death and respawns
            let app_handle = app.handle().clone();
            thread::spawn(move || {
                let mut was_running = true;
                loop {
                    thread::sleep(Duration::from_secs(3));

                    let port = app_handle.state::<ServerPort>().0;
                    let running = is_server_running(port);

                    if was_running && !running {
                        println!("[WarpCore] Server connection lost, attempting respawn...");
                        let _ = app_handle.emit("server-status", "disconnected");

                        let child = spawn_server();
                        if let Some(c) = child {
                            *app_handle.state::<ServerProcess>().0.lock().unwrap() = Some(c);
                            let recovered = wait_for_server(port, 30);
                            if recovered {
                                println!("[WarpCore] Server respawned successfully");
                                let _ = app_handle.emit("server-status", "connected");
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    let url = format!("http://localhost:{}", port);
                                    let _ = window.navigate(url.parse().unwrap());
                                }
                            } else {
                                eprintln!("[WarpCore] Server respawn failed");
                                let _ = app_handle.emit("server-status", "failed");
                            }
                        }
                    } else if !was_running && running {
                        println!("[WarpCore] Server connection restored");
                        let _ = app_handle.emit("server-status", "connected");
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let url = format!("http://localhost:{}", port);
                            let _ = window.navigate(url.parse().unwrap());
                        }
                    }

                    was_running = running;
                }
            });

            // Tray menu
            let open_item = MenuItemBuilder::with_id("open", "Open WarpCore").build(app)?;
            let hide_item = MenuItemBuilder::with_id("hide", "Hide Window").build(app)?;
            let restart_item = MenuItemBuilder::with_id("restart", "Restart Server").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&open_item)
                .item(&hide_item)
                .separator()
                .item(&restart_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::with_id("warpcore-tray")
                .icon(Image::from_bytes(include_bytes!("../icons/icon.png"))?)
                .menu(&menu)
                .show_menu_on_left_click(false)
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
                    "restart" => {
                        if let Some(mut child) = app.state::<ServerProcess>().0.lock().unwrap().take() {
                            let _ = child.kill();
                        }
                        let child = spawn_server();
                        if let Some(c) = child {
                            *app.state::<ServerProcess>().0.lock().unwrap() = Some(c);
                            let port = app.state::<ServerPort>().0;
                            let app_clone = app.clone();
                            thread::spawn(move || {
                                if wait_for_server(port, 30) {
                                    let _ = app_clone.emit("server-status", "connected");
                                    if let Some(window) = app_clone.get_webview_window("main") {
                                        let url = format!("http://localhost:{}", port);
                                        let _ = window.navigate(url.parse().unwrap());
                                    }
                                }
                            });
                        }
                    }
                    "quit" => {
                        if let Some(mut child) = app.state::<ServerProcess>().0.lock().unwrap().take() {
                            let _ = child.kill();
                            println!("[WarpCore] Server process killed");
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

            // Intercept window close — hide to tray
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            // Show window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running WarpCore Desktop");
}