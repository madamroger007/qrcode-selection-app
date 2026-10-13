<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { onMount, onDestroy } from "svelte";

  import ResultDisplay from "$lib/components/ResultDisplay.svelte";
  import {
    appState,
    startCapture,
    setPreview,
    setLoading,
    setResults,
    setError,
    resetToIdle,
    type QrResult,
  } from "$lib/stores/appState";

  // ----- Reactive state from store -----
  let capturePhase = $derived($appState.capturePhase);
  let processingState = $derived($appState.processingState);
  let previewImageUrl = $derived($appState.previewImageUrl);

  // ----- Region type (matches the payload emitted by OverlayWindow.svelte) -----
  interface Region {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  // ----- Tauri event listeners -----
  let unlistenRegionSelected: UnlistenFn | null = null;
  let unlistenRegionCancelled: UnlistenFn | null = null;

  // ----- Show the overlay window -----
  async function showOverlay(): Promise<void> {
    await invoke("show_overlay");
  }

  // ----- Handle the "Capture QR" button -----
  async function handleCapture(): Promise<void> {
    startCapture();
    try {
      await showOverlay();
    } catch (err) {
      setError(`Failed to open selection overlay: ${String(err)}`);
    }
  }

  // ----- Process a confirmed region selection -----
  async function handleRegionSelected(region: Region): Promise<void> {
    // Validate dimensions
    if (region.width < 1 || region.height < 1) {
      setError("Selected region is too small. Please try again.");
      return;
    }

    setLoading();

    // Step 1: capture the screen region
    let imageBytes: number[];
    try {
      imageBytes = await invoke<number[]>("capture_region", { region });
    } catch (err) {
      setError(`Screen capture failed: ${String(err)}`);
      return;
    }

    // Build a preview object URL from the PNG bytes
    try {
      const blob = new Blob([new Uint8Array(imageBytes)], {
        type: "image/png",
      });
      const url = URL.createObjectURL(blob);
      setPreview(url);
    } catch {
      // Preview is non-critical; continue without it
    }

    // Step 2: decode QR codes
    let decoded: string[];
    try {
      decoded = await invoke<string[]>("decode_qr", { imageBytes });
    } catch (err) {
      setError(`QR decoding failed: ${String(err)}`);
      return;
    }

    const results: QrResult[] = decoded.map((text) => ({ text }));
    setResults(results);
  }

  // ----- Lifecycle: register/unregister event listeners -----
  onMount(async () => {
    unlistenRegionSelected = await listen<Region>(
      "region-selected",
      (event) => {
        handleRegionSelected(event.payload);
      },
    );

    unlistenRegionCancelled = await listen("region-cancelled", () => {
      // User pressed Escape or cancelled without selecting — return to idle
      resetToIdle();
    });
  });

  onDestroy(() => {
    unlistenRegionSelected?.();
    unlistenRegionCancelled?.();
  });

  // ----- Revoke object URLs when they change to prevent memory leaks -----
  let previousPreviewUrl: string | null = null;
  $effect(() => {
    const current = previewImageUrl;
    if (previousPreviewUrl && previousPreviewUrl !== current) {
      URL.revokeObjectURL(previousPreviewUrl);
    }
    previousPreviewUrl = current;
  });
</script>

<main class="main-window" aria-label="QR Code Reader">
  <header class="app-header">
    <h1>QR Code Reader</h1>
    <p class="subtitle">Capture a screen region to scan for QR codes.</p>
  </header>

  <!-- Primary action area -->
  <section class="capture-section" aria-label="Capture controls">
    {#if capturePhase === "idle" || capturePhase === "captured"}
      <button
        type="button"
        class="capture-button"
        onclick={handleCapture}
        disabled={processingState === "loading"}
        aria-label="Capture screen region to scan for QR codes"
      >
        {#if processingState === "loading"}
          Capturing…
        {:else}
          Capture QR
        {/if}
      </button>
    {:else if capturePhase === "selecting"}
      <!-- Overlay is open; show a status message instead of the button -->
      <p class="status-hint" role="status" aria-live="polite">
        Select a region on screen, then release to capture.
      </p>
    {/if}

    {#if capturePhase !== "idle"}
      <button
        type="button"
        class="reset-button"
        onclick={resetToIdle}
        aria-label="Reset and start over"
      >
        Reset
      </button>
    {/if}
  </section>

  <!-- Preview of the captured region -->
  {#if previewImageUrl}
    <section class="preview-section" aria-label="Captured region preview">
      <p class="section-label">Captured region:</p>
      <img
        src={previewImageUrl}
        alt="Captured screen region"
        class="preview-image"
      />
    </section>
  {/if}

  <!-- Results / loading / error area -->
  <section class="result-section" aria-label="QR code results">
    <ResultDisplay />
  </section>
</main>

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(html, body) {
    height: 100%;
    font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.5;
    color: #0f0f0f;
    background-color: #f6f6f6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  @media (prefers-color-scheme: dark) {
    :global(html, body) {
      color: #f6f6f6;
      background-color: #1a1a1a;
    }
  }

  .main-window {
    max-width: 760px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-height: 100vh;
  }

  /* ---- Header ---- */
  .app-header {
    text-align: center;
  }

  .app-header h1 {
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 0.25rem;
  }

  .subtitle {
    color: #6b7280;
    font-size: 0.95rem;
  }

  @media (prefers-color-scheme: dark) {
    .subtitle {
      color: #9ca3af;
    }
  }

  /* ---- Capture controls ---- */
  .capture-section {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .capture-button {
    padding: 0.65em 1.6em;
    font-size: 1rem;
    font-family: inherit;
    font-weight: 600;
    border: none;
    border-radius: 8px;
    background-color: #3b82f6;
    color: #ffffff;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      opacity 0.15s ease;
    min-width: 140px;
  }

  .capture-button:hover:not(:disabled) {
    background-color: #2563eb;
  }

  .capture-button:active:not(:disabled) {
    background-color: #1d4ed8;
  }

  .capture-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .capture-button:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 3px;
  }

  .reset-button {
    padding: 0.6em 1.1em;
    font-size: 0.9rem;
    font-family: inherit;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    color: inherit;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease;
  }

  .reset-button:hover {
    background-color: rgba(0, 0, 0, 0.05);
    border-color: #9ca3af;
  }

  .reset-button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  @media (prefers-color-scheme: dark) {
    .reset-button {
      border-color: #374151;
    }
    .reset-button:hover {
      background-color: rgba(255, 255, 255, 0.07);
      border-color: #6b7280;
    }
  }

  .status-hint {
    color: #6b7280;
    font-size: 0.95rem;
    font-style: italic;
  }

  /* ---- Preview ---- */
  .preview-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  @media (prefers-color-scheme: dark) {
    .section-label {
      color: #9ca3af;
    }
  }

  .preview-image {
    max-width: 100%;
    max-height: 220px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    object-fit: contain;
    background-color: #e5e7eb;
  }

  @media (prefers-color-scheme: dark) {
    .preview-image {
      border-color: #374151;
      background-color: #111827;
    }
  }

  /* ---- Result section ---- */
  .result-section {
    flex: 1;
  }
</style>
