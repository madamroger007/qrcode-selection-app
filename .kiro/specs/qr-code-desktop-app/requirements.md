# Requirements Document

## Introduction

A desktop application built with Tauri v2 and Svelte 5 that allows users to capture an arbitrary screen region by drawing a selection, decode any QR codes present in that region, and interact with the decoded results (copy to clipboard, open URLs). The app targets Windows as the primary platform and is packaged as an MSI/NSIS installer via GitHub Actions.

## Requirements

### Requirement 1: Application Shell

**User Story:** As a user, I want a native desktop application shell, so that I can run the QR code tool as a standalone app on my system.

#### Acceptance Criteria

1. THE Application SHALL launch as a native desktop window titled **"QR Code Selector"** with a minimum size of 800×600 pixels and a default size of 900×650 pixels.
2. THE Application SHALL be built with Tauri v2 as the native shell and Svelte 5 (TypeScript) as the frontend framework, using SvelteKit with `@sveltejs/adapter-static` for the static build.
3. IF any IPC command (screen capture, QR decode, clipboard write, URL open, overlay show) fails, THEN THE Application SHALL display a descriptive error message to the user rather than silently failing or crashing.
4. THE Application UI SHALL use a fixed gradient background (`#1B2CC1` → `#1A1953`) with cream text (`#FEFAF3`) as the sole visual theme. There is no separate dark/light mode toggle — the gradient is always applied.

### Requirement 2: Screen Region Selection (Overlay)

**User Story:** As a user, I want to draw a selection rectangle on the screen, so that I can choose which region to scan for QR codes.

#### Acceptance Criteria

1. WHEN the user initiates a screen capture, THE Application SHALL present a fullscreen, transparent, always-on-top overlay window. The overlay window SHALL have no decorations, SHALL skip the taskbar, and SHALL start hidden.
2. WHILE the overlay is active, THE Application SHALL change the cursor to a crosshair to signal that the user can draw a selection.
3. WHILE the user is dragging, THE Application SHALL render the selection rectangle visually in real time and allow the user to click and drag to define a rectangular capture region.
4. WHILE the user is dragging, THE Application SHALL display the pixel dimensions (width × height) overlaid on or near the drawn rectangle.
5. WHEN the user releases the mouse button, THE Application SHALL capture the pixels within the drawn rectangle using global virtual-screen coordinates and pass the captured image data to the QR decoder.
6. WHEN the user releases the mouse button, THE Overlay Window SHALL hide itself automatically, whether the capture succeeds or fails.
7. WHEN the user presses the **Escape** key, THE Overlay Window SHALL dismiss itself without performing a capture.
8. THE Main Window SHALL provide a clearly labeled **"Capture QR"** button that triggers the capture flow.
9. WHEN the user clicks **"Capture QR"**, THE Main Window SHALL hide itself and SHALL be fully removed from the display before the overlay window becomes visible. The Rust `show_overlay` command SHALL poll `is_visible()` for up to 500 ms in 50 ms increments and SHALL NOT show the overlay until the main window reports hidden. THE Main Window SHALL restore itself (show and regain focus) as soon as the overlay emits either a `region-selected` or `region-cancelled` event.
10. THE Application SHALL call `hide()` on the main window before invoking `show_overlay`, to remove it from the display. The Rust `show_overlay` command SHALL poll `is_visible()` for up to 500 ms in 50 ms increments before showing the overlay. THE Application SHALL call `show()` and `setFocus()` to restore the window after the overlay session ends. No minimize/unminimize is required.

### Requirement 3: QR Code Decoding

**User Story:** As a user, I want QR codes in my selected region to be decoded automatically, so that I can see the encoded text without any manual steps.

#### Acceptance Criteria

1. THE QR Decoder SHALL decode QR codes from PNG image bytes using the `rxing` pure-Rust library (a ZXing port). No external process or network call is permitted for decoding.
2. THE QR Decoder SHALL support decoding a single QR code from a captured image.
3. THE QR Decoder SHALL support decoding multiple QR codes found in a single captured image in one pass.
4. WHEN no QR code is found in the captured region, THE Application SHALL display a "No QR codes found." message. This is a success state, not an error.
5. WHEN a QR decoding operation does not complete within 30 seconds, THE Application SHALL cancel the operation and display the error message: "QR decoding timed out after 30 seconds".
6. WHILE a decode operation is in progress, THE Application SHALL display a loading spinner and SHALL disable the **Capture QR** button to prevent concurrent captures.

### Requirement 4: Result Display and Actions

**User Story:** As a user, I want to see decoded QR code results and act on them, so that I can copy text or open URLs from the codes I scan.

#### Acceptance Criteria

1. THE Result Display SHALL show each decoded QR code result as a distinct card displaying the full decoded text in a monospace font.
2. WHEN a decoded result is a valid URL (starts with `http://` or `https://`), THE Result Display SHALL show an **"Open"** button on that card. WHEN clicked, THE Application SHALL open the URL in the system's default browser via `tauri-plugin-opener`. Failures to open the URL SHALL be handled silently.
3. THE Result Display SHALL include a **"Copy"** button on each result card. WHEN clicked, THE Application SHALL write the decoded text to the system clipboard using `@tauri-apps/plugin-clipboard-manager`.
4. WHEN a clipboard write succeeds, THE Copy Button SHALL display **"Copied!"** for 2 seconds, then revert to **"Copy"**.
5. IF a clipboard write fails, THEN THE Copy Button SHALL display **"Failed"** as visible error feedback, then revert after 2 seconds.
6. THE Application SHALL manage all state (capture phase, processing state, preview image URL, results, error message) in a single reactive Svelte store (`appState.ts`) so that all UI components stay consistent without prop-drilling.

### Requirement 5: CI/CD

**User Story:** As a developer, I want automated CI/CD pipelines, so that code quality is verified on every change and releases are built consistently.

#### Acceptance Criteria

1. WHEN a push or pull request is made to any branch, THE CI Pipeline SHALL run `pnpm check` (svelte-check type checking) and `pnpm test` (Vitest `--run`) on `ubuntu-latest`, and `cargo test --all-features` on `windows-latest`.
2. WHEN a version tag matching `v[0-9]+.[0-9]+.[0-9]+` is pushed, THE Release Pipeline SHALL re-run both test suites as a hard gate, build native installers for Windows (MSI + NSIS), macOS Intel, macOS Apple Silicon, and Linux (deb, rpm, AppImage) using `tauri-apps/tauri-action`, and upload all installer artifacts to a draft GitHub Release.
3. THE `package.json` SHALL declare `"packageManager": "pnpm@<version>"` so `pnpm/action-setup@v4` can resolve the correct pnpm version without an explicit `version` key in the workflow.
