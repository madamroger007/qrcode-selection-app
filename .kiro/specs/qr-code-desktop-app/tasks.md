# Implementation Plan: QR Code Desktop App

## Overview

Implement a Tauri v2 + Svelte desktop application that captures a screen region drawn by the user, decodes any QR codes present in that region, and displays the decoded results with copy and URL-open support. The implementation follows the two-process architecture defined in the design: a Svelte WebView frontend communicating with a Rust backend exclusively through Tauri IPC commands and events.

## Tasks

- [x] 1. Scaffold Tauri v2 + Svelte project and add all dependencies
  - [x] 1.1 Initialize Tauri v2 project with Svelte frontend
    - Run `npm create tauri-app` with the Svelte template (TypeScript variant)
    - Confirm the generated workspace contains `src-tauri/` (Rust) and `src/` (Svelte)
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Add Rust crate dependencies to `src-tauri/Cargo.toml`
    - Add `rxing = "0.5"` (pure-Rust ZXing port for QR decoding)
    - Add `screenshots = "0.8"` (cross-platform screen capture)
    - Add `image = "0.25"` (PNG decoding for rxing input)
    - Add `tokio = { version = "1", features = ["full"] }` (async runtime, timeout support)
    - Add `tauri-plugin-clipboard-manager = "2"` and `tauri-plugin-shell = "2"`
    - _Requirements: 3.1, 3.5, 4.3_

  - [x] 1.3 Add frontend npm dependencies
    - Add `@tauri-apps/plugin-clipboard-manager` and `@tauri-apps/plugin-shell` packages
    - Add `vitest` and `@testing-library/svelte` as dev dependencies for frontend testing
    - _Requirements: 4.3_

- [x] 2. Configure Tauri windows and permissions
  - [x] 2.1 Configure `tauri.conf.json` for main and overlay windows
    - Set main window: `label:"main"`, `title:"QR Code Selector"`, `width:900`, `height:650`, `minWidth:800`, `minHeight:600`
    - Add overlay window: `label:"overlay"`, `transparent:true`, `decorations:false`, `alwaysOnTop:true`, `fullscreen:true`, `skipTaskbar:true`, `visible:false`, `url:"overlay.html"`
    - _Requirements: 1.1, 2.1_

  - [x] 2.2 Configure plugin permissions in `src-tauri/capabilities/`
    - Enable `clipboard-manager:allow-write-text` capability
    - Enable `shell:allow-open` capability for opening URLs
    - Enable window show/hide permissions for the overlay window
    - _Requirements: 4.2, 4.3_

- [x] 3. Implement Rust backend modules
  - [x] 3.1 Implement `screen_capture` module (`src-tauri/src/screen_capture.rs`)
    - Define `CaptureRegion { x: i32, y: i32, width: u32, height: u32 }` struct
    - Implement `capture_region(region: CaptureRegion) -> Result<Vec<u8>, String>`
    - Use the `screenshots` crate to capture all screens and crop to the specified region using global virtual-screen coordinates
    - Encode the cropped image as PNG bytes and return as `Vec<u8>`
    - Return descriptive `Err(String)` on any capture failure
    - _Requirements: 2.5_

  - [x] 3.2 Write unit tests for `screen_capture` module
    - Mock or stub the `screenshots` crate to verify coordinate math for region crops
    - Test that `capture_region` returns `Err` when the screenshots crate fails
    - _Requirements: 2.5_

  - [x] 3.3 Implement `qr_decoder` module (`src-tauri/src/qr_decoder.rs`)
    - Implement `decode_qr_from_bytes(image_bytes: &[u8]) -> Result<Vec<String>, String>`
    - Decode PNG bytes to `image::DynamicImage` using the `image` crate
    - Call `rxing::helpers::detect_multiple_in_image_with_hints` with `DecodeHints` restricted to `QR_CODE` format
    - Return `Ok(Vec<String>)` of decoded text values; an empty `Vec` means no QR found
    - Return `Err(String)` with a human-readable message on any rxing error
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.4 Write unit tests for `qr_decoder` module
    - Test with a known single-QR PNG fixture: assert `Ok(vec!["expected_text"])`
    - Test with a known multi-QR PNG fixture: assert `Ok(vec)` with correct length and content
    - Test with a PNG containing no QR code: assert `Ok(vec![])` (empty)
    - Test with invalid/corrupt bytes: assert `Err(_)`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.5 Implement `window_manager` module (`src-tauri/src/window_manager.rs`)
    - Implement `open_url(url: String) -> Result<(), String>` using Tauri's `shell::open`
    - _Requirements: 4.2_

  - [x] 3.6 Register Tauri commands and initialize plugins in `src-tauri/src/main.rs`
    - Expose `capture_region`, `decode_qr`, and `open_url` as `#[tauri::command]`
    - Wrap `decode_qr` handler body in `tokio::time::timeout(Duration::from_secs(30), ...)` -- return `Err("QR decoding timed out after 30 seconds".to_string())` on expiry
    - Register `tauri_plugin_clipboard_manager::init()` and `tauri_plugin_shell::init()` in `tauri::Builder`
    - Register all three commands with `tauri::generate_handler!`
    - _Requirements: 3.4, 3.5_

  - [x] 3.7 Write property-based tests for Rust backend (proptest)
    - Add `proptest = "1"` to `[dev-dependencies]` in `Cargo.toml`
    - _Requirements: 2.3, 2.4, 2.7, 3.4, 3.5, 3.6_

