use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::ApkUpdater;
#[cfg(mobile)]
use mobile::ApkUpdater;

/// Extensões de [`tauri::App`], [`tauri::AppHandle`] e [`tauri::Window`] para acessar o plugin.
pub trait ApkUpdaterExt<R: Runtime> {
    fn apk_updater(&self) -> &ApkUpdater<R>;
}

impl<R: Runtime, T: Manager<R>> crate::ApkUpdaterExt<R> for T {
    fn apk_updater(&self) -> &ApkUpdater<R> {
        self.state::<ApkUpdater<R>>().inner()
    }
}

/// Inicializa o plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("apk-updater")
        .invoke_handler(tauri::generate_handler![commands::download_and_install])
        .setup(|app, api| {
            #[cfg(mobile)]
            let apk_updater = mobile::init(app, api)?;
            #[cfg(desktop)]
            let apk_updater = desktop::init(app, api)?;
            app.manage(apk_updater);
            Ok(())
        })
        .build()
}
