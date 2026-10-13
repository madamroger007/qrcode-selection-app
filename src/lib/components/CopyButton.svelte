<script lang="ts">
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";

  interface Props {
    text: string;
  }

  let { text }: Props = $props();

  // 'idle' | 'copied' | 'error'
  type CopyState = "idle" | "copied" | "error";
  let copyState = $state<CopyState>("idle");
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  async function handleCopy() {
    // Cancel any pending reset so a rapid double-click restarts the timer
    if (resetTimer !== null) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }

    try {
      await writeText(text);
      copyState = "copied";
    } catch {
      copyState = "error";
    }

    // Revert to idle after 2 seconds regardless of outcome
    resetTimer = setTimeout(() => {
      copyState = "idle";
      resetTimer = null;
    }, 2000);
  }

  const label = $derived(
    copyState === "copied"
      ? "Copied!"
      : copyState === "error"
        ? "Failed"
        : "Copy",
  );

  const ariaLabel = $derived(
    copyState === "copied"
      ? "Copied to clipboard"
      : copyState === "error"
        ? "Copy failed, try again"
        : `Copy: ${text}`,
  );
</script>

<button
  type="button"
  class="copy-button"
  class:copied={copyState === "copied"}
  class:error={copyState === "error"}
  aria-label={ariaLabel}
  onclick={handleCopy}
>
  {label}
</button>

<style>
  .copy-button {
    display: inline-flex;
    align-items: center;
    gap: 0.25em;
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

  .copy-button:hover:not(:disabled) {
    background-color: rgba(254, 250, 243, 0.12);
    border-color: rgba(254, 250, 243, 0.7);
  }

  .copy-button:focus-visible {
    outline: 2px solid #fefaf3;
    outline-offset: 2px;
  }

  .copy-button.copied {
    color: #86efac;
    border-color: #86efac;
  }

  .copy-button.error {
    color: #fca5a5;
    border-color: #fca5a5;
  }
</style>
