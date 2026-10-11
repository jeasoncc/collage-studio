// swift-tools-version:5.3
import PackageDescription

let package = Package(
    name: "tauri-plugin-native-save",
    platforms: [.iOS(.v14)],
    products: [.library(name: "tauri-plugin-native-save", type: .static, targets: ["tauri-plugin-native-save"])],
    dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
    targets: [.target(name: "tauri-plugin-native-save", dependencies: [.byName(name: "Tauri")], path: "Sources")]
)
