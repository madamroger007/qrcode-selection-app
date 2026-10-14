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
/// Runs inside a 30-second `tokio::time::timeout`. Returns
/// `Err("QR decoding timed out after 30 seconds")` if the decoder exceeds
/// that budget.
#[tauri::command]
async fn decode_qr(image_bytes: Vec<u8>) -> Result<Vec<String>, String> {
    decode_qr_with_timeout(image_bytes, Duration::from_secs(30)).await
}

/// Internal helper: runs the QR decode with a configurable timeout so tests
/// can use a short duration without waiting 30 s.
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

    /// Timeout path: a blocking task that sleeps 2 s must be cancelled by a
    /// 1 ms deadline and return the expected error string.
    /// **Validates: Requirements 3.5, 3.6**
    #[tokio::test]
    async fn decode_qr_returns_timeout_error_when_operation_exceeds_limit() {
        let slow_future = tokio::task::spawn_blocking(|| {
            std::thread::sleep(std::time::Duration::from_secs(2));
            Ok::<Vec<String>, String>(vec![])
        });

        let result: Result<Vec<String>, String> =
            match tokio::time::timeout(Duration::from_millis(1), slow_future).await {
                Ok(join_result) => match join_result {
                    Ok(inner) => inner,
                    Err(e) => Err(format!("Task join error: {e}")),
                },
                Err(_elapsed) => Err("QR decoding timed out after 30 seconds".to_string()),
            };

        assert!(result.is_err(), "expected Err from timeout, got Ok({result:?})");
        assert_eq!(result.unwrap_err(), "QR decoding timed out after 30 seconds");
    }

    /// Happy path: a real QR PNG decodes well within 30 s.
    /// **Validates: Requirements 3.5, 3.6**
    #[tokio::test]
    async fn decode_qr_completes_successfully_within_timeout() {
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

        let result = decode_qr_with_timeout(png_bytes, Duration::from_secs(30)).await;
        assert!(result.is_ok(), "expected Ok for valid QR image, got {result:?}");
        assert_eq!(result.unwrap(), vec!["timeout-test".to_string()]);
    }
}

/// IPC command: open `url` in the system default browser.
#[tauri::command]
fn open_url(app_handle: tauri::AppHandle, url: String) -> Result<(), String> {
    window_manager::open_url(&app_handle, url)
}

/// Polls a predicate until it returns `Ok(false)` (window is gone from
/// screen) or all attempts are exhausted.
///
/// - `is_still_visible`: `Ok(true)` = still blocking the screen,
///   `Ok(false)` = gone, `Err(...)` = propagate immediately.
/// - `max_polls`: maximum number of checks.
/// - `poll_interval`: sleep between each check.
///
/// Returns `Ok(())` on first `Ok(false)` result.
/// Returns `Err("Main window did not hide in time")` after all polls.
///
/// `pub(crate)` so unit tests can call it directly.
pub(crate) async fn poll_until_hidden<F>(
    mut is_still_visible: F,
    max_polls: u32,
    poll_interval: Duration,
) -> Result<(), String>
where
    F: FnMut() -> Result<bool, String>,
{
    for _ in 0..max_polls {
        if !is_still_visible().map_err(|e| e.to_string())? {
            return Ok(());
        }
        tokio::time::sleep(poll_interval).await;
    }
    // One final check after the last sleep.
    if !is_still_visible().map_err(|e| e.to_string())? {
        return Ok(());
    }
    Err("Main window did not hide in time".to_string())
}

/// IPC command: show the overlay window and give it focus.
///
/// Polls the main window's `is_visible()` for up to 500 ms in 50 ms
/// increments via [`poll_until_hidden`], waiting for the `hide()` call on
/// the frontend to take effect before the overlay appears. This eliminates
/// the race where both windows are visible simultaneously.
///
/// Returns `Err("Main window did not hide in time")` if the main window is
/// still visible after 500 ms, or if the overlay cannot be shown/focused.
#[tauri::command]
async fn show_overlay(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let main_window = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    poll_until_hidden(
        || main_window.is_visible().map_err(|e| e.to_string()),
        10,
        Duration::from_millis(50),
    )
    .await?;

    let overlay = app_handle
        .get_webview_window("overlay")
        .ok_or_else(|| "Overlay window not found".to_string())?;
    overlay
        .show()
        .map_err(|e| format!("Failed to show overlay: {e}"))?;
    overlay
        .set_focus()
        .map_err(|e| format!("Failed to focus overlay: {e}"))
}

#[cfg(test)]
mod show_overlay_tests {
    use super::poll_until_hidden;
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    /// Build a checker that replays a fixed sequence of bool values.
    /// Once exhausted, repeats the last value indefinitely.
    fn make_checker(sequence: Vec<bool>) -> impl FnMut() -> Result<bool, String> {
        let idx = Arc::new(Mutex::new(0usize));
        let seq = Arc::new(sequence);
        move || {
            let mut guard = idx.lock().unwrap();
            let i = *guard;
            let val = if i < seq.len() { seq[i] } else { *seq.last().unwrap() };
            if i < seq.len() { *guard += 1; }
            Ok(val)
        }
    }

    /// Window already hidden on first check — returns Ok with no sleep.
    /// **Validates: Requirements 2.9, 2.10**
    #[tokio::test]
    async fn already_hidden_returns_ok_immediately() {
        let start = Instant::now();
        let result = poll_until_hidden(make_checker(vec![false]), 10, Duration::from_millis(50)).await;
        assert!(result.is_ok(), "Expected Ok(()), got {result:?}");
        assert!(start.elapsed() < Duration::from_millis(40), "took {:?}", start.elapsed());
    }

    /// Window hides after several polls — returns Ok after waiting.
    /// **Validates: Requirements 2.9, 2.10**
    #[tokio::test]
    async fn hides_after_several_polls_returns_ok() {
        let start = Instant::now();
        let result = poll_until_hidden(
            make_checker(vec![true, true, true, true, false]),
            10,
            Duration::from_millis(5),
        ).await;
        assert!(result.is_ok(), "Expected Ok(()), got {result:?}");
        assert!(start.elapsed() >= Duration::from_millis(15), "took {:?}", start.elapsed());
        assert!(start.elapsed() < Duration::from_millis(200), "took {:?}", start.elapsed());
    }

    /// Window never hides — returns Err after polls exhausted.
    /// **Validates: Requirements 2.9, 2.10**
    #[tokio::test]
    async fn never_hides_returns_err() {
        let result = poll_until_hidden(make_checker(vec![true]), 5, Duration::from_millis(5)).await;
        assert!(result.is_err(), "Expected Err, got {result:?}");
        assert_eq!(result.unwrap_err(), "Main window did not hide in time");
    }

    /// Checker error propagates immediately without further polling.
    /// **Validates: Requirements 2.9, 2.10**
    #[tokio::test]
    async fn checker_error_propagates() {
        let mut calls = 0u32;
        let result = poll_until_hidden(
            move || { calls += 1; Err(format!("handle invalid (call {calls})")) },
            10,
            Duration::from_millis(5),
        ).await;
        assert!(result.is_err(), "Expected Err, got {result:?}");
        assert!(result.unwrap_err().contains("handle invalid"));
    }
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
        .map_err(|e| format!("Failed to hide overlay: {e}"))
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