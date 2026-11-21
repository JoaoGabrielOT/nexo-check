use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "io.github.joaogabrielot.apkupdater";

// Registra a classe Kotlin do plugin.
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<ApkUpdater<R>> {
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "ApkUpdaterPlugin")?;
    Ok(ApkUpdater(handle))
}

pub struct ApkUpdater<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> ApkUpdater<R> {
    // Versão assíncrona: o Kotlin só responde depois do download inteiro.
    pub async fn download_and_install(&self, payload: DownloadRequest) -> crate::Result<DownloadResult> {
        self.0
            .run_mobile_plugin_async("downloadAndInstall", payload)
            .await
            .map_err(Into::into)
    }
}
