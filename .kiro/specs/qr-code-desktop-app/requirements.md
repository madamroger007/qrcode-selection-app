# Requirements: QR Code Desktop App

## Overview

A cross-platform desktop application built with Tauri v2 and Svelte that allows users to capture an arbitrary screen region by drawing a selection, decode any QR codes present in that region, and interact with the decoded results (copy to clipboard, open URLs).

---

## Requirement 1: Application Shell

### 1.1
The application MUST launch as a native desktop window titled "QR Code Selector" with a minimum size of 800×600 pixels and a default size of 900×650 pixels.

### 1.2
The application MUST be built with Tauri v2 as the native shell and Svelte (TypeScript) as the frontend framework.

### 1.3
The application MUST display a descriptive error message to the user whenever any IPC command (screen capture, QR decode, clipboard write, URL open) fails, rather than silently failing or crashing.

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
The overlay window MUST close (hide) automatically after the user releases the mouse button, whether the capture succeeds or fails.

### 2.7
The user MUST be able to cancel the selection by pressing the ESC key. Pressing ESC MUST dismiss the overlay without performing a capture.

### 2.8
The main window MUST provide a clearly labeled button ("Capture QR Code" or equivalent) that triggers the overlay to appear.

---

## Requirement 3: QR Code Decoding

### 3.1
The application MUST decode QR codes from PNG image bytes using a pure-Rust decoding library (rxing, a ZXing port). No external process or network call is permitted for decoding.

### 3.2
The application MUST support decoding a single QR code from a captured image.

### 3.3
The application MUST support decoding multiple QR codes from a single captured image.

### 3.4
When no QR code is found in the captured region, the application MUST display a message indicating that no QR code was detected (not an error condition).

### 3.5
The QR decoding operation MUST be subject to a 30-second timeout. If decoding does not complete within 30 seconds, the operation MUST be cancelled and the user MUST be shown an error message stating the operation timed out.

### 3.6
The application MUST display a loading / processing indicator while a capture or decode operation is in progress, and the capture button MUST be disabled during this time to prevent concurrent captures.

---

## Requirement 4: Result Display and Actions

### 4.1
Each decoded QR code result MUST be displayed as a distinct item showing the full decoded text.

### 4.2
If a decoded result is a valid URL (starts with `http://` or `https://`), the application MUST display an "Open URL" button for that result. Clicking the button MUST open the URL in the system's default web browser. Failures to open the URL MUST be handled silently (no crash, no blocking error dialog).

### 4.3
Each decoded result MUST have a "Copy" button. Clicking it MUST write the decoded text to the system clipboard using the Tauri clipboard-manager plugin.

### 4.4
After a successful clipboard write, the "Copy" button MUST change its label or appearance to provide feedback (e.g., "Copied!") for a short duration (≥ 1.5 seconds), then revert.

### 4.5
If the clipboard write fails, the copy button MUST provide visible error feedback to the user.

### 4.6
The application state (capture phase, processing state, preview image, results, error message) MUST be managed in a reactive Svelte store so that all UI components stay consistent without prop-drilling.