use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRequest {
    pub url: String,
    pub expected_size: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InstallStatus {
    Installing,
    NeedsPermission,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
pub struct DownloadResult {
    pub status: InstallStatus,
}
