import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://steve-api-850416724643.us-central1.run.app';

export function SocialSubscribeCTA() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/social/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), company: company.trim() || undefined }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al suscribirse');
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-black text-white p-4 font-mono text-center text-sm z-50">
        Listo. Mañana a las 8am te llega el primer digest por WhatsApp.
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full py-3 px-4 flex items-center justify-between font-mono text-sm hover:bg-slate-50 transition-colors"
        >
          <span className="text-slate-600">
            Resumen diario por WhatsApp. 7 días gratis.
          </span>
          <span className="text-black font-semibold">Suscribirme →</span>
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="p-4 max-w-lg mx-auto">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="flex-1 font-mono text-sm px-3 py-2 border border-slate-200 rounded focus:outline-none focus:border-black"
              />
              <input
                type="tel"
                placeholder="+56 9 1234 5678"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                className="flex-1 font-mono text-sm px-3 py-2 border border-slate-200 rounded focus:outline-none focus:border-black"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Empresa (opcional)"
                value={company}
                onChange={e => setCompany(e.target.value)}
                className="flex-1 font-mono text-sm px-3 py-2 border border-slate-200 rounded focus:outline-none focus:border-black"
              />
              <button
                type="submit"
                disabled={loading}
                className="font-mono text-sm px-4 py-2 bg-black text-white rounded hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {loading ? '...' : 'Enviar'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="font-mono text-xs text-slate-400 hover:text-black px-2"
              >
                ✕
              </button>
            </div>
          </div>
          {error && (
            <p className="font-mono text-xs text-red-500 mt-1">{error}</p>
          )}
        </form>
      )}
    </div>
  );
}
