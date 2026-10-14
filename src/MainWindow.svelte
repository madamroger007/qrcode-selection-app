<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";

  import ResultDisplay from "$lib/components/ResultDisplay.svelte";
  import {
    appState,
    startCapture,
    setPreview,
    setLoading,
    setResults,
    setError,
    resetToIdle,
  } from "$lib/stores/appState";

  // ----- Reactive store slices (Svelte 5 runes) -----
  let capturePhase = $derived($appState.capturePhase);
  let processingState = $derived($appState.processingState);
  let previewImageUrl = $derived($appState.previewImageUrl);

  // True while hide() + invoke("show_overlay") is in flight.
  // Keeps the button disabled and prevents the UI from flipping to
  // "selecting" before the overlay is actually visible.
  let isOverlayOpening = $state(false);

  // ----- Region payload type (matches OverlayWindow.svelte emit) -----
  interface Region {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  // ----- Restore the main window after the capture session ends -----
  async function restoreMainWindow(): Promise<void> {
    try {
      const win = getCurrentWindow();
      await win.show();
      await win.setFocus();
    } catch {
      // Non-critical — do not block the capture flow on restore failure
    }
  }

  // ----- Handle the "Capture QR" button -----
  async function handleCapture(): Promise<void> {
    isOverlayOpening = true;
    try {
      const win = getCurrentWindow();
      // Hide the main window so it is absent from the screen before the
      // overlay appears. The Rust show_overlay command polls is_visible()
      // for up to 500 ms, ensuring the hide has taken effect.
      await win.hide();
      await invoke("show_overlay");
      // Transition to 'selecting' only after the overlay is confirmed
      // visible — prevents the status hint appearing on a visible window.
      startCapture();
    } catch (err) {
      await restoreMainWindow();
      setError(`Failed to open selection overlay: ${String(err)}`);
    } finally {
      isOverlayOpening = false;
    }
  }

  // ----- Process a confirmed region selection -----
  async function handleRegionSelected(region: Region): Promise<void> {
    if (region.width < 1 || region.height < 1) {
      setError("Selected region is too small. Please try again.");
      return;
    }

    setLoading();

    // Capture the screen region → PNG bytes
    let imageBytes: number[];
    try {
      imageBytes = await invoke<number[]>("capture_region", { region });
    } catch (err) {
      setError(`Screen capture failed: ${String(err)}`);
      return;
    }

    // Build a preview object URL from the PNG bytes (non-critical)
    try {
      const blob = new Blob([new Uint8Array(imageBytes)], {
        type: "image/png",
      });
      setPreview(URL.createObjectURL(blob));
    } catch {
      // Preview failure is non-critical; decoding can still proceed
    }

    // Decode QR codes
    let decoded: string[];
    try {
      decoded = await invoke<string[]>("decode_qr", { imageBytes });
    } catch (err) {
      setError(`QR decoding failed: ${String(err)}`);
      return;
    }

    setResults(decoded.map((text) => ({ text })));
  }

  // ----- Tauri event listeners (Svelte 5 $effect for lifecycle) -----
  $effect(() => {
    let unlistenSelected: UnlistenFn | null = null;
    let unlistenCancelled: UnlistenFn | null = null;

    // region-selected: hide the overlay first so neither window is on
    // screen during capture, then capture+decode, then restore the main window.
    const selectedPromise = listen<Region>("region-selected", async (event) => {
      try {
        // Belt-and-suspenders: overlay hides itself in OverlayWindow.svelte,
        // but we also call hide_overlay here to guarantee it is gone before
        // capture_region runs and screenshots the screen.
        await invoke("hide_overlay");
        await handleRegionSelected(event.payload);
      } finally {
        await restoreMainWindow();
      }
    }).then((fn) => {
      unlistenSelected = fn;
    });

    // region-cancelled: just restore the main window and reset state.
    const cancelledPromise = listen("region-cancelled", async () => {
      await restoreMainWindow();
      resetToIdle();
    }).then((fn) => {
      unlistenCancelled = fn;
    });

    return () => {
      selectedPromise.then(() => unlistenSelected?.());
      cancelledPromise.then(() => unlistenCancelled?.());
    };
  });

  // ----- Revoke object URLs when previewImageUrl changes (prevent leaks) -----
  let previousPreviewUrl: string | null = null;
  $effect(() => {
    const current = previewImageUrl;
    if (previousPreviewUrl && previousPreviewUrl !== current) {
      URL.revokeObjectURL(previousPreviewUrl);
    }
    previousPreviewUrl = current;
  });
</script>

<main class="main-window" aria-label="QR Code Selector">
  <header class="app-header">
    <h1>QR Code Selector</h1>
    <p class="subtitle">Capture a screen region to scan for QR codes.</p>
  </header>

  <!-- Primary action area -->
  <section class="capture-section" aria-label="Capture controls">
    {#if capturePhase === "selecting"}
      <p class="status-hint" role="status" aria-live="polite">
        Select a region on screen, then release to capture.
      </p>
    {:else}
      <button
        type="button"
        class="capture-button"
        onclick={handleCapture}
        disabled={processingState === "loading" || isOverlayOpening}
        aria-label="Capture screen region to scan for QR codes"
      >
        {#if processingState === "loading"}
          Capturing…
        {:else if isOverlayOpening}
          Opening…
        {:else}
          Capture QR
        {/if}
      </button>
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
    color: #fefaf3;
    background-color: #050029;
    background-image: linear-gradient(
      45deg,
      #050029 0%,
      #13095d 47%,
      #060029 100%
    );
    background-attachment: fixed;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
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

  .app-header {
    text-align: center;
  }

  .app-header h1 {
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 0.25rem;
    color: #fefaf3;
  }

  .subtitle {
    color: rgba(254, 250, 243, 0.65);
    font-size: 0.95rem;
  }

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
    background-color: #fefaf3;
    color: #1a1953;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      opacity 0.15s ease,
      transform 0.1s ease;
    min-width: 140px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
  }

  .capture-button:hover:not(:disabled) {
    background-color: #fffdf7;
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .capture-button:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .capture-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .capture-button:focus-visible {
    outline: 2px solid #fefaf3;
    outline-offset: 3px;
  }

  .reset-button {
    padding: 0.6em 1.1em;
    font-size: 0.9rem;
    font-family: inherit;
    border: 1px solid rgba(254, 250, 243, 0.35);
    border-radius: 6px;
    background: rgba(254, 250, 243, 0.08);
    cursor: pointer;
    color: #fefaf3;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease;
  }

  .reset-button:hover {
    background-color: rgba(254, 250, 243, 0.15);
    border-color: rgba(254, 250, 243, 0.6);
  }

  .reset-button:focus-visible {
    outline: 2px solid #fefaf3;
    outline-offset: 2px;
  }

  .status-hint {
    color: rgba(254, 250, 243, 0.65);
    font-size: 0.95rem;
    font-style: italic;
  }

  .preview-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: rgba(254, 250, 243, 0.55);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .preview-image {
    max-width: 100%;
    max-height: 220px;
    border: 1px solid rgba(254, 250, 243, 0.2);
    border-radius: 6px;
    object-fit: contain;
    background-color: rgba(0, 0, 0, 0.2);
  }

  .result-section {
    flex: 1;
  }
</style>
