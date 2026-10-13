# Design: QR Code Desktop App

## Architecture Overview

The application uses a two-process architecture mandated by Tauri v2:

- **Rust backend process** — handles all system-level operations: screen capture, QR decoding, clipboard write, and URL opening. Exposed to the frontend exclusively via Tauri IPC commands.
- **Svelte WebView frontend** — renders the UI and orchestrates the user workflow by invoking Tauri commands and reacting to their results through a central Svelte store.

The overlay selection window runs in a **second WebView** (a separate Tauri window). It cannot share JavaScript state with the main window; all coordination happens through Tauri events over the IPC bridge.

```
┌─────────────────────────────────────────────────────────┐
│  Main WebView (MainWindow.svelte)                        │
│   ┌──────────────┐   ┌───────────────┐  ┌────────────┐  │
│   │ appState     │   │ ResultDisplay │  │ CopyButton │  │
│   │ (store)      │   │ .svelte       │  │ .svelte    │  │
│   └──────────────┘   └───────────────┘  └────────────┘  │
│          │  invoke / listen                              │
└──────────┼──────────────────────────────────────────────┘
           │ Tauri IPC
┌──────────┼──────────────────────────────────────────────┐
│  Rust Backend (lib.rs / main.rs)                         │
│   ┌──────────────┐  ┌─────────────┐  ┌───────────────┐  │
│   │screen_capture│  │ qr_decoder  │  │window_manager │  │
│   │   .rs        │  │   .rs       │  │   .rs         │  │
│   └──────────────┘  └─────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
           │ Tauri events
┌──────────┼──────────────────────────────────────────────┐
│  Overlay WebView (OverlayWindow.svelte)                  │
│   Canvas-based region selector, fullscreen transparent   │
└─────────────────────────────────────────────────────────┘
```

---

## Tauri Window Configuration (`src-tauri/tauri.conf.json`)

### Main Window
```json
{
  "label": "main",
  "title": "QR Code Selector",
  "width": 900,
  "height": 650,
  "minWidth": 800,
  "minHeight": 600
}
```

### Overlay Window
```json
{
  "label": "overlay",
  "url": "/overlay",
  "transparent": true,
  "decorations": false,
  "alwaysOnTop": true,
  "fullscreen": true,
  "skipTaskbar": true,
  "visible": false
}
```

---

## Rust Backend Modules

### `screen_capture.rs`
```rust
pub struct CaptureRegion {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub fn capture_region(region: CaptureRegion) -> Result<Vec<u8>, String>
```
- Uses the `screenshots` crate to enumerate all screens.
- Finds the screen(s) covering the requested global virtual-screen rectangle.
- Crops to the specified region and encodes as PNG bytes.
- Returns `Err(String)` with a human-readable message on failure.

### `qr_decoder.rs`
```rust
pub fn decode_qr_from_bytes(image_bytes: &[u8]) -> Result<Vec<String>, String>
```
- Decodes PNG bytes to `image::DynamicImage`.
- Calls `rxing::helpers::detect_multiple_in_image_with_hints` with `DecodeHints` restricted to `QR_CODE` format.
- Returns `Ok(vec![])` when no QR code is found (not an error).
- Returns `Err(String)` on decode error.

### `window_manager.rs`
```rust
pub fn open_url(app_handle: &tauri::AppHandle, url: String) -> Result<(), String>
```
- Uses `tauri_plugin_opener::OpenerExt` to open URLs in the system default browser.
- Returns `Err(String)` with a descriptive message on failure.

### `lib.rs` — Tauri Commands
```rust
#[tauri::command]
fn capture_region(region: CaptureRegion) -> Result<Vec<u8>, String>

#[tauri::command]
async fn decode_qr(image_bytes: Vec<u8>) -> Result<Vec<String>, String>
// Runs in tokio::task::spawn_blocking wrapped in tokio::time::timeout(30s)
// Returns Err("QR decoding timed out after 30 seconds") on expiry

#[tauri::command]
fn open_url(app_handle: tauri::AppHandle, url: String) -> Result<(), String>

#[tauri::command]
fn show_overlay(app_handle: tauri::AppHandle) -> Result<(), String>
// Shows the overlay window and gives it focus

#[tauri::command]
fn hide_overlay(app_handle: tauri::AppHandle) -> Result<(), String>
// Imperatively hides the overlay window
```
Plugins registered: `tauri_plugin_opener::init()`, `tauri_plugin_shell::init()`, `tauri_plugin_clipboard_manager::init()`.

