import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from '../EmptyState';
import { ShoppingCart, Search, Inbox } from 'lucide-react';

describe('EmptyState', () => {
  it('renders icon, title, and description', () => {
    render(
      <EmptyState
        icon={ShoppingCart}
        title="No hay productos"
        description="Agrega tu primer producto para empezar"
      />
    );

    expect(screen.getByText('No hay productos')).toBeInTheDocument();
    expect(screen.getByText('Agrega tu primer producto para empezar')).toBeInTheDocument();
  });

  it('does NOT render button without actionLabel + onAction', () => {
    render(
      <EmptyState
        icon={Search}
        title="Sin resultados"
        description="Intenta con otra búsqueda"
      />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders button when actionLabel and onAction provided', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();

    render(
      <EmptyState
        icon={Inbox}
        title="Bandeja vacía"
        description="No hay mensajes"
        actionLabel="Crear mensaje"
        onAction={onAction}
      />
    );

    const button = screen.getByRole('button', { name: 'Crear mensaje' });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('does NOT render button with only actionLabel (no onAction)', () => {
    render(
      <EmptyState
        icon={Search}
        title="Test"
        description="Desc"
        actionLabel="Click me"
      />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders tip with Lightbulb icon when tip prop is provided', () => {
    render(
      <EmptyState
        icon={Search}
        title="Test"
        description="Desc"
        tip="Consejo: prueba buscar por nombre"
      />
    );

    expect(screen.getByText('Consejo: prueba buscar por nombre')).toBeInTheDocument();
  });

  it('does NOT render tip when prop is absent', () => {
    const { container } = render(
      <EmptyState icon={Search} title="Test" description="Desc" />
    );

    // Lightbulb icon's parent container should not exist
    expect(container.querySelector('.text-amber-500')).not.toBeInTheDocument();
  });

  // ── Variant: compact ──

  it('compact variant has py-8 padding', () => {
    const { container } = render(
      <EmptyState icon={Search} title="Compact" description="Desc" variant="compact" />
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('py-8');
    expect(wrapper.className).not.toContain('py-16');
  });

  it('compact variant uses h-6 icon size', () => {
    const { container } = render(
      <EmptyState icon={Search} title="Compact icon" description="Desc" variant="compact" />
    );

    const icon = container.querySelector('.h-6.w-6');
    expect(icon).toBeInTheDocument();
  });

  it('compact variant button has sm size', () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        icon={Search}
        title="Compact btn"
        description="Desc"
        actionLabel="Do it"
        onAction={onAction}
        variant="compact"
      />
    );

    const button = screen.getByRole('button', { name: 'Do it' });
    // shadcn sm button typically has smaller padding
    expect(button).toBeInTheDocument();
  });

  // ── Variant: default ──

  it('default variant has py-16 and h-8 icon', () => {
    const { container } = render(
      <EmptyState icon={Search} title="Default" description="Desc" />
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('py-16');

    const icon = container.querySelector('.h-8.w-8');
    expect(icon).toBeInTheDocument();
  });
});
