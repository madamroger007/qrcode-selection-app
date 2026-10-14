# Implementation Plan: QR Code Desktop App

## Overview

Implement a Tauri v2 + Svelte 5 desktop application that captures a screen region drawn by the user, decodes any QR codes present in that region, and displays the decoded results with copy and URL-open support. The implementation follows the two-process architecture defined in the design: a Svelte WebView frontend communicating with a Rust backend exclusively through Tauri IPC commands and events.

## Tasks

- [x] 1. Scaffold Tauri v2 + Svelte project and add all dependencies
  - [x] 1.1 Initialize Tauri v2 project with Svelte frontend
    - Generated with `npm create tauri-app`, Svelte + TypeScript template
    - Workspace contains `src-tauri/` (Rust) and `src/` (Svelte)
    - Package manager: `pnpm` with `"packageManager": "pnpm@11.20.0"` in `package.json`
    - _Requirements: 1.1, 1.2, 5.3_

  - [x] 1.2 Add Rust crate dependencies to `src-tauri/Cargo.toml`
    - `rxing = "0.9"`, `screenshots = "0.8"`, `image = "0.25"`
    - `tokio = { version = "1", features = ["full"] }`
    - `tauri-plugin-clipboard-manager = "2"`, `tauri-plugin-shell = "2"`, `tauri-plugin-opener = "2"`
    - `serde = { version = "1", features = ["derive"] }`, `serde_json = "1"`
    - Dev: `proptest = "1"`, `qrcode = "0.14"`
    - _Requirements: 3.1, 3.5, 4.3_

  - [x] 1.3 Add frontend npm dependencies
    - `@tauri-apps/api`, `@tauri-apps/plugin-clipboard-manager`, `@tauri-apps/plugin-opener`, `@tauri-apps/plugin-shell`
    - Dev: `vitest ^2`, `@testing-library/svelte ^5`, `@testing-library/jest-dom ^6`, `jsdom ^24`
    - _Requirements: 4.3_

- [x] 2. Configure Tauri windows and permissions
  - [x] 2.1 Configure `src-tauri/tauri.conf.json`
    - `productName: "QR Code Reader"`, `version: "1.0.0"`, `identifier: "com.adams.qr-code-reader"`
    - `beforeDevCommand: "pnpm dev"`, `beforeBuildCommand: "pnpm build"`
    - Main window: `label:"main"`, `title:"QR Code Selector"`, `width:900`, `height:650`, `minWidth:800`, `minHeight:600`
    - Overlay window: `label:"overlay"`, `url:"/overlay"`, `transparent:true`, `decorations:false`, `alwaysOnTop:true`, `fullscreen:true`, `skipTaskbar:true`, `visible:false`
    - _Requirements: 1.1, 2.1_

  - [x] 2.2 Configure plugin permissions in `src-tauri/capabilities/`
    - `default.json` (main window): `core:default`, `opener:default`, `clipboard-manager:allow-write-text`, `shell:allow-open`, `core:window:allow-hide`, `core:window:allow-show`
    - `overlay.json` (overlay window): `core:default`, `core:window:allow-show`, `core:window:allow-hide`
    - _Requirements: 2.9, 2.10, 4.2, 4.3_

