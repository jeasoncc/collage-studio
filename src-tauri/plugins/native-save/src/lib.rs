use std::{fs::File, io::Write, sync::Mutex};
use tauri::{ipc::{InvokeBody, Request}, plugin::{Builder, TauriPlugin}, AppHandle, Manager, Runtime, State};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_native_save);

struct Export {
    directory: tempfile::TempDir,
    file: File,
    #[cfg(any(target_os = "android", target_os = "ios"))]
    filename: String,
    expected: u64,
    written: u64,
}

#[derive(Default)]
struct Exports {
    active: Option<Export>,
    finishing: bool,
}

struct NativeSave<R: Runtime> {
    exports: Mutex<Exports>,
    #[cfg(any(target_os = "android", target_os = "ios"))]
    handle: tauri::plugin::PluginHandle<R>,
    marker: std::marker::PhantomData<fn() -> R>,
}

fn valid_filename(filename: &str) -> bool {
    !filename.is_empty() && filename != "." && filename != ".." && filename.len() <= 240
        && !filename.chars().any(|c| c == '/' || c == '\\' || c.is_control())
}

fn token(export: &Export) -> &str {
    export.directory.path().file_name().unwrap().to_str().expect("generated export tokens are ASCII")
}

#[tauri::command]
fn prepare<R: Runtime>(app: AppHandle<R>, state: State<'_, NativeSave<R>>, filename: String, size: u64) -> Result<String, String> {
    if !cfg!(any(target_os = "android", target_os = "ios")) {
        return Err("Mobile export is unavailable on this platform".into());
    }
    if !valid_filename(&filename) {
        return Err("Invalid export filename".into());
    }
    let mut exports = state.exports.lock().map_err(|e| e.to_string())?;
    if exports.active.is_some() || exports.finishing {
        return Err("Another export is already in progress".into());
    }
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("exports");
    std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    let directory = tempfile::Builder::new().prefix("export-").tempdir_in(cache).map_err(|e| e.to_string())?;
    let file = File::create(directory.path().join(&filename)).map_err(|e| e.to_string())?;
    let export = Export {
        directory, file,
        #[cfg(any(target_os = "android", target_os = "ios"))]
        filename,
        expected: size, written: 0,
    };
    let id = token(&export).to_owned();
    exports.active = Some(export);
    Ok(id)
}

#[tauri::command]
fn append<R: Runtime>(app: AppHandle<R>, request: Request<'_>) -> Result<(), String> {
    let id = request.headers().get("x-export-token").and_then(|v| v.to_str().ok()).ok_or("Missing export token")?;
    let length = match request.body() {
        InvokeBody::Raw(bytes) => bytes.len(),
        #[cfg(target_os = "android")]
        InvokeBody::Json(value) => {
            // Android's official Tauri IPC serializes ArrayBuffer as a JSON byte array.
            let bytes = value.as_array().ok_or("Binary IPC byte array required")?;
            if bytes.len() > 4 * 1024 * 1024 { return Err("Export chunk is too large".into()); }
            if bytes.iter().any(|byte| byte.as_u64().is_none_or(|value| value > 255)) {
                return Err("Invalid IPC byte value".into());
            }
            bytes.len()
        }
        #[cfg(not(target_os = "android"))]
        _ => return Err("Binary IPC body required".into()),
    };
    if length > 4 * 1024 * 1024 { return Err("Export chunk is too large".into()); }
    let state = app.state::<NativeSave<R>>();
    let mut exports = state.exports.lock().map_err(|e| e.to_string())?;
    let export = exports.active.as_mut().ok_or("No export is in progress")?;
    if token(export) != id { return Err("Invalid export token".into()); }
    let next = export.written.checked_add(length as u64).ok_or("Export length overflow")?;
    if next > export.expected { return Err("Export exceeds declared size".into()); }
    match request.body() {
        InvokeBody::Raw(bytes) => export.file.write_all(bytes).map_err(|e| e.to_string())?,
        #[cfg(target_os = "android")]
        InvokeBody::Json(value) => {
            let mut buffer = [0_u8; 64 * 1024];
            for chunk in value.as_array().unwrap().chunks(buffer.len()) {
                for (destination, byte) in buffer.iter_mut().zip(chunk) {
                    *destination = byte.as_u64().unwrap() as u8;
                }
                export.file.write_all(&buffer[..chunk.len()]).map_err(|e| e.to_string())?;
            }
        }
        #[cfg(not(target_os = "android"))]
        _ => unreachable!("non-binary IPC was rejected above"),
    }
    export.written = next;
    Ok(())
}

#[tauri::command]
fn discard<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let state = app.state::<NativeSave<R>>();
    let mut exports = state.exports.lock().map_err(|e| e.to_string())?;
    if let Some(export) = exports.active.as_ref() {
        if token(export) != id { return Err("Invalid export token".into()); }
        exports.active.take();
    }
    Ok(())
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SavePayload<'a> { path: String, filename: &'a str }

#[cfg(any(target_os = "android", target_os = "ios"))]
#[derive(serde::Deserialize)]
struct SaveResponse { status: String }

#[tauri::command]
async fn finish<R: Runtime>(app: AppHandle<R>, id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<NativeSave<R>>();
        let export = {
            let mut exports = state.exports.lock().map_err(|e| e.to_string())?;
            let export = exports.active.as_ref().ok_or("No export is in progress")?;
            if token(export) != id { return Err("Invalid export token".into()); }
            if export.written != export.expected { return Err("Export transfer is incomplete".into()); }
            exports.finishing = true;
            exports.active.take().unwrap()
        };
        let result = (|| {
            export.file.sync_all().map_err(|e| e.to_string())?;
            #[cfg(any(target_os = "android", target_os = "ios"))]
            {
                let response: SaveResponse = state.handle.run_mobile_plugin("save", SavePayload {
                    path: export.directory.path().join(&export.filename).to_string_lossy().into_owned(),
                    filename: &export.filename,
                }).map_err(|e| e.to_string())?;
                match response.status.as_str() {
                    "saved" | "cancelled" => Ok(response.status),
                    _ => Err("Unexpected native save result".into()),
                }
            }
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            { Err("Mobile export is unavailable on this platform".into()) }
        })();
        state.exports.lock().map_err(|e| e.to_string())?.finishing = false;
        drop(export);
        result
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn is_mobile() -> bool {
    cfg!(any(target_os = "android", target_os = "ios"))
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("native-save")
        .invoke_handler(tauri::generate_handler![is_mobile, prepare, append, finish, discard])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let handle = api.register_android_plugin("top.szlh.collage.export", "NativeSavePlugin")?;
            #[cfg(target_os = "ios")]
            let handle = api.register_ios_plugin(init_plugin_native_save)?;
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            let _ = api;
            app.manage(NativeSave::<R> {
                exports: Mutex::new(Exports::default()),
                #[cfg(any(target_os = "android", target_os = "ios"))]
                handle,
                marker: std::marker::PhantomData,
            });
            Ok(())
        })
        .build()
}
