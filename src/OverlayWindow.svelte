<script lang="ts">
  import { emit } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";

  // --- Types ---
  interface Point {
    clientX: number;
    clientY: number;
    screenX: number;
    screenY: number;
  }

  interface SelectionRect {
    /** CSS pixel coords for rendering the highlight box */
    left: number;
    top: number;
    width: number;
    height: number;
    /** Absolute screen coords for IPC payload */
    screenX: number;
    screenY: number;
    screenWidth: number;
    screenHeight: number;
  }

  // --- State (Svelte 5 runes) ---
  let isDragging = $state(false);
  let phase = $state<"idle" | "dragging" | "done">("idle");
  let startPoint = $state<Point | null>(null);
  let currentPoint = $state<Point | null>(null);

  // Derived selection rect (normalized so width/height are always positive)
  const selectionRect: SelectionRect | null = $derived(
    startPoint && currentPoint
      ? {
          left: Math.min(startPoint.clientX, currentPoint.clientX),
          top: Math.min(startPoint.clientY, currentPoint.clientY),
          width: Math.abs(currentPoint.clientX - startPoint.clientX),
          height: Math.abs(currentPoint.clientY - startPoint.clientY),
          screenX: Math.min(startPoint.screenX, currentPoint.screenX),
          screenY: Math.min(startPoint.screenY, currentPoint.screenY),
          screenWidth: Math.abs(currentPoint.screenX - startPoint.screenX),
          screenHeight: Math.abs(currentPoint.screenY - startPoint.screenY),
        }
      : null,
  );

  // --- Helpers ---
  async function hideOverlay(): Promise<void> {
    try {
      await getCurrentWindow().hide();
    } catch {
      // Fallback: the Rust side may also hide the window after receiving the event
    }
  }

  async function confirmSelection(): Promise<void> {
    const rect = selectionRect;
    if (!rect || rect.screenWidth < 1 || rect.screenHeight < 1) {
      await cancelSelection();
      return;
    }

    phase = "done";

    try {
      await emit("region-selected", {
        x: rect.screenX,
        y: rect.screenY,
        width: rect.screenWidth,
        height: rect.screenHeight,
      });
    } catch {
      // Ignore — main window may log the IPC error; overlay still hides
    }

    await hideOverlay();
  }

  async function cancelSelection(): Promise<void> {
    phase = "done";

    try {
      await emit("region-cancelled", {});
    } catch {
      // Ignore
    }

    await hideOverlay();
  }

  // --- Global event handlers (registered once via $effect) ---
  function handleMouseDown(e: MouseEvent): void {
    if (phase === "done") return;
    // Only respond to left button
    if (e.button !== 0) return;

    isDragging = true;
    phase = "dragging";
    startPoint = {
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
    };
    currentPoint = { ...startPoint };
    e.preventDefault();
  }

  function handleMouseMove(e: MouseEvent): void {
    if (!isDragging) return;
    currentPoint = {
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
    };
    e.preventDefault();
  }

  function handleMouseUp(e: MouseEvent): void {
    if (!isDragging) return;
    isDragging = false;
    currentPoint = {
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
    };
    confirmSelection();
    e.preventDefault();
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      cancelSelection();
    }
    if (e.key === "Enter" && phase === "dragging") {
      isDragging = false;
      confirmSelection();
    }
  }

  // Register and clean up global listeners
  $effect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);

    // Reset state whenever the overlay window gains focus (i.e. becomes visible again),
    // so every new capture session starts clean.
    let unlistenFocus: (() => void) | null = null;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          isDragging = false;
          phase = "idle";
          startPoint = null;
          currentPoint = null;
        }
      })
      .then((unlisten) => {
        unlistenFocus = unlisten;
      });

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("keydown", handleKeyDown);
      unlistenFocus?.();
    };
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- The role="application" and aria-label satisfy the a11y requirement for an interactive overlay -->
<div
  class="overlay"
  role="application"
  aria-label="Screen region selector. Click and drag to select a region. Press Escape to cancel."
  onmousedown={handleMouseDown}
>
  <!-- Hint tooltip -->
  <div class="hint" aria-live="polite">
    {#if phase === "dragging"}
      Release to confirm selection. Press ESC to cancel.
    {:else if phase === "idle"}
      Click and drag to select a region. Press ESC to cancel.
    {/if}
  </div>

  <!-- Selection highlight -->
  {#if selectionRect && (phase === "dragging" || phase === "done")}
    <div
      class="selection-rect"
      style:left="{selectionRect.left}px"
      style:top="{selectionRect.top}px"
      style:width="{selectionRect.width}px"
      style:height="{selectionRect.height}px"
      aria-hidden="true"
    ></div>

    <!-- Dimension label shown while dragging -->
    {#if phase === "dragging" && selectionRect.screenWidth > 0 && selectionRect.screenHeight > 0}
      <div
        class="dimension-label"
        style:left="{selectionRect.left + selectionRect.width + 8}px"
        style:top="{selectionRect.top + selectionRect.height + 8}px"
        aria-hidden="true"
      >
        {selectionRect.screenWidth} × {selectionRect.screenHeight}
      </div>
    {/if}
  {/if}
</div>

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(html, body) {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: transparent;
  }

  /* Full-screen transparent overlay with dark tint and crosshair cursor */
  .overlay {
    position: fixed;
    inset: 0;
    /* Semi-transparent dark tint (requirement 2.2) */
    background-color: rgba(0, 0, 0, 0.4);
    cursor: crosshair;
    user-select: none;
    -webkit-user-select: none;
  }

  /* Hint bar at the top of the screen (requirement 2.7) */
  .hint {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    padding: 0.5em 1em;
    background-color: rgba(0, 0, 0, 0.6);
    color: #ffffff;
    font-family: system-ui, sans-serif;
    font-size: 0.9rem;
    text-align: center;
    pointer-events: none;
    z-index: 10;
  }

  /* Selection rectangle highlight (requirements 2.3, 2.4) */
  .selection-rect {
    position: absolute;
    /* Bright border makes the region clearly visible */
    border: 2px solid #3b82f6;
    /* Translucent fill so content beneath is still visible */
    background-color: rgba(59, 130, 246, 0.15);
    /* Punch-through effect: remove the dark tint inside the selection */
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
    pointer-events: none;
    z-index: 5;
  }

  /* Dimension readout shown next to the selection corner */
  .dimension-label {
    position: absolute;
    padding: 0.2em 0.5em;
    border-radius: 3px;
    background-color: rgba(0, 0, 0, 0.75);
    color: #ffffff;
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    white-space: nowrap;
    pointer-events: none;
    z-index: 10;
  }
</style>
