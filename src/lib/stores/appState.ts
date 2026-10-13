import { writable } from 'svelte/store';

// The text value decoded from a single QR code
export interface QrResult {
  text: string;
}

// Tracks the multi-step capture flow
export type CapturePhase =
  | 'idle'       // nothing happening
  | 'selecting'  // overlay window is open, user is drawing region
  | 'captured';  // region captured, decode in progress or done

// Tracks async decode operation
export type ProcessingState =
  | 'idle'     // not processing
  | 'loading'  // decode in progress
  | 'success'  // decode returned results (may be empty)
  | 'error';   // decode failed

// Root application state
export interface AppState {
  capturePhase: CapturePhase;
  processingState: ProcessingState;
  previewImageUrl: string | null; // object URL for the captured region PNG
  results: QrResult[];            // decoded QR strings
  errorMessage: string | null;    // human-readable error text
}

const initialState: AppState = {
  capturePhase: 'idle',
  processingState: 'idle',
  previewImageUrl: null,
  results: [],
  errorMessage: null,
};

export const appState = writable<AppState>(initialState);

/** Opens the overlay window for the user to draw a capture region. */
export function startCapture(): void {
  appState.update(() => ({
    capturePhase: 'selecting',
    processingState: 'idle',
    previewImageUrl: null,
    results: [],
    errorMessage: null,
  }));
}

/** Marks the region as captured and stores the preview image URL. */
export function setPreview(url: string): void {
  appState.update((state) => ({
    ...state,
    capturePhase: 'captured',
    previewImageUrl: url,
  }));
}

/** Signals that QR decoding is in progress. */
export function setLoading(): void {
  appState.update((state) => ({
    ...state,
    processingState: 'loading',
  }));
}

/** Stores successful decode results. */
export function setResults(results: QrResult[]): void {
  appState.update((state) => ({
    ...state,
    processingState: 'success',
    results,
  }));
}

/** Stores a decode error message. */
export function setError(message: string): void {
  appState.update((state) => ({
    ...state,
    processingState: 'error',
    errorMessage: message,
  }));
}

/** Resets the entire state back to the initial idle state. */
export function resetToIdle(): void {
  appState.set({ ...initialState });
}
