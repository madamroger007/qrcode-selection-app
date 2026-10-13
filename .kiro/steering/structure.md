# Project Structure

```
example/
├── src/                              # Svelte/TypeScript frontend
│   ├── app.html                      # HTML shell (SvelteKit entry)
│   ├── MainWindow.svelte             # Root component — orchestrates capture workflow
│   ├── OverlayWindow.svelte          # Fullscreen transparent region-selector window
│   ├── OverlayWindow.test.ts         # Vitest tests for overlay selection logic
│   ├── OverlayLifecycle.test.ts      # Tests for overlay show/hide lifecycle
│   ├── test-setup.ts                 # Vitest global setup (jest-dom matchers)
│   ├── routes/
│   │   ├── +layout.ts                # SSR disabled, prerender enabled
│   │   └── +page.svelte              # Route page — renders <MainWindow />
│   └── lib/
│       ├── stores/
│       │   ├── appState.ts           # Central writable store + all action helpers
│       │   └── appState.test.ts      # Unit tests for every state transition
│       └── components/
│           ├── CopyButton.svelte     # Clipboard copy with idle/copied/error states
│           ├── CopyButton.test.ts
│           ├── ResultDisplay.svelte  # Renders results, loading, and error states
│           └── ResultDisplay.test.ts
│
├── src-tauri/                        # Rust Tauri backend
│   ├── Cargo.toml
│   ├── build.rs
│   ├── src/
│   │   ├── main.rs                   # Binary entry point — calls lib::run()
│   │   ├── lib.rs                    # IPC commands, timeout logic, plugin registration
│   │   ├── screen_capture.rs         # CaptureRegion struct + multi-monitor screen capture
│   │   ├── qr_decoder.rs             # rxing-based QR decode (multi-code, NotFoundException handling)
│   │   ├── window_manager.rs         # open_url via tauri-plugin-opener
│   │   └── proptest_tests.rs         # Property-based tests
│   ├── capabilities/
│   │   ├── default.json              # Main window permissions
│   │   └── overlay.json              # Overlay window permissions
│   └── icons/                        # App icons for all platforms
│
├── .kiro/specs/qr-code-desktop-app/  # Spec-driven development artifacts
│   ├── requirements.md
│   ├── design.md
│   └── tasks.md
│
├── package.json                      # npm scripts + frontend deps
├── vite.config.js                    # Vite + SvelteKit + Vitest config
└── pnpm-workspace.yaml
```

## Architecture Patterns

### Two-Process / Two-Window Model
- The **Rust backend** owns all system operations: screen capture, QR decode, clipboard, URL opener — exposed only as `#[tauri::command]` IPC functions.
- The **main window** (`MainWindow.svelte`) orchestrates the workflow via `invoke()` and `listen()`.
- The **overlay window** (`OverlayWindow.svelte`) is a separate WebView with no shared JS state. It communicates back only by emitting Tauri events (`region-selected`, `region-cancelled`) and hiding itself.

### Centralized Frontend State
All UI state lives in a single `writable<AppState>` store (`appState.ts`). Components subscribe to it directly — no prop drilling. The store exposes typed action helpers for every allowed transition: `startCapture`, `setPreview`, `setLoading`, `setResults`, `setError`, `resetToIdle`.

State uses two orthogonal axes:
- `CapturePhase`: `'idle' | 'selecting' | 'captured'`
- `ProcessingState`: `'idle' | 'loading' | 'success' | 'error'`

### Svelte 5 Runes
Use the runes API throughout — no legacy Options API:
- `$state()` for local component state
- `$derived()` for reactive computed values
- `$effect()` for side effects and event listener lifecycle
- `$props()` for component props

### Rust Module Conventions
- One concern per module: `screen_capture`, `qr_decoder`, `window_manager`.
- All public functions return `Result<T, String>` — errors are human-readable strings for direct IPC serialization.
- Unit tests live inside the same file as the code they test (`#[cfg(test)] mod tests { ... }`).
- CPU-bound work (QR decode) runs in `tokio::task::spawn_blocking` wrapped in `tokio::time::timeout`.

### CSS
All styles are scoped in `<style>` blocks within each `.svelte` file. Dark mode uses `@media (prefers-color-scheme: dark)`. No CSS preprocessor or utility framework — plain CSS only.

### Testing Conventions
- Tauri APIs (`invoke`, `emit`, `writeText`, `getCurrentWindow`) are mocked with `vi.mock(...)` before component render.
- Timer-dependent tests use `vi.useFakeTimers()` / `vi.useRealTimers()`.
- Store tests call `resetToIdle()` in `beforeEach` to prevent cross-test state leakage.