- [x] 3. Implement Rust backend modules
  - [x] 3.1 Implement `screen_capture` module (`src-tauri/src/screen_capture.rs`)
    - `CaptureRegion { x: i32, y: i32, width: u32, height: u32 }`
    - `capture_region(region: CaptureRegion) -> Result<Vec<u8>, String>`
    - Uses `screenshots` crate; crops to virtual-screen coordinates; encodes as PNG bytes
    - _Requirements: 2.5_

  - [x] 3.2 Write unit tests for `screen_capture` module
    - Coordinate math for region crops; error path when screenshots crate fails
    - _Requirements: 2.5_

  - [x] 3.3 Implement `qr_decoder` module (`src-tauri/src/qr_decoder.rs`)
    - `decode_qr_from_bytes(image_bytes: &[u8]) -> Result<Vec<String>, String>`
    - Uses `rxing::helpers::detect_multiple_in_image_with_hints` with `QR_CODE` hint
    - Empty `Vec` = no QR found (not an error)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.4 Write unit tests for `qr_decoder` module
    - Single QR fixture, multi-QR fixture, no-QR image, corrupt bytes
    - QR PNG fixtures generated with the `qrcode` dev crate
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.5 Implement `window_manager` module (`src-tauri/src/window_manager.rs`)
    - `open_url(app_handle: &tauri::AppHandle, url: String) -> Result<(), String>`
    - Uses `tauri_plugin_opener::OpenerExt`
    - _Requirements: 4.2_

  - [x] 3.6 Register Tauri commands and plugins in `src-tauri/src/lib.rs`
    - Commands: `capture_region`, `decode_qr`, `open_url`, `show_overlay`, `hide_overlay`
    - `decode_qr` uses `tokio::task::spawn_blocking` wrapped in `tokio::time::timeout(30s)`
    - `show_overlay` is `async fn` — polls `main` window `is_visible()` up to 500ms (50ms increments); shows overlay only once the main window is hidden
    - Plugins: `tauri_plugin_opener::init()`, `tauri_plugin_shell::init()`, `tauri_plugin_clipboard_manager::init()`
    - _Requirements: 2.9, 2.10, 3.5_

  - [x] 3.7 Write property-based and timeout tests (`src-tauri/src/proptest_tests.rs`, `lib.rs`)
    - `proptest` for coordinate/decode edge cases
    - Timeout unit tests in `lib.rs`: 1 ms timeout → error path; 30 s timeout → success path
    - _Requirements: 3.5_

- [x] 4. Checkpoint — Rust backend compiles and all tests pass
  - `cd src-tauri && cargo test --all-features`

- [x] 5. Implement Svelte state store (`src/lib/stores/appState.ts`)
  - [x] 5.1 Define types: `QrResult`, `CapturePhase`, `ProcessingState`, `AppState`
    - `CapturePhase`: `'idle' | 'selecting' | 'captured'`
    - `ProcessingState`: `'idle' | 'loading' | 'success' | 'error'`
    - Export `appState` writable store and action helpers
    - _Requirements: 3.6, 4.6_

  - [x] 5.2 Write Vitest unit tests for `appState` store
    - Every action helper transitions state correctly; `resetToIdle` in `beforeEach`
    - _Requirements: 3.6, 4.6_