---

## Rust Crate Dependencies

| Crate | Version | Purpose |
|---|---|---|
| `rxing` | `0.9` | Pure-Rust ZXing QR decoder |
| `screenshots` | `0.8` | Cross-platform screen capture |
| `image` | `0.25` | PNG decode for rxing input |
| `tokio` | `1` (features: full) | Async runtime, timeout, spawn_blocking |
| `tauri-plugin-clipboard-manager` | `2` | Clipboard write |
| `tauri-plugin-shell` | `2` | Shell integration |
| `tauri-plugin-opener` | `2` | Open URLs in default browser |
| `serde` + `serde_json` | `1` | IPC serialization |
| `proptest` | `1` (dev) | Property-based tests |
| `qrcode` | `0.14` (dev) | Generate QR PNG fixtures for tests |

---

## Frontend State Model (`src/lib/stores/appState.ts`)

```typescript
export interface QrResult {
  text: string;
}

export type CapturePhase =
  | 'idle'       // nothing happening
  | 'selecting'  // overlay is open, user is drawing
  | 'captured';  // region captured, decode in progress or done

export type ProcessingState =
  | 'idle'
  | 'loading'
  | 'success'
  | 'error';

export interface AppState {
  capturePhase: CapturePhase;
  processingState: ProcessingState;
  previewImageUrl: string | null;
  results: QrResult[];
  errorMessage: string | null;
}
```

Initial state: `{ capturePhase: 'idle', processingState: 'idle', previewImageUrl: null, results: [], errorMessage: null }`

### Action helpers exported from the store

| Helper | Effect |
|---|---|
| `startCapture()` | Full reset + `capturePhase → 'selecting'` |
| `setPreview(url)` | `previewImageUrl → url`, `capturePhase → 'captured'` |
| `setLoading()` | `processingState → 'loading'` |
| `setResults(r)` | `results → r`, `processingState → 'success'` |
| `setError(msg)` | `errorMessage → msg`, `processingState → 'error'` |
| `resetToIdle()` | Resets all fields to initial values |

---

## Frontend Components

### `MainWindow.svelte`
Root component. Uses Svelte 5 runes (`$derived`, `$effect`). Renders:
- **Capture QR** button — disabled when `processingState === 'loading'`; hidden while `capturePhase === 'selecting'` (replaced by a status hint)
- **Reset** button — shown whenever `capturePhase !== 'idle'`
- Preview `<img>` of the captured region (shown when `previewImageUrl` is set)
- `<ResultDisplay />` for decoded results, loading spinner, and error state

Orchestrates the full workflow:
1. `handleCapture()` — hides main window → 150 ms delay → `invoke("show_overlay")`
2. On `region-selected` event — `restoreMainWindow()` → `invoke("capture_region")` → build preview blob URL → `invoke("decode_qr")` → `setResults()`
3. On `region-cancelled` event — `restoreMainWindow()` → `resetToIdle()`
4. Object URLs are revoked via `$effect` when `previewImageUrl` changes

> **Main window hide/show**: The main window hides itself before showing the overlay so it does not obstruct the selection. It restores itself (`show()` + `setFocus()`) as soon as the overlay emits any event. Requires `core:window:allow-hide` and `core:window:allow-show` in `capabilities/default.json`.

### `OverlayWindow.svelte`
Fullscreen, transparent component for the overlay window. Responsibilities:
- Canvas-based crosshair cursor and real-time selection rectangle rendering
- Mouse event handling: `mousedown` (anchor), `mousemove` (resize rect + show dimensions), `mouseup` (emit region + hide)
- Keyboard handler: `Escape` cancels and hides overlay
- Emits Tauri event `region-selected` with `{ x, y, width, height }` on mouseup
- Emits Tauri event `region-cancelled` on Escape
- Hides itself via `getCurrentWindow().hide()` after emitting either event

