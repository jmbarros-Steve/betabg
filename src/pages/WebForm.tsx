import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const API_URL = import.meta.env.VITE_API_URL || '';

interface FormField {
  name: string;
  label: string;
  type: string;
  required: boolean;
}

export default function WebForm() {
  const { formId } = useParams<{ formId: string }>();
  const [loading, setLoading] = useState(true);
  const [formConfig, setFormConfig] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!formId) return;
    loadForm();
  }, [formId]);

  async function loadForm() {
    try {
      const res = await fetch(`${API_URL}/api/web-forms/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_id: formId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFormConfig(data.form);
      // Initialize form data
      const initial: Record<string, string> = {};
      for (const field of (data.form.fields || [])) {
        initial[field.name] = '';
      }
      setFormData(initial);
    } catch (err: any) {
      setError(err.message || 'Formulario no encontrado');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/web-forms/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_id: formId, data: formData }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setSubmitted(true);

      if (data.redirect_url) {
        setTimeout(() => {
          window.location.href = data.redirect_url;
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Error enviando formulario');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-[#1E3A7B]" />
      </div>
    );
  }

  if (error && !formConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-md text-center">
          <p className="text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-md text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 mb-2">Gracias</h2>
          <p className="text-slate-500">Nos pondremos en contacto contigo pronto.</p>
        </div>
      </div>
    );
  }

  const fields: FormField[] = formConfig?.fields || [];

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 w-full max-w-md">
        <h1 className="text-xl font-semibold text-slate-800 mb-1">
          {formConfig?.form_name || 'Formulario'}
        </h1>
        <p className="text-sm text-slate-400 mb-6">Completa tus datos y te contactaremos</p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field) => (
            <div key={field.name}>
              <label className="text-sm font-medium text-slate-600 block mb-1">
                {field.label} {field.required && <span className="text-red-400">*</span>}
              </label>
              {field.type === 'textarea' ? (
                <Textarea
                  value={formData[field.name] || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  required={field.required}
                  rows={3}
                  className="text-sm"
                />
              ) : (
                <Input
                  type={field.type || 'text'}
                  value={formData[field.name] || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  required={field.required}
                  className="text-sm"
                />
              )}
            </div>
          ))}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#1E3A7B] hover:bg-[#162d5e]"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Enviar
          </Button>
        </form>
      </div>
    </div>
  );
}
