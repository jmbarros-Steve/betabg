import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BriefChip {
  key: string;
  emoji: string;
  label: string;
  value: string;
}

export function useBriefContext(clientId: string) {
  const [chips, setChips] = useState<BriefChip[]>([]);
  const [activeChips, setActiveChips] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadContext();
  }, [clientId]);

  const loadContext = async () => {
    try {
      const [{ data: personaData }, { data: researchData }] = await Promise.all([
        supabase.from('buyer_personas').select('persona_data').eq('client_id', clientId).eq('is_complete', true).maybeSingle(),
        supabase.from('brand_research').select('research_data, research_type').eq('client_id', clientId),
      ]);

      const foundChips: BriefChip[] = [];
      const defaults = new Set<string>();

      // Extract from brand_research
      if (researchData) {
        for (const r of researchData) {
          const d = r.research_data as Record<string, unknown>;
          if (!d) continue;

          // Ventaja competitiva
          const ventaja = d.ventaja_competitiva || d.propuesta_valor || d.diferenciador;
          if (ventaja && typeof ventaja === 'string') {
            foundChips.push({ key: 'ventaja', emoji: '💪', label: 'Mencionar', value: ventaja });
            defaults.add('ventaja');
          }

          // Tono comunicación
          const tono = d.tono_comunicacion || d.tono || d.voz_marca;
          if (tono && typeof tono === 'string') {
            foundChips.push({ key: 'tono', emoji: '🗣️', label: 'Tono', value: tono });
          }

          // Prueba social
          const prueba = d.prueba_social || d.social_proof;
          if (prueba && typeof prueba === 'string') {
            foundChips.push({ key: 'prueba', emoji: '⭐', label: 'Prueba social', value: prueba });
          }

          // Garantía
          const garantia = d.garantia || d.garantia_marca;
          if (garantia && typeof garantia === 'string') {
            foundChips.push({ key: 'garantia', emoji: '🛡️', label: 'Garantía', value: garantia });
          }

          // Narrativa marca
          const narrativa = d.narrativa_marca || d.historia_marca;
          if (narrativa && typeof narrativa === 'string') {
            foundChips.push({ key: 'narrativa', emoji: '🛡️', label: 'Narrativa', value: narrativa });
          }
        }
      }

      // Extract from buyer persona
      if (personaData?.persona_data) {
        const p = personaData.persona_data as Record<string, unknown>;

        const dolor = p.dolor_principal || p.frustracion_principal || p.problema_principal;
        if (dolor && typeof dolor === 'string') {
          foundChips.push({ key: 'dolor', emoji: '😤', label: 'Dolor', value: dolor });
          defaults.add('dolor');
        }

        const transformacion = p.transformacion_deseada || p.resultado_deseado || p.meta_principal;
        if (transformacion && typeof transformacion === 'string') {
          foundChips.push({ key: 'transformacion', emoji: '🎯', label: 'Transformación', value: transformacion });
        }
      }

      // Deduplicate by key
      const unique = foundChips.filter((c, i, arr) => arr.findIndex(x => x.key === c.key) === i);
      setChips(unique);
      setActiveChips(defaults);
    } catch {
      // Error handled by toast
    } finally {
      setLoaded(true);
    }
  };

  const toggleChip = (key: string) => {
    setActiveChips(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getActiveChipsText = (): string => {
    return chips
      .filter(c => activeChips.has(c.key))
      .map(c => `${c.label}: ${c.value}`)
      .join('. ');
  };

  return { chips, activeChips, toggleChip, getActiveChipsText, loaded };
}
