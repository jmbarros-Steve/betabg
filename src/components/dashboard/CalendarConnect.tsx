import { useEffect, useState } from 'react';
import { Calendar, Link2, Loader2, Copy, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = 'https://www.googleapis.com/auth/calendar';
const REDIRECT_URI = window.location.origin + '/agendar/oauth-callback';

interface Seller {
  id: string;
  seller_name: string;
  seller_email: string;
  is_active: boolean;
  slot_duration_minutes: number | null;
  working_hours_start: number | null;
  working_hours_end: number | null;
}

export function CalendarConnect() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [sellerName, setSellerName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchSellers = async () => {
    try {
      const { data, error } = await callApi('crm/sellers', { body: {} });
      if (error) throw new Error(error);
      setSellers(data?.sellers || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSellers();
  }, []);

  const handleConnect = () => {
    if (!GOOGLE_CLIENT_ID) {
      toast.error('VITE_GOOGLE_CLIENT_ID no configurado en .env.local');
      return;
    }

    // Open Google OAuth consent screen
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state: sellerName || 'Vendedor',
    });

    window.open(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      '_blank',
      'width=500,height=600',
    );
  };

  const copyBookingLink = (sellerId: string) => {
    const url = `${window.location.origin}/agendar/${sellerId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(sellerId);
    toast.success('Link copiado');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-blue-500" />
        Calendarios conectados
      </h3>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {sellers.length > 0 ? (
            <div className="space-y-2 mb-3">
              {sellers.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${s.is_active ? 'bg-green-500' : 'bg-slate-300'}`} />
                    <div>
                      <p className="text-sm font-medium text-slate-700">{s.seller_name}</p>
                      <p className="text-[11px] text-slate-400">{s.seller_email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {s.slot_duration_minutes || 15} min
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyBookingLink(s.id)}
                      title="Copiar link de agendamiento"
                    >
                      {copiedId === s.id ? (
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => window.open(`/agendar/${s.id}`, '_blank')}
                      title="Abrir página de agendamiento"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 mb-3">No hay calendarios conectados</p>
          )}

          {/* Connect new */}
          <div className="flex gap-2">
            <Input
              placeholder="Nombre del vendedor"
              value={sellerName}
              onChange={(e) => setSellerName(e.target.value)}
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={connecting}
              className="h-8 bg-[#1E3A7B] hover:bg-[#162d5e] whitespace-nowrap"
            >
              <Link2 className="w-3.5 h-3.5 mr-1.5" />
              Conectar Google Calendar
            </Button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">
            Requiere GOOGLE_CLIENT_ID configurado. El vendedor autoriza acceso a su calendario.
          </p>
        </>
      )}
    </div>
  );
}
