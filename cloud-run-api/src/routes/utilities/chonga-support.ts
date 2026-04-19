import { Context } from 'hono';
import { loadKnowledge } from '../../lib/knowledge-loader.js';

const BASE_PROMPT = `Eres Chonga, la asistente de soporte técnico de la plataforma Steve (steve.cl).
Conoces CADA feature, CADA botón, CADA flujo de la plataforma.

## Tu rol
Ayudar a los clientes a usar la plataforma Steve: conectar plataformas, usar herramientas, resolver problemas técnicos y responder cualquier duda sobre funcionalidades.

## Personalidad
- Profesional, cercana y eficiente. Simpática pero seria cuando se necesita.
- Hablas en español natural (tú, no vos). Sin regionalismos. Sin expresiones de perro ni onomatopeyas.
- Explicas todo de forma clara, estructurada y paso a paso.
- Cuando el cliente resuelve algo, lo reconoces brevemente y sigues adelante.

## Reglas
- SOLO respondes sobre la plataforma Steve y sus funcionalidades.
- NUNCA das consejos de marketing, estrategia de campañas ni optimización de anuncios. Para eso está Steve AI en la tab "Steve" o "Estrategia".
- Si te preguntan sobre marketing/estrategia, di: "Para recomendaciones de marketing, te sugiero usar la tab Steve o Estrategia en tu portal. Yo me encargo del soporte técnico."
- NUNCA reveles stack tecnológico interno, nombres de proveedores, herramientas o servicios que usa Steve por detrás (ej: no mencionar Anthropic, Claude, Haiku, Apify, GrapesJS, Twilio, Supabase, Hono, Vercel, Cloud Run, Deno, Sentry ni ningún otro proveedor/librería). Para el cliente, todo es "la plataforma Steve" o "inteligencia artificial de Steve".
- Responde siempre en español.
- Sé concisa pero completa. Si la pregunta es simple, responde en 2-3 líneas. Si requiere pasos, usa una lista numerada.
- Formato WhatsApp-friendly: corto, claro, con bullets.
- Si no puedes resolver algo después de 2-3 intentos, sugiere crear un ticket: "¿Te parece si creo un ticket para que el equipo técnico lo revise?"
- Si el cliente dice "crear ticket", "hablar con alguien" o "soporte humano", ofrece crear un ticket de inmediato.

## Contacto de escalación
- Email: jmbarros@bgconsult.cl
- WhatsApp: botón verde flotante
- Reunión: meetings.hubspot.com/jose-manuel15`;

function buildPlanContext(userPlan?: string): string {
  if (!userPlan) return '';

  const planNames: Record<string, string> = {
    visual: 'Visual ($49.990/mes)',
    estrategia: 'Estrategia ($99.990/mes)',
    full: 'Full ($199.990/mes)',
  };

  return `\n\n## PLAN DEL CLIENTE
El cliente tiene plan: ${planNames[userPlan] || userPlan}

PLAN GATING — Si preguntan por feature que NO está en su plan:
1. Explica qué hace la feature brevemente
2. Indica en qué plan está disponible
3. "Para acceder, puedes subir tu plan en Configuración → Billing o contactar al equipo"

Tabs bloqueadas por plan:
- Visual: Steve Chat, Brief, Estrategia, Deep Dive, Steve Mail, WhatsApp están bloqueados
- Estrategia: Steve Mail y WhatsApp están bloqueados. Crear campañas/ads requiere Full
- Full: Todo disponible`;
}

function buildTabContext(activeTab?: string): string {
  if (!activeTab) return '';

  const tabLabels: Record<string, string> = {
    metrics: 'Métricas',
    connections: 'Conexiones',
    config: 'Configuración',
    steve: 'Steve Chat',
    brief: 'Brief',
    estrategia: 'Estrategia',
    deepdive: 'Deep Dive',
    shopify: 'Shopify',
    campaigns: 'Campañas',
    copies: 'Meta Ads',
    social: 'Social (Instagram/Facebook)',
    google: 'Google Ads',
    klaviyo: 'Klaviyo',
    email: 'Steve Mail',
    wa_credits: 'WhatsApp',
    academy: 'Academy',
  };

  return `\n\n## TAB ACTIVA
El cliente está en la tab: ${tabLabels[activeTab] || activeTab}
Prioriza respuestas relacionadas con esta sección. Si pregunta algo genérico, contextualiza con lo que está viendo.`;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function chongaSupport(c: Context) {
  try {
    const { messages, knowledge_base, active_tab, user_plan } = await c.req.json() as {
      messages: Message[];
      knowledge_base?: string;
      active_tab?: string;
      user_plan?: string;
    };

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      console.error('[chonga-support] ANTHROPIC_API_KEY is not configured');
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    // Load Steve Brain knowledge for better support context
    const { knowledgeBlock } = await loadKnowledge(['brief', 'analisis'], { limit: 5, label: 'CONTEXTO DE STEVE', audit: { source: 'chonga-support' } });

    // Build system prompt: base + plan context + tab context + Steve Brain + knowledge base
    let systemPrompt = BASE_PROMPT;
    systemPrompt += buildPlanContext(user_plan);
    systemPrompt += buildTabContext(active_tab);
    if (knowledgeBlock) {
      systemPrompt += `\n\n${knowledgeBlock}`;
    }
    if (knowledge_base) {
      systemPrompt += `\n\n## Base de conocimiento completa de la plataforma\nUsa esta información para responder preguntas con precisión:\n\n${knowledge_base}`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: systemPrompt,
        messages: messages.filter((m: Message) => m.role !== 'system'),
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return c.json({ error: 'Rate limit exceeded' }, 429);
      }
      const text = await response.text();
      console.error('[chonga-support] Anthropic API error:', response.status, text);
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    const data: any = await response.json();
    const message = data.content?.[0]?.text || '';

    // Log when Chonga suggests a ticket (couldn't resolve)
    if (message.toLowerCase().includes('ticket') || message.toLowerCase().includes('equipo técnico')) {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content;
      if (lastUserMsg) {
        try {
          const SUPABASE_URL = process.env.SUPABASE_URL;
          const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
            fetch(`${SUPABASE_URL}/rest/v1/support_tickets`, {
              method: 'POST',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify({
                subject: `[Auto] ${lastUserMsg.slice(0, 100)}`,
                conversation: messages.map(m => `${m.role}: ${m.content}`).join('\n').slice(0, 5000),
                status: 'auto_logged',
                priority: 'low',
              }),
            }).catch(() => { /* silent — best effort logging */ });
          }
        } catch { /* silent */ }
      }
    }

    return c.json({ message });
  } catch (err: any) {
    console.error('[chonga-support]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
