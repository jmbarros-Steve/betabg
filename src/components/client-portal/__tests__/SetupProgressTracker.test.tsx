import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock supabase with controllable responses per table
let supabaseMockData: Record<string, any[]> = {};

vi.mock('@/integrations/supabase/client', () => {
  const createChain = (tableName: string) => {
    const chain: any = {};
    const methods = ['select', 'eq', 'neq', 'in', 'order', 'limit', 'single', 'maybeSingle'];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    Object.defineProperty(chain, 'then', {
      value: (resolve: any) => resolve({ data: supabaseMockData[tableName] || [], error: null }),
      writable: true,
      configurable: true,
    });
    return chain;
  };

  return {
    supabase: {
      from: vi.fn((table: string) => createChain(table)),
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
    },
  };
});

import { SetupProgressTracker } from '../SetupProgressTracker';

function setMockData(options: {
  connections?: Array<{ platform: string; is_active: boolean }>;
  briefs?: Array<{ id: string }>;
  config?: Array<{ id: string }>;
}) {
  supabaseMockData = {
    platform_connections: (options.connections || []).map((c, i) => ({
      id: `conn-${i}`,
      client_id: 'test-client',
      ...c,
    })),
    brand_research: options.briefs || [],
    client_financial_config: options.config || [],
  };
}

