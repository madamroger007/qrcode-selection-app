<script lang="ts">
  import { open } from "@tauri-apps/plugin-shell";
  import { appState, type QrResult } from "$lib/stores/appState";
  import CopyButton from "./CopyButton.svelte";

  // Derive individual slices from the store using Svelte 5 runes
  let processingState = $derived($appState.processingState);
  let results = $derived($appState.results);
  let errorMessage = $derived($appState.errorMessage);

  function isUrl(text: string): boolean {
    return /^https?:\/\//i.test(text);
  }

  async function handleOpen(url: string): Promise<void> {
    try {
      await open(url);
    } catch {
      // Silently discard — requirement 4.2 mandates no error shown to user
    }
  }
</script>

{#if processingState === "loading"}
  <div
    class="loading"
    role="status"
    aria-live="polite"
    aria-label="Decoding QR code"
  >
    <span class="spinner" aria-hidden="true"></span>
    <span>Decoding…</span>
  </div>
{:else if processingState === "error"}
  <div class="error-box" role="alert">
    <strong>Error:</strong>
    {errorMessage ?? "An unexpected error occurred."}
  </div>
{:else if processingState === "success"}
  {#if results.length === 0}
    <p class="no-results">No QR codes found.</p>
  {:else}
    <ul class="result-list" aria-label="Decoded QR code results">
      {#each results as result, index (index)}
        <li class="result-card">
          <pre
            class="result-text"
            aria-label={`QR code result ${index + 1}`}>{result.text}</pre>
          <div class="result-actions">
            <CopyButton text={result.text} />
            {#if isUrl(result.text)}
              <button
                type="button"
                class="open-button"
                aria-label={`Open URL in browser: ${result.text}`}
                onclick={() => handleOpen(result.text)}
              >
                Open
              </button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  /* Loading state */
  .loading {
    display: flex;
    align-items: center;
    gap: 0.6em;
    padding: 1rem;
    color: #fefaf3;
    font-size: 0.95em;
  }

  .spinner {
    display: inline-block;
    width: 1em;
    height: 1em;
    border: 2px solid rgba(254, 250, 243, 0.4);
    border-top-color: #fefaf3;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Error state */
  .error-box {
    padding: 0.75rem 1rem;
    border: 1px solid rgba(248, 113, 113, 0.5);
    border-radius: 6px;
    background-color: rgba(185, 28, 28, 0.25);
    color: #fca5a5;
    font-size: 0.9em;
    line-height: 1.5;
  }

  /* No results */
  .no-results {
    padding: 1rem;
    color: rgba(254, 250, 243, 0.5);
    font-size: 0.9em;
    font-style: italic;
    margin: 0;
  }

  /* Result list */
  .result-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* Individual result card */
  .result-card {
    border: 1px solid rgba(254, 250, 243, 0.15);
    border-radius: 8px;
    background-color: rgba(254, 250, 243, 0.07);
    backdrop-filter: blur(8px);
    padding: 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  /* Decoded text */
  .result-text {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
    font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo,
      monospace;
    font-size: 0.875em;
    line-height: 1.6;
    color: #fefaf3;
    background: transparent;
  }

  /* Action buttons row */
  .result-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  /* Open URL button */
  .open-button {
    display: inline-flex;
    align-items: center;
    padding: 0.3em 0.75em;
    border: 1px solid rgba(254, 250, 243, 0.45);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    font-size: 0.875em;
    font-family: inherit;
    color: #fefaf3;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease;
  }

  .open-button:hover:not(:disabled) {
    background-color: rgba(254, 250, 243, 0.12);
    border-color: rgba(254, 250, 243, 0.7);
  }

  .open-button:focus-visible {
    outline: 2px solid #fefaf3;
    outline-offset: 2px;
  }
</style>
