import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { KeyboardShortcutsDialog, useShortcutsDialog } from '../KeyboardShortcutsDialog';

// ── Dialog Component ──────────────────────────────────────────────

describe('KeyboardShortcutsDialog', () => {
  it('renders all 7 shortcuts with kbd elements when open', () => {
    render(<KeyboardShortcutsDialog open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Atajos de teclado')).toBeInTheDocument();

    expect(screen.getByText('Búsqueda rápida')).toBeInTheDocument();
    expect(screen.getByText('Mostrar atajos')).toBeInTheDocument();
    expect(screen.getByText('Steve (Chat)')).toBeInTheDocument();
    expect(screen.getByText('Brief')).toBeInTheDocument();
    expect(screen.getByText('Métricas')).toBeInTheDocument();
    expect(screen.getByText('Conexiones')).toBeInTheDocument();
    expect(screen.getByText('Configuración')).toBeInTheDocument();
  });

  it('renders kbd elements for each shortcut key', () => {
    render(<KeyboardShortcutsDialog open={true} onOpenChange={vi.fn()} />);

    const kbdElements = screen.getAllByText((_, element) => element?.tagName === 'KBD');
    // Cmd + K (2) + ? (1) + 1 + 2 + 3 + 4 + 5 = 8 kbd elements
    expect(kbdElements.length).toBe(8);
  });

  it('does not render content when closed', () => {
    render(<KeyboardShortcutsDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText('Atajos de teclado')).not.toBeInTheDocument();
  });

  it('calls onOpenChange when dialog close is triggered', () => {
    const onOpenChange = vi.fn();
    render(<KeyboardShortcutsDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// ── useShortcutsDialog Hook ───────────────────────────────────────

describe('useShortcutsDialog', () => {
  it('starts with open=false', () => {
    const { result } = renderHook(() => useShortcutsDialog());
    expect(result.current.open).toBe(false);
  });

  it('opens dialog when ? is pressed', () => {
    const { result } = renderHook(() => useShortcutsDialog());

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    });

    expect(result.current.open).toBe(true);
  });

  it('does NOT open when ? is pressed inside an input', () => {
    const { result } = renderHook(() => useShortcutsDialog());

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    });

    expect(result.current.open).toBe(false);
    document.body.removeChild(input);
  });

  it('does NOT open when ? is pressed inside a textarea', () => {
    const { result } = renderHook(() => useShortcutsDialog());

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    });

    expect(result.current.open).toBe(false);
    document.body.removeChild(textarea);
  });

  it('does NOT open when ? is pressed inside a select', () => {
    const { result } = renderHook(() => useShortcutsDialog());

    const select = document.createElement('select');
    document.body.appendChild(select);
    select.focus();

    act(() => {
      select.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    });

    expect(result.current.open).toBe(false);
    document.body.removeChild(select);
  });

  it('does NOT open when Ctrl+? is pressed', () => {
    const { result } = renderHook(() => useShortcutsDialog());

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', ctrlKey: true, bubbles: true }));
    });

    expect(result.current.open).toBe(false);
  });

  it('does NOT open when Meta+? is pressed', () => {
    const { result } = renderHook(() => useShortcutsDialog());

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', metaKey: true, bubbles: true }));
    });

    expect(result.current.open).toBe(false);
  });

  it('setOpen can close the dialog', () => {
    const { result } = renderHook(() => useShortcutsDialog());

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    });
    expect(result.current.open).toBe(true);

    act(() => {
      result.current.setOpen(false);
    });
    expect(result.current.open).toBe(false);
  });

  it('cleans up keyboard listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useShortcutsDialog());

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeSpy.mockRestore();
  });
});
