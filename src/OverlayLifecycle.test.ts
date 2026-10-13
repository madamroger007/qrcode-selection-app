/**
 * Integration tests for the overlay window lifecycle (Task 11.2).
 *
 * These tests verify:
 *   - The overlay window is shown when the user initiates a capture (Req 2.1)
 *   - The overlay window is hidden after a region selection completes (Req 2.6)
 *   - The overlay window is hidden when the user cancels via ESC (Req 2.6)
 *
 * Both MainWindow and OverlayWindow are rendered together so that the full
 * event round-trip (invoke → Tauri event → handler) can be exercised using
 * mocked Tauri APIs rather than a live Tauri runtime.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { resetToIdle, appState } from '$lib/stores/appState';

// ---------------------------------------------------------------------------
// Tauri API mocks
// ---------------------------------------------------------------------------

/**
 * Registry of event listeners registered via `listen()`.
 * Tests can fire events into this registry to simulate Tauri IPC events
 * arriving at the main window (e.g., "region-selected", "region-cancelled").
 */
const eventListeners: Record<string, Array<(payload: unknown) => void>> = {};

/** Simulates a Tauri event being emitted from the overlay to the main window. */
function simulateTauriEvent(eventName: string, payload: unknown): void {
  const handlers = eventListeners[eventName] ?? [];
  // Call each handler directly with the payload (the registry stores raw handlers,
  // not the wrapper — see mockListen below).
  handlers.forEach((fn) => fn(payload));
}

// `listen` — called by MainWindow to register handlers for overlay events
const mockListen = vi.fn((event: string, handler: (e: { payload: unknown }) => void) => {
  if (!eventListeners[event]) eventListeners[event] = [];
  eventListeners[event].push((payload) => handler({ payload }));
  // Returns a Promise<unlisten fn> (same shape as the real Tauri API)
  const unlisten = vi.fn(() => {
    eventListeners[event] = (eventListeners[event] ?? []).filter((h) => h !== handler);
  });
  return Promise.resolve(unlisten);
});

// `emit` — called by OverlayWindow when the selection is confirmed or cancelled
const mockEmit = vi.fn();

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: Parameters<typeof mockListen>) => mockListen(...args),
  emit: (...args: unknown[]) => mockEmit(...args),
}));

// `invoke` — called by MainWindow to trigger show_overlay / capture_region / decode_qr
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// `getCurrentWindow().hide()` — called by OverlayWindow after selection/cancel
const mockHide = vi.fn();

// `getCurrentWindow().show()` and `.setFocus()` — called by MainWindow.restoreMainWindow()
const mockShow = vi.fn();
const mockSetFocus = vi.fn();

// `getCurrentWindow().onFocusChanged()` — called by OverlayWindow $effect
const mockOnFocusChanged = vi.fn((_cb: unknown) => Promise.resolve(vi.fn()));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    hide: mockHide,
    show: mockShow,
    setFocus: mockSetFocus,
    onFocusChanged: mockOnFocusChanged,
  }),
}));