- [x] 6. Implement `CopyButton.svelte` component
  - [x] 6.1 Create `src/lib/components/CopyButton.svelte`
    - `writeText` from `@tauri-apps/plugin-clipboard-manager`
    - States: idle/**Copy** → copied/**Copied!** | error/**Failed** → idle (2 s revert)
    - Rapid double-click restarts the timer
    - Theme: `#FEFAF3` border/text; copied → `#86efac`; error → `#fca5a5`
    - _Requirements: 4.3, 4.4, 4.5_

  - [x] 6.2 Write Vitest unit tests for `CopyButton.svelte`
    - Mock `@tauri-apps/plugin-clipboard-manager`; verify state transitions and revert timing
    - _Requirements: 4.3, 4.4, 4.5_

- [x] 7. Implement `ResultDisplay.svelte` component
  - [x] 7.1 Create `src/lib/components/ResultDisplay.svelte`
    - Reads `processingState`, `results`, `errorMessage` from `appState` store (no props)
    - Renders: loading spinner | error box | no-results message | result cards
    - Each card: monospace decoded text + `<CopyButton>` + conditional Open button for URLs
    - Theme: frosted glass cards (`rgba(254,250,243,0.07)` + `backdrop-filter: blur(8px)`)
    - _Requirements: 3.4, 4.1, 4.2_

  - [x] 7.2 Write Vitest unit tests for `ResultDisplay.svelte`
    - URL detection, Open button presence, loading/error/no-results states
    - _Requirements: 3.4, 4.1, 4.2_

- [x] 8. Implement `OverlayWindow.svelte` component
  - [x] 8.1 Create `src/OverlayWindow.svelte`
    - Canvas-based crosshair cursor + real-time selection rectangle with dimensions
    - Mouse events: `mousedown` (anchor), `mousemove` (resize + label), `mouseup` (emit + hide)
    - Keyboard: Escape → emit `region-cancelled` + hide
    - Hides via `getCurrentWindow().hide()`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 8.2 Write Vitest unit tests for overlay selection logic (`OverlayWindow.test.ts`)
    - Coordinate calculation, Escape cancel
    - _Requirements: 2.3, 2.4, 2.7_

- [x] 9. Implement `MainWindow.svelte` root component
  - [x] 9.1 Create `src/MainWindow.svelte`
    - Svelte 5 runes: `$derived` for store slices, `$effect` for object URL revocation
    - `handleCapture()`: sets `isOverlayOpening = true` → `getCurrentWindow().hide()` → `invoke("show_overlay")` → `startCapture()` (only after overlay confirmed visible) → `isOverlayOpening = false`
    - `isOverlayOpening: $state(false)` disables the button and shows "Opening…" during the hide+invoke sequence, preventing premature UI transition
    - `restoreMainWindow()`: `getCurrentWindow().show()` → `getCurrentWindow().setFocus()`
    - On `region-selected`: `invoke("hide_overlay")` → `handleRegionSelected()` (capture + decode) → `restoreMainWindow()` — overlay is confirmed gone before screenshot runs
    - On `region-cancelled`: `restoreMainWindow()` → `resetToIdle()` (async listener)
    - If overlay show fails: `restoreMainWindow()` → `setError()`
    - Gradient background + `#FEFAF3` text applied via `:global(html, body)`
    - _Requirements: 1.3, 1.4, 2.8, 2.9, 2.10, 3.6_

- [x] 10. Checkpoint — Full frontend integration
  - `pnpm check` (0 errors) + `pnpm test` (all pass)

- [x] 11. Wire Tauri event system and overlay window lifecycle
  - [x] 11.1 `show_overlay` / `hide_overlay` IPC commands in `lib.rs`
    - `show_overlay` is `async fn` — polls `is_visible()` up to 500ms (50ms increments); shows overlay once main window reports hidden
    - Returns `Err("Main window did not hide in time")` if still visible and not minimized after 500ms
    - Uses `tauri::Manager::get_webview_window("overlay")`
    - _Requirements: 2.1, 2.6, 2.9, 2.10_

  - [x] 11.2 Write integration test for overlay lifecycle (`OverlayLifecycle.test.ts`)
    - Verify show → region-selected → restore sequence
    - _Requirements: 2.1, 2.6, 2.9_

  - [x] 11.3 Write unit test for `show_overlay` polling logic in `lib.rs`
    - Test: window already hidden → `poll_until_hidden` returns Ok immediately (no sleep)
    - Test: window hides after several polls → waits then returns Ok
    - Test: window never hides → returns Err after polls exhausted
    - Test: checker returns Err → error propagates immediately
    - _Requirements: 2.9, 2.10_

- [x] 12. Implement and verify all error handling paths
  - [x] 12.1 `capture_region` IPC failure → `setError()` in `MainWindow.svelte`
  - [x] 12.2 `decode_qr` 30 s timeout → `setError("QR decoding timed out after 30 seconds")`
  - [x] 12.3 `open_url` silent failure in `ResultDisplay.svelte`
  - [x] 12.4 Overlay show failure → `restoreMainWindow()` + `setError()` in `handleCapture()`

- [x] 13. Final checkpoint — Full test suite
  - `pnpm check` + `pnpm test` (frontend, all pass)
  - `cd src-tauri && cargo test --all-features` (Rust, all pass)

- [x] 14. Add CI/CD GitHub Actions workflows
  - [x] 14.1 `.github/workflows/ci.yml`
    - Frontend: `pnpm check` + `pnpm test` on `ubuntu-latest`
    - Rust: `cargo test --all-features` on `windows-latest`
    - Triggers on every push and pull request to all branches
    - _Requirements: 5.1_

  - [x] 14.2 `.github/workflows/release.yml`
    - Triggers on `v[0-9]+.[0-9]+.[0-9]+` tags
    - Test gate: frontend + Rust suites before any build
    - Build matrix: `windows-latest` (MSI + NSIS), `macos-13` (Intel DMG), `macos-latest` (ARM DMG), `ubuntu-22.04` (deb + rpm + AppImage)
    - Uploads all installers as assets on a draft GitHub Release via `tauri-apps/tauri-action`
    - _Requirements: 5.2_

- [x] 15. Fix: defer `startCapture()` until overlay is confirmed visible
  - [x] 15.1 Fix premature UI state transition in `handleCapture()` (`src/MainWindow.svelte`)
    - Bug: `startCapture()` was called before `minimize()`/`hide()`, causing the main window to display "Select a region on screen..." while still visible on screen
    - Add `let isOverlayOpening = $state(false)` local flag
    - Move `startCapture()` to after `await invoke("show_overlay")` succeeds — `capturePhase` only transitions to `'selecting'` once the overlay is confirmed visible
    - Button disabled and shows "Opening…" during the hide+invoke sequence via `isOverlayOpening`
    - `isOverlayOpening` cleared in `finally` block to cover both success and error paths
    - _Requirements: 2.9, 2.10_

- [x] 16. Fix: `show_overlay` polls `is_minimized()` in addition to `is_visible()` on Windows
  - [x] 16.1 Fix `show_overlay` polling condition in `src-tauri/src/lib.rs`
    - Root cause: on Windows, `WebviewWindow::is_visible()` returns `true` even when the window is minimized, so the Rust poll was never satisfied and `show_overlay` returned an error before the overlay appeared
    - Change the `poll_until_hidden` checker in `show_overlay` from `is_visible()` only to `is_minimized() || !is_visible()` — the window is considered "out of the way" when it is either minimized OR hidden
    - The `poll_until_hidden` helper itself is unchanged; only the closure passed to it is updated
    - All 27 Rust tests pass after this change (added `minimized_window_treated_as_gone` test to cover the Windows-specific minimized-but-visible case)
    - _Requirements: 2.9, 2.10_

- [x] 17. Refactor: replace minimize/unminimize with hide/show only
  - [x] 17.1 Remove `minimize()`/`unminimize()` from `MainWindow.svelte` and `show_overlay` polling
    - `minimize()` was unreliable — the window was not being minimized as expected on the taskbar during overlay capture
    - New approach: `handleCapture()` calls only `hide()` before `invoke("show_overlay")`; `restoreMainWindow()` calls only `show()` + `setFocus()`
    - `show_overlay` Rust polling simplified back to `is_visible()` only — no `is_minimized()` check needed
    - Remove `core:window:allow-minimize` and `core:window:allow-unminimize` from `capabilities/default.json`
    - Remove `minimized_window_treated_as_gone` test (no longer applicable); 26 Rust tests pass
    - _Requirements: 2.9, 2.10_

- [x] 18. Fix: invoke `hide_overlay` before `capture_region` on region-selected
  - [x] 18.1 Reorder region-selected handler in `MainWindow.svelte` so overlay is hidden before screenshot
    - Root cause: `capture_region` was called while the overlay WebView was still composited over the screen, causing the overlay UI to appear in the captured image
    - New order: `invoke("hide_overlay")` → `handleRegionSelected()` (capture + decode) → `restoreMainWindow()`
    - `restoreMainWindow()` moved to `finally` block so it runs even if capture or decode throws
    - `region-cancelled` listener also made fully async for consistency
    - `unlistenSelected` assignment preserved — `.then((fn) => { unlistenSelected = fn })` chained correctly
    - _Requirements: 2.5, 2.6, 2.9_

## Notes

- All IPC calls cross the Tauri process boundary — always handle both `Ok` and `Err` variants on the frontend
- `decode_qr` is `async` on the Rust side; the frontend `invoke` call returns a Promise — always `await` it
- The overlay window is a separate WebView and cannot read `appState` directly — coordinate via Tauri events only
- The main window calls `hide()` before invoking `show_overlay`. The Rust `show_overlay` polls `is_visible()` up to 500ms before making the overlay visible. On `region-selected`, the frontend calls `invoke("hide_overlay")` before `capture_region` to ensure the overlay WebView is gone from the screen before the screenshot runs. `restoreMainWindow()` is called in a `finally` block after capture and decode complete.
- `core:window:allow-hide` and `core:window:allow-show` must be present in `capabilities/default.json` for the main window to hide/show itself via `getCurrentWindow()`

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
    { "id": 9, "tasks": ["11.1", "12.1", "12.2", "12.3", "12.4"] },
    { "id": 10, "tasks": ["11.2", "11.3", "14.1", "14.2"] },
    { "id": 11, "tasks": ["15.1", "16.1", "17.1", "18.1"] }
  ]
}
```
