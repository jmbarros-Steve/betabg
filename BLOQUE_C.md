# BLOQUE C: CAPAS EXTRA — Error Budgets, RCA, Postmortem, Self-Healing
# Para: Claudio (CTO)
# Prerequisito: Fases 1-6 completadas

---

## QUÉ HACE ESTE BLOQUE

Después de las 6 fases, la máquina detecta errores y los arregla. Pero no APRENDE de ellos. Los mismos errores vuelven. Este bloque agrega:
- Freno automático cuando hay muchos errores (error budgets)
- Análisis de por qué los errores se repiten (RCA)
- Documento automático después de cada crisis (postmortem)
- Tests que se reparan solos cuando la UI cambia (self-healing)
- Reglas nuevas que se crean solas cuando hay errores sin regla
- Calibración de reglas que rechazan demasiado

---

## PASO C.1: Error Budgets por CUJ

### Qué es
Un error budget es cuánto puede fallar un flujo antes de que la máquina PARE de construir features y solo arregle. Google lo inventó. Funciona.

### Los 4 CUJs de Steve Ads

```sql
CREATE TABLE slo_config (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  slo_target DECIMAL NOT NULL,  -- 0.995 = 99.5%
  window_days INTEGER DEFAULT 30,
  current_success_rate DECIMAL,
  error_budget_remaining DECIMAL,
  status TEXT DEFAULT 'healthy',  -- healthy | warning | critical | frozen
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO slo_config VALUES
('CUJ-1', 'Login → Dashboard', 'Merchant entra y ve ventas reales', 0.995, 30, null, null, 'healthy', now()),
('CUJ-2', 'Steve responde', 'Steve da respuesta correcta en <30s', 0.95, 30, null, null, 'healthy', now()),
('CUJ-3', 'Crear campaña Meta', 'Campaña llega a Meta como PAUSED', 0.90, 30, null, null, 'healthy', now()),
('CUJ-4', 'Crear email', 'Email llega a Klaviyo como draft', 0.90, 30, null, null, 'healthy', now());
```

### Calculador de error budget

```typescript
// trigger/error-budget-calculator.ts
import { schedules } from "@trigger.dev/sdk/v3";

export const errorBudgetCalculator = schedules.task({
  id: "error-budget-calculator",
  cron: "0 */4 * * *",  // Cada 4 horas
  run: async () => {
    const supabase = getSupabase();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    
    const slos = [
      {
        id: 'CUJ-1',
        query: async () => {
          // Contar checks de Checkly para login+dashboard
          const { data } = await supabase
            .from('criterio_results')
            .select('passed')
            .eq('entity_type', 'health_check')
            .ilike('rule_id', '%LOGIN%')
            .gte('evaluated_at', thirtyDaysAgo);
          return data || [];
        }
      },
      {
        id: 'CUJ-2',
        query: async () => {
          const { data } = await supabase
            .from('criterio_results')
            .select('passed')
            .eq('evaluated_by', 'juez')
            .gte('evaluated_at', thirtyDaysAgo);
          return data || [];
        }
      },
      {
        id: 'CUJ-3',
        query: async () => {
          const { data } = await supabase
            .from('criterio_results')
            .select('passed')
            .eq('entity_type', 'meta_campaign')
            .gte('evaluated_at', thirtyDaysAgo);
          return data || [];
        }
      },
      {
        id: 'CUJ-4',
        query: async () => {
          const { data } = await supabase
            .from('criterio_results')
            .select('passed')
            .eq('entity_type', 'email_campaign')
            .gte('evaluated_at', thirtyDaysAgo);
          return data || [];
        }
      }
    ];
    
    for (const slo of slos) {
      const results = await slo.query();
      if (results.length === 0) continue;
      
      const total = results.length;
      const passed = results.filter(r => r.passed).length;
      const successRate = passed / total;
      
      // Traer config
      const { data: config } = await supabase
        .from('slo_config')
        .select('*')
        .eq('id', slo.id)
        .single();
      
      const target = config.slo_target;
      const errorBudgetTotal = 1 - target;  // ej: 0.005 para 99.5%
      const errorRateActual = 1 - successRate;
      const budgetRemaining = errorBudgetTotal > 0 
        ? Math.max(0, (errorBudgetTotal - errorRateActual) / errorBudgetTotal)
        : 1;
      
      // Determinar status
      let status = 'healthy';
      if (budgetRemaining < 0.01) status = 'frozen';      // 0% → CONGELAR TODO
      else if (budgetRemaining < 0.25) status = 'critical'; // <25% → solo bugs
      else if (budgetRemaining < 0.50) status = 'warning';  // <50% → cuidado
      
      await supabase
        .from('slo_config')
        .update({
          current_success_rate: Math.round(successRate * 10000) / 100,
          error_budget_remaining: Math.round(budgetRemaining * 100),
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', slo.id);
      
      // ALERTAS
      if (status === 'frozen') {
        await sendWhatsApp(
          `🔴 ERROR BUDGET AGOTADO: ${config.name}\n` +
          `Success rate: ${(successRate * 100).toFixed(1)}% (target: ${target * 100}%)\n` +
          `TODAS las features CONGELADAS. Solo arreglar bugs hasta que se recupere.`
        );
        
        // Crear tarea para congelar
        await createTask({
          title: `FREEZE: Error budget ${slo.id} agotado`,
          description: `${config.name} bajo SLO. Success rate ${(successRate * 100).toFixed(1)}%. CONGELAR features.`,
          priority: 'critica',
          type: 'seguridad',
          source: 'cerebro'
        });
      } else if (status === 'critical') {
        await sendWhatsApp(
          `🟡 ERROR BUDGET BAJO: ${config.name}\n` +
          `Queda ${Math.round(budgetRemaining * 100)}% del budget.\n` +
          `Priorizar bugs sobre features.`
        );
      }
    }
  }
});
```

