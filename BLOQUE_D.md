# BLOQUE D: MEJORA CONTINUA — El Ciclo de 11 Flechas
# Para: Claudio (CTO)
# Prerequisito: Fases 1-6 + Bloque C completados

---

## QUÉ HACE ESTE BLOQUE

Hoy Steve crea y se olvida. No sabe si lo que creó funcionó o no.
Después de este bloque, Steve:
- Mide resultados reales 48hrs después de publicar
- Compara contra benchmark
- Documenta qué funcionó y qué no
- Consulta su historial antes de crear algo nuevo
- Usa lo aprendido en el siguiente creative
- Detecta fatiga creativa antes de que mate el ROAS
- Cada vuelta del ciclo es mejor que la anterior

EL CICLO:
Crear → Revisar adentro → Mandar afuera → Revisar afuera → Esperar 48hrs
→ Medir resultados → ¿Funcionó? → Documentar → Buscar mejoras
→ Aplicar lo aprendido → Crear mejor → loop

---

## HERRAMIENTAS NECESARIAS

```
Ninguna nueva. Todo se monta sobre:
- Trigger.dev (ya instalado)
- Supabase tablas creative_history (ya existe)
- Meta Ads API (ya conectada)
- Klaviyo API (ya conectada)
- Claude API Haiku (ya se usa)
```

---

## PASO D.1: Performance Tracker — Medir resultados reales

### Tabla: agregar columnas a creative_history

```sql
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS 
  meta_ctr DECIMAL,
  meta_cpa DECIMAL,
  meta_roas DECIMAL,
  meta_spend DECIMAL,
  meta_impressions INTEGER,
  meta_clicks INTEGER,
  meta_conversions INTEGER,
  klaviyo_open_rate DECIMAL,
  klaviyo_click_rate DECIMAL,
  klaviyo_unsubscribe_rate DECIMAL,
  klaviyo_revenue DECIMAL,
  performance_score DECIMAL,        -- 0-100, calculado
  performance_verdict TEXT,          -- 'bueno' | 'malo' | 'neutro'
  performance_reason TEXT,           -- por qué funcionó o no (Claude)
  measured_at TIMESTAMPTZ,
  benchmark_comparison JSONB;        -- vs benchmark y vs promedio del merchant
```

### Task: medir campañas Meta después de 48hrs