- [x] 4. Checkpoint -- Verify Rust backend compiles and passes tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Svelte state store
  - [x] 5.1 Create `appState` store (`src/lib/stores/appState.ts`)
    - Define `ProcessingState`, `CapturePhase`, and `AppState` TypeScript interfaces as specified in the design
    - Initialize `writable<AppState>` with `capturePhase:'idle'`, `processingState:'idle'`, `previewImageUrl:null`, `results:[]`, `errorMessage:null`
    - Export action helpers: `startCapture()`, `setPreview(url)`, `setLoading()`, `setResults(r)`, `setError(msg)`, `resetToIdle()`
    - _Requirements: 3.6, 4.6_

  - [x] 5.2 Write Vitest unit tests for `appState` store
    - _Requirements: 3.6, 4.6_

- [x] 6. Implement `CopyButton.svelte` component
  - [x] 6.1 Create `src/lib/components/CopyButton.svelte`
    - _Requirements: 4.3, 4.4, 4.5_

  - [x] 6.2 Write Vitest unit tests for `CopyButton.svelte`
    - _Requirements: 4.3, 4.4, 4.5_

- [x] 7. Implement `ResultDisplay.svelte` component
  - [x] 7.1 Create `src/lib/components/ResultDisplay.svelte`
    - _Requirements: 3.2, 3.3, 3.4, 3.6, 4.1, 4.2_

  - [x] 7.2 Write Vitest unit tests for `ResultDisplay.svelte`
    - _Requirements: 3.2, 3.3, 3.4, 3.6, 4.1, 4.2_

- [x] 8. Implement `OverlayWindow.svelte` component
  - [x] 8.1 Create `src/OverlayWindow.svelte` (entry for the overlay Tauri window)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 8.2 Write Vitest unit tests for OverlayWindow selection logic
    - _Requirements: 2.3, 2.4, 2.7_

- [x] 9. Implement `MainWindow.svelte` root component
  - [x] 9.1 Create `src/MainWindow.svelte` (or update generated `App.svelte` entry)
    - _Requirements: 1.1, 1.2, 1.3, 2.5, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.6_

- [ ] 10. Checkpoint -- Verify full frontend integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Wire Tauri event system and overlay window lifecycle
  - [x] 11.1 Implement overlay window show/hide via Tauri window management
    - _Requirements: 2.1, 2.6_

  - [x] 11.2 Write integration test for overlay window lifecycle
    - _Requirements: 2.1, 2.6_

- [x] 12. Implement and verify all error handling paths
  - [x] 12.1 Add error handling for `capture_region` IPC failure in `MainWindow.svelte`
    - _Requirements: 1.3_

  - [x] 12.2 Verify timeout path for `decode_qr`
    - _Requirements: 3.5, 3.6_

  - [x] 12.3 Verify `open_url` silent-failure path in `ResultDisplay.svelte`
    - _Requirements: 4.2_

- [ ] 13. Final checkpoint -- Full test suite
  - Ensure all Rust tests (`cargo test`) and frontend tests (`vitest --run`) pass. Ask the user if any questions arise.

- [x] 14. Add CI/CD GitHub Actions workflows
  - [x] 14.1 Create `.github/workflows/ci.yml`
    - Run `pnpm check` (svelte-check type checking) and `pnpm test` (Vitest) on ubuntu-latest
    - Run `cargo test --all-features` on windows-latest (required for screenshots crate)
    - Trigger on every push and pull request to all branches
  - [x] 14.2 Create `.github/workflows/release.yml`
    - Trigger on version tags matching `v*.*.*`
    - Re-run both frontend and Rust test jobs as a hard gate before building
    - Build and publish a draft GitHub Release with the Tauri desktop binary via `tauri-apps/tauri-action`

## Notes

- Tasks marked with `~` are optional and can be skipped for a faster MVP build
- All IPC calls cross the Tauri process boundary: always handle both the `Ok` and `Err` variants on the frontend
- The `decode_qr` command is `async` on the Rust side; the frontend `invoke` call returns a Promise -- always await it
- The overlay window runs in a separate WebView; it cannot directly read the main window's `appState` store; coordinate via Tauri events only
- Checkpoints at tasks 4 and 10 provide early validation before integration work begins

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2"] },
    { "id": 3, "tasks": ["3.1", "3.3", "3.5"] },
    { "id": 4, "tasks": ["3.2", "3.4", "3.6"] },
    { "id": 5, "tasks": ["3.7", "5.1"] },
    { "id": 6, "tasks": ["5.2", "6.1", "8.1"] },
    { "id": 7, "tasks": ["6.2", "7.1", "8.2"] },
    { "id": 8, "tasks": ["7.2", "9.1"] },
    { "id": 9, "tasks": ["11.1", "12.1", "12.2", "12.3"] },
    { "id": 10, "tasks": ["11.2"] }
  ]
}
```