describe('SetupProgressTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setMockData({ connections: [], briefs: [], config: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for empty clientId', async () => {
    const { container } = render(
      <SetupProgressTracker clientId="" onNavigate={vi.fn()} />
    );

    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(container.innerHTML).toBe('');
  });

  it('shows progress 0/5 with nothing connected', async () => {
    render(<SetupProgressTracker clientId="test-client" onNavigate={vi.fn()} />);

    await act(async () => { vi.advanceTimersByTime(600); });

    await waitFor(() => {
      expect(screen.getByText('0/5')).toBeInTheDocument();
    });
  });

  it('shows progress 2/5 with partial setup', async () => {
    setMockData({
      connections: [
        { platform: 'shopify', is_active: true },
        { platform: 'meta', is_active: false },
      ],
      briefs: [{ id: 'b1' }],
      config: [],
    });

    render(<SetupProgressTracker clientId="test-client" onNavigate={vi.fn()} />);

    await act(async () => { vi.advanceTimersByTime(600); });

    await waitFor(() => {
      expect(screen.getByText('2/5')).toBeInTheDocument();
    });
  });

  it('shows line-through for completed steps', async () => {
    setMockData({
      connections: [{ platform: 'shopify', is_active: true }],
      briefs: [],
      config: [],
    });

    render(<SetupProgressTracker clientId="test-client" onNavigate={vi.fn()} />);

    await act(async () => { vi.advanceTimersByTime(600); });

    await waitFor(() => {
      const shopifyStep = screen.getByText('Conectar Shopify');
      expect(shopifyStep.className).toContain('line-through');
    });
  });

  it('clicking pending step calls onNavigate with correct tab', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<SetupProgressTracker clientId="test-client" onNavigate={onNavigate} />);

    await act(async () => { vi.advanceTimersByTime(600); });

    await waitFor(() => {
      expect(screen.getByText('Conectar Shopify')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Conectar Shopify'));
    expect(onNavigate).toHaveBeenCalledWith('conexiones');
  });

  it('completed steps are disabled', async () => {
    setMockData({
      connections: [{ platform: 'shopify', is_active: true }],
      briefs: [],
      config: [],
    });

    render(<SetupProgressTracker clientId="test-client" onNavigate={vi.fn()} />);

    await act(async () => { vi.advanceTimersByTime(600); });

    await waitFor(() => {
      const shopifyBtn = screen.getByText('Conectar Shopify').closest('button');
      expect(shopifyBtn).toBeDisabled();
    });
  });

  it('collapse hides steps, expand shows them again', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<SetupProgressTracker clientId="test-client" onNavigate={vi.fn()} />);

    await act(async () => { vi.advanceTimersByTime(600); });

    await waitFor(() => {
      expect(screen.getByText('Conectar Shopify')).toBeInTheDocument();
    });

    // Collapse
    await user.click(screen.getByLabelText('Colapsar pasos'));
    expect(screen.queryByText('Conectar Shopify')).not.toBeInTheDocument();

    // Expand
    await user.click(screen.getByLabelText('Expandir pasos'));
    expect(screen.getByText('Conectar Shopify')).toBeInTheDocument();
  });

  it('dismiss hides tracker completely', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<SetupProgressTracker clientId="test-client" onNavigate={vi.fn()} />);

    await act(async () => { vi.advanceTimersByTime(600); });

    await waitFor(() => {
      expect(screen.getByText('Setup del portal')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Cerrar progreso de setup'));
    expect(screen.queryByText('Setup del portal')).not.toBeInTheDocument();
  });

  it('returns null when all steps completed', async () => {
    setMockData({
      connections: [
        { platform: 'shopify', is_active: true },
        { platform: 'meta', is_active: true },
        { platform: 'google', is_active: true },
      ],
      briefs: [{ id: 'b1' }],
      config: [{ id: 'c1' }],
    });

    const { container } = render(
      <SetupProgressTracker clientId="test-client" onNavigate={vi.fn()} />
    );

    await act(async () => { vi.advanceTimersByTime(600); });

    await waitFor(() => {
      expect(container.querySelector('.border.rounded-lg')).not.toBeInTheDocument();
    });
  });

  it('has ARIA on progress bar', async () => {
    setMockData({
      connections: [{ platform: 'shopify', is_active: true }],
      briefs: [],
      config: [],
    });

    render(<SetupProgressTracker clientId="test-client" onNavigate={vi.fn()} />);

    await act(async () => { vi.advanceTimersByTime(600); });

    await waitFor(() => {
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '1');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '5');
    });
  });

  it('tip: Shopify done + Meta not done', async () => {
    setMockData({
      connections: [{ platform: 'shopify', is_active: true }],
      briefs: [],
      config: [],
    });

    render(<SetupProgressTracker clientId="test-client" onNavigate={vi.fn()} />);

    await act(async () => { vi.advanceTimersByTime(600); });

    await waitFor(() => {
      expect(screen.getByText('Conecta Meta para ver que anuncios generan ventas')).toBeInTheDocument();
    });
  });

  it('tip: has platforms but no brief', async () => {
    setMockData({
      connections: [
        { platform: 'shopify', is_active: true },
        { platform: 'meta', is_active: true },
      ],
      briefs: [],
      config: [],
    });

    render(<SetupProgressTracker clientId="test-client" onNavigate={vi.fn()} />);

    await act(async () => { vi.advanceTimersByTime(600); });

    await waitFor(() => {
      expect(screen.getByText('Completa tu Brief para que Steve entienda tu marca')).toBeInTheDocument();
    });
  });

  it('tip: has brief but no config', async () => {
    setMockData({
      connections: [
        { platform: 'shopify', is_active: true },
        { platform: 'meta', is_active: true },
      ],
      briefs: [{ id: 'b1' }],
      config: [],
    });

    render(<SetupProgressTracker clientId="test-client" onNavigate={vi.fn()} />);

    await act(async () => { vi.advanceTimersByTime(600); });

    await waitFor(() => {
      expect(screen.getByText('Configura finanzas para calcular tu ROAS real')).toBeInTheDocument();
    });
  });

  it('refreshes on bg:sync-complete event', async () => {
    render(<SetupProgressTracker clientId="test-client" onNavigate={vi.fn()} />);

    await act(async () => { vi.advanceTimersByTime(600); });

    await waitFor(() => {
      expect(screen.getByText('0/5')).toBeInTheDocument();
    });

    // Update mock data and fire sync event
    setMockData({
      connections: [{ platform: 'shopify', is_active: true }],
      briefs: [],
      config: [],
    });

    await act(async () => {
      window.dispatchEvent(new Event('bg:sync-complete'));
    });

    await waitFor(() => {
      expect(screen.getByText('1/5')).toBeInTheDocument();
    });
  });
});
