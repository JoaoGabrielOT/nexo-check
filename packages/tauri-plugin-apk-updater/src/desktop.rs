use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<ApkUpdater<R>> {
    Ok(ApkUpdater(app.clone()))
}

/// Sem implementação fora do Android.
#[allow(dead_code)]
pub struct ApkUpdater<R: Runtime>(AppHandle<R>);

impl<R: Runtime> ApkUpdater<R> {
    pub async fn download_and_install(
        &self,
        _payload: DownloadRequest,
    ) -> crate::Result<DownloadResult> {
        Err(crate::Error::Unsupported)
    }
}
