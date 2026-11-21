use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::ApkUpdaterExt;
use crate::Result;

#[command]
pub(crate) async fn download_and_install<R: Runtime>(
    app: AppHandle<R>,
    payload: DownloadRequest,
) -> Result<DownloadResult> {
    app.apk_updater().download_and_install(payload).await
}
