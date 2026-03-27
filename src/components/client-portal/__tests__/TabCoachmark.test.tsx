import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { TabCoachmark } from '../TabCoachmark';
import { Coachmark } from '../Coachmark';

// ── TabCoachmark ──────────────────────────────────────────────────

describe('TabCoachmark', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const tabTips: Record<string, string> = {
    steve: 'Aqui puedes crear tu Brand Brief respondiendo preguntas. Steve analiza tu negocio automaticamente.',
    metrics: 'Tus metricas se sincronizan cada 6 horas. Conecta Shopify para ver datos completos.',
    connections: 'Conecta tus plataformas para desbloquear todas las funcionalidades de Steve.',
    campaigns: 'Analiza el rendimiento de tus campanas de Meta y Google Ads.',
    klaviyo: 'Gestiona tus campanas de email marketing y flujos automatizados.',
  };

  it.each(Object.entries(tabTips))('shows correct tip for tab "%s"', (tabId, expectedTip) => {
    render(<TabCoachmark tabId={tabId} />);

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByText(expectedTip)).toBeInTheDocument();
  });

  it('returns null for tabs without a defined tip', () => {
    const { container } = render(<TabCoachmark tabId="nonexistent" />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null for empty tabId', () => {
    const { container } = render(<TabCoachmark tabId="" />);
    expect(container.innerHTML).toBe('');
  });
});

// ── Coachmark (base component) ────────────────────────────────────

describe('Coachmark', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is NOT visible initially (before 800ms)', () => {
    render(<Coachmark id="test" message="Hello tip" />);
    expect(screen.queryByText('Hello tip')).not.toBeInTheDocument();
  });

  it('becomes visible after 800ms', () => {
    render(<Coachmark id="test-visible" message="Visible tip" />);

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByText('Visible tip')).toBeInTheDocument();
  });

  it('does NOT show if already seen (localStorage)', () => {
    localStorage.setItem('steve_coachmark_seen-before', 'true');

    render(<Coachmark id="seen-before" message="Should not show" />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText('Should not show')).not.toBeInTheDocument();
  });

  it('dismiss button hides coachmark and persists to localStorage', () => {
    render(<Coachmark id="dismiss-test" message="Dismiss me" />);

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByText('Dismiss me')).toBeInTheDocument();

    // Use fireEvent.click (synchronous, works with fake timers)
    const dismissBtn = screen.getByRole('button');
    fireEvent.click(dismissBtn);

    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
    expect(localStorage.getItem('steve_coachmark_dismiss-test')).toBe('true');
  });

  it('does not reappear after dismiss (localStorage persisted)', () => {
    localStorage.setItem('steve_coachmark_recheck', 'true');

    render(<Coachmark id="recheck" message="Gone" />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText('Gone')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Coachmark id="custom-class" message="Custom" className="mx-4 mb-4" />);

    act(() => {
      vi.advanceTimersByTime(800);
    });

    const wrapper = screen.getByText('Custom').closest('div');
    expect(wrapper?.className).toContain('mx-4 mb-4');
  });

  it('cleans up timer on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = render(<Coachmark id="unmount-test" message="Cleanup" />);

    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