```typescript
// trigger/performance-tracker-meta.ts
import { schedules } from "@trigger.dev/sdk/v3";

export const performanceTrackerMeta = schedules.task({
  id: "performance-tracker-meta",
  cron: "0 8 * * *",  // Todos los días 8am
  run: async () => {
    const supabase = getSupabase();
    
    // Buscar campañas publicadas hace 48-72hrs que no tienen métricas
    const twoDaysAgo = new Date(Date.now() - 48 * 3600000).toISOString();
    const threeDaysAgo = new Date(Date.now() - 72 * 3600000).toISOString();
    
    const { data: unmeasured } = await supabase
      .from('creative_history')
      .select('*, platform_connections!inner(encrypted_token)')
      .eq('channel', 'meta')
      .is('measured_at', null)
      .gte('created_at', threeDaysAgo)
      .lte('created_at', twoDaysAgo);
    
    if (!unmeasured || unmeasured.length === 0) {
      return { message: 'No hay campañas para medir' };
    }
    
    for (const creative of unmeasured) {
      try {
        // Descifrar token
        const token = await decryptToken(creative.shop_id, 'meta');
        if (!token) continue;
        
        // GET métricas de Meta
        const metrics = await fetch(
          `https://graph.facebook.com/v21.0/${creative.meta_campaign_id}/insights?` +
          `fields=impressions,clicks,spend,actions,cost_per_action_type,ctr&` +
          `access_token=${token}`
        ).then(r => r.json());
        
        if (!metrics.data || metrics.data.length === 0) continue;
        
        const d = metrics.data[0];
        const impressions = parseInt(d.impressions || '0');
        const clicks = parseInt(d.clicks || '0');
        const spend = parseFloat(d.spend || '0');
        const ctr = parseFloat(d.ctr || '0');
        
        // Buscar conversiones
        const conversions = (d.actions || [])
          .find(a => a.action_type === 'purchase')?.value || 0;
        const cpa = conversions > 0 ? spend / conversions : null;
        const roas = spend > 0 && conversions > 0 
          ? (conversions * creative.avg_order_value || 50000) / spend 
          : null;
        
        // Calcular performance score (0-100)
        let score = 50; // base neutro
        if (ctr > 2.0) score += 20;
        else if (ctr > 1.0) score += 10;
        else if (ctr < 0.5) score -= 20;
        
        if (roas && roas > 3.0) score += 20;
        else if (roas && roas > 1.5) score += 10;
        else if (roas && roas < 1.0) score -= 20;
        
        if (cpa && cpa < 5000) score += 10;  // CPA < $5000 CLP
        else if (cpa && cpa > 15000) score -= 10;
        
        score = Math.max(0, Math.min(100, score));
        
        const verdict = score >= 65 ? 'bueno' : score >= 40 ? 'neutro' : 'malo';
        
        // Comparar contra promedio del merchant
        const { data: avgData } = await supabase
          .from('creative_history')
          .select('meta_ctr, meta_cpa, meta_roas')
          .eq('shop_id', creative.shop_id)
          .eq('channel', 'meta')
          .not('meta_ctr', 'is', null)
          .order('created_at', { ascending: false })
          .limit(10);
        
        const avgCTR = avgData && avgData.length > 0
          ? avgData.reduce((s, d) => s + (d.meta_ctr || 0), 0) / avgData.length
          : null;
        const avgROAS = avgData && avgData.length > 0
          ? avgData.reduce((s, d) => s + (d.meta_roas || 0), 0) / avgData.length
          : null;
        
        const benchmark = {
          merchant_avg_ctr: avgCTR,
          merchant_avg_roas: avgROAS,
          vs_avg_ctr: avgCTR ? ((ctr - avgCTR) / avgCTR * 100).toFixed(1) + '%' : null,
          vs_avg_roas: avgROAS && roas ? ((roas - avgROAS) / avgROAS * 100).toFixed(1) + '%' : null
        };
        
        // Actualizar creative_history
        await supabase
          .from('creative_history')
          .update({
            meta_ctr: ctr,
            meta_cpa: cpa,
            meta_roas: roas,
            meta_spend: spend,
            meta_impressions: impressions,
            meta_clicks: clicks,
            meta_conversions: parseInt(conversions),
            performance_score: score,
            performance_verdict: verdict,
            benchmark_comparison: benchmark,
            measured_at: new Date().toISOString()
          })
          .eq('id', creative.id);
        
      } catch (error) {
        console.error(`Error midiendo creative ${creative.id}:`, error);
      }
    }
    
    return { measured: unmeasured.length };
  }
});
```

### Task: medir emails Klaviyo después de 24hrs

```typescript
// trigger/performance-tracker-klaviyo.ts
export const performanceTrackerKlaviyo = schedules.task({
  id: "performance-tracker-klaviyo",
  cron: "0 9 * * *",  // Todos los días 9am
  run: async () => {
    const supabase = getSupabase();
    
    const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 48 * 3600000).toISOString();
    
    const { data: unmeasured } = await supabase
      .from('creative_history')
      .select('*')
      .eq('channel', 'klaviyo')
      .is('measured_at', null)
      .gte('created_at', twoDaysAgo)
      .lte('created_at', oneDayAgo);
    
    if (!unmeasured || unmeasured.length === 0) return;
    
    for (const creative of unmeasured) {
      try {
        const token = await decryptToken(creative.shop_id, 'klaviyo');
        if (!token) continue;
        
        // GET métricas de Klaviyo
        const campaign = await fetch(
          `https://a.klaviyo.com/api/campaigns/${creative.klaviyo_campaign_id}`,
          { headers: { 'Authorization': `Klaviyo-API-Key ${token}`, 'revision': '2024-10-15' } }
        ).then(r => r.json());
        
        const stats = campaign.data?.attributes?.statistics || {};
        const openRate = stats.open_rate || 0;
        const clickRate = stats.click_rate || 0;
        const unsubRate = stats.unsubscribe_rate || 0;
        const revenue = stats.revenue || 0;
        
        let score = 50;
        if (openRate > 0.25) score += 20;
        else if (openRate > 0.15) score += 10;
        else if (openRate < 0.10) score -= 20;
        
        if (clickRate > 0.03) score += 15;
        else if (clickRate > 0.02) score += 5;
        else if (clickRate < 0.01) score -= 15;
        
        if (unsubRate > 0.005) score -= 15;
        if (revenue > 0) score += 15;
        
        score = Math.max(0, Math.min(100, score));
        const verdict = score >= 65 ? 'bueno' : score >= 40 ? 'neutro' : 'malo';
        
        await supabase
          .from('creative_history')
          .update({
            klaviyo_open_rate: openRate,
            klaviyo_click_rate: clickRate,
            klaviyo_unsubscribe_rate: unsubRate,
            klaviyo_revenue: revenue,
            performance_score: score,
            performance_verdict: verdict,
            measured_at: new Date().toISOString()
          })
          .eq('id', creative.id);
        
      } catch (error) {
        console.error(`Error midiendo email ${creative.id}:`, error);
      }
    }
  }
});
```

VERIFICACIÓN D.1:
- [ ] Campañas Meta se miden 48hrs después automáticamente
- [ ] Emails Klaviyo se miden 24hrs después automáticamente
- [ ] CTR, CPA, ROAS, open_rate guardados en creative_history
- [ ] Performance score calculado (0-100)
- [ ] Comparación contra promedio del merchant guardada

---

## PASO D.2: Evaluador de resultado + Documentador

### Task que evalúa y documenta

```typescript
// trigger/performance-evaluator.ts
export const performanceEvaluator = schedules.task({
  id: "performance-evaluator",
  cron: "0 10 * * *",  // Todos los días 10am (después de medir)
  run: async () => {
    const supabase = getSupabase();
    
    // Buscar creatives medidos hoy que no tienen razón
    const today = new Date().toISOString().split('T')[0];
    const { data: measured } = await supabase
      .from('creative_history')
      .select('*')
      .gte('measured_at', today)
      .is('performance_reason', null);
    
    if (!measured || measured.length === 0) return;
    
    for (const creative of measured) {
      // Claude Haiku analiza POR QUÉ funcionó o no
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: `Analiza este resultado de marketing en 2 líneas máximo.

CANAL: ${creative.channel}
ÁNGULO: ${creative.angle || 'no especificado'}
COPY: ${(creative.copy_text || '').substring(0, 200)}
PRODUCTO: ${creative.product_name || 'no especificado'}

RESULTADOS:
${creative.channel === 'meta' 
  ? `CTR: ${creative.meta_ctr}%, CPA: $${creative.meta_cpa}, ROAS: ${creative.meta_roas}x`
  : `Open: ${(creative.klaviyo_open_rate * 100).toFixed(1)}%, Click: ${(creative.klaviyo_click_rate * 100).toFixed(1)}%`}

SCORE: ${creative.performance_score}/100 (${creative.performance_verdict})
VS PROMEDIO MERCHANT: ${JSON.stringify(creative.benchmark_comparison)}

¿Por qué funcionó o no funcionó? Responde en máximo 2 líneas, concreto.`
          }]
        })
      }).then(r => r.json());
      
      const reason = response.content[0].text;
      
      await supabase
        .from('creative_history')
        .update({ performance_reason: reason })
        .eq('id', creative.id);
      
      // Si fue MALO → crear tarea para mejorar
      if (creative.performance_verdict === 'malo') {
        await createTask({
          shop_id: creative.shop_id,
          title: `Campaña ${creative.channel} con score ${creative.performance_score}/100`,
          description: `${creative.product_name || 'Producto'}: ${reason}\nÁngulo: ${creative.angle}\nSugerencia: probar ángulo distinto.`,
          priority: 'media',
          type: 'mejora',
          source: 'cerebro'
        });
      }
    }
  }
});
```

VERIFICACIÓN D.2:
- [ ] Cada creative medido recibe performance_reason
- [ ] Razón es concreta (no genérica)
- [ ] Si score es 'malo' → se crea tarea de mejora automática

---

## PASO D.3: Consultar historial antes de crear

### Función helper

```typescript
// src/lib/creative-context.ts

