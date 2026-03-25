import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface Invoice {
  id: string;
  invoice_number: string;
  month: number;
  year: number;
  total_hours: number;
  total_amount: number;
  status: string;
  client_id: string;
  clients: { name: string; hourly_rate: number } | null;
  created_at: string;
}

interface Client {
  id: string;
  name: string;
  hourly_rate: number;
}

interface Props {
  userId: string;
}

const months = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function InvoicesPanel({ userId }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({
    client_id: '',
    month: (new Date().getMonth() + 1).toString(),
    year: new Date().getFullYear().toString(),
  });

  useEffect(() => {
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    const [invoicesRes, clientsRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('*, clients(name, hourly_rate)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('clients')
        .select('id, name, hourly_rate')
        .eq('user_id', userId)
        .order('name'),
    ]);

    if (invoicesRes.error) toast.error('Error al cargar recibos');
    if (clientsRes.error) toast.error('Error al cargar clientes');

    setInvoices(invoicesRes.data || []);
    setClients(clientsRes.data || []);
    setLoading(false);
  };

  const generateInvoice = async () => {
    if (!form.client_id) {
      toast.error('Selecciona un cliente');
      return;
    }

    setGenerating(true);

    const month = parseInt(form.month);
    const year = parseInt(form.year);
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = month === 12 
      ? `${year + 1}-01-01` 
      : `${year}-${(month + 1).toString().padStart(2, '0')}-01`;

    // Get time entries for the month
    const { data: entries, error: entriesError } = await supabase
      .from('time_entries')
      .select('hours')
      .eq('user_id', userId)
      .eq('client_id', form.client_id)
      .gte('date', startDate)
      .lt('date', endDate)
      .eq('billed', false);

    if (entriesError) {
      toast.error('Error al obtener horas');
      setGenerating(false);
      return;
    }

    if (!entries || entries.length === 0) {
      toast.error('No hay horas sin facturar para este período');
      setGenerating(false);
      return;
    }

    const totalHours = entries.reduce((acc, e) => acc + Number(e.hours), 0);
    const client = clients.find(c => c.id === form.client_id);
    const totalAmount = totalHours * (client?.hourly_rate || 0);

    // Generate invoice number
    const invoiceNumber = `INV-${year}${month.toString().padStart(2, '0')}-${Date.now().toString().slice(-4)}`;

    // Create invoice
    const { error: invoiceError } = await supabase.from('invoices').insert({
      user_id: userId,
      client_id: form.client_id,
      invoice_number: invoiceNumber,
      month,
      year,
      total_hours: totalHours,
      total_amount: totalAmount,
      status: 'generated',
    });

    if (invoiceError) {
      toast.error('Error al generar recibo');
      setGenerating(false);
      return;
    }

    // Mark entries as billed
    await supabase
      .from('time_entries')
      .update({ billed: true })
      .eq('user_id', userId)
      .eq('client_id', form.client_id)
      .gte('date', startDate)
      .lt('date', endDate);

    toast.success('Recibo generado exitosamente');
    setDialogOpen(false);
    setGenerating(false);
    fetchData();
  };

  const downloadInvoice = (invoice: Invoice) => {
    const content = `
==============================================
              RECIBO DE SERVICIOS
              STEVE
==============================================

Número de Recibo: ${invoice.invoice_number}
Fecha: ${format(new Date(invoice.created_at), 'dd/MM/yyyy')}

Cliente: ${invoice.clients?.name || 'N/A'}

Período: ${months[invoice.month - 1]} ${invoice.year}

----------------------------------------------
DETALLE
----------------------------------------------

Total Horas: ${invoice.total_hours.toFixed(2)} h
Tarifa por Hora: €${invoice.clients?.hourly_rate.toFixed(2) || '0.00'}

----------------------------------------------
TOTAL: €${invoice.total_amount.toFixed(2)}
----------------------------------------------

Gracias por confiar en Steve.

==============================================
    `;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.invoice_number}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="animate-pulse h-40 bg-white rounded-xl border border-slate-200" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Recibos</h2>
          <p className="text-muted-foreground">Genera recibos mensuales por cliente</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="hero" disabled={clients.length === 0}>
              <Plus className="w-4 h-4 mr-2" />
              Generar Recibo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generar Recibo Mensual</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Cliente</Label>
                <Select value={form.client_id} onValueChange={(value) => setForm({ ...form, client_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name} (€{client.hourly_rate}/h)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Mes</Label>
                  <Select value={form.month} onValueChange={(value) => setForm({ ...form, month: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month, index) => (
                        <SelectItem key={index} value={(index + 1).toString()}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Año</Label>
                  <Select value={form.year} onValueChange={(value) => setForm({ ...form, year: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026].map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={generateInvoice} className="w-full" disabled={generating}>
                {generating ? 'Generando...' : 'Generar Recibo'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-muted-foreground">Primero debes añadir clientes</p>
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No hay recibos generados</p>
          <p className="text-sm text-muted-foreground mt-1">
            Registra horas y genera tu primer recibo
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {invoices.map((invoice, index) => (
            <motion.div
              key={invoice.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="p-4 bg-white border border-slate-200 rounded-xl card-hover flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#F0F4FA] text-[#1E3A7B] flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{invoice.invoice_number}</h3>
                  <p className="text-sm text-muted-foreground">
                    {invoice.clients?.name} • {months[invoice.month - 1]} {invoice.year}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="font-mono font-semibold text-primary">
                    €{invoice.total_amount.toFixed(2)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {invoice.total_hours.toFixed(1)} horas
                  </p>
                </div>
                <Button variant="outline" size="icon" onClick={() => downloadInvoice(invoice)}>
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
