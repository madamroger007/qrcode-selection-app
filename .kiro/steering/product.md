# Product

A Tauri v2 desktop application that reads QR codes from a screen region the user selects interactively.

## Core User Flow

1. User clicks **Capture QR** in the main window.
2. A fullscreen transparent overlay appears, turning the cursor into a crosshair.
3. User click-drags a rectangle over any part of the screen; a live selection box with dimensions is shown.
4. On mouse release the overlay emits a Tauri event with screen coordinates and hides itself.
5. The Rust backend captures that region as PNG bytes (multi-monitor aware) and decodes any QR codes found.
6. Results are displayed as cards; each card has a **Copy** button, and URLs also get an **Open** button (default browser).
7. Multiple QR codes in a single capture are all decoded and shown.
8. A 30-second decode timeout is enforced; if it expires the user sees an error message.
9. **Escape** cancels the overlay; **Reset** returns the main window to idle.

## Key Constraints

- All system-level operations (screen capture, QR decode, clipboard, URL opener) run in the Rust backend.
- The overlay window and main window share no JavaScript state; they communicate only via Tauri events.
- Error states are always surfaced to the user with a human-readable message.
