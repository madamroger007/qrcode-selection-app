# Changelog

All notable changes to **QR Code Selector** are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## Verssion [1.0.0]

Initial public release. 🎉

### Added

#### Screen Region Selection
- Fullscreen transparent overlay window with crosshair cursor activates when the user clicks **Capture QR**.
- Click-and-drag to draw a selection rectangle anywhere on the screen; pixel dimensions (`width × height`) are rendered live inside the selection box while dragging.
- Pressing **Escape** during selection cancels the overlay and returns the app to idle — no capture is performed.
- Overlay hides itself automatically after the mouse is released, whether the capture succeeds or not.

#### Multi-Monitor Screen Capture
- Captures the exact virtual-screen rectangle the user drew, correctly resolving coordinates across all connected monitors.
- Captured region is encoded as PNG bytes entirely in Rust — no temp files written to disk.

#### QR Code Decoding
- Pure-Rust decoder (`rxing`, a ZXing port) — no external process, no network call, no camera required.
- Decodes **multiple** QR codes found in a single capture in one pass.
- Returns a clear "no QR code detected" message (not an error) when the region contains no code.
- Hard **30-second timeout** on every decode operation; if the timeout fires the user sees a descriptive error message and can retry immediately.
- Loading spinner and a disabled **Capture** button prevent concurrent captures while decoding is in progress.

#### Result Cards
- Every decoded text is shown as its own result card.
- **Copy** button writes the text to the system clipboard via the Tauri clipboard-manager plugin.
  - Button label changes to **Copied!** for 1.5 seconds as visual confirmation, then reverts to idle.
  - Displays a visible error state if the clipboard write fails.
- Decoded results that begin with `http://` or `https://` automatically gain an **Open** button that launches the URL in the system default browser.

#### Application Shell
- Native desktop window — title **"QR Code Selector"**, minimum size 800 × 600 px, default size 900 × 650 px.
- All system-level operations (screen capture, QR decode, clipboard, browser open) run in the Rust backend over Tauri IPC — the renderer never touches native APIs directly.
- Every IPC failure surfaces a human-readable error message in the UI; the app never crashes or fails silently.
- **Reset** button returns the app to idle from any state.

#### Theming
- Automatic dark mode — follows the OS color scheme via `@media (prefers-color-scheme: dark)`.

---

[1.0.0]: https://github.com/madamroger007/qrcode-selection-app/releases/tag/v1.0.0
