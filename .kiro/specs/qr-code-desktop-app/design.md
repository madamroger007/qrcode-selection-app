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

## Tauri Window Configuration

### Main Window (`tauri.conf.json`)
```json
{
  "label": "main",
  "title": "QR Code Reader",
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
  "transparent": true,
  "decorations": false,
  "alwaysOnTop": true,
  "fullscreen": true,
  "skipTaskbar": true,
  "visible": false,
  "url": "overlay.html"
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
pub fn open_url(url: String) -> Result<(), String>
```
- Delegates to Tauri's `shell::open` for the system default browser.

### `lib.rs` / `main.rs` — Tauri Commands
```rust
#[tauri::command]
async fn capture_region(region: CaptureRegion) -> Result<Vec<u8>, String>

#[tauri::command]
async fn decode_qr(image_bytes: Vec<u8>) -> Result<Vec<String>, String>
// Wrapped in tokio::time::timeout(Duration::from_secs(30), ...)
// Returns Err("QR decoding timed out after 30 seconds") on expiry

#[tauri::command]
async fn open_url(url: String) -> Result<(), String>
```
Plugins registered: `tauri_plugin_clipboard_manager::init()`, `tauri_plugin_shell::init()`.

---

## Rust Crate Dependencies

| Crate | Version | Purpose |
|---|---|---|
| `rxing` | `0.5` | Pure-Rust ZXing QR decoder |
| `screenshots` | `0.8` | Cross-platform screen capture |
| `image` | `0.25` | PNG decode for rxing input |
| `tokio` | `1` (features: full) | Async runtime, timeout support |
| `tauri-plugin-clipboard-manager` | `2` | Clipboard write |
| `tauri-plugin-shell` | `2` | Open URLs in browser |
| `proptest` | `1` (dev) | Property-based tests |

---

## Frontend State Model (`appState.ts`)

```typescript
type ProcessingState = 'idle' | 'loading' | 'success' | 'error';
type CapturePhase = 'idle' | 'selecting' | 'capturing' | 'decoding';

interface AppState {
  capturePhase: CapturePhase;
  processingState: ProcessingState;
  previewImageUrl: string | null;
  results: string[];
  errorMessage: string | null;
}
```

Initial state: `{ capturePhase: 'idle', processingState: 'idle', previewImageUrl: null, results: [], errorMessage: null }`

### Action helpers exported from the store

| Helper | Effect |
|---|---|
| `startCapture()` | `capturePhase → 'selecting'` |
| `setPreview(url)` | sets `previewImageUrl`, `capturePhase → 'capturing'` |
| `setLoading()` | `processingState → 'loading'`, `capturePhase → 'decoding'` |
| `setResults(r)` | `results → r`, `processingState → 'success'`, `capturePhase → 'idle'` |
| `setError(msg)` | `errorMessage → msg`, `processingState → 'error'`, `capturePhase → 'idle'` |
| `resetToIdle()` | resets all fields to initial values |

---

## Frontend Components

### `MainWindow.svelte`
Root component. Subscribes to `appState`. Renders:
- "Capture QR Code" button (disabled when `processingState === 'loading'`)
- Loading spinner when `capturePhase === 'decoding'`
- Error message when `processingState === 'error'`
- Preview image of the captured region
- `<ResultDisplay>` for each decoded result
- Orchestrates the full workflow: show overlay → receive region → invoke `capture_region` → invoke `decode_qr` → update store

### `OverlayWindow.svelte`
Fullscreen, transparent Svelte component for the overlay window. Responsibilities:
- Canvas-based crosshair cursor and real-time selection rectangle rendering
- Mouse event handling: `mousedown` (anchor), `mousemove` (resize rect + show dimensions), `mouseup` (emit region + close)
- Keyboard handler: `Escape` key cancels and closes overlay
- Emits a Tauri event (`region-selected`) with `{ x, y, width, height }` payload on mouseup
- Emits a Tauri event (`capture-cancelled`) on Escape
- Uses `window.__TAURI__.window` APIs to hide itself after selection

### `ResultDisplay.svelte`
Props: `result: string` (a single decoded text value).
- Displays the decoded text
- Detects if text starts with `http://` or `https://`; if so, renders an "Open URL" button that calls `invoke('open_url', { url: result })`
- Renders `<CopyButton text={result} />`

### `CopyButton.svelte`
Props: `text: string`.
- Calls `invoke('plugin:clipboard-manager|write_text', { text })` on click (or via `@tauri-apps/plugin-clipboard-manager` JS API)
- State machine: `idle → copying → copied | error`
- Shows "Copied!" for 1500 ms then reverts to idle
- Shows error feedback if clipboard write fails

---

## Overlay Window Lifecycle

```
User clicks "Capture QR Code"
  → MainWindow calls Tauri window API to show overlay window
  → OverlayWindow becomes visible (fullscreen, transparent, always-on-top)

User drags a region
  → OverlayWindow renders selection rect with real-time dimensions

User releases mouse
  → OverlayWindow emits 'region-selected' event { x, y, width, height }
  → OverlayWindow hides itself
  → MainWindow receives event, calls invoke('capture_region', region)
  → MainWindow calls invoke('decode_qr', { imageBytes })
  → MainWindow updates appState with results or error

User presses Escape
  → OverlayWindow emits 'capture-cancelled'
  → OverlayWindow hides itself
  → MainWindow resets appState to idle
```

---

## Tauri Capabilities (`src-tauri/capabilities/`)

### `default.json` (main window)
- `clipboard-manager:allow-write-text`
- `shell:allow-open`
- Window show/hide permissions

### `overlay.json` (overlay window)
- Permissions scoped to the overlay window label
- Window hide permission so the overlay can close itself

---

## IPC Command Summary

| Command | Direction | Input | Output |
|---|---|---|---|
| `capture_region` | Frontend → Rust | `{ x, y, width, height }` | `Vec<u8>` (PNG bytes) or error |
| `decode_qr` | Frontend → Rust | `{ imageBytes: number[] }` | `string[]` (decoded texts) or error |
| `open_url` | Frontend → Rust | `{ url: string }` | `void` or error |
| `plugin:clipboard-manager\|write_text` | Frontend → Plugin | `{ text: string }` | `void` or error |

---

## Testing Strategy

### Rust (unit + property-based)
- `screen_capture`: coordinate math for region crop; error path when screenshots crate fails
- `qr_decoder`: single QR fixture, multi-QR fixture, no-QR image, corrupt bytes
- `proptest`: property-based tests for coordinate and decode edge cases

### Frontend (Vitest + @testing-library/svelte)
- `appState` store: verify each action helper transitions state correctly
- `CopyButton.svelte`: mock Tauri IPC; verify copied/error states and revert timing
- `ResultDisplay.svelte`: verify URL detection, Open URL button presence, CopyButton rendering
- `OverlayWindow.svelte`: selection logic (coordinate calculation, Escape cancel)
- `OverlayWindow` lifecycle: integration test for overlay show/hide sequencing
