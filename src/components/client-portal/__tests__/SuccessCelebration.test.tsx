import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SuccessCelebration } from '../SuccessCelebration';

describe('SuccessCelebration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders message and check icon', () => {
    render(<SuccessCelebration message="Guardado con éxito" />);

    expect(screen.getByText('Guardado con éxito')).toBeInTheDocument();
    // Green check icon container
    const checkIcon = document.querySelector('.bg-green-500');
    expect(checkIcon).toBeInTheDocument();
  });

  it('has green styling', () => {
    render(<SuccessCelebration message="Success" />);

    const wrapper = screen.getByText('Success').closest('div.flex');
    expect(wrapper?.className).toContain('bg-green-50');
    expect(wrapper?.className).toContain('border-green-200');
  });

  it('auto-dismisses after default 3000ms and calls onDone', () => {
    const onDone = vi.fn();
    render(<SuccessCelebration message="Bye" onDone={onDone} />);

    expect(screen.getByText('Bye')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText('Bye')).not.toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('respects custom duration', () => {
    const onDone = vi.fn();
    render(<SuccessCelebration message="Custom" onDone={onDone} duration={1000} />);

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not crash without onDone', () => {
    render(<SuccessCelebration message="No callback" />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText('No callback')).not.toBeInTheDocument();
    // No error thrown
  });

  it('cleans up timer on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = render(<SuccessCelebration message="Unmount test" />);

    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('does not call onDone if unmounted before timeout', () => {
    const onDone = vi.fn();
    const { unmount } = render(<SuccessCelebration message="Early" onDone={onDone} />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onDone).not.toHaveBeenCalled();
  });
});
