import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Calendar, Clock, CheckCircle, XCircle, Video, Globe, DollarSign } from 'lucide-react';
import logo from '@/assets/logo.jpg';

const API_BASE = import.meta.env.VITE_API_URL || 'https://steve-api-850416724643.us-central1.run.app';

interface Slot {
  start: string;
  end: string;
  label: string;
}

export default function Agendar() {
  const { sellerId } = useParams<{ sellerId: string }>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'confirming' | 'success' | 'error'>('loading');
  const [sellerName, setSellerName] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [meetLink, setMeetLink] = useState('');
  const [meetingDate, setMeetingDate] = useState('');

  // Get prospect info from URL params (Steve sends these)
  const searchParams = new URLSearchParams(window.location.search);
  const prospectId = searchParams.get('pid') || '';
  const prospectName = searchParams.get('name') || '';
  const prospectPhone = searchParams.get('phone') || '';

  useEffect(() => {
    if (prospectName) setName(prospectName);
    if (prospectPhone) setPhone(prospectPhone);
  }, [prospectName, prospectPhone]);

  useEffect(() => {
    if (!sellerId) {
      setStatus('error');
      setErrorMsg('Link inválido');
      return;
    }

    fetch(`${API_BASE}/api/booking/slots/${sellerId}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setStatus('error');
          setErrorMsg(data.error);
          return;
        }
        setSellerName(data.seller_name || 'Steve Ads');
        setSlots(data.slots || []);
        setStatus('ready');
      })
      .catch(() => {
        setStatus('error');
        setErrorMsg('No se pudo cargar los horarios');
      });
  }, [sellerId]);

  const handleConfirm = async () => {
    if (!selectedSlot || !name.trim()) return;

    setStatus('confirming');

    try {
      const res = await fetch(`${API_BASE}/api/booking/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_id: sellerId,
          slot_start: selectedSlot.start,
          prospect_name: name.trim(),
          prospect_phone: phone.trim() || prospectPhone || undefined,
          prospect_id: prospectId || undefined,
          website: website.trim() || undefined,
          monthly_budget: monthlyBudget || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setStatus('ready');
        setErrorMsg(data.error || 'Error al agendar');
        return;
      }

      setMeetLink(data.meeting?.meet_link || '');
      setMeetingDate(data.meeting?.date || selectedSlot.label);
      setStatus('success');
    } catch {
      setStatus('ready');
      setErrorMsg('Error de conexión. Intenta de nuevo.');
    }
  };

  // Group slots by day
  const slotsByDay: Record<string, Slot[]> = {};
  slots.forEach(slot => {
    const date = new Date(slot.start);
    const dayKey = date.toLocaleDateString('es-CL', {
      timeZone: 'America/Santiago',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    if (!slotsByDay[dayKey]) slotsByDay[dayKey] = [];
    slotsByDay[dayKey].push(slot);
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-start justify-center p-4 pt-8">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <img src={logo} alt="Steve" className="w-16 h-16 rounded-full mx-auto mb-3 shadow-md" />
          <h1 className="text-xl font-bold text-slate-800">
            Agendar con {sellerName || 'Steve Ads'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Elige el horario que te acomode
          </p>
        </div>

        {/* Loading */}
        {status === 'loading' && (
          <div className="bg-white rounded-2xl p-8 shadow-sm border text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
            <p className="text-slate-500 mt-3">Cargando horarios disponibles...</p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="bg-white rounded-2xl p-8 shadow-sm border text-center">
            <XCircle className="w-12 h-12 text-red-400 mx-auto" />
            <p className="text-red-600 font-medium mt-3">{errorMsg}</p>
            <p className="text-slate-400 text-sm mt-2">
              Escríbele a Steve por WhatsApp para agendar directamente.
            </p>
          </div>
        )}

        {/* Success */}
        {status === 'success' && (
          <div className="bg-white rounded-2xl p-8 shadow-sm border text-center space-y-4">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="text-lg font-bold text-slate-800">Reunión confirmada</h2>
            <div className="bg-green-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-center gap-2 text-slate-700">
                <Calendar className="w-4 h-4" />
                <span className="font-medium">{meetingDate}</span>
              </div>
              {meetLink && (
                <div className="flex items-center justify-center gap-2">
                  <Video className="w-4 h-4 text-blue-500" />
                  <a
                    href={meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline text-sm font-medium"
                  >
                    Abrir Google Meet
                  </a>
                </div>
              )}
            </div>
            <p className="text-sm text-slate-500">
              Te llegará un recordatorio por WhatsApp antes de la reunión.
            </p>
          </div>
        )}

        {/* Slot selection */}
        {(status === 'ready' || status === 'confirming') && (
          <div className="space-y-4">
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                <p className="text-red-600 text-sm">{errorMsg}</p>
              </div>
            )}

            {/* Prospect info */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Tu nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Nombre completo"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  <Globe className="w-3.5 h-3.5 inline mr-1" />
                  Página web o tienda online
                </label>
                <input
                  type="text"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                  placeholder="www.tutienda.com"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  <DollarSign className="w-3.5 h-3.5 inline mr-1" />
                  Inversión mensual en marketing (USD)
                </label>
                <select
                  value={monthlyBudget}
                  onChange={e => setMonthlyBudget(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                >
                  <option value="">Seleccionar rango</option>
                  <option value="0-500">Menos de $500</option>
                  <option value="500-1500">$500 — $1,500</option>
                  <option value="1500-5000">$1,500 — $5,000</option>
                  <option value="5000-15000">$5,000 — $15,000</option>
                  <option value="15000+">Más de $15,000</option>
                </select>
              </div>
            </div>

            {/* Slots by day */}
            {Object.keys(slotsByDay).length === 0 ? (
              <div className="bg-white rounded-2xl p-6 shadow-sm border text-center">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-slate-500 mt-2">No hay horarios disponibles esta semana</p>
              </div>
            ) : (
              Object.entries(slotsByDay).map(([day, daySlots]) => (
                <div key={day} className="bg-white rounded-2xl p-4 shadow-sm border">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    {day.charAt(0).toUpperCase() + day.slice(1)}
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {daySlots.map(slot => {
                      const time = new Date(slot.start).toLocaleTimeString('es-CL', {
                        timeZone: 'America/Santiago',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const isSelected = selectedSlot?.start === slot.start;
                      return (
                        <button
                          key={slot.start}
                          onClick={() => { setSelectedSlot(slot); setErrorMsg(''); }}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-md'
                              : 'bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                          }`}
                        >
                          <Clock className="w-3 h-3 inline mr-1" />
                          {time}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}

            {/* Confirm button */}
            {selectedSlot && (
              <button
                onClick={handleConfirm}
                disabled={!name.trim() || status === 'confirming'}
                className="w-full bg-blue-600 text-white py-3 rounded-2xl font-semibold text-sm shadow-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {status === 'confirming' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Agendando...
                  </>
                ) : (
                  <>
                    <Video className="w-4 h-4" />
                    Confirmar reunión
                  </>
                )}
              </button>
            )}
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by Steve Ads
        </p>
      </div>
    </div>
  );
}
