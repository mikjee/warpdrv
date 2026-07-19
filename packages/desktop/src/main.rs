#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager,
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
                    let path_str = entry.path().to_string_lossy().to_string();
                    // Strip Windows \\?\ UNC prefix that crashes Node.js realpathSync
                    let cleaned = path_str
                        .strip_prefix(r"\\?\")
                        .unwrap_or(&path_str)
                        .to_string();
                    return Some((cleaned, vec![]));
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
                dev_index
                    .canonicalize()
                    .unwrap_or(dev_index)
                    .to_string_lossy()
                    .to_string(),
            ],
        ));
    }

    None
}

fn get_server_port() -> u16 {
    // Check env var first (for dev/override), then read from settings, default to 4400
    if let Ok(env_port) = std::env::var("CONTROL_API_PORT") {
        if let Ok(port) = env_port.parse::<u16>() {
            if port >= 1 && port <= 65535 {
                return port;
            }
        }
    }

    // Try to read from settings file
    let config_dir = match std::env::var("XDG_CONFIG_HOME") {
        Ok(path) if !path.is_empty() => PathBuf::from(path),
        _ => std::env::var_os("HOME")
            .map(|h| PathBuf::from(h).join(".config"))
            .filter(|p| p.exists())
            .unwrap_or_else(|| std::env::current_dir().ok().unwrap()),
    };

    let data_path = config_dir.join("warpcore").join("warpcore-data.json");
    if !data_path.exists() {
        return 4400;
    }

    if let Ok(content) = std::fs::read_to_string(&data_path) {
        // Simple JSON parsing - look for "apiPort":NUMBER pattern
        if let Some(api_port_str) = content
            .split("\"apiPort\"")
            .nth(1)
            .and_then(|s| s.split(':').next())
        {
            let trimmed = api_port_str
                .trim()
                .split(',')
                .next()
                .unwrap_or("")
                .split('}')
                .next()
                .unwrap_or("")
                .trim();
            if let Ok(port) = trimmed.parse::<u16>() {
                if port >= 1 && port <= 65535 {
                    return port;
                }
            }
        }
    }

    4400
}