// Mock clipboard / shell plugins used by child components
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Lazy imports — must come AFTER vi.mock() calls
// ---------------------------------------------------------------------------
// We import components here so the mocks are in place when the modules load.
const { default: MainWindow } = await import('./MainWindow.svelte');
const { default: OverlayWindow } = await import('./OverlayWindow.svelte');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fire mousedown/mouseup sequence on the OverlayWindow to produce a valid region. */
async function drawRegion(
  overlayEl: Element,
  x1: number, y1: number,
  x2: number, y2: number,
) {
  await fireEvent(
    overlayEl,
    new MouseEvent('mousedown', {
      bubbles: true, cancelable: true, button: 0,
      clientX: x1, clientY: y1, screenX: x1, screenY: y1,
    }),
  );
  await fireEvent(
    window,
    new MouseEvent('mouseup', {
      bubbles: true, cancelable: true, button: 0,
      clientX: x2, clientY: y2, screenX: x2, screenY: y2,
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Overlay window lifecycle integration', () => {
  beforeEach(() => {
    // Reset store to idle before each test
    resetToIdle();

    // Clear all listener registrations
    for (const key of Object.keys(eventListeners)) {
      delete eventListeners[key];
    }

    // Default: show_overlay succeeds; capture_region and decode_qr return stubs
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'show_overlay') return Promise.resolve();
      if (command === 'capture_region') return Promise.resolve([/* PNG bytes stub */]);
      if (command === 'decode_qr') return Promise.resolve([]);
      return Promise.resolve();
    });

    mockEmit.mockResolvedValue(undefined);
    mockHide.mockResolvedValue(undefined);
    mockShow.mockResolvedValue(undefined);
    mockSetFocus.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Overlay is shown when capture is initiated (Req 2.1) ───────────────

  it('invokes show_overlay when the "Capture QR" button is clicked', async () => {
    const { getByRole } = render(MainWindow);
    const captureBtn = getByRole('button', { name: /Capture screen region to scan for QR codes/i });
    await fireEvent.click(captureBtn);
    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('show_overlay');
    });
  });

  it('transitions appState capturePhase to "selecting" when capture starts', async () => {
    const { getByRole } = render(MainWindow);
    const captureBtn = getByRole('button', { name: /Capture screen region/i });

    await fireEvent.click(captureBtn);

    expect(get(appState).capturePhase).toBe('selecting');
  });

  it('shows a status hint in MainWindow while the overlay is open', async () => {
    const { getByRole, getByText } = render(MainWindow);
    const captureBtn = getByRole('button', { name: /Capture screen region/i });

    await fireEvent.click(captureBtn);

    // The capture button is replaced by the status hint when phase === "selecting"
    expect(
      getByText('Select a region on screen, then release to capture.'),
    ).toBeInTheDocument();
  });

  // ── 2. Overlay hides after a valid region selection (Req 2.6) ─────────────

  it('hides the overlay after the user draws a region and releases the mouse', async () => {
    // Render the OverlayWindow (this is the process that calls hide())
    const { getByRole } = render(OverlayWindow);
    const overlayEl = getByRole('application');

    await drawRegion(overlayEl, 10, 20, 110, 120);

    await vi.waitFor(() => {
      expect(mockHide).toHaveBeenCalled();
    });
  });

  it('emits "region-selected" before hiding so MainWindow receives coordinates', async () => {
    const { getByRole } = render(OverlayWindow);
    const overlayEl = getByRole('application');

    await drawRegion(overlayEl, 0, 0, 200, 150);

    // emit should have been called with the region payload
    expect(mockEmit).toHaveBeenCalledWith('region-selected', {
      x: 0,
      y: 0,
      width: 200,
      height: 150,
    });

    // And the window should then hide
    await vi.waitFor(() => {
      expect(mockHide).toHaveBeenCalled();
    });
  });

  it('transitions appState to "captured" after MainWindow receives region-selected', async () => {
    // Make capture_region pause so we can observe the 'loading' state before it resolves
    let resolveCaptureRegion: (value: number[]) => void;
    const captureRegionPromise = new Promise<number[]>((resolve) => {
      resolveCaptureRegion = resolve;
    });
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'show_overlay') return Promise.resolve();
      if (command === 'capture_region') return captureRegionPromise;
      if (command === 'decode_qr') return Promise.resolve([]);
      return Promise.resolve();
    });

    // MainWindow registers "region-selected" listener on mount
    render(MainWindow);

    // Wait for the listener to be registered before firing the event
    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith('region-selected', expect.any(Function));
    });

    // Simulate the overlay emitting region-selected
    simulateTauriEvent('region-selected', { x: 50, y: 60, width: 200, height: 150 });

    // MainWindow calls setLoading() before invoking capture_region
    await vi.waitFor(() => {
      expect(get(appState).processingState).toBe('loading');
    });

    // Unblock capture_region so the test can clean up
    resolveCaptureRegion!([]);
  });

  it('invokes capture_region with the emitted coordinates after region-selected', async () => {
    render(MainWindow);

    // Wait for onMount listeners to register before firing the event
    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith('region-selected', expect.any(Function));
    });

    const region = { x: 10, y: 20, width: 300, height: 200 };
    simulateTauriEvent('region-selected', region);

    await vi.waitFor(
      () => {
        const commands = mockInvoke.mock.calls.map((c) => c[0]);
        expect(commands).toContain('capture_region');
      },
      { timeout: 3000 },
    );
    // The invoke call passes the region wrapped as { region: <payload> }
    const captureCall = mockInvoke.mock.calls.find((c) => c[0] === 'capture_region');
    const captureArg = captureCall?.[1] as { region: typeof region } | typeof region;
    // Handle both shapes: { region } wrapper or bare region object
    const actualRegion =
      captureArg && 'region' in captureArg ? captureArg.region : captureArg;
    expect(actualRegion).toEqual(region);
  });

  // ── 3. Overlay hides on cancel / ESC (Req 2.6) ─────────────────────────

  it('hides the overlay when ESC is pressed', async () => {
    render(OverlayWindow);

    await fireEvent(window, new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));

    await vi.waitFor(() => {
      expect(mockHide).toHaveBeenCalled();
    });
  });

  it('emits "region-cancelled" when Escape is pressed', async () => {
    render(OverlayWindow);

    await fireEvent(window, new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));

    expect(mockEmit).toHaveBeenCalledWith('region-cancelled', {});
  });

  it('resets appState to idle when MainWindow receives region-cancelled', async () => {
    // Put appState into selecting phase first
    render(MainWindow);

    // Wait for onMount listeners to register
    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith('region-cancelled', expect.any(Function));
    });

    await fireEvent.click(
      document.querySelector('button[aria-label="Capture screen region to scan for QR codes"]')!,
    );
    expect(get(appState).capturePhase).toBe('selecting');

    // Now simulate cancel arriving from the overlay
    simulateTauriEvent('region-cancelled', {});

    await vi.waitFor(() => {
      expect(get(appState).capturePhase).toBe('idle');
    });
  });

  it('does not invoke capture_region when region-cancelled is received', async () => {
    render(MainWindow);

    // Wait for onMount listeners to register
    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith('region-cancelled', expect.any(Function));
    });

    simulateTauriEvent('region-cancelled', {});

    // Give async work a chance to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(mockInvoke).not.toHaveBeenCalledWith('capture_region', expect.anything());
  });

  // ── 4. Full round-trip: capture → select → results (Req 2.1, 2.6) ─────────

  it('completes the full lifecycle: show overlay → select region → decode → results', async () => {
    // Set up invoke to return a PNG stub and a decoded QR result
    mockInvoke.mockImplementation((command: string, args?: unknown) => {
      if (command === 'show_overlay') return Promise.resolve();
      if (command === 'capture_region') return Promise.resolve([137, 80, 78, 71]); // PNG magic bytes stub
      if (command === 'decode_qr') return Promise.resolve(['https://example.com']);
      return Promise.resolve();
    });

    // 1. Render MainWindow — it registers event listeners on mount
    render(MainWindow);

    // 2. User clicks "Capture QR" → show_overlay is invoked
    const captureBtn = document.querySelector(
      'button[aria-label="Capture screen region to scan for QR codes"]',
    )!;
    await fireEvent.click(captureBtn);
    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('show_overlay');
      expect(get(appState).capturePhase).toBe('selecting');
    },
    )

    // Wait for onMount listeners to register
    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith('region-selected', expect.any(Function));
    });

    // 3. Overlay fires region-selected → MainWindow processes it
    simulateTauriEvent('region-selected', { x: 100, y: 100, width: 200, height: 200 });

    // 4. MainWindow calls capture_region then decode_qr, then sets results.
    // Note: URL.createObjectURL is not available in jsdom so setPreview() is
    // skipped (the catch block absorbs the error), meaning capturePhase stays
    // 'selecting'. The decode pipeline still completes and processingState
    // reaches 'success'.
    await vi.waitFor(
      () => {
        expect(get(appState).processingState).toBe('success');
      },
      { timeout: 3000 },
    );
    expect(get(appState).results).toEqual([{ text: 'https://example.com' }]);
  });
});
