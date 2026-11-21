// register_listener/remove_listener são os comandos que o addPluginListener do @tauri-apps/api
// invoca para receber o evento "progress" do Kotlin.
const COMMANDS: &[&str] = &[
    "download_and_install",
    "register_listener",
    "remove_listener",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