export async function getCreativeContext(shop_id: string, channel: string, product_name?: string) {
  const supabase = getSupabase();
  
  // 1. Mejores creatives de este merchant
  const { data: best } = await supabase
    .from('creative_history')
    .select('angle, copy_text, performance_score, performance_verdict, performance_reason, meta_roas, klaviyo_open_rate')
    .eq('shop_id', shop_id)
    .eq('channel', channel)
    .eq('performance_verdict', 'bueno')
    .not('performance_score', 'is', null)
    .order('performance_score', { ascending: false })
    .limit(5);
  
  // 2. Peores creatives (para evitar)
  const { data: worst } = await supabase
    .from('creative_history')
    .select('angle, copy_text, performance_score, performance_reason')
    .eq('shop_id', shop_id)
    .eq('channel', channel)
    .eq('performance_verdict', 'malo')
    .not('performance_score', 'is', null)
    .order('performance_score', { ascending: true })
    .limit(5);
  
  // 3. Si hay producto específico, filtrar
  let productBest = null;
  let productWorst = null;
  if (product_name) {
    const { data: pb } = await supabase
      .from('creative_history')
      .select('angle, performance_score, performance_reason')
      .eq('shop_id', shop_id)
      .eq('product_name', product_name)
      .not('performance_score', 'is', null)
      .order('performance_score', { ascending: false })
      .limit(3);
    productBest = pb;
  }
  
  // 4. Ángulos que funcionan vs no funcionan
  const angles = {};
  const allCreatives = [...(best || []), ...(worst || [])];
  for (const c of allCreatives) {
    if (!c.angle) continue;
    if (!angles[c.angle]) angles[c.angle] = { scores: [], count: 0 };
    angles[c.angle].scores.push(c.performance_score);
    angles[c.angle].count++;
  }
  
  const angleRanking = Object.entries(angles)
    .map(([angle, data]: [string, any]) => ({
      angle,
      avg_score: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
      count: data.count
    }))
    .sort((a, b) => b.avg_score - a.avg_score);
  
  // 5. Construir contexto como texto
  let context = `## HISTORIAL DE ESTE MERCHANT (${channel})\n\n`;
  
  if (angleRanking.length > 0) {
    context += `### ÁNGULOS QUE FUNCIONAN:\n`;
    angleRanking.filter(a => a.avg_score >= 60).forEach(a => {
      context += `✅ ${a.angle}: score promedio ${a.avg_score}/100 (${a.count} veces)\n`;
    });
    context += `\n### ÁNGULOS QUE NO FUNCIONAN:\n`;
    angleRanking.filter(a => a.avg_score < 40).forEach(a => {
      context += `❌ ${a.angle}: score promedio ${a.avg_score}/100 (${a.count} veces) — NO usar\n`;
    });
  }
  
  if (best && best.length > 0) {
    context += `\n### TOP 3 MEJORES CREATIVES:\n`;
    best.slice(0, 3).forEach((b, i) => {
      context += `${i + 1}. [${b.performance_score}/100] Ángulo: ${b.angle}. ${b.performance_reason}\n`;
    });
  }
  
  if (worst && worst.length > 0) {
    context += `\n### TOP 3 PEORES (EVITAR):\n`;
    worst.slice(0, 3).forEach((w, i) => {
      context += `${i + 1}. [${w.performance_score}/100] Ángulo: ${w.angle}. ${w.performance_reason}\n`;
    });
  }
  
  if (productBest && productBest.length > 0) {
    context += `\n### HISTORIAL DE "${product_name}":\n`;
    productBest.forEach(p => {
      context += `• Ángulo: ${p.angle} → Score: ${p.performance_score}/100. ${p.performance_reason}\n`;
    });
  }
  
  return context;
}
```

VERIFICACIÓN D.3:
- [ ] getCreativeContext devuelve historial del merchant
- [ ] Muestra ángulos que funcionan y no funcionan
- [ ] Muestra top 3 mejores y peores
- [ ] Si hay producto específico, filtra por producto

---

## PASO D.4: Inyectar contexto en prompt de Steve

### Modificar steve-chat

```typescript
// En supabase/functions/steve-chat/index.ts
// ANTES de llamar a Claude, agregar:

