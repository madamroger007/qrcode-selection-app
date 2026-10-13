# Tech Stack

## Languages
- **TypeScript + Svelte** — frontend (all files under `src/`)
- **Rust** — backend (all files under `src-tauri/src/`)

## Frameworks & Core Libraries

| Layer | Library | Version |
|---|---|---|
| Desktop shell | Tauri v2 | `2` |
| Frontend framework | SvelteKit + Svelte 5 | `^2.65.1` / `^5.56.3` |
| Build tool | Vite | `^8.0.16` |
| Static adapter | `@sveltejs/adapter-static` | `^3.0.10` |
| QR decoding | `rxing` (pure-Rust ZXing port) | `0.9` |
| Screen capture | `screenshots` | `0.8` |
| Image handling | `image` | `0.25` |
| Async runtime | `tokio` (full features) | `1` |
| Clipboard | `tauri-plugin-clipboard-manager` | `2` |
| URL opener | `tauri-plugin-opener` + `tauri-plugin-shell` | `2` |
| Serialization | `serde` + `serde_json` | `1` |

## Testing Libraries

| Layer | Library |
|---|---|
| Frontend test runner | Vitest `^2` |
| Component tests | `@testing-library/svelte` `^5` |
| DOM matchers | `@testing-library/jest-dom` `^6` |
| Test DOM | jsdom `^24` |
| Rust unit tests | Built-in `#[test]` / `#[tokio::test]` |
| Property-based tests (Rust) | `proptest` `1` (dev-dep) |
| QR encode fixtures (Rust) | `qrcode` `0.14` (dev-dep) |

## Common Commands

```sh
# Full Tauri app (Rust + Svelte, hot reload)
pnpm tauri dev

# Production build
pnpm tauri build

# Frontend only
pnpm dev          # Vite dev server on port 1420
pnpm build        # Build static assets
pnpm check        # svelte-kit sync + svelte-check type checking

# Frontend tests (single-pass, no watch mode)
pnpm test

# Rust tests only
cd src-tauri && cargo test
```

> Vite always listens on port **1420** (strict — fails if the port is busy).
> `pnpm test` runs `vitest --run`, which executes once and exits — do not use watch mode in automated contexts.
