import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LoadingWithMessage } from '../LoadingWithMessage';

describe('LoadingWithMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders first default message and spinner on mount', () => {
    render(<LoadingWithMessage />);

    expect(screen.getByText('Cargando datos...')).toBeInTheDocument();
    // Spinner (Loader2 has animate-spin class)
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('rotates to second message after 3s', () => {
    render(<LoadingWithMessage />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText('Sincronizando metricas...')).toBeInTheDocument();
  });

  it('rotates to third message after 6s', () => {
    render(<LoadingWithMessage />);

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.getByText('Casi listo...')).toBeInTheDocument();
  });

  it('cycles back to first message after all shown', () => {
    render(<LoadingWithMessage />);

    // 3 messages × 3s = 9s to cycle back
    act(() => {
      vi.advanceTimersByTime(9000);
    });

    expect(screen.getByText('Cargando datos...')).toBeInTheDocument();
  });

  it('accepts custom messages', () => {
    const customMessages = ['Paso 1', 'Paso 2'];
    render(<LoadingWithMessage messages={customMessages} />);

    expect(screen.getByText('Paso 1')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText('Paso 2')).toBeInTheDocument();
  });

  it('accepts custom interval', () => {
    render(<LoadingWithMessage interval={1000} />);

    expect(screen.getByText('Cargando datos...')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Sincronizando metricas...')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<LoadingWithMessage className="my-custom" />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('my-custom');
  });

  it('cleans up interval on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = render(<LoadingWithMessage />);

    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