import { getCreativeContext } from '../_shared/creative-context';

// Cuando el merchant pide crear campaña o email:
if (intent === 'create_campaign' || intent === 'create_email') {
  const channel = intent === 'create_campaign' ? 'meta' : 'klaviyo';
  const creativeContext = await getCreativeContext(shop_id, channel, product_name);
  
  // Agregar al system prompt:
  systemPrompt += `\n\n${creativeContext}\n\nIMPORTANTE: Usa este historial para tomar decisiones. Si un ángulo tiene score <40, NO lo sugieras. Prioriza ángulos con score >60. Si no hay historial, experimenta con ángulos variados.\n`;
}
```

### Modificar generate-meta-copy

```typescript
// En supabase/functions/generate-meta-copy/index.ts
// ANTES de generar el copy:

const creativeContext = await getCreativeContext(shop_id, 'meta', product_name);

const prompt = `Genera copy para Meta Ads.

${creativeContext}

PRODUCTO: ${product_name}
OBJETIVO: ${objective}
PÚBLICO: ${audience}

REGLAS:
- Si el historial muestra que "descuento" tiene score bajo para este merchant → NO uses descuento
- Si "testimonio" tiene score alto → prioriza testimonio
- Si no hay historial → experimenta con ángulo nuevo
- Siempre menciona el producto por nombre
- Español chileno, cercano, sin jerga
`;
```

### Modificar generate-mass-campaigns (emails)

```typescript
// En supabase/functions/generate-mass-campaigns/index.ts

