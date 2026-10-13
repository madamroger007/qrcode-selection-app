import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import OverlayWindow from './OverlayWindow.svelte';

// ---------------------------------------------------------------------------
// Mock Tauri APIs
// ---------------------------------------------------------------------------

// Mock the emit function from @tauri-apps/api/event so we can assert on the
// events that the overlay fires without a real Tauri runtime.
const mockEmit = vi.fn();
vi.mock('@tauri-apps/api/event', () => ({
  emit: (...args: unknown[]) => mockEmit(...args),
}));

// Mock getCurrentWindow().hide() and .onFocusChanged() — the overlay calls both.
// onFocusChanged must return a Promise<UnlistenFn> matching the real Tauri API.
const mockHide = vi.fn();
const mockOnFocusChanged = vi.fn(() => Promise.resolve(() => { }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    hide: mockHide,
    onFocusChanged: mockOnFocusChanged,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fire a mousedown on an element with both client and screen coordinates. */
function mousedown(
  target: Element | Window,
  clientX: number,
  clientY: number,
  screenX = clientX,
  screenY = clientY,
) {
  return fireEvent(
    target as Element,
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX,
      clientY,
      screenX,
      screenY,
    }),
  );
}

/** Fire a mousemove on window with both client and screen coordinates. */
function mousemove(
  clientX: number,
  clientY: number,
  screenX = clientX,
  screenY = clientY,
) {
  return fireEvent(
    window,
    new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      screenX,
      screenY,
    }),
  );
}

/** Fire a mouseup on window with both client and screen coordinates. */
function mouseup(
  clientX: number,
  clientY: number,
  screenX = clientX,
  screenY = clientY,
) {
  return fireEvent(
    window,
    new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX,
      clientY,
      screenX,
      screenY,
    }),
  );
}

