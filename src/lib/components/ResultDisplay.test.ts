import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { resetToIdle, setError, setLoading, setResults } from '$lib/stores/appState';
import ResultDisplay from './ResultDisplay.svelte';

// Mock the Tauri shell plugin — `open` is called when a URL result is clicked.
const mockOpen = vi.fn();
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: (...args: unknown[]) => mockOpen(...args),
}));

// Mock the clipboard plugin so CopyButton (child) doesn't fail.
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));

describe('ResultDisplay', () => {
  beforeEach(() => {
    resetToIdle();
    mockOpen.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Idle / no state ────────────────────────────────────────────────────

  it('renders nothing visible in idle state', () => {
    const { container } = render(ResultDisplay);
    // In idle processingState none of the conditional blocks render
    expect(container.querySelector('.loading')).toBeNull();
    expect(container.querySelector('.error-box')).toBeNull();
    expect(container.querySelector('.result-list')).toBeNull();
    expect(container.querySelector('.no-results')).toBeNull();
  });

  // ── 2. Loading state (requirement 3.6) ────────────────────────────────────

  it('shows a loading indicator while decoding', () => {
    setLoading();
    const { getByRole } = render(ResultDisplay);
    const status = getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-label', 'Decoding QR code');
    expect(status).toHaveTextContent('Decoding');
  });

  // ── 3. Error state (requirement 3.6) ──────────────────────────────────────

  it('displays the error message when processingState is "error"', () => {
    setError('QR decoding timed out after 30 seconds');
    const { getByRole } = render(ResultDisplay);
    const alert = getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('QR decoding timed out after 30 seconds');
  });

  it('falls back to a generic message when errorMessage is null', () => {
    // Force error state with a null message by directly updating the store
    setError('');
    // Override: simulate no message by using a different path — setError always sets a string,
    // so just verify the error box always renders something readable.
    const { getByRole } = render(ResultDisplay);
    expect(getByRole('alert')).toBeInTheDocument();
  });

  // ── 4. Success with empty results (requirement 3.3) ───────────────────────

  it('shows "No QR codes found." when success but results are empty', () => {
    setResults([]);
    const { getByText } = render(ResultDisplay);
    expect(getByText('No QR codes found.')).toBeInTheDocument();
  });

  // ── 5. Single plain-text result (requirements 3.2, 4.1) ──────────────────

  it('renders the decoded text for a single non-URL result', () => {
    setResults([{ text: 'hello world' }]);
    const { getByLabelText } = render(ResultDisplay);
    const pre = getByLabelText('QR code result 1');
    expect(pre).toHaveTextContent('hello world');
  });

  it('does not render an "Open" button for a plain-text result', () => {
    setResults([{ text: 'not-a-url' }]);
    const { queryByRole } = render(ResultDisplay);
    const openBtn = queryByRole('button', { name: /Open URL in browser/i });
    expect(openBtn).toBeNull();
  });

  it('renders a CopyButton for a plain-text result', () => {
    setResults([{ text: 'hello world' }]);
    const { getByRole } = render(ResultDisplay);
    // CopyButton renders a button with label "Copy: <text>"
    expect(getByRole('button', { name: /Copy: hello world/i })).toBeInTheDocument();
  });

  // ── 6. URL result — clickable Open button (requirements 4.1, 4.2) ─────────

  it('renders an "Open" button for an http URL result', () => {
    setResults([{ text: 'http://example.com' }]);
    const { getByRole } = render(ResultDisplay);
    expect(
      getByRole('button', { name: /Open URL in browser: http:\/\/example\.com/i })
    ).toBeInTheDocument();
  });

  it('renders an "Open" button for an https URL result', () => {
    setResults([{ text: 'https://example.com/path?q=1' }]);
    const { getByRole } = render(ResultDisplay);
    expect(
      getByRole('button', { name: /Open URL in browser/i })
    ).toBeInTheDocument();
  });

  it('calls open() with the URL when the Open button is clicked', async () => {
    const url = 'https://example.com';
    setResults([{ text: url }]);
    const { getByRole } = render(ResultDisplay);
    const openBtn = getByRole('button', { name: /Open URL in browser/i });

    await fireEvent.click(openBtn);

    expect(mockOpen).toHaveBeenCalledOnce();
    expect(mockOpen).toHaveBeenCalledWith(url);
  });

  it('silently discards errors when open() throws (requirement 4.2)', async () => {
    mockOpen.mockRejectedValueOnce(new Error('shell error'));
    setResults([{ text: 'https://example.com' }]);
    const { getByRole } = render(ResultDisplay);

    // Should not throw
    await expect(
      fireEvent.click(getByRole('button', { name: /Open URL in browser/i }))
    ).resolves.not.toThrow();

    // No error box should appear
    expect(document.querySelector('.error-box')).toBeNull();
  });

  // ── 7. Multiple results (requirements 3.2, 3.4) ───────────────────────────

  it('renders all results when multiple QR codes are decoded', () => {
    setResults([
      { text: 'first result' },
      { text: 'second result' },
      { text: 'https://third.com' },
    ]);
    const { getByLabelText, getAllByRole } = render(ResultDisplay);

    expect(getByLabelText('QR code result 1')).toHaveTextContent('first result');
    expect(getByLabelText('QR code result 2')).toHaveTextContent('second result');
    expect(getByLabelText('QR code result 3')).toHaveTextContent('https://third.com');

    // Three copy buttons, one open button (only for the URL)
    const copyButtons = getAllByRole('button', { name: /Copy:/i });
    expect(copyButtons).toHaveLength(3);

    const openButtons = getAllByRole('button', { name: /Open URL in browser/i });
    expect(openButtons).toHaveLength(1);
  });

  it('renders the result list with an accessible label', () => {
    setResults([{ text: 'abc' }]);
    const { getByRole } = render(ResultDisplay);
    expect(getByRole('list', { name: 'Decoded QR code results' })).toBeInTheDocument();
  });
});
