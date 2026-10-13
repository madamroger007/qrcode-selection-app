# Requirements: QR Code Desktop App

## Overview

A desktop application built with Tauri v2 and Svelte 5 that allows users to capture an arbitrary screen region by drawing a selection, decode any QR codes present in that region, and interact with the decoded results (copy to clipboard, open URLs). The app targets Windows as the primary platform and is packaged as an MSI/NSIS installer via GitHub Actions.

---

## Requirement 1: Application Shell

### 1.1
The application MUST launch as a native desktop window titled **"QR Code Selector"** with a minimum size of 800×600 pixels and a default size of 900×650 pixels.

### 1.2
The application MUST be built with Tauri v2 as the native shell and Svelte 5 (TypeScript) as the frontend framework, using SvelteKit with `@sveltejs/adapter-static` for the static build.

### 1.3
The application MUST display a descriptive error message to the user whenever any IPC command (screen capture, QR decode, clipboard write, URL open, overlay show) fails, rather than silently failing or crashing.

### 1.4
The application UI MUST use a fixed gradient background (`#1B2CC1` → `#1A1953`) with cream text (`#FEFAF3`) as the sole visual theme. There is no separate dark/light mode toggle — the gradient is always applied.

---

## Requirement 2: Screen Region Selection (Overlay)

### 2.1
The application MUST present a fullscreen, transparent, always-on-top overlay window when the user initiates a screen capture. The overlay window MUST have no decorations, MUST skip the taskbar, and MUST start hidden.

### 2.2
The overlay MUST change the cursor to a crosshair to signal that the user can draw a selection.

### 2.3
The user MUST be able to click and drag to define a rectangular capture region. The selection rectangle MUST be rendered visually in real time as the user drags.

### 2.4
The selection rectangle MUST display its pixel dimensions (width × height) overlaid on or near the drawn rectangle while the user is dragging.

### 2.5
When the user releases the mouse button, the application MUST capture the pixels within the drawn rectangle using global virtual-screen coordinates and pass the captured image data to the QR decoder.

### 2.6
The overlay window MUST hide itself automatically after the user releases the mouse button, whether the capture succeeds or fails.

### 2.7
The user MUST be able to cancel the selection by pressing the **Escape** key. Pressing Escape MUST dismiss the overlay without performing a capture.

### 2.8
The main window MUST provide a clearly labeled **"Capture QR"** button that triggers the capture flow.

### 2.9
When the user clicks **"Capture QR"**, the main window MUST hide itself before the overlay appears, so it does not obstruct the selection area. The main window MUST restore itself (show and regain focus) as soon as the overlay emits either a `region-selected` or `region-cancelled` event.

---

## Requirement 3: QR Code Decoding

### 3.1
The application MUST decode QR codes from PNG image bytes using the `rxing` pure-Rust library (a ZXing port). No external process or network call is permitted for decoding.

### 3.2
The application MUST support decoding a single QR code from a captured image.

### 3.3
The application MUST support decoding multiple QR codes found in a single captured image in one pass.

### 3.4
When no QR code is found in the captured region, the application MUST display a "No QR codes found." message. This is a success state, not an error.

### 3.5
The QR decoding operation MUST be subject to a 30-second timeout. If decoding does not complete within 30 seconds, the operation MUST be cancelled and the user MUST see an error message: "QR decoding timed out after 30 seconds".

### 3.6
The application MUST display a loading spinner while a decode operation is in progress, and the **Capture QR** button MUST be disabled during this time to prevent concurrent captures.

---

## Requirement 4: Result Display and Actions

### 4.1
Each decoded QR code result MUST be displayed as a distinct card showing the full decoded text in a monospace font.

### 4.2
If a decoded result is a valid URL (starts with `http://` or `https://`), the card MUST display an **"Open"** button. Clicking it MUST open the URL in the system's default browser via `tauri-plugin-opener`. Failures to open the URL MUST be handled silently.

### 4.3
Each result card MUST have a **"Copy"** button. Clicking it MUST write the decoded text to the system clipboard using `@tauri-apps/plugin-clipboard-manager`.

### 4.4
After a successful clipboard write, the **Copy** button MUST display **"Copied!"** for 2 seconds, then revert to **"Copy"**.

### 4.5
If the clipboard write fails, the **Copy** button MUST display **"Failed"** as visible error feedback, then revert after 2 seconds.

### 4.6
All application state (capture phase, processing state, preview image URL, results, error message) MUST be managed in a single reactive Svelte store (`appState.ts`) so that all UI components stay consistent without prop-drilling.

---

## Requirement 5: CI/CD

### 5.1
Every push and pull request to any branch MUST trigger a GitHub Actions CI pipeline that runs:
- `pnpm check` (svelte-check type checking) and `pnpm test` (Vitest `--run`) on `ubuntu-latest`
- `cargo test --all-features` on `windows-latest`

### 5.2
Pushing a version tag matching `v[0-9]+.[0-9]+.[0-9]+` MUST trigger a release workflow that:
- Re-runs both test suites as a hard gate
- Builds native installers for Windows (MSI + NSIS), macOS Intel, macOS Apple Silicon, and Linux (deb, rpm, AppImage) using `tauri-apps/tauri-action`
- Uploads all installer artifacts to a draft GitHub Release

### 5.3
The `package.json` MUST declare `"packageManager": "pnpm@<version>"` so `pnpm/action-setup@v4` can resolve the correct pnpm version without an explicit `version` key in the workflow.