fn spawn_server(app: &tauri::AppHandle) -> Option<Child> {
    let (bin, args) = find_server_binary()?;
    let log_dir = std::env::temp_dir();
    let log_path = log_dir.join("warpcore-server.log");
    let log_file = std::fs::File::create(&log_path).unwrap();
    let err_file = log_file.try_clone().unwrap();
    // Resolve resource dir via Tauri API - works cross-platform
    let resource_dir = app
        .path()
        .resource_dir()
        .map(|p| {
            let s = p.to_string_lossy().to_string();
            s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
        })
        .unwrap_or_else(|_| ".".to_string());

    // Get port from env var or settings, and pass to server process
    let server_port = get_server_port();
    let rust_path = env::var("PATH").unwrap_or_else(|_| "(not set)".to_string());
    println!("[WarpCore] Rust PATH: {}", rust_path);
    let mut cmd = Command::new(&bin);
    cmd.args(&args)
        .env("WARPCORE_RESOURCE_DIR", &resource_dir)
        .env("CONTROL_API_PORT", server_port.to_string())
        .stdout(log_file)
        .stderr(err_file);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.spawn() {
        Ok(c) => {
            println!(
                "[WarpCore] Server spawned: {} {:?} (PID {}) on port {}",
                bin,
                args,
                c.id(),
                server_port
            );
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
    format!(
        r#"
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
            <div class="text">[engaging warpdrv]</div>
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
    "#,
        port = port
    )
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
        if chunk.len() > 1 {
            result.push(CHARS[((n >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(n & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

// Read startMinimized setting from warpcore-data.json
fn read_start_minimized_setting() -> bool {
    // Get config dir based on platform
    let config_dir = match std::env::var("XDG_CONFIG_HOME") {
        Ok(path) if !path.is_empty() => PathBuf::from(path),
        _ => std::env::var_os("HOME")
            .map(|h| PathBuf::from(h).join(".config"))
            .filter(|p| p.exists())
            .unwrap_or_else(|| std::env::current_dir().ok().unwrap()),
    };

    let data_path = config_dir.join("warpcore").join("warpcore-data.json");

    if !data_path.exists() {
        return false;
    }

    match std::fs::read_to_string(&data_path) {
        Ok(content) => {
            // Simple JSON parsing without external deps - look for "startMinimized":true pattern
            content.contains("\"startMinimized\":true")
                || content.contains("\"startMinimized\": true")
        }
        Err(_) => false,
    }
}

// Read window size settings from warpcore-data.json
fn read_window_size_settings() -> Option<(u32, u32)> {
    let config_dir = match std::env::var("XDG_CONFIG_HOME") {
        Ok(path) if !path.is_empty() => PathBuf::from(path),
        _ => std::env::var_os("HOME")
            .map(|h| PathBuf::from(h).join(".config"))
            .filter(|p| p.exists())
            .unwrap_or_else(|| std::env::current_dir().ok().unwrap()),
    };

    let data_path = config_dir.join("warpcore").join("warpcore-data.json");

    if !data_path.exists() {
        return None;
    }

    match std::fs::read_to_string(&data_path) {
        Ok(content) => {
            // Parse the outer JSON file
            let json: serde_json::Value = match serde_json::from_str(&content) {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("[WarpCore] Failed to parse warpcore-data.json: {}", e);
                    return None;
                }
            };

            // settings:general is stored as a stringified JSON string (per store.ts convention)
            let settings_str = match json.get("settings:general") {
                Some(serde_json::Value::String(s)) => s,
                _ => return None,
            };

            // Parse the nested settings object
            let settings: serde_json::Value = match serde_json::from_str(settings_str) {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("[WarpCore] Failed to parse nested settings JSON: {}", e);
                    return None;
                }
            };

            let width = settings
                .get("windowWidth")
                .and_then(|v| v.as_u64())
                .map(|w| w as u32)?;
            let height = settings
                .get("windowHeight")
                .and_then(|v| v.as_u64())
                .map(|h| h as u32)?;

            // Validate reasonable bounds (min window size is 800x600 per tauri.conf.json)
            if width >= 800 && height >= 600 {
                return Some((width, height));
            }
            None
        }
        Err(e) => {
            eprintln!("[WarpCore] Failed to read settings file: {}", e);
            None
        }
    }
}

// Save window size to warpcore-data.json
fn save_window_size(width: u32, height: u32) -> bool {
    let config_dir = match std::env::var("XDG_CONFIG_HOME") {
        Ok(path) if !path.is_empty() => PathBuf::from(path),
        _ => std::env::var_os("HOME")
            .map(|h| PathBuf::from(h).join(".config"))
            .filter(|p| p.exists())
            .unwrap_or_else(|| std::env::current_dir().ok().unwrap()),
    };

    let data_path = config_dir.join("warpcore").join("warpcore-data.json");

    if !data_path.exists() {
        return false;
    }

    match std::fs::read_to_string(&data_path) {
        Ok(content) => {
            // Use proper JSON parsing to safely update window size without corrupting other data
            let mut json: serde_json::Value = match serde_json::from_str(&content) {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("[WarpCore] Failed to parse warpcore-data.json: {}", e);
                    return false;
                }
            };

            // Update settings:general windowWidth and windowHeight
            // Note: settings:general is stored as a stringified JSON string (per store.ts convention)
            if let Some(settings_value) = json.get_mut("settings:general") {
                if let Some(settings_str) = settings_value.as_str() {
                    match serde_json::from_str::<serde_json::Value>(settings_str) {
                        Ok(mut settings_obj) => {
                            if let Some(settings_map) = settings_obj.as_object_mut() {
                                settings_map
                                    .insert("windowWidth".to_string(), serde_json::json!(width));
                                settings_map
                                    .insert("windowHeight".to_string(), serde_json::json!(height));
                                // Re-stringify and update back to the parent JSON
                                *settings_value = serde_json::Value::String(
                                    serde_json::to_string(&settings_obj)
                                        .unwrap_or_else(|_| settings_str.to_string()),
                                );
                            }
                        }
                        Err(e) => {
                            eprintln!("[WarpCore] Failed to parse nested settings JSON: {}", e);
                        }
                    }
                }
            }

            match std::fs::write(
                &data_path,
                serde_json::to_string_pretty(&json).unwrap_or(content),
            ) {
                Ok(_) => true,
                Err(e) => {
                    eprintln!("[WarpCore] Failed to save window size: {}", e);
                    false
                }
            }
        }
        Err(e) => {
            eprintln!("[WarpCore] Failed to read settings for window size: {}", e);
            false
        }
    }
}

fn main() {
    let server_port = get_server_port();
    println!(
        "[WarpCore] Using API port: {} (from env or settings)",
        server_port
    );

    // Check if launched with --hidden flag (from autostart)
    let launched_hidden = std::env::args().any(|arg| arg == "--hidden");

    #[tauri::command]
    fn type_text(text: String) {
        use enigo::{Enigo, Keyboard, Settings};
        match Enigo::new(&Settings::default()) {
            Ok(mut enigo) => {
                if let Err(e) = enigo.text(&text) {
                    eprintln!("[WarpCore] type_text failed: {:?}", e);
                }
            }
            Err(e) => eprintln!("[WarpCore] enigo init failed: {:?}", e),
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        // .plugin(tauri_plugin_devtools::init())
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
            // Determine if we should start minimized:
            // - Must be launched via autostart (--hidden flag)
            // - AND startMinimized setting must be true
            let should_start_minimized = launched_hidden && read_start_minimized_setting();

            // Apply Mica blur on Windows (replaces transparent padding shadow trick)
            // #[cfg(target_os = "windows")]
            // {
            //     use window_vibrancy::apply_mica;
            //     if let Some(window) = app.get_webview_window("main") {
            //         let _ = apply_mica(&window, Some(true));
            //     }
            // }

            // Show loading page immediately (or hide if starting minimized)
            if let Some(window) = app.get_webview_window("main") {
                // Apply saved window size if available
                if let Some((saved_width, saved_height)) = read_window_size_settings() {
                    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                        saved_width as f64,
                        saved_height as f64,
                    )));
                    println!(
                        "[WarpCore] Restored window size: {}x{}",
                        saved_width, saved_height
                    );
                }

                let html = loading_html(server_port);
                let data_url = format!("data:text/html;base64,{}", base64_encode(html.as_bytes()));
                let _ = window.navigate(data_url.parse().unwrap());

                #[cfg(target_os = "linux")]
                {
                    use webkit2gtk::PermissionRequestExt;
                    use webkit2gtk::WebViewExt;
                    let _ = window.with_webview(|webview| {
                        webview.inner().connect_permission_request(|_, request| {
                            request.allow();
                            true
                        });
                    });
                }
                if !should_start_minimized {
                    let _ = window.show();
                } else {
                    println!("[WarpCore] Starting minimized (to tray)");
                }
            }

            // Global hotkey listener (rdev) -> emit "hotkey://key" { code, down }
            let hk_handle = app.handle().clone();
            thread::spawn(move || {
                let _ = rdev::listen(move |event| {
                    let (code, down) = match event.event_type {
                        rdev::EventType::KeyPress(k) => (format!("{:?}", k), true),
                        rdev::EventType::KeyRelease(k) => (format!("{:?}", k), false),
                        _ => return,
                    };
                    let _ = hk_handle.emit(
                        "hotkey://key",
                        serde_json::json!({ "code": code, "down": down }),
                    );
                });
            });
            // Spawn server in background
            let app_handle = app.handle().clone();
            thread::spawn(move || {
                let port = server_port;

                if !is_server_running(port) {
                    let child = spawn_server(&app_handle);
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
                        let child = spawn_server(&app_handle);
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
            let open_item = MenuItemBuilder::with_id("open", "Show warpdrv").build(app)?;
            let hide_item = MenuItemBuilder::with_id("hide", "Hide warpdrv").build(app)?;
            let restart_item = MenuItemBuilder::with_id("restart", "Restart Server").build(app)?;
            let devtools_item =
                MenuItemBuilder::with_id("devtools", "Toggle DevTools").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&open_item)
                .item(&hide_item)
                .separator()
                .item(&restart_item)
                .separator()
                .item(&devtools_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::with_id("warpcore-tray")
                .icon(Image::from_bytes(include_bytes!("../icons/icon.png"))?)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
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
                    "devtools" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_devtools_open() {
                                window.close_devtools();
                            } else {
                                window.open_devtools();
                            }
                        }
                    }
                    "restart" => {
                        if let Some(mut child) =
                            app.state::<ServerProcess>().0.lock().unwrap().take()
                        {
                            let _ = child.kill();
                        }
                        let child = spawn_server(app);
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
                        // Save current window size before quitting
                        if let Some(window) = app.get_webview_window("main") {
                            if let Ok(size) = window.inner_size() {
                                let _ = save_window_size(size.width, size.height);
                                println!(
                                    "[WarpCore] Saved window size: {}x{}",
                                    size.width, size.height
                                );
                            }
                        }

                        // Stop all llama-server instances via API
                        if is_server_running(server_port) {
                            let _ = reqwest::blocking::Client::new()
                                .post(format!(
                                    "http://localhost:{}/api/servers/stop-all",
                                    server_port
                                ))
                                .send();
                            thread::sleep(Duration::from_millis(500));
                            // Stop all whisper-server instances via API
                            let _ = reqwest::blocking::Client::new()
                                .post(format!(
                                    "http://localhost:{}/api/whisper-servers/stop-all",
                                    server_port
                                ))
                                .send();
                            thread::sleep(Duration::from_millis(500));
                        }

                        // Then kill the Node.js server process
                        if let Some(mut child) =
                            app.state::<ServerProcess>().0.lock().unwrap().take()
                        {
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

            // Close to tray (save window size before hiding)
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(debug_assertions)]
                app.get_webview_window("main").unwrap().open_devtools();

                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // Save current window size before hiding to tray
                        if let Ok(size) = w.inner_size() {
                            let _ = save_window_size(size.width, size.height);
                            println!(
                                "[WarpCore] Saved window size: {}x{}",
                                size.width, size.height
                            );
                        }
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![type_text])
        .run(tauri::generate_context!())
        .expect("error while running WarpCore Desktop");
}
