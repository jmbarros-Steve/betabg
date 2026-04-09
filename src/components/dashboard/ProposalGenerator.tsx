import { useState } from 'react';
import { Loader2, Sparkles, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';

interface ProposalGeneratorProps {
  prospectId: string;
  prospectName: string;
  onProposalSaved?: () => void;
}

const PLAN_OPTIONS = [
  { value: 'basico', label: 'Básico' },
  { value: 'profesional', label: 'Profesional' },
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'custom', label: 'Custom' },
];

export function ProposalGenerator({ prospectId, prospectName, onProposalSaved }: ProposalGeneratorProps) {
  const [planType, setPlanType] = useState('profesional');
  const [monthlyPrice, setMonthlyPrice] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [generatedTitle, setGeneratedTitle] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await callApi('crm/proposals/generate', {
        body: {
          prospect_id: prospectId,
          plan_type: planType,
          monthly_price: monthlyPrice ? parseInt(monthlyPrice) : undefined,
        },
      });

      if (error) throw new Error(error);

      setGeneratedContent(data.content);
      setGeneratedTitle(data.title);
      toast.success('Propuesta generada');
    } catch (err: any) {
      toast.error(err.message || 'Error generando propuesta');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (sendStatus: 'draft' | 'sent' = 'draft') => {
    if (!generatedContent) return;
    setSaving(true);
    try {
      const { error } = await callApi('crm/proposals', {
        body: {
          action: 'create',
          prospect_id: prospectId,
          title: generatedTitle,
          content: generatedContent,
          plan_type: planType,
          monthly_price: monthlyPrice ? parseInt(monthlyPrice) : undefined,
          status: sendStatus,
        },
      });

      if (error) throw new Error(error);

      toast.success(sendStatus === 'draft' ? 'Borrador guardado' : 'Propuesta guardada');
      setGeneratedContent('');
      setGeneratedTitle('');
      onProposalSaved?.();
    } catch (err: any) {
      toast.error(err.message || 'Error guardando propuesta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Plan</label>
          <div className="flex gap-1">
            {PLAN_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPlanType(opt.value)}
                className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                  planType === opt.value
                    ? 'bg-[#1E3A7B] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="w-36">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Precio USD/mes</label>
          <Input
            type="number"
            placeholder="1500"
            value={monthlyPrice}
            onChange={(e) => setMonthlyPrice(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>

      <Button
        onClick={handleGenerate}
        disabled={generating}
        className="w-full bg-[#1E3A7B] hover:bg-[#162d5e]"
      >
        {generating ? (
          <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generando con AI...</>
        ) : (
          <><Sparkles className="w-4 h-4 mr-2" /> Generar propuesta para {prospectName}</>
        )}
      </Button>

      {generatedContent && (
        <div className="space-y-3">
          <div className="border rounded-lg p-4 max-h-[400px] overflow-y-auto bg-white">
            <h3 className="font-semibold text-sm mb-2">{generatedTitle}</h3>
            <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap text-xs leading-relaxed">
              {generatedContent}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSave('draft')}
              disabled={saving}
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              Guardar borrador
            </Button>
            <Button
              size="sm"
              onClick={() => handleSave('sent')}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Guardar y marcar enviada
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
