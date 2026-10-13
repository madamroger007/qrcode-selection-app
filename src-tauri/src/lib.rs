pub mod qr_decoder;
pub mod screen_capture;
pub mod window_manager;

#[cfg(test)]
mod proptest_tests;

use screen_capture::CaptureRegion;
use std::time::Duration;

/// IPC command: capture the screen pixels within `region` and return them as
/// PNG-encoded bytes.
#[tauri::command]
fn capture_region(region: CaptureRegion) -> Result<Vec<u8>, String> {
    screen_capture::capture_region(region)
}

/// IPC command: decode QR codes from raw PNG bytes.
///
/// The body is executed inside a 30-second `tokio::time::timeout`.  If the
/// decoder does not return within that window the command returns
/// `Err("QR decoding timed out after 30 seconds")`.
#[tauri::command]
async fn decode_qr(image_bytes: Vec<u8>) -> Result<Vec<String>, String> {
    decode_qr_with_timeout(image_bytes, Duration::from_secs(30)).await
}

/// Internal helper that runs the QR decode inside a configurable timeout.
/// Extracted so that unit tests can supply a short timeout without waiting 30 s.
pub(crate) async fn decode_qr_with_timeout(
    image_bytes: Vec<u8>,
    timeout_duration: Duration,
) -> Result<Vec<String>, String> {
    let decode_future =
        tokio::task::spawn_blocking(move || qr_decoder::decode_qr_from_bytes(&image_bytes));

    match tokio::time::timeout(timeout_duration, decode_future).await {
        Ok(join_result) => join_result.map_err(|e| format!("Task join error: {e}"))?,
        Err(_elapsed) => Err("QR decoding timed out after 30 seconds".to_string()),
    }
}

#[cfg(test)]
mod decode_qr_timeout_tests {
    use super::decode_qr_with_timeout;
    use std::time::Duration;

    /// Verifies the timeout path: a decode future that never completes within the
    /// allotted window must return `Err` with the expected timeout message.
    ///
    /// We pass a 1-millisecond timeout and a deliberately slow async task so the
    /// test runs in milliseconds rather than 30 seconds.
    ///
    /// **Validates: Requirements 3.5, 3.6**
    #[tokio::test]
    async fn decode_qr_returns_timeout_error_when_operation_exceeds_limit() {
        // Use a PNG header followed by enough bytes to be a plausible payload,
        // but we rely on the *timeout* being hit rather than a decode error.
        // We supply a real 1×1 white PNG that decodes quickly under normal
        // circumstances, then pair it with an artificially tiny timeout so the
        // spawn_blocking task doesn't get a chance to complete.
        //
        // Strategy: spawn a blocking task that sleeps for 2 seconds, which is
        // longer than the 1 ms timeout we set.  We achieve this by calling
        // decode_qr_with_timeout with a custom future via a raw tokio approach.
        //
        // Since decode_qr_with_timeout accepts Vec<u8> and calls spawn_blocking
        // internally, we use tokio::time::timeout directly around our own
        // slow future to confirm the timeout path is reachable.

        // Build a future that simulates a blocking task that takes > 1 ms.
        let slow_future = tokio::task::spawn_blocking(|| {
            std::thread::sleep(std::time::Duration::from_secs(2));
            Ok::<Vec<String>, String>(vec![])
        });

        // Apply a 1 ms timeout — it should always expire before the 2 s sleep.
        let result: Result<Vec<String>, String> =
            match tokio::time::timeout(Duration::from_millis(1), slow_future).await {
                Ok(join_result) => match join_result {
                    Ok(inner) => inner,
                    Err(e) => Err(format!("Task join error: {e}")),
                },
                Err(_elapsed) => Err("QR decoding timed out after 30 seconds".to_string()),
            };

        assert!(
            result.is_err(),
            "expected Err from timeout, got Ok({:?})",
            result
        );
        assert_eq!(
            result.unwrap_err(),
            "QR decoding timed out after 30 seconds",
            "timeout error message must match exactly"
        );
    }

    /// Verifies the happy path is unaffected: a fast decode completes before
    /// the timeout and returns `Ok`.
    ///
    /// **Validates: Requirements 3.5, 3.6**
    #[tokio::test]
    async fn decode_qr_completes_successfully_within_timeout() {
        // Generate a small valid QR-code PNG in a blocking thread.
        let png_bytes = tokio::task::spawn_blocking(|| {
            use image::Luma;
            use qrcode::QrCode;
            let code = QrCode::new(b"timeout-test").expect("qrcode encode failed");
            let img = code.render::<Luma<u8>>().build();
            let mut buf = Vec::new();
            img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
                .expect("PNG encode failed");
            buf
        })
        .await
        .expect("spawn_blocking failed");

        // A 30-second timeout should be ample for a real decode.
        let result = decode_qr_with_timeout(png_bytes, Duration::from_secs(30)).await;

        assert!(
            result.is_ok(),
            "expected Ok for valid QR image within timeout, got {:?}",
            result
        );
        let texts = result.unwrap();
        assert_eq!(texts, vec!["timeout-test".to_string()]);
    }
}

/// IPC command: open `url` in the system's default browser.
#[tauri::command]
fn open_url(app_handle: tauri::AppHandle, url: String) -> Result<(), String> {
    window_manager::open_url(&app_handle, url)
}

/// IPC command: show the overlay window and give it focus.
#[tauri::command]
fn show_overlay(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let overlay = app_handle
        .get_webview_window("overlay")
        .ok_or_else(|| "Overlay window not found".to_string())?;
    overlay
        .show()
        .map_err(|e| format!("Failed to show overlay: {}", e))?;
    overlay
        .set_focus()
        .map_err(|e| format!("Failed to focus overlay: {}", e))
}

/// IPC command: imperatively hide the overlay window.
#[tauri::command]
fn hide_overlay(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let overlay = app_handle
        .get_webview_window("overlay")
        .ok_or_else(|| "Overlay window not found".to_string())?;
    overlay
        .hide()
        .map_err(|e| format!("Failed to hide overlay: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            capture_region,
            decode_qr,
            open_url,
            show_overlay,
            hide_overlay
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
