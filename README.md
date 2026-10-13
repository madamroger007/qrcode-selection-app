<div align="center">
  <img src="./static/app-icon.png" alt="QR Code Selector logo" width="128" />
  <h1>QR Code Selector</h1>
  <p>A lightweight desktop app for scanning QR codes directly from your screen.</p>

  ![CI](https://github.com/madamroger007/qrcode-selection-app/actions/workflows/ci.yml/badge.svg)
  ![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
</div>

---

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [Option A — Download the installer (recommended)](#option-a--download-the-installer-recommended)
  - [Option B — Build from source](#option-b--build-from-source)
- [Usage](#usage)
- [Development](#development)
- [Running Tests](#running-tests)
- [License](#license)

---

## Introduction

**QR Code Selector** is a cross-platform desktop application built with [Tauri v2](https://tauri.app) and [Svelte 5](https://svelte.dev). It lets you point at any region of your screen, draw a selection box around a QR code, and instantly see the decoded result — no camera required, no browser extensions, no internet connection needed.

All processing (screen capture and QR decoding) happens entirely on your machine using a pure-Rust decoder. Nothing is sent to any server.

---

## Features

- **Draw to scan** — click and drag anywhere on your screen to capture a region
- **Multi-monitor aware** — works across all connected displays
- **Multiple QR codes** — decodes every QR code found in a single capture
- **Copy to clipboard** — one click copies any decoded result
- **Open URLs** — detected URLs get an "Open" button that launches your default browser
- **30-second decode timeout** — long-running decodes are automatically cancelled with a clear error message
- **Keyboard shortcuts** — press `Escape` to cancel a selection at any time
- **Dark mode** — follows your system color scheme automatically

---

## Screenshots

> _Add screenshots here once the app is running._

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 |
| Frontend | SvelteKit + Svelte 5 (TypeScript) |
| QR decoding | `rxing` (pure-Rust ZXing port) |
| Screen capture | `screenshots` crate |
| Build tool | Vite 8 |
| Package manager | pnpm |

---

## Prerequisites

Before installing from source you need the following tools. If you are using the pre-built installer you only need the Tauri runtime listed under Windows.

### Windows

| Tool | Purpose | Install |
|---|---|---|
| [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) | Tauri runtime (usually pre-installed on Windows 10/11) | Download from Microsoft |
| [Rust + Cargo](https://rustup.rs) | Compile the Rust backend | `winget install Rustlang.Rustup` |
| [Node.js 22+](https://nodejs.org) | Build the frontend | `winget install OpenJS.NodeJS.LTS` |
| [pnpm](https://pnpm.io) | JavaScript package manager | `npm install -g pnpm` |

> **Tip:** If you have the [VS Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) installed, Rust on Windows will work out of the box. The Tauri docs have a full [Windows prerequisites guide](https://v2.tauri.app/start/prerequisites/#windows).

---

## Installation

### Option A — Download the installer (recommended)

1. Go to the [**Releases**](https://github.com/madamroger007/qrcode-selection-app/releases) page.
2. Download the latest `.msi` or `.exe` installer for your platform.
3. Run the installer and follow the on-screen prompts.
4. Launch **QR Code Selector** from the Start Menu or desktop shortcut.

> WebView2 is required and is pre-installed on Windows 10 (version 1803+) and Windows 11. If the app fails to launch, download and install [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section).

---

### Option B — Build from source

#### 1. Clone the repository

```sh
git clone https://github.com/your-username/your-repo.git
cd your-repo
```

#### 2. Install frontend dependencies

```sh
pnpm install
```

#### 3. Run in development mode

This starts the Vite dev server and the Tauri window simultaneously with hot-reload:

```sh
pnpm tauri dev
```

#### 4. Build a production binary

```sh
pnpm tauri build
```

The compiled installer will be placed in:

```
src-tauri/target/release/bundle/
├── msi/          # Windows MSI installer
└── nsis/         # Windows NSIS (.exe) installer
```

---

## Usage

1. **Launch** the app.
2. Click the **"Capture QR"** button.
3. Your screen will dim and the cursor will become a crosshair.
4. **Click and drag** a rectangle around the QR code you want to scan. The pixel dimensions are shown in real time as you drag.
5. **Release** the mouse button — the app captures that region and decodes it instantly.
6. The decoded text appears as a result card:
   - Click **Copy** to copy the text to your clipboard.
   - If the text is a URL, click **Open** to open it in your default browser.
7. Click **Reset** to start a new capture, or press **Escape** during selection to cancel.

---

## Development

```sh
# Start the full app with hot-reload (Rust + Svelte)
pnpm tauri dev

# Type-check the frontend only
pnpm check

# Build static frontend assets only
pnpm build
```

### Recommended IDE

[VS Code](https://code.visualstudio.com/) with these extensions:

- [Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode)
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

---

## Running Tests

### Frontend (Vitest)

```sh
pnpm test
```

Runs all component and store tests once and exits. Uses `jsdom` as the test environment — no browser required.

### Rust backend (cargo test)

```sh
cd src-tauri
cargo test
```

Covers the screen capture module, QR decoder, timeout logic, and property-based edge cases.

### Continuous Integration

Every push and pull request runs both test suites automatically via GitHub Actions. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## License

This project is licensed under the [MIT License](LICENSE).