const creativeContext = await getCreativeContext(shop_id, 'klaviyo', product_name);

// Agregar al prompt de generación de emails:
systemPrompt += `\n${creativeContext}\n`;
```

VERIFICACIÓN D.4:
- [ ] steve-chat incluye historial cuando genera campañas
- [ ] generate-meta-copy incluye historial
- [ ] generate-mass-campaigns incluye historial
- [ ] Copy generado evita ángulos malos y prioriza buenos

---

## PASO D.5: Detector de fatiga creativa

```typescript
// trigger/fatigue-detector.ts
export const fatigueDetector = schedules.task({
  id: "fatigue-detector",
  cron: "0 11 * * *",  // Todos los días 11am
  run: async () => {
    const supabase = getSupabase();
    
    // Para cada merchant con campañas activas
    const { data: activeConnections } = await supabase
      .from('platform_connections')
      .select('shop_id, client_id')
      .eq('platform', 'meta');
    
    for (const conn of (activeConnections || [])) {
      try {
        const token = await decryptToken(conn.shop_id, 'meta');
        if (!token) continue;
        
        // Traer campañas activas
        const campaigns = await fetch(
          `https://graph.facebook.com/v21.0/act_${conn.client_id}/campaigns?` +
          `fields=id,name,status&effective_status=["ACTIVE"]&` +
          `access_token=${token}`
        ).then(r => r.json());
        
        for (const campaign of (campaigns.data || [])) {
          // Traer métricas de últimos 7 días, día a día
          const insights = await fetch(
            `https://graph.facebook.com/v21.0/${campaign.id}/insights?` +
            `fields=ctr,cpm,frequency&time_increment=1&date_preset=last_7d&` +
            `access_token=${token}`
          ).then(r => r.json());
          
          if (!insights.data || insights.data.length < 4) continue;
          
          const days = insights.data;
          const recentCTR = days.slice(-3).map(d => parseFloat(d.ctr || '0'));
          const peakCTR = Math.max(...days.map(d => parseFloat(d.ctr || '0')));
          const avgRecentCTR = recentCTR.reduce((a, b) => a + b, 0) / recentCTR.length;
          const lastFrequency = parseFloat(days[days.length - 1].frequency || '0');
          
          // FATIGA: CTR baja 20%+ desde peak Y frequency > 3
          const ctrDrop = peakCTR > 0 ? (peakCTR - avgRecentCTR) / peakCTR : 0;
          
          if (ctrDrop > 0.20 && lastFrequency > 3) {
            // Buscar mejor ángulo del historial
            const { data: bestAngle } = await supabase
              .from('creative_history')
              .select('angle')
              .eq('shop_id', conn.shop_id)
              .eq('channel', 'meta')
              .eq('performance_verdict', 'bueno')
              .order('performance_score', { ascending: false })
              .limit(1);
            
            const suggestedAngle = bestAngle?.[0]?.angle || 'testimonio o beneficio';
            
            await createTask({
              shop_id: conn.shop_id,
              title: `Fatiga creativa: ${campaign.name}`,
              description: `CTR bajó ${(ctrDrop * 100).toFixed(0)}% en 3 días. Frequency: ${lastFrequency}.\n` +
                `Rotar creative con ángulo: ${suggestedAngle} (mejor score histórico).`,
              priority: 'alta',
              type: 'mejora',
              source: 'ojos'
            });
            
            await sendWhatsApp(
              `⚠️ FATIGA CREATIVA detectada:\n` +
              `Campaña: ${campaign.name}\n` +
              `CTR bajó ${(ctrDrop * 100).toFixed(0)}% | Frequency: ${lastFrequency}\n` +
              `Sugiero rotar a ángulo "${suggestedAngle}"`
            );
          }
        }
      } catch (error) {
        console.error(`Error en fatigue detector para ${conn.shop_id}:`, error);
      }
    }
  }
});
```

VERIFICACIÓN D.5:
- [ ] Detector corre todos los días 11am
- [ ] Detecta CTR bajando + frequency subiendo = fatiga
- [ ] Sugiere ángulo del historial que mejor funcionó
- [ ] Crea tarea para rotar creative
- [ ] WhatsApp al CEO con alerta

---

## PASO D.6: Loop cerrado — Guardar ángulo al crear

### Modificar funciones de creación para guardar en creative_history

```typescript
// Después de que Steve crea una campaña Meta:
await supabase.from('creative_history').insert({
  shop_id,
  channel: 'meta',
  entity_type: 'meta_campaign',
  entity_id: campaignId,
  meta_campaign_id: metaCampaignId,
  product_name: product?.name,
  angle: detectedAngle,        // Steve debe decir qué ángulo usó
  copy_text: generatedCopy,
  image_url: selectedImage,
  criterio_score: criterioResult?.score,
  espejo_score: espejoResult?.score,
  created_at: new Date().toISOString()
});