### Regla del freeze

Agregar al priorizador (task-prioritizer.ts):

```typescript
// ANTES de asignar tareas, verificar si hay freeze
const { data: frozenSLOs } = await supabase
  .from('slo_config')
  .select('id, name')
  .eq('status', 'frozen');

if (frozenSLOs && frozenSLOs.length > 0) {
  // SOLO procesar tareas tipo 'bug' o 'seguridad'
  // RECHAZAR todo tipo 'feature' o 'mejora'
  const filteredPending = pending.filter(t => 
    t.type === 'bug' || t.type === 'seguridad'
  );
  // Si hay tareas de feature, moverlas a 'blocked'
  const blocked = pending.filter(t => 
    t.type === 'feature' || t.type === 'mejora'
  );
  for (const t of blocked) {
    await supabase.from('tasks').update({ 
      status: 'blocked',
      result: `Bloqueada por freeze: ${frozenSLOs.map(s => s.name).join(', ')}`
    }).eq('id', t.id);
  }
}
```

VERIFICACIÓN C.1:
- [ ] slo_config tiene 4 CUJs
- [ ] Calculador corre cada 4 horas
- [ ] Si success rate < SLO → status cambia
- [ ] Si status=frozen → WhatsApp + features bloqueadas
- [ ] Priorizador respeta el freeze

---

## PASO C.2: Root Cause Analysis semanal

