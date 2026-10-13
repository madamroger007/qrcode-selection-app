import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  appState,
  startCapture,
  setPreview,
  setLoading,
  setResults,
  setError,
  resetToIdle,
  type QrResult,
} from './appState';

describe('appState store', () => {
  beforeEach(() => {
    resetToIdle();
  });

  it('has correct default initial values', () => {
    const state = get(appState);
    expect(state.capturePhase).toBe('idle');
    expect(state.processingState).toBe('idle');
    expect(state.previewImageUrl).toBeNull();
    expect(state.results).toEqual([]);
    expect(state.errorMessage).toBeNull();
  });

  describe('startCapture()', () => {
    it('sets capturePhase to "selecting"', () => {
      startCapture();
      expect(get(appState).capturePhase).toBe('selecting');
    });

    it('resets processingState to "idle"', () => {
      setLoading();
      startCapture();
      expect(get(appState).processingState).toBe('idle');
    });

    it('clears results', () => {
      setResults([{ text: 'hello' }]);
      startCapture();
      expect(get(appState).results).toEqual([]);
    });

    it('clears errorMessage', () => {
      setError('some error');
      startCapture();
      expect(get(appState).errorMessage).toBeNull();
    });

    it('clears previewImageUrl', () => {
      setPreview('blob:http://localhost/123');
      startCapture();
      expect(get(appState).previewImageUrl).toBeNull();
    });
  });

  describe('setPreview(url)', () => {
    it('sets capturePhase to "captured"', () => {
      setPreview('blob:http://localhost/abc');
      expect(get(appState).capturePhase).toBe('captured');
    });

    it('sets previewImageUrl to the provided URL', () => {
      const url = 'blob:http://localhost/xyz-456';
      setPreview(url);
      expect(get(appState).previewImageUrl).toBe(url);
    });

    it('does not reset other state fields', () => {
      startCapture();
      setPreview('blob:http://localhost/img');
      const state = get(appState);
      expect(state.processingState).toBe('idle');
      expect(state.results).toEqual([]);
      expect(state.errorMessage).toBeNull();
    });
  });

  describe('setLoading()', () => {
    it('sets processingState to "loading"', () => {
      setLoading();
      expect(get(appState).processingState).toBe('loading');
    });

    it('does not change capturePhase', () => {
      startCapture();
      setPreview('blob:http://localhost/img');
      setLoading();
      expect(get(appState).capturePhase).toBe('captured');
    });
  });

  describe('setResults(results)', () => {
    it('sets processingState to "success"', () => {
      setResults([]);
      expect(get(appState).processingState).toBe('success');
    });

    it('stores the provided results array', () => {
      const results: QrResult[] = [{ text: 'https://example.com' }, { text: 'hello world' }];
      setResults(results);
      expect(get(appState).results).toEqual(results);
    });

    it('works with an empty results array (no QR found)', () => {
      setResults([]);
      expect(get(appState).results).toEqual([]);
      expect(get(appState).processingState).toBe('success');
    });
  });

  describe('setError(message)', () => {
    it('sets processingState to "error"', () => {
      setError('Capture failed');
      expect(get(appState).processingState).toBe('error');
    });

    it('stores the provided error message', () => {
      const msg = 'QR decoding timed out after 30 seconds';
      setError(msg);
      expect(get(appState).errorMessage).toBe(msg);
    });
  });

  describe('resetToIdle()', () => {
    it('resets all fields back to initial values after multiple actions', () => {
      startCapture();
      setPreview('blob:http://localhost/img');
      setLoading();
      setResults([{ text: 'qr-content' }]);
      setError('oops');

      resetToIdle();

      const state = get(appState);
      expect(state.capturePhase).toBe('idle');
      expect(state.processingState).toBe('idle');
      expect(state.previewImageUrl).toBeNull();
      expect(state.results).toEqual([]);
      expect(state.errorMessage).toBeNull();
    });

    it('is idempotent when called on an already-idle state', () => {
      resetToIdle();
      resetToIdle();
      const state = get(appState);
      expect(state.capturePhase).toBe('idle');
      expect(state.processingState).toBe('idle');
    });
  });
});