// Después de que Steve crea un email:
await supabase.from('creative_history').insert({
  shop_id,
  channel: 'klaviyo',
  entity_type: 'email_campaign',
  entity_id: emailId,
  klaviyo_campaign_id: klaviyoCampaignId,
  product_name: product?.name,
  angle: detectedAngle,
  copy_text: subjectLine,
  criterio_score: criterioResult?.score,
  espejo_score: espejoResult?.score,
  created_at: new Date().toISOString()
});
```

### Detectar ángulo automáticamente

```typescript
// src/lib/angle-detector.ts
export async function detectAngle(copy: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `Clasifica este copy en UN ángulo de marketing. Responde SOLO el ángulo, 1-3 palabras.

Opciones: descuento, testimonio, beneficio, urgencia, exclusividad, educativo, emocional, comparación, autoridad, novedad, problema-solución, social proof.

Copy: "${copy}"

Ángulo:`
      }]
    })
  }).then(r => r.json());
  
  return response.content[0].text.trim().toLowerCase();
}
```

VERIFICACIÓN D.6:
- [ ] Cada campaña creada se guarda en creative_history con ángulo
- [ ] Cada email creado se guarda en creative_history con ángulo
- [ ] detectAngle clasifica el ángulo automáticamente
- [ ] 48hrs después → D.1 mide → D.2 evalúa → D.3 documenta → D.4 aprende

---

## PASO D.7: Reporte de mejora continua (agregar al viernes)

Agregar al weekly-report.ts:

```typescript
// MEJORA CONTINUA section
const { data: weekCreatives } = await supabase
  .from('creative_history')
  .select('*')
  .not('performance_score', 'is', null)
  .gte('measured_at', weekAgo);

