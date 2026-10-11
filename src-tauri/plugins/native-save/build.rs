fn main() {
    tauri_plugin::Builder::new(&["is_mobile", "prepare", "append", "finish", "discard"])
        .android_path("android")
        .ios_path("ios")
        .build();
}