/** Fire a keydown event on window. */
function keydown(key: string) {
  return fireEvent(window, new KeyboardEvent('keydown', { bubbles: true, key }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OverlayWindow', () => {
  beforeEach(() => {
    mockEmit.mockResolvedValue(undefined);
    mockHide.mockResolvedValue(undefined);
    mockOnFocusChanged.mockReturnValue(Promise.resolve(() => { }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Initial render ────────────────────────────────────────────────────

  it('renders the overlay container with the correct role and accessible label', () => {
    const { getByRole } = render(OverlayWindow);
    const overlay = getByRole('application');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveAttribute(
      'aria-label',
      'Screen region selector. Click and drag to select a region. Press Escape to cancel.',
    );
  });

  it('shows the idle hint text before any interaction', () => {
    const { getByText } = render(OverlayWindow);
    expect(
      getByText('Click and drag to select a region. Press Escape to cancel.'),
    ).toBeInTheDocument();
  });

  it('does not render a selection rectangle in idle state', () => {
    const { container } = render(OverlayWindow);
    expect(container.querySelector('.selection-rect')).toBeNull();
  });

  // ── 2. mousedown starts a selection (requirement 2.3) ───────────────────

  it('enters dragging phase after mousedown on the overlay', async () => {
    const { getByRole, getByText } = render(OverlayWindow);
    const overlay = getByRole('application');

    await mousedown(overlay, 100, 100);

    // Hint text changes to the dragging message
    expect(
      getByText('Release to confirm selection. Press Escape to cancel.'),
    ).toBeInTheDocument();
  });

  it('renders the selection rectangle after mousedown', async () => {
    const { getByRole, container } = render(OverlayWindow);
    const overlay = getByRole('application');

    await mousedown(overlay, 100, 100);

    // A selection rect should appear (even if zero-size at this point)
    expect(container.querySelector('.selection-rect')).toBeInTheDocument();
  });

  it('ignores non-left-button mousedown events', async () => {
    const { getByRole, container } = render(OverlayWindow);
    const overlay = getByRole('application');

    // Right mouse button (button=2)
    await fireEvent(
      overlay,
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 50,
        clientY: 50,
      }),
    );

    // Should still be idle — no selection rect
    expect(container.querySelector('.selection-rect')).toBeNull();
  });

  // ── 3. mousemove updates the selection rectangle (requirement 2.3) ───────

  it('updates the selection rectangle dimensions as the mouse moves', async () => {
    const { getByRole, container } = render(OverlayWindow);
    const overlay = getByRole('application');

    await mousedown(overlay, 50, 50);
    await mousemove(200, 150);

    const rect = container.querySelector<HTMLElement>('.selection-rect');
    expect(rect).toBeInTheDocument();
    // Width = |200 - 50| = 150, Height = |150 - 50| = 100
    expect(rect!.style.width).toBe('150px');
    expect(rect!.style.height).toBe('100px');
  });

  it('positions the selection rectangle correctly when dragging right-down', async () => {
    const { getByRole, container } = render(OverlayWindow);
    const overlay = getByRole('application');

    await mousedown(overlay, 100, 80);
    await mousemove(300, 250);

    const rect = container.querySelector<HTMLElement>('.selection-rect');
    expect(rect!.style.left).toBe('100px');
    expect(rect!.style.top).toBe('80px');
    expect(rect!.style.width).toBe('200px');
    expect(rect!.style.height).toBe('170px');
  });

  it('handles drag in the opposite direction (up-left) with normalized coordinates', async () => {
    const { getByRole, container } = render(OverlayWindow);
    const overlay = getByRole('application');

    // Start at (300, 250), drag to (100, 80) — upper-left drag
    await mousedown(overlay, 300, 250);
    await mousemove(100, 80);

    const rect = container.querySelector<HTMLElement>('.selection-rect');
    // left = Math.min(300, 100) = 100, top = Math.min(250, 80) = 80
    expect(rect!.style.left).toBe('100px');
    expect(rect!.style.top).toBe('80px');
    // width = |100 - 300| = 200, height = |80 - 250| = 170
    expect(rect!.style.width).toBe('200px');
    expect(rect!.style.height).toBe('170px');
  });

  it('does not update the selection rect when mousemove fires before mousedown', async () => {
    const { container } = render(OverlayWindow);

    await mousemove(200, 200);

    // No dragging started, so no selection rect
    expect(container.querySelector('.selection-rect')).toBeNull();
  });

  // ── 4. mouseup finalizes selection and emits region-selected (requirement 2.3) ─

  it('emits "region-selected" with correct coordinates on mouseup', async () => {
    const { getByRole } = render(OverlayWindow);
    const overlay = getByRole('application');

    await mousedown(overlay, 10, 20, 10, 20);
    await mouseup(110, 120, 110, 120);

    expect(mockEmit).toHaveBeenCalledWith('region-selected', {
      x: 10,
      y: 20,
      width: 100,
      height: 100,
    });
  });

  it('emits "region-selected" with screen coordinates, not CSS client coordinates', async () => {
    const { getByRole } = render(OverlayWindow);
    const overlay = getByRole('application');

    // Simulate a HiDPI setup where screenX/Y differ from clientX/Y
    await mousedown(overlay, 50, 60, 100, 120);
    await mouseup(150, 160, 300, 320);

    expect(mockEmit).toHaveBeenCalledWith('region-selected', {
      x: 100,   // screenX of start
      y: 120,   // screenY of start
      width: 200,  // |300 - 100|
      height: 200, // |320 - 120|
    });
  });

  it('hides the overlay window after a valid selection', async () => {
    const { getByRole } = render(OverlayWindow);
    const overlay = getByRole('application');

    await mousedown(overlay, 10, 10);
    await mouseup(210, 210);

    // hide() is called asynchronously; wait for microtasks
    await vi.waitFor(() => {
      expect(mockHide).toHaveBeenCalled();
    });
  });

  it('emits "region-cancelled" instead of "region-selected" for a zero-size selection', async () => {
    const { getByRole } = render(OverlayWindow);
    const overlay = getByRole('application');

    // Start and end at the same point — zero-area selection
    await mousedown(overlay, 100, 100, 100, 100);
    await mouseup(100, 100, 100, 100);

    expect(mockEmit).toHaveBeenCalledWith('region-cancelled', {});
    expect(mockEmit).not.toHaveBeenCalledWith('region-selected', expect.anything());
  });

  // ── 5. Selection rectangle clamped / normalized (requirement 2.4) ────────
  //
  // The component normalizes selection coordinates so that width/height are
  // always positive (Math.abs) and the top-left corner is always Math.min of
  // the two endpoints. This means no negative values appear in the emitted
  // region regardless of drag direction.

  it('emits non-negative x and y when dragging from a further point back to origin', async () => {
    const { getByRole } = render(OverlayWindow);
    const overlay = getByRole('application');

    // Drag from (500, 400) back to (200, 150) — upper-left drag
    await mousedown(overlay, 500, 400, 500, 400);
    await mouseup(200, 150, 200, 150);

    expect(mockEmit).toHaveBeenCalledWith('region-selected', {
      x: 200,   // Math.min(500, 200)
      y: 150,   // Math.min(400, 150)
      width: 300,  // |200 - 500|
      height: 250, // |150 - 400|
    });
  });

  it('always emits positive width and height regardless of drag direction', async () => {
    const { getByRole } = render(OverlayWindow);
    const overlay = getByRole('application');

    // Drag rightward then leftward
    await mousedown(overlay, 300, 300, 300, 300);
    await mouseup(50, 50, 50, 50);

    const call = mockEmit.mock.calls[0];
    const payload = call[1] as { x: number; y: number; width: number; height: number };

    expect(payload.width).toBeGreaterThan(0);
    expect(payload.height).toBeGreaterThan(0);
    expect(payload.x).toBeGreaterThanOrEqual(0);
    expect(payload.y).toBeGreaterThanOrEqual(0);
  });

  // ── 6. Escape key cancels selection (requirement 2.7) ────────────────────

  it('emits "region-cancelled" when Escape is pressed during idle phase', async () => {
    render(OverlayWindow);

    await keydown('Escape');

    expect(mockEmit).toHaveBeenCalledWith('region-cancelled', {});
  });

  it('emits "region-cancelled" when Escape is pressed during dragging phase', async () => {
    const { getByRole } = render(OverlayWindow);
    const overlay = getByRole('application');

    await mousedown(overlay, 100, 100);
    await mousemove(200, 200);
    await keydown('Escape');

    expect(mockEmit).toHaveBeenCalledWith('region-cancelled', {});
    expect(mockEmit).not.toHaveBeenCalledWith('region-selected', expect.anything());
  });

  it('hides the overlay window after Escape cancels the selection', async () => {
    render(OverlayWindow);

    await keydown('Escape');

    await vi.waitFor(() => {
      expect(mockHide).toHaveBeenCalled();
    });
  });

  it('does not emit "region-selected" when Escape cancels a drag in progress', async () => {
    const { getByRole } = render(OverlayWindow);
    const overlay = getByRole('application');

    await mousedown(overlay, 50, 50);
    await mousemove(300, 300);
    await keydown('Escape');

    expect(mockEmit).not.toHaveBeenCalledWith('region-selected', expect.anything());
  });

  // ── 7. Enter key finalizes selection (bonus — covered by component logic) ─

  it('confirms selection when Enter is pressed while dragging', async () => {
    const { getByRole } = render(OverlayWindow);
    const overlay = getByRole('application');

    await mousedown(overlay, 0, 0, 0, 0);
    await mousemove(100, 80, 100, 80);

    await fireEvent(window, new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));

    expect(mockEmit).toHaveBeenCalledWith('region-selected', {
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
  });
});
