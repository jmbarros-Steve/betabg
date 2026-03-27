import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StructuredFieldsForm, QuestionField } from '../StructuredFieldsForm';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
  }),
}));

import { toast } from 'sonner';

const textField: QuestionField = {
  key: 'name',
  label: 'Nombre',
  type: 'text',
  placeholder: 'Tu nombre',
};

const textareaField: QuestionField = {
  key: 'description',
  label: 'Descripción',
  type: 'textarea',
  placeholder: 'Describe tu negocio',
};

const selectField: QuestionField = {
  key: 'category',
  label: 'Categoría',
  type: 'select',
  options: [
    { value: 'tech', label: 'Tecnología' },
    { value: 'retail', label: 'Retail' },
  ],
};

const numberField: QuestionField = {
  key: 'budget',
  label: 'Presupuesto',
  type: 'number',
  prefix: '$',
  suffix: 'USD',
  placeholder: '1000',
};

const fieldWithHint: QuestionField = {
  key: 'cpa',
  label: 'CPA Target',
  type: 'number',
  hint: 'Costo por adquisición objetivo',
};

describe('StructuredFieldsForm', () => {
  it('renders fields by type: text, textarea, select, number', () => {
    render(
      <StructuredFieldsForm
        fields={[textField, textareaField, selectField, numberField]}
        onSubmit={vi.fn()}
        isLoading={false}
      />
    );

    expect(screen.getByPlaceholderText('Tu nombre')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Describe tu negocio')).toBeInTheDocument();
    expect(screen.getByText('Selecciona una opción')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('1000')).toBeInTheDocument();
  });

  it('renders prefix and suffix for number field', () => {
    render(
      <StructuredFieldsForm
        fields={[numberField]}
        onSubmit={vi.fn()}
        isLoading={false}
      />
    );

    expect(screen.getByText('$')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('renders hint icon with hover text', () => {
    render(
      <StructuredFieldsForm
        fields={[fieldWithHint]}
        onSubmit={vi.fn()}
        isLoading={false}
      />
    );

    expect(screen.getByText('Costo por adquisición objetivo')).toBeInTheDocument();
  });

  it('submits formatted "Label: value" message', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <StructuredFieldsForm
        fields={[textField, numberField]}
        onSubmit={onSubmit}
        isLoading={false}
      />
    );

    await user.type(screen.getByPlaceholderText('Tu nombre'), 'Steve');
    await user.type(screen.getByPlaceholderText('1000'), '5000');

    await user.click(screen.getByRole('button', { name: /enviar respuesta/i }));

    expect(onSubmit).toHaveBeenCalledWith('Nombre: Steve\nPresupuesto: $5000 USD');
  });

  it('shows toast error when fields are empty (non sum_100)', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <StructuredFieldsForm
        fields={[textField]}
        onSubmit={onSubmit}
        isLoading={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /enviar respuesta/i }));

    expect(toast.error).toHaveBeenCalledWith('Faltan campos por completar');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ── sum_100 validation ──

  it('sum_100: error if percentages do not sum to 100', async () => {
    const fields: QuestionField[] = [
      { key: 'a', label: 'Canal A', type: 'number', placeholder: 'Canal A %' },
      { key: 'b', label: 'Canal B', type: 'number', placeholder: 'Canal B %' },
    ];

    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <StructuredFieldsForm
        fields={fields}
        validation="sum_100"
        onSubmit={onSubmit}
        isLoading={false}
      />
    );

    await user.type(screen.getByPlaceholderText('Canal A %'), '30');
    await user.type(screen.getByPlaceholderText('Canal B %'), '50');

    await user.click(screen.getByRole('button', { name: /enviar respuesta/i }));

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('80%'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sum_100: submits successfully when sum equals 100', async () => {
    const fields: QuestionField[] = [
      { key: 'a', label: 'Canal A', type: 'number', placeholder: 'Canal A %' },
      { key: 'b', label: 'Canal B', type: 'number', placeholder: 'Canal B %' },
    ];

    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <StructuredFieldsForm
        fields={fields}
        validation="sum_100"
        onSubmit={onSubmit}
        isLoading={false}
      />
    );

    await user.type(screen.getByPlaceholderText('Canal A %'), '60');
    await user.type(screen.getByPlaceholderText('Canal B %'), '40');

    await user.click(screen.getByRole('button', { name: /enviar respuesta/i }));

    expect(onSubmit).toHaveBeenCalledWith('Canal A: 60\nCanal B: 40');
  });

  it('sum_100: shows green indicator when sum = 100', async () => {
    const fields: QuestionField[] = [
      { key: 'a', label: 'Canal A', type: 'number', placeholder: 'Canal A %' },
      { key: 'b', label: 'Canal B', type: 'number', placeholder: 'Canal B %' },
    ];

    const user = userEvent.setup();

    render(
      <StructuredFieldsForm
        fields={fields}
        validation="sum_100"
        onSubmit={vi.fn()}
        isLoading={false}
      />
    );

    await user.type(screen.getByPlaceholderText('Canal A %'), '50');
    await user.type(screen.getByPlaceholderText('Canal B %'), '50');

    const totalIndicator = screen.getByText(/Total: 100%/);
    expect(totalIndicator.className).toContain('text-green-600');
  });

  it('sum_100: shows red indicator when sum != 100', async () => {
    const fields: QuestionField[] = [
      { key: 'a', label: 'Canal A', type: 'number', placeholder: 'Canal A %' },
      { key: 'b', label: 'Canal B', type: 'number', placeholder: 'Canal B %' },
    ];

    const user = userEvent.setup();

    render(
      <StructuredFieldsForm
        fields={fields}
        validation="sum_100"
        onSubmit={vi.fn()}
        isLoading={false}
      />
    );

    await user.type(screen.getByPlaceholderText('Canal A %'), '30');

    const totalIndicator = screen.getByText(/Total: 30%/);
    expect(totalIndicator.className).toContain('text-destructive');
  });

  // ── isLoading ──

  it('disables all inputs when isLoading', () => {
    render(
      <StructuredFieldsForm
        fields={[textField, textareaField, numberField]}
        onSubmit={vi.fn()}
        isLoading={true}
      />
    );

    expect(screen.getByPlaceholderText('Tu nombre')).toBeDisabled();
    expect(screen.getByPlaceholderText('Describe tu negocio')).toBeDisabled();
    expect(screen.getByPlaceholderText('1000')).toBeDisabled();

    const submitBtn = screen.getByRole('button', { name: /enviar respuesta/i });
    expect(submitBtn).toBeDisabled();
  });

  it('submit button is enabled when not loading', () => {
    render(
      <StructuredFieldsForm
        fields={[textField]}
        onSubmit={vi.fn()}
        isLoading={false}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /enviar respuesta/i });
    expect(submitBtn).not.toBeDisabled();
  });
});
