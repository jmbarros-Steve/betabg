import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://steve-api-850416724643.us-central1.run.app';

interface SocialSubscribeCTAProps {
  darkMode?: boolean;
}

export function SocialSubscribeCTA({ darkMode = false }: SocialSubscribeCTAProps) {
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
      setName('');
      setPhone('');
      setCompany('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const bg = darkMode ? 'bg-black border-green-900' : 'bg-white border-slate-200';
  const inputClass = darkMode
    ? 'font-mono text-sm px-3 py-2 border border-green-800 rounded bg-black text-green-300 focus:outline-none focus:border-green-400 placeholder-green-800'
    : 'font-mono text-sm px-3 py-2 border border-slate-200 rounded focus:outline-none focus:border-black';
  const btnClass = darkMode
    ? 'font-mono text-sm px-4 py-2 bg-green-500 text-black rounded hover:bg-green-400 transition-colors disabled:opacity-50'
    : 'font-mono text-sm px-4 py-2 bg-black text-white rounded hover:bg-slate-800 transition-colors disabled:opacity-50';

  if (success) {
    return (
      <div className={`fixed bottom-0 left-0 right-0 p-4 font-mono text-center text-sm z-50 ${
        darkMode ? 'bg-green-900 text-green-200' : 'bg-black text-white'
      }`}>
        Listo. Mañana a las 8am te llega el primer digest por WhatsApp.
      </div>
    );
  }

  return (
    <div className={`fixed bottom-0 left-0 right-0 border-t z-50 ${bg}`}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className={`w-full py-3 px-4 flex items-center justify-between font-mono text-sm transition-colors ${
            darkMode ? 'hover:bg-green-950 text-green-500' : 'hover:bg-slate-50 text-slate-600'
          }`}
        >
          <span>Resumen diario por WhatsApp. 7 días gratis.</span>
          <span className={`font-semibold ${darkMode ? 'text-green-300' : 'text-black'}`}>
            Suscribirme
          </span>
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="p-4 max-w-lg mx-auto">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="text" placeholder="Nombre" value={name}
                onChange={e => setName(e.target.value)} required className={`flex-1 ${inputClass}`} />
              <input type="tel" placeholder="+56 9 1234 5678" value={phone}
                onChange={e => setPhone(e.target.value)} required className={`flex-1 ${inputClass}`} />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="text" placeholder="Empresa (opcional)" value={company}
                onChange={e => setCompany(e.target.value)} className={`flex-1 ${inputClass}`} />
              <div className="flex gap-2">
                <button type="submit" disabled={loading} className={btnClass}>
                  {loading ? '...' : 'Enviar'}
                </button>
                <button type="button" onClick={() => setOpen(false)}
                  className={`font-mono text-xs px-2 ${darkMode ? 'text-green-700 hover:text-green-400' : 'text-slate-400 hover:text-black'}`}>
                  x
                </button>
              </div>
            </div>
          </div>
          {error && <p className={`font-mono text-xs mt-1 ${darkMode ? 'text-red-400' : 'text-red-500'}`}>{error}</p>}
        </form>
      )}
    </div>
  );
}