const avgScore = weekCreatives && weekCreatives.length > 0
  ? Math.round(weekCreatives.reduce((s, c) => s + c.performance_score, 0) / weekCreatives.length)
  : null;

const buenos = (weekCreatives || []).filter(c => c.performance_verdict === 'bueno').length;
const malos = (weekCreatives || []).filter(c => c.performance_verdict === 'malo').length;

// Comparar con semana pasada
const { data: lastWeekCreatives } = await supabase
  .from('creative_history')
  .select('performance_score')
  .not('performance_score', 'is', null)
  .gte('measured_at', twoWeeksAgo)
  .lt('measured_at', weekAgo);

const lastAvgScore = lastWeekCreatives && lastWeekCreatives.length > 0
  ? Math.round(lastWeekCreatives.reduce((s, c) => s + c.performance_score, 0) / lastWeekCreatives.length)
  : null;

const mejoraContinuaSection = `
🔄 MEJORA CONTINUA:
• Creatives medidos: ${weekCreatives?.length || 0}
• Score promedio: ${avgScore || 'N/A'}/100 ${lastAvgScore ? `(semana pasada: ${lastAvgScore})` : ''}
• Buenos: ${buenos} | Malos: ${malos}
• Fatiga detectada: ${fatigueCount} campañas
${avgScore && lastAvgScore 
  ? `• Tendencia: ${avgScore > lastAvgScore ? '📈 mejorando' : avgScore < lastAvgScore ? '📉 empeorando' : '➡️ estable'}`
  : ''}
`;
```

VERIFICACIÓN D.7:
- [ ] Reporte viernes incluye sección de mejora continua
- [ ] Score promedio semanal con tendencia
- [ ] Comparación vs semana anterior

---

## CHECKLIST FINAL BLOQUE D

- [ ] Performance tracker mide Meta 48hrs después
- [ ] Performance tracker mide Klaviyo 24hrs después
- [ ] CTR, CPA, ROAS, open_rate en creative_history
- [ ] Performance score 0-100 calculado
- [ ] Performance reason generado por Claude
- [ ] Creatives malos generan tarea de mejora automática
- [ ] getCreativeContext devuelve historial del merchant
- [ ] steve-chat usa historial al crear campañas
- [ ] generate-meta-copy usa historial
- [ ] generate-mass-campaigns usa historial
- [ ] Fatiga detectada por CTR drop + frequency alta
- [ ] Fatiga sugiere ángulo del historial
- [ ] Cada creative se guarda con ángulo detectado
- [ ] Reporte viernes incluye score promedio + tendencia
- [ ] El ciclo completo funciona: Crear → Medir → Documentar → Aprender → Crear mejor

**Cuando todo pase, mándame WhatsApp:**
"Bloque D completo. Ciclo de mejora continua funcionando. Cada campaña se mide, documenta y aprende. Steve mejora cada semana."
