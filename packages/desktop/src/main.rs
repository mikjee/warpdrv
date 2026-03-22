#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use std::thread;
use std::path::PathBuf;
use std::env;

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

fn find_server_binary() -> Option<(String, Vec<String>)> {
    if let Ok(exe_path) = env::current_exe() {
        let exe_dir = exe_path.parent().unwrap_or(std::path::Path::new("."));

        for entry in std::fs::read_dir(exe_dir).ok()? {
            if let Ok(entry) = entry {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("warpcore-server") && !name.ends_with(".sig") {
                    return Some((entry.path().to_string_lossy().to_string(), vec![]));
                }
            }
        }
    }

    let dev_index = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("server")
        .join("src")
        .join("index.ts");

    if dev_index.exists() {
        return Some((
            "npx".to_string(),
            vec![
                "tsx".to_string(),
                dev_index.canonicalize().unwrap_or(dev_index).to_string_lossy().to_string(),
            ],
        ));
    }

    None
}

fn spawn_server() -> Option<Child> {
    let (bin, args) = find_server_binary()?;

    let log_file = std::fs::File::create("/tmp/warpcore-server.log").unwrap();
    let err_file = log_file.try_clone().unwrap();

    // Find resource dir (Tauri puts resources in ../lib/WarpCore/ relative to the binary)
    let resource_dir = env::current_exe().ok()
        .and_then(|p| p.parent().map(|d| d.join("../lib/WarpCore").to_string_lossy().to_string()))
        .unwrap_or_else(|| ".".to_string());

    let mut cmd = Command::new(&bin);
    cmd.args(&args)
        .env("WARPCORE_RESOURCE_DIR", &resource_dir)
        .stdout(log_file)
        .stderr(err_file);

    match cmd.spawn() {
        Ok(c) => {
            println!("[WarpCore] Server spawned: {} {:?} (PID {})", bin, args, c.id());
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

fn navigate_to_app(app: &tauri::AppHandle, port: u16) {
    if let Some(window) = app.get_webview_window("main") {
        let url = format!("http://localhost:{}", port);
        let _ = window.navigate(url.parse().unwrap());
    }
}

fn loading_html(port: u16) -> String {
    format!(r#"
        <html>
        <head><style>
            * {{ box-sizing: border-box; }}
            html, body {{
                margin: 0; padding: 0;
                height: 100%;
                overflow: hidden;
            }}
            body {{
                background: #09090b; color: #e4e4e7;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                display: flex; align-items: center; justify-content: center;
                flex-direction: column; gap: 16px;
            }}
            .spinner {{
                width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.08);
                border-top-color: #3381ff; border-radius: 50%;
                animation: spin 0.8s linear infinite;
            }}
            @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
            .text {{ font-size: 14px; color: rgba(255,255,255,0.4); }}
            .sub {{ font-size: 11px; color: rgba(255,255,255,0.2); margin-top: 4px; }}
        </style></head>
        <body>
            <div class="spinner"></div>
            <div class="text">Starting WarpCore...</div>
            <div class="sub">Waiting for server on port {port}</div>
            <script>
                setInterval(() => {{
                    fetch('http://localhost:{port}/api/health')
                        .then(r => r.json())
                        .then(d => {{ if (d.ok) window.location.href = 'http://localhost:{port}'; }})
                        .catch(() => {{}});
                }}, 1000);
            </script>
        </body>
        </html>
    "#, port = port)
}

// Autostart is handled by the tauri-plugin-autostart built-in commands:
// - autostart:enable - enables autostart
// - autostart:disable - disables autostart
// - autostart:is_enabled - checks if autostart is enabled

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b = match chunk.len() {
            3 => [chunk[0], chunk[1], chunk[2]],
            2 => [chunk[0], chunk[1], 0],
            1 => [chunk[0], 0, 0],
            _ => unreachable!(),
        };
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | (b[2] as u32);
        result.push(CHARS[((n >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((n >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 { result.push(CHARS[((n >> 6) & 0x3F) as usize] as char); } else { result.push('='); }
        if chunk.len() > 2 { result.push(CHARS[(n & 0x3F) as usize] as char); } else { result.push('='); }
    }
    result
}

fn main() {
    let server_port: u16 = 4400;

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(ServerProcess(Mutex::new(None)))
        .manage(ServerPort(server_port))
        .setup(move |app| {
            // Show loading page immediately
            if let Some(window) = app.get_webview_window("main") {
                let html = loading_html(server_port);
                let data_url = format!(
                    "data:text/html;base64,{}",
                    base64_encode(html.as_bytes())
                );
                let _ = window.navigate(data_url.parse().unwrap());
                let _ = window.show();
            }

            // Spawn server in background
            let app_handle = app.handle().clone();
            thread::spawn(move || {
                let port = server_port;

                if !is_server_running(port) {
                    let child = spawn_server();
                    if let Some(c) = child {
                        *app_handle.state::<ServerProcess>().0.lock().unwrap() = Some(c);
                    }
                    let ready = wait_for_server(port, 60);
                    if ready {
                        println!("[WarpCore] Server ready on port {}", port);
                        navigate_to_app(&app_handle, port);
                    } else {
                        eprintln!("[WarpCore] Server did not start within 60s");
                    }
                } else {
                    println!("[WarpCore] Server already running on port {}", port);
                    navigate_to_app(&app_handle, port);
                }

                // Health monitor
                let mut was_running = true;
                loop {
                    thread::sleep(Duration::from_secs(3));
                    let running = is_server_running(port);

                    if was_running && !running {
                        println!("[WarpCore] Server died, respawning...");
                        let _ = app_handle.emit("server-status", "disconnected");
                        let child = spawn_server();
                        if let Some(c) = child {
                            *app_handle.state::<ServerProcess>().0.lock().unwrap() = Some(c);
                            if wait_for_server(port, 30) {
                                println!("[WarpCore] Server respawned");
                                let _ = app_handle.emit("server-status", "connected");
                                navigate_to_app(&app_handle, port);
                            }
                        }
                    } else if !was_running && running {
                        println!("[WarpCore] Server connection restored");
                        let _ = app_handle.emit("server-status", "connected");
                        navigate_to_app(&app_handle, port);
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
                                    navigate_to_app(&app_clone, port);
                                }
                            });
                        }
                    }
                    "quit" => {
                        // First, stop all llama-server instances via API
                        if is_server_running(server_port) {
                            let _ = reqwest::blocking::Client::new()
                                .post(format!("http://localhost:{}/api/servers/stop-all", server_port))
                                .send();
                            thread::sleep(Duration::from_millis(500));
                        }

                        // Then kill the Node.js server process
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

            // Close to tray
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running WarpCore Desktop");
}
