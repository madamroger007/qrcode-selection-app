import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CopyButton from './CopyButton.svelte';

// Mock the Tauri clipboard plugin before any test runs.
// Each test can override `writeText` via mockResolvedValueOnce / mockRejectedValueOnce.
const mockWriteText = vi.fn();
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: (...args: unknown[]) => mockWriteText(...args),
}));

describe('CopyButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWriteText.mockResolvedValue(undefined); // default: copy succeeds
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ── 1. Idle state ────────────────────────────────────────────────────────────

  it('renders with "Copy" label in idle state', () => {
    const { getByRole } = render(CopyButton, { props: { text: 'hello' } });
    const button = getByRole('button');
    expect(button).toHaveTextContent('Copy');
  });

  it('has a descriptive aria-label for the text in idle state', () => {
    const { getByRole } = render(CopyButton, { props: { text: 'https://example.com' } });
    const button = getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Copy: https://example.com');
  });

  // ── 2. Successful copy ───────────────────────────────────────────────────────

  it('shows "Copied!" after a successful copy', async () => {
    const { getByRole } = render(CopyButton, { props: { text: 'hello' } });
    const button = getByRole('button');

    await fireEvent.click(button);

    expect(button).toHaveTextContent('Copied!');
  });

  it('updates aria-label to "Copied to clipboard" after a successful copy', async () => {
    const { getByRole } = render(CopyButton, { props: { text: 'hello' } });
    const button = getByRole('button');

    await fireEvent.click(button);

    expect(button).toHaveAttribute('aria-label', 'Copied to clipboard');
  });

  it('calls writeText with the correct text', async () => {
    const { getByRole } = render(CopyButton, { props: { text: 'my-secret' } });

    await fireEvent.click(getByRole('button'));

    expect(mockWriteText).toHaveBeenCalledWith('my-secret');
  });

  // ── 3. Revert to idle after 2 s ──────────────────────────────────────────────

  it('reverts to "Copy" after 2 seconds following a successful copy', async () => {
    const { getByRole } = render(CopyButton, { props: { text: 'hello' } });
    const button = getByRole('button');

    await fireEvent.click(button);
    expect(button).toHaveTextContent('Copied!');

    await vi.advanceTimersByTimeAsync(2000);

    expect(button).toHaveTextContent('Copy');
  });

  // ── 4. Failed copy ───────────────────────────────────────────────────────────

  it('shows "Failed" when the copy throws an error', async () => {
    mockWriteText.mockRejectedValueOnce(new Error('clipboard denied'));

    const { getByRole } = render(CopyButton, { props: { text: 'hello' } });
    const button = getByRole('button');

    await fireEvent.click(button);

    expect(button).toHaveTextContent('Failed');
  });

  it('updates aria-label to "Copy failed, try again" on error', async () => {
    mockWriteText.mockRejectedValueOnce(new Error('clipboard denied'));

    const { getByRole } = render(CopyButton, { props: { text: 'hello' } });
    const button = getByRole('button');

    await fireEvent.click(button);

    expect(button).toHaveAttribute('aria-label', 'Copy failed, try again');
  });

  it('reverts to "Copy" 2 seconds after a failed copy', async () => {
    mockWriteText.mockRejectedValueOnce(new Error('clipboard denied'));

    const { getByRole } = render(CopyButton, { props: { text: 'hello' } });
    const button = getByRole('button');

    await fireEvent.click(button);
    expect(button).toHaveTextContent('Failed');

    await vi.advanceTimersByTimeAsync(2000);

    expect(button).toHaveTextContent('Copy');
  });

  // ── 5. Rapid double-click resets the timer ───────────────────────────────────

  it('restarts the 2-second revert timer on a rapid double-click', async () => {
    const { getByRole } = render(CopyButton, { props: { text: 'hello' } });
    const button = getByRole('button');

    // First click — starts the 2 s timer
    await fireEvent.click(button);

    // Advance 1 s (timer has not fired yet)
    await vi.advanceTimersByTimeAsync(1000);
    expect(button).toHaveTextContent('Copied!');

    // Second click — should cancel the old timer and start a fresh 2 s timer
    await fireEvent.click(button);

    // Another 1 s elapses: total 2 s from first click, but only 1 s from second click
    await vi.advanceTimersByTimeAsync(1000);
    // Should still be "Copied!" because the new timer hasn't expired yet
    expect(button).toHaveTextContent('Copied!');

    // Advance the remaining 1 s of the new timer
    await vi.advanceTimersByTimeAsync(1000);
    expect(button).toHaveTextContent('Copy');
  });
});
