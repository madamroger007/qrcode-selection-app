use tauri_plugin_opener::OpenerExt;

/// Opens the given URL in the system's default browser.
///
/// Uses Tauri's opener plugin (`tauri_plugin_opener`) to delegate to the OS
/// default handler.  The caller must pass in the `AppHandle` so the plugin
/// can resolve the correct capability context.
///
/// # Errors
/// Returns `Err(String)` with a descriptive message when the opener plugin
/// fails to open the URL (e.g. unsupported scheme, OS-level failure, or the
/// required capability is not granted).
pub fn open_url(app_handle: &tauri::AppHandle, url: String) -> Result<(), String> {
    app_handle
        .opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("Failed to open URL '{}': {}", url, e))
}

#[cfg(test)]
mod tests {
    // Integration tests that actually invoke the OS opener require a running
    // Tauri application context and cannot be exercised in plain `cargo test`.
    // Behaviour is validated at the IPC command level in task 3.6.
}
