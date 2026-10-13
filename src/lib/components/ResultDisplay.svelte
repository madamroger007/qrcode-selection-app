<script lang="ts">
  import { open } from '@tauri-apps/plugin-shell';
  import { appState, type QrResult } from '$lib/stores/appState';
  import CopyButton from './CopyButton.svelte';

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

{#if processingState === 'loading'}
  <div class="loading" role="status" aria-live="polite" aria-label="Decoding QR code">
    <span class="spinner" aria-hidden="true"></span>
    <span>Decoding…</span>
  </div>

{:else if processingState === 'error'}
  <div class="error-box" role="alert">
    <strong>Error:</strong>
    {errorMessage ?? 'An unexpected error occurred.'}
  </div>

{:else if processingState === 'success'}
  {#if results.length === 0}
    <p class="no-results">No QR codes found.</p>
  {:else}
    <ul class="result-list" aria-label="Decoded QR code results">
      {#each results as result, index (index)}
        <li class="result-card">
          <pre class="result-text" aria-label={`QR code result ${index + 1}`}>{result.text}</pre>
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
    color: inherit;
    font-size: 0.95em;
  }

  .spinner {
    display: inline-block;
    width: 1em;
    height: 1em;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Error state */
  .error-box {
    padding: 0.75rem 1rem;
    border: 1px solid #f87171;
    border-radius: 6px;
    background-color: #fef2f2;
    color: #b91c1c;
    font-size: 0.9em;
    line-height: 1.5;
  }

  @media (prefers-color-scheme: dark) {
    .error-box {
      background-color: #450a0a;
      border-color: #dc2626;
      color: #fca5a5;
    }
  }

  /* No results */
  .no-results {
    padding: 1rem;
    color: #6b7280;
    font-size: 0.9em;
    font-style: italic;
    margin: 0;
  }

  @media (prefers-color-scheme: dark) {
    .no-results {
      color: #9ca3af;
    }
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
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background-color: #f9fafb;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  @media (prefers-color-scheme: dark) {
    .result-card {
      border-color: #374151;
      background-color: #1f2937;
    }
  }

  /* Decoded text */
  .result-text {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
    font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
    font-size: 0.875em;
    line-height: 1.6;
    color: inherit;
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
    border: 1px solid currentColor;
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    font-size: 0.875em;
    font-family: inherit;
    color: #2563eb;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .open-button:hover:not(:disabled) {
    background-color: rgba(37, 99, 235, 0.08);
  }

  .open-button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  @media (prefers-color-scheme: dark) {
    .open-button {
      color: #60a5fa;
    }

    .open-button:hover:not(:disabled) {
      background-color: rgba(96, 165, 250, 0.1);
    }
  }
</style>