```typescript
// trigger/root-cause-analysis.ts
export const rootCauseAnalysis = schedules.task({
  id: "root-cause-analysis",
  cron: "0 2 * * 0",  // Domingo 2am
  run: async () => {
    const supabase = getSupabase();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    
    // 1. Traer todos los errores de la semana
    const { data: errors } = await supabase
      .from('qa_log')
      .select('*')
      .gte('detected_at', weekAgo)
      .order('detected_at', { ascending: false });
    
    if (!errors || errors.length < 3) {
      return { message: 'Menos de 3 errores esta semana, no hay patrones' };
    }
    
    // 2. Claude Sonnet analiza patrones
    const analysis = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Eres un ingeniero de confiabilidad (SRE). Analiza estos ${errors.length} errores de la última semana y encuentra PATRONES.

ERRORES:
${errors.map(e => `- [${e.error_type}] ${e.error_detail} (detectado por: ${e.detected_by}, status: ${e.status})`).join('\n')}

ANÁLISIS REQUERIDO:
1. ¿Hay errores que se repiten? Agrúpalos por causa probable.
2. Para cada grupo: aplica 5 Whys.
   - ¿Por qué falló? → ¿Por qué eso? → ¿Por qué eso? → ... hasta la raíz.
3. ¿La raíz es un bug (arreglo puntual) o arquitectura (necesita refactor)?
4. ¿Qué prevención se necesita? (nueva regla, invariante, test, refactor)

Responde en JSON:
{
  "patterns": [
    {
      "name": "nombre del patrón",
      "count": N,
      "errors": ["error_id1", "error_id2"],
      "five_whys": ["why1", "why2", "why3", "why4", "root_cause"],
      "type": "bug" | "architecture",
      "prevention": "qué hacer para que nunca más pase",
      "priority": "critica" | "alta" | "media"
    }
  ],
  "one_off_errors": N,
  "recurring_errors": N,
  "health_score": "mejorando" | "estable" | "empeorando"
}`
        }]
      })
    }).then(r => r.json());
    
    let result;
    try {
      result = JSON.parse(analysis.content[0].text.replace(/```json|```/g, '').trim());
    } catch {
      return { error: 'Parse failed' };
    }
    
    // 3. Crear tareas para cada patrón recurrente
    for (const pattern of result.patterns) {
      if (pattern.type === 'architecture') {
        await createTask({
          title: `REFACTOR: ${pattern.name} (${pattern.count} veces esta semana)`,
          description: `Root cause: ${pattern.five_whys[pattern.five_whys.length - 1]}\nPrevención: ${pattern.prevention}`,
          priority: pattern.priority,
          type: 'mejora',
          source: 'cerebro'
        });
      }
    }
    
    // 4. WhatsApp resumen
    await sendWhatsApp(
      `🔍 ROOT CAUSE ANALYSIS semanal:\n` +
      `${errors.length} errores → ${result.patterns.length} patrones\n` +
      `${result.recurring_errors} recurrentes, ${result.one_off_errors} únicos\n` +
      `Salud: ${result.health_score}\n` +
      (result.patterns.length > 0 
        ? `\nPatrones:\n${result.patterns.map(p => `• ${p.name} (${p.count}x) → ${p.type}`).join('\n')}`
        : '')
    );
    
    // 5. Guardar análisis
    await supabase.from('qa_log').insert({
      error_type: 'rca_weekly',
      error_detail: JSON.stringify(result),
      detected_by: 'cerebro',
      status: 'info'
    });
    
    return result;
  }
});
```

VERIFICACIÓN C.2:
- [ ] RCA corre cada domingo 2am
- [ ] Agrupa errores por patrón (no lista plana)
- [ ] 5 Whys llega a causa raíz
- [ ] Si es arquitectura → crea tarea de refactor
- [ ] WhatsApp con resumen

---

## PASO C.3: Postmortem automático

```typescript
// trigger/auto-postmortem.ts
export const autoPostmortem = task({
  id: "auto-postmortem",
  run: async ({ task_id }) => {
    const supabase = getSupabase();
    
    // Traer la tarea completada
    const { data: task } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', task_id)
      .single();
    
    // Solo para tareas críticas
    if (task.priority !== 'critica') return { skipped: true };
    
    // Calcular duración
    const duration = task.completed_at && task.created_at
      ? Math.round((new Date(task.completed_at).getTime() - new Date(task.created_at).getTime()) / 60000)
      : null;
    
    // Claude genera postmortem
    const pm = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Genera un postmortem para este incidente crítico en Steve Ads:

TÍTULO: ${task.title}
DESCRIPCIÓN: ${task.description}
FUENTE: ${task.source}
DURACIÓN: ${duration} minutos (desde detección hasta fix)
INTENTOS: ${task.attempts}
RESULTADO: ${task.result}

Responde en JSON:
{
  "summary": "qué pasó en 1 línea",
  "duration_minutes": ${duration},
  "impact": "a quién afectó y cómo",
  "root_cause": "causa raíz en 1 línea",
  "five_whys": ["why1", "why2", "why3", "why4", "why5"],
  "what_prevented_it": "qué regla/test/invariante habría evitado esto",
  "prevention_action": {
    "type": "new_rule" | "new_invariant" | "new_test" | "refactor",
    "description": "qué crear exactamente"
  },
  "lessons": ["lección 1", "lección 2"]
}`
        }]
      })
    }).then(r => r.json());
    
    let postmortem;
    try {
      postmortem = JSON.parse(pm.content[0].text.replace(/```json|```/g, '').trim());
    } catch {
      return { error: 'Parse failed' };
    }
    
    // Guardar postmortem
    await supabase.from('qa_log').insert({
      error_type: 'postmortem',
      error_detail: JSON.stringify(postmortem),
      detected_by: 'cerebro',
      status: 'info'
    });
    
    // CREAR la prevención automáticamente
    if (postmortem.prevention_action) {
      const pa = postmortem.prevention_action;
      
      if (pa.type === 'new_rule') {
        await createTask({
          title: `Crear regla: ${pa.description}`,
          description: `Postmortem de "${task.title}" reveló que falta esta regla.\n${pa.description}`,
          priority: 'alta',
          type: 'mejora',
          source: 'cerebro'
        });
      } else if (pa.type === 'new_invariant') {
        await createTask({
          title: `Crear invariante: ${pa.description}`,
          description: `Postmortem: este incidente se habría prevenido con un invariante.\n${pa.description}`,
          priority: 'alta',
          type: 'seguridad',
          source: 'cerebro'
        });
      } else if (pa.type === 'new_test') {
        await createTask({
          title: `Crear test: ${pa.description}`,
          description: `Postmortem: faltaba test que cubra este escenario.\n${pa.description}`,
          priority: 'media',
          type: 'mejora',
          source: 'cerebro'
        });
      }
    }
    
    return postmortem;
  }
});
```

Conectar al verificador de tareas (task-verifier.ts):

```typescript
// Cuando una tarea critica se marca como completada:
if (task.priority === 'critica' && task.status === 'completed') {
  await triggerAutoPostmortem({ task_id: task.id });
}
```

VERIFICACIÓN C.3:
- [ ] Tarea crítica completada → postmortem se genera
- [ ] Postmortem tiene 5 whys + causa raíz
- [ ] prevention_action crea tarea nueva automáticamente
- [ ] Guardado en qa_log para historial

---

## PASO C.4: Self-Healing Tests (Healenium)

### Instalar

```bash
cd ~/steve
npm install --save-dev healenium-web
```

### Configurar con Playwright

```typescript
// playwright.config.ts — agregar:
import { HealeniumDriver } from 'healenium-web';

// Para cada test que use locators dinámicos:
// En vez de page.locator('[data-testid="create-btn"]')
// Usar el wrapper de Healenium que auto-repara:

export function healingLocator(page, selector, fallbacks = []) {
  return {
    async click() {
      try {
        await page.locator(selector).click({ timeout: 5000 });
      } catch {
        // Intentar fallbacks
        for (const fb of fallbacks) {
          try {
            await page.locator(fb).click({ timeout: 3000 });
            // Logear la reparación
            console.log(`[HEAL] ${selector} → ${fb}`);
            await logHealing(selector, fb);
            return;
          } catch { continue; }
        }
        throw new Error(`No healing found for ${selector}`);
      }
    }
  };
}

async function logHealing(original, healed) {
  const supabase = getSupabase();
  await supabase.from('qa_log').insert({
    error_type: 'test_self_healed',
    error_detail: `Locator reparado: ${original} → ${healed}`,
    detected_by: 'healenium',
    status: 'auto_fixed'
  });
}
```

### Alternativa simple sin Healenium

Si Healenium no se instala bien, la versión básica funciona igual:

```typescript
// src/lib/healing-locator.ts
export async function resilientClick(page, selectors: string[]) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel);
      if (await el.isVisible({ timeout: 3000 })) {
        await el.click();
        return sel;
      }
    } catch { continue; }
  }
  throw new Error(`Ningún selector funcionó: ${selectors.join(', ')}`);
}

// Uso:
await resilientClick(page, [
  '[data-testid="create-campaign"]',  // Selector primario
  'button:has-text("Crear campaña")',  // Fallback por texto
  'button:has-text("Crear")',          // Fallback parcial
  '.btn-primary >> nth=0'              // Fallback por clase
]);
```

VERIFICACIÓN C.4:
- [ ] Test usa selectors con fallbacks
- [ ] Si selector principal falla → usa fallback y avisa
- [ ] Reparación se registra en qa_log
- [ ] Test no se rompe por cambio menor de UI

---

## PASO C.5: Auto-generación de reglas

```typescript
// trigger/auto-rule-generator.ts
export const autoRuleGenerator = task({
  id: "auto-rule-generator",
  run: async ({ error_detail, error_type, entity_type }) => {
    const supabase = getSupabase();
    
    // 1. Verificar si ya hay regla que cubra esto
    const { data: existingRules } = await supabase
      .from('criterio_rules')
      .select('id, name, check_rule')
      .eq('active', true);
    
    // 2. Claude analiza si hay regla existente
    const analysis = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `Un error ocurrió en Steve Ads que ninguna regla detectó.

ERROR: ${error_detail}
TIPO: ${error_type}
ENTIDAD: ${entity_type}

REGLAS EXISTENTES (resumen):
${existingRules.map(r => `${r.id}: ${r.name} — ${r.check_rule}`).join('\n')}

¿Alguna regla existente debería haber atrapado esto? Si sí, ¿cuál y por qué no lo hizo?
Si no, genera una NUEVA regla en JSON:
{
  "existing_covers": false,
  "new_rule": {
    "category": "META COPY|EMAIL BODY|STEVE DATOS|etc",
    "name": "nombre corto",
    "check_rule": "qué verificar exactamente",
    "pass_example": "ejemplo que pasa",
    "fail_example": "ejemplo que falla",
    "on_fail": "qué hacer si falla",
    "severity": "Rechazar|Advertencia|BLOQUEAR|ALERTA",
    "weight": 1-3,
    "organ": "CRITERIO|OJOS|JUEZ|ESPEJO"
  }
}
Si ya hay regla que cubre, responde: {"existing_covers": true, "rule_id": "R-XXX", "reason": "por qué no lo atrapó"}`
        }]
      })
    }).then(r => r.json());
    
    let result;
    try {
      result = JSON.parse(analysis.content[0].text.replace(/```json|```/g, '').trim());
    } catch {
      return { error: 'Parse failed' };
    }
    
    if (!result.existing_covers && result.new_rule) {
      // Generar nuevo ID
      const { count } = await supabase
        .from('criterio_rules')
        .select('id', { count: 'exact' });
      
      const newId = `R-${String(count + 1).padStart(3, '0')}`;
      
      await supabase.from('criterio_rules').insert({
        id: newId,
        ...result.new_rule,
        auto: true,
        active: true
      });
      
      await sendWhatsApp(
        `🆕 REGLA AUTO-GENERADA: ${newId}\n` +
        `${result.new_rule.name}\n` +
        `Check: ${result.new_rule.check_rule}\n` +
        `Generada por error: ${error_detail.substring(0, 100)}`
      );
      
      return { created: true, rule_id: newId };
    }
    
    return { existing_covers: true, rule_id: result.rule_id };
  }
});
```

Conectar: cuando qa_log recibe un error que OJOS o API Check detectó pero CRITERIO no → triggear auto-rule-generator.

VERIFICACIÓN C.5:
- [ ] Error sin regla → Claude genera regla nueva
- [ ] Regla nueva se inserta en criterio_rules
- [ ] WhatsApp avisa qué regla se creó
- [ ] La próxima vez que ese error ocurra → la regla lo atrapa

---

## PASO C.6: Calibración automática de reglas

```typescript
// trigger/rule-calibrator.ts
export const ruleCalibrator = schedules.task({
  id: "rule-calibrator",
  cron: "0 3 * * 0",  // Domingo 3am (después del RCA a las 2am)
  run: async () => {
    const supabase = getSupabase();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    
    // 1. Para cada regla activa, calcular tasa de rechazo
    const { data: rules } = await supabase
      .from('criterio_rules')
      .select('id, name, category')
      .eq('active', true);
    
    const problematic = [];
    
    for (const rule of rules) {
      const { data: results } = await supabase
        .from('criterio_results')
        .select('passed')
        .eq('rule_id', rule.id)
        .gte('evaluated_at', thirtyDaysAgo);
      
      if (!results || results.length < 10) continue;  // No suficiente data
      
      const total = results.length;
      const failed = results.filter(r => !r.passed).length;
      const rejectRate = failed / total;
      
      if (rejectRate > 0.80) {
        // Regla rechaza >80% → probablemente mal calibrada
        problematic.push({
          rule_id: rule.id,
          name: rule.name,
          reject_rate: Math.round(rejectRate * 100),
          total_evaluations: total
        });
      } else if (rejectRate < 0.01 && total > 50) {
        // Regla nunca rechaza en 50+ evaluaciones → posiblemente inútil
        problematic.push({
          rule_id: rule.id,
          name: rule.name,
          reject_rate: 0,
          total_evaluations: total,
          issue: 'never_rejects'
        });
      }
    }
    
    if (problematic.length > 0) {
      await sendWhatsApp(
        `⚙️ CALIBRACIÓN: ${problematic.length} reglas necesitan revisión:\n` +
        problematic.map(p => 
          `• ${p.rule_id} "${p.name}": ${p.reject_rate}% rechazo en ${p.total_evaluations} evaluaciones`
        ).join('\n') +
        `\n\n¿Ajusto umbrales o las revisa José Manuel?`
      );
    }
    
    return { checked: rules.length, problematic: problematic.length };
  }
});
```

VERIFICACIÓN C.6:
- [ ] Calibrador corre cada domingo 3am
- [ ] Detecta reglas que rechazan >80%
- [ ] Detecta reglas que nunca rechazan (inútiles)
- [ ] WhatsApp con lista de reglas problemáticas

---

## PASO C.7: QA Scorecard

Agregar al reporte semanal (weekly-report.ts):

```typescript
// Agregar después de las métricas existentes:

// QA Scorecard
const { data: thisWeekErrors } = await supabase
  .from('qa_log')
  .select('*')
  .gte('detected_at', weekAgo);

const { data: lastWeekErrors } = await supabase
  .from('qa_log')
  .select('*')
  .gte('detected_at', twoWeeksAgo)
  .lt('detected_at', weekAgo);

const thisWeekCount = thisWeekErrors?.length || 0;
const lastWeekCount = lastWeekErrors?.length || 0;
const errorTrend = thisWeekCount < lastWeekCount ? '📉 bajando' : 
                   thisWeekCount > lastWeekCount ? '📈 subiendo' : '➡️ estable';

const autoFixed = (thisWeekErrors || []).filter(e => e.status === 'auto_fixed').length;
const autofixRate = thisWeekCount > 0 ? Math.round(autoFixed / thisWeekCount * 100) : 0;

const selfHealed = (thisWeekErrors || []).filter(e => e.error_type === 'test_self_healed').length;

const newRules = await supabase
  .from('criterio_rules')
  .select('id')
  .gte('created_at', weekAgo)
  .then(r => r.data?.length || 0);

const repeated = /* contar errores que aparecen 2+ veces */;

// Agregar al reporte:
const qaScorecard = `
📊 QA SCORECARD:
• Errores: ${thisWeekCount} (semana pasada: ${lastWeekCount}) ${errorTrend}
• MTTR: ${mttrMinutes} min
• Autofix: ${autofixRate}%
• Tests auto-reparados: ${selfHealed}
• Reglas nuevas: ${newRules}
• Errores repetidos: ${repeated}
`;
```

VERIFICACIÓN C.7:
- [ ] Scorecard aparece en reporte del viernes
- [ ] Muestra tendencia vs semana anterior
- [ ] MTTR, autofix rate, errores repetidos incluidos

---

## CHECKLIST FINAL BLOQUE C

- [ ] Error budgets calculándose cada 4hrs para 4 CUJs
- [ ] Si budget agotado → freeze automático de features
- [ ] RCA semanal agrupa errores y genera tareas de refactor
- [ ] Postmortem automático para toda tarea crítica
- [ ] Postmortem genera tarea de prevención
- [ ] Self-healing tests con fallback de locators
- [ ] Auto-generación de reglas (493 crece a 494, 495...)
- [ ] Calibración detecta reglas mal calibradas
- [ ] QA Scorecard en reporte semanal

**Cuando todo pase, mándame WhatsApp:**
"Bloque C completo. Error budgets activos. RCA semanal. Postmortems automáticos. Self-healing tests. Reglas auto-generadas."
