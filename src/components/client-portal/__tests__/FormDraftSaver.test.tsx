import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDraftSaver, useDraftLoader } from '../FormDraftSaver';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: vi.fn(),
}));

import { toast } from 'sonner';

describe('useDraftSaver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves data to localStorage after interval', () => {
    const data = { name: 'Test', value: 42 };
    renderHook(() => useDraftSaver('myform', data, 5000));

    expect(localStorage.getItem('steve_draft_myform')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    const stored = JSON.parse(localStorage.getItem('steve_draft_myform')!);
    expect(stored).toEqual(data);
  });

  it('shows toast with fixed id on save', () => {
    renderHook(() => useDraftSaver('toasttest', { x: 1 }, 1000));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(toast).toHaveBeenCalledWith('Borrador guardado', { id: 'draft-saved', duration: 2000 });
  });

  it('saves every interval (repeating)', () => {
    renderHook(() => useDraftSaver('repeat', { v: 1 }, 2000));

    act(() => { vi.advanceTimersByTime(2000); });
    expect(localStorage.getItem('steve_draft_repeat')).not.toBeNull();

    localStorage.removeItem('steve_draft_repeat');

    act(() => { vi.advanceTimersByTime(2000); });
    expect(localStorage.getItem('steve_draft_repeat')).not.toBeNull();
  });

  it('uses default 30s interval', () => {
    renderHook(() => useDraftSaver('default-interval', { a: 1 }));

    act(() => { vi.advanceTimersByTime(29999); });
    expect(localStorage.getItem('steve_draft_default-interval')).toBeNull();

    act(() => { vi.advanceTimersByTime(1); });
    expect(localStorage.getItem('steve_draft_default-interval')).not.toBeNull();
  });

  it('clearDraft removes item from localStorage', () => {
    localStorage.setItem('steve_draft_clearme', '"data"');

    const { result } = renderHook(() => useDraftSaver('clearme', {}));

    act(() => {
      result.current.clearDraft();
    });

    expect(localStorage.getItem('steve_draft_clearme')).toBeNull();
  });

  it('cleans up interval on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useDraftSaver('cleanup', {}, 1000));

    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('silently handles localStorage full error', () => {
    // Mock localStorage.setItem to throw
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    renderHook(() => useDraftSaver('full', { data: 'big' }, 1000));

    // Should not throw
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    setItemSpy.mockRestore();
  });
});

describe('useDraftLoader', () => {
  it('returns parsed JSON from localStorage', () => {
    localStorage.setItem('steve_draft_load', JSON.stringify({ name: 'Test', count: 5 }));

    const { result } = renderHook(() => useDraftLoader<{ name: string; count: number }>('load'));
    expect(result.current).toEqual({ name: 'Test', count: 5 });
  });

  it('returns null if key does not exist', () => {
    const { result } = renderHook(() => useDraftLoader('nonexistent'));
    expect(result.current).toBeNull();
  });

  it('returns null if JSON is corrupted', () => {
    localStorage.setItem('steve_draft_corrupted', '{not valid json!!');

    const { result } = renderHook(() => useDraftLoader('corrupted'));
    expect(result.current).toBeNull();
  });

  it('returns null for empty string value', () => {
    localStorage.setItem('steve_draft_empty', '');

    const { result } = renderHook(() => useDraftLoader('empty'));
    expect(result.current).toBeNull();
  });

  it('handles arrays correctly', () => {
    localStorage.setItem('steve_draft_arr', JSON.stringify([1, 2, 3]));

    const { result } = renderHook(() => useDraftLoader<number[]>('arr'));
    expect(result.current).toEqual([1, 2, 3]);
  });
});