### `ResultDisplay.svelte`
Reads `processingState`, `results`, and `errorMessage` directly from `appState` store (no props). Renders:
- Loading spinner when `processingState === 'loading'`
- Error box when `processingState === 'error'`
- "No QR codes found." when `processingState === 'success'` and `results` is empty
- Result cards when `processingState === 'success'` and `results` has items
  - Each card shows decoded text, a `<CopyButton>`, and an "Open" button for URLs

### `CopyButton.svelte`
Props: `text: string`. Uses `writeText` from `@tauri-apps/plugin-clipboard-manager`.
- State machine: `idle → copied | error → idle` (2-second revert timer)
- Label changes: idle → **Copy**, copied → **Copied!**, error → **Failed**
- Rapid double-click restarts the revert timer cleanly

---

## Overlay Window Lifecycle

```
User clicks "Capture QR"
  → startCapture() (store reset)
  → getCurrentWindow().hide()          ← main window hides itself
  → setTimeout(150ms)
  → invoke("show_overlay")             ← overlay becomes visible

User drags a region
  → OverlayWindow renders selection rect with real-time dimensions

User releases mouse
  → OverlayWindow emits 'region-selected' { x, y, width, height }
  → OverlayWindow hides itself
  → MainWindow: restoreMainWindow() → handleRegionSelected()
     → invoke("capture_region") → build preview blob URL (setPreview)
     → invoke("decode_qr")      → setResults() or setError()

User presses Escape
  → OverlayWindow emits 'region-cancelled'
  → OverlayWindow hides itself
  → MainWindow: restoreMainWindow() → resetToIdle()
```

---

## Tauri Capabilities (`src-tauri/capabilities/`)

### `default.json` (main window)
- `core:default`
- `opener:default`
- `clipboard-manager:allow-write-text`
- `shell:allow-open`
- `core:window:allow-hide`
- `core:window:allow-show`

### `overlay.json` (overlay window)
- `core:default`
- `core:window:allow-show`
- `core:window:allow-hide`

---

## IPC Command Summary

| Command | Direction | Input | Output |
|---|---|---|---|
| `capture_region` | Frontend → Rust | `{ region: { x, y, width, height } }` | `number[]` (PNG bytes) or error |
| `decode_qr` | Frontend → Rust | `{ imageBytes: number[] }` | `string[]` (decoded texts) or error |
| `open_url` | Frontend → Rust | `{ url: string }` | `void` or error |
| `show_overlay` | Frontend → Rust | — | `void` or error |
| `hide_overlay` | Frontend → Rust | — | `void` or error |
| `plugin:clipboard-manager\|write_text` | Frontend → Plugin | `{ text: string }` | `void` or error |

---

## UI Theme

- Background: `linear-gradient(135deg, #1B2CC1 0%, #1A1953 100%)` fixed to viewport
- Primary text: `#FEFAF3`
- Capture button: `#FEFAF3` background / `#1A1953` text (inverted for contrast)
- Result cards: frosted glass — `rgba(254,250,243,0.07)` fill + `backdrop-filter: blur(8px)`
- Copied state: `#86efac` (soft green); Error state: `#fca5a5` (soft red)
- No CSS preprocessor — plain scoped `<style>` blocks per component

---

## Testing Strategy

### Rust (unit + property-based)
- `screen_capture`: coordinate math for region crop; error path when screenshots crate fails
- `qr_decoder`: single QR fixture, multi-QR fixture, no-QR image, corrupt bytes
- `lib.rs` timeout tests: 1 ms timeout on a 2 s blocking task → confirms error path; 30 s timeout on real QR → confirms success path
- `proptest_tests.rs`: property-based tests for coordinate and decode edge cases

### Frontend (Vitest + @testing-library/svelte)
- `appState` store: every action helper transitions state correctly; `resetToIdle` cleans cross-test state
- `CopyButton.svelte`: mock `writeText`; verify copied/error states and 2 s revert
- `ResultDisplay.svelte`: URL detection, Open button presence, CopyButton rendering
- `OverlayWindow.svelte`: selection coordinate calculation, Escape cancel
- `OverlayLifecycle.test.ts`: integration test for overlay show/hide event sequencing

### CI
- Frontend tests run on `ubuntu-latest` via `pnpm check` + `pnpm test` (Vitest `--run`)
- Rust tests run on `windows-latest` via `cargo test --all-features` (required for `screenshots` crate)
- Both suites are re-run as a hard gate in `release.yml` before any build
