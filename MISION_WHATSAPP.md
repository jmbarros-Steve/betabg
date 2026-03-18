# MISIÓN: WHATSAPP COMPLETO — STEVE CHAT + MERCHANT WA + TWILIO

**Agentes:** Valentina (W1) + Camila (W4 Frontend) + Sebastián (W5 Infra) + Paula (W19 Steve AI)
**Prioridad:** ALTA — diferenciador killer, nadie habla al DUEÑO por WhatsApp
**Instrucción:** Implementa TODO sin pedir permiso. Ejecuta directamente.

---

## QUÉ ES ESTO

Dos productos de WhatsApp dentro de Steve Ads, ambos sobre Twilio:

**PRODUCTO 1 — Steve Chat WA:** Steve habla con el MERCHANT (dueño de la tienda) por WhatsApp. Reportes, alertas, consultas, comandos. Un solo número de Steve para todos los merchants.

**PRODUCTO 2 — Merchant WA:** El merchant habla con SUS CLIENTES (compradores) por WhatsApp. Carrito abandonado, ofertas, soporte automático. Cada merchant tiene su propio número. Sistema de créditos.

**Diferenciador:** Todos los competidores (TextYess, Cartloop, etc) hablan al COMPRADOR. Nadie habla al MERCHANT con inteligencia de negocio. Steve hace las dos cosas.

---

## ARQUITECTURA TWILIO

```
Cuenta principal Twilio: Steve Ads
├── TU tarjeta de crédito (tú pagas todo)
├── UNA factura mensual
│
├── Número de Steve: +56 9 XXXX XXXX
│   ├── Webhook: POST /api/steve-wa-chat
│   ├── Para: todos los merchants hablan con Steve
│   └── Billing: costo de Steve Ads (no del merchant)
│
├── Sub-account: Jardín de Eva
│   ├── Número: +56 9 AAAA AAAA
│   ├── Webhook: POST /api/merchant-wa/client_UUID_1
│   ├── Para: clientes de Jardín de Eva hablan con la tienda
│   └── Billing: créditos del merchant en Steve Ads
│
├── Sub-account: Comercial Badim
│   ├── Número: +56 9 BBBB BBBB
│   ├── Webhook: POST /api/merchant-wa/client_UUID_2
│   └── ...
│
└── Sub-account por cada merchant nuevo (automático)
```

---

## TABLAS SUPABASE

```sql
-- Créditos de WhatsApp por merchant
CREATE TABLE wa_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,          -- créditos disponibles
  total_purchased INTEGER NOT NULL DEFAULT 0,  -- total comprado históricamente
  total_used INTEGER NOT NULL DEFAULT 0,       -- total consumido
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Transacciones de créditos (compras y consumo)
CREATE TABLE wa_credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
  type TEXT NOT NULL,                -- 'purchase' | 'usage' | 'refund' | 'bonus'
  amount INTEGER NOT NULL,           -- positivo = créditos agregados, negativo = consumidos
  description TEXT,                  -- "Compra 1000 créditos" | "Campaña carrito abandonado: 47 msgs"
  campaign_id UUID,                  -- referencia a la campaña que consumió
  balance_after INTEGER NOT NULL,    -- balance después de esta transacción
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Mensajes de WhatsApp (historial de conversaciones)
CREATE TABLE wa_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
  channel TEXT NOT NULL,              -- 'steve_chat' | 'merchant_wa'
  direction TEXT NOT NULL,            -- 'inbound' | 'outbound'
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT,
  media_url TEXT,                     -- si envía imagen/video
  message_sid TEXT,                   -- Twilio message SID
  status TEXT DEFAULT 'sent',         -- 'sent' | 'delivered' | 'read' | 'failed'
  template_name TEXT,                 -- si fue template message
  credits_used INTEGER DEFAULT 0,    -- créditos consumidos por este mensaje
  contact_name TEXT,                  -- nombre del contacto (cliente del merchant)
  contact_phone TEXT,                 -- teléfono del contacto
  metadata JSONB,                    -- datos extra (producto del carrito, etc)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Conversaciones (agrupación de mensajes por contacto)
CREATE TABLE wa_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
  channel TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  status TEXT DEFAULT 'open',         -- 'open' | 'escalated' | 'closed'
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INTEGER DEFAULT 0,
  assigned_to TEXT,                   -- 'steve' | 'human' (si fue escalado)
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, channel, contact_phone)
);

-- Campañas de WhatsApp (envíos masivos)
CREATE TABLE wa_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,        -- template aprobado por Meta
  template_body TEXT NOT NULL,
  segment_query JSONB,                -- filtro de destinatarios
  recipient_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  credits_used INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',        -- 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed'
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Automatizaciones de WhatsApp
CREATE TABLE wa_automations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
  name TEXT NOT NULL,                 -- "Carrito abandonado", "Bienvenida", etc
  trigger_type TEXT NOT NULL,         -- 'abandoned_cart' | 'first_purchase' | 'post_purchase' | 'custom'
  trigger_config JSONB,               -- {"delay_minutes": 60, "conditions": {...}}
  template_name TEXT NOT NULL,
  template_body TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  total_sent INTEGER DEFAULT 0,
  total_converted INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sub-accounts de Twilio por merchant
CREATE TABLE wa_twilio_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
  twilio_account_sid TEXT NOT NULL,   -- SID de la sub-account
  twilio_auth_token TEXT NOT NULL,    -- encriptado
  phone_number TEXT NOT NULL,         -- +56 9 XXXX XXXX
  phone_number_sid TEXT NOT NULL,     -- SID del número en Twilio
  whatsapp_approved BOOLEAN DEFAULT false,  -- si Meta aprobó el número para WA
  display_name TEXT,                  -- "Jardín de Eva" (lo que ven los clientes)
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para todo
ALTER TABLE wa_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_twilio_accounts ENABLE ROW LEVEL SECURITY;
-- Usar can_access_shop() para todas
```

---

## ARCHIVOS A CREAR

```
src/
├── api/whatsapp/
│   ├── steve-chat.ts              ← Webhook: merchant → Steve
│   ├── merchant-wa.ts             ← Webhook: cliente → merchant (vía Steve)
│   ├── status-callback.ts         ← Webhook: Twilio status updates (delivered, read, etc)
│   │
│   ├── setup/
│   │   ├── create-sub-account.ts  ← Crear sub-account Twilio para merchant
│   │   ├── buy-number.ts          ← Comprar número chileno
│   │   └── configure-webhook.ts   ← Configurar webhook del número
│   │
│   ├── send/
│   │   ├── send-message.ts        ← Enviar mensaje individual
│   │   ├── send-campaign.ts       ← Enviar campaña masiva
│   │   └── send-template.ts       ← Enviar template aprobado
│   │
│   ├── credits/
│   │   ├── check-balance.ts       ← Verificar si tiene créditos
│   │   ├── deduct.ts              ← Descontar créditos
│   │   └── purchase.ts            ← Comprar créditos (Stripe/Flow)
│   │
│   ├── automations/
│   │   ├── abandoned-cart.ts      ← Trigger: Shopify webhook carrito
│   │   ├── first-purchase.ts      ← Trigger: primera compra
│   │   ├── post-purchase.ts       ← Trigger: X días después de compra
│   │   └── runner.ts              ← Ejecuta automatizaciones pendientes
│   │
│   └── lib/
│       ├── twilio-client.ts       ← Cliente Twilio configurado
│       ├── steve-wa-brain.ts      ← Lógica de Steve Chat (conecta con steve-chat)
│       └── merchant-wa-brain.ts   ← Lógica de respuesta automática como la tienda
│
├── pages/
│   └── WhatsApp.tsx               ← Página principal módulo WhatsApp
│
├── components/whatsapp/
│   ├── WAInbox.tsx                ← Inbox de conversaciones
│   ├── WAConversation.tsx         ← Vista de una conversación (chat)
│   ├── WACampaigns.tsx            ← Lista de campañas + crear nueva
│   ├── WAAutomations.tsx          ← Lista de automatizaciones con toggles
│   ├── WAMetrics.tsx              ← Dashboard de métricas
│   ├── WACredits.tsx              ← Balance + comprar créditos
│   └── WASetup.tsx                ← Configuración inicial del número
```

---

# ═══════════════════════════════════════════
# PRODUCTO 1: STEVE CHAT WA
# ═══════════════════════════════════════════

## Qué es
Steve habla con el merchant por WhatsApp. El merchant le escribe al número de Steve como si fuera un amigo experto en marketing.

## Número
Un solo número de WhatsApp para Steve: +56 9 XXXX XXXX
Registrado en la cuenta principal de Twilio (no sub-account).

## Webhook

```typescript
// steve-chat.ts — POST /api/steve-wa-chat
// Twilio envía cada mensaje que llega al número de Steve

import twilio from 'twilio';

export async function POST(req: Request) {
  const body = await req.formData();
  const from = body.get('From') as string;       // whatsapp:+56987654321
  const messageBody = body.get('Body') as string; // "¿Cómo van mis ventas?"
  const profileName = body.get('ProfileName') as string;

  // Extraer número limpio
  const phone = from.replace('whatsapp:', '').replace('+', '');

  // Identificar merchant por teléfono
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('phone', phone)
    .single();

  if (!client) {
    // Número no registrado — responder amablemente
    await sendWhatsApp(from, 
      "Hola! Soy Steve, el asistente de marketing de Steve Ads. " +
      "No tengo tu número registrado. Si ya eres cliente, " +
      "agrega tu número en app.steveads.com/settings"
    );
    return new Response('OK');
  }

  // Guardar mensaje entrante
  await supabase.from('wa_messages').insert({
    client_id: client.id,
    channel: 'steve_chat',
    direction: 'inbound',
    from_number: phone,
    to_number: process.env.STEVE_WA_NUMBER,
    body: messageBody,
    contact_name: profileName,
    contact_phone: phone,
  });

  // Llamar a steve-chat con contexto del merchant
  // Steve ya tiene acceso a shopify_products, meta_campaigns, ventas, etc
  const steveResponse = await fetch(`${process.env.API_URL}/api/steve-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: client.id,
      message: messageBody,
      channel: 'whatsapp',  // Steve sabe que viene de WA → respuestas cortas
      context: {
        merchant_name: client.business_name,
        merchant_phone: phone,
      }
    })
  });

  const { response: steveReply } = await steveResponse.json();

  // Enviar respuesta de Steve
  await sendWhatsApp(from, steveReply);

  // Guardar mensaje saliente
  await supabase.from('wa_messages').insert({
    client_id: client.id,
    channel: 'steve_chat',
    direction: 'outbound',
    from_number: process.env.STEVE_WA_NUMBER,
    to_number: phone,
    body: steveReply,
  });

  return new Response('OK');
}

async function sendWhatsApp(to: string, body: string) {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  await client.messages.create({
    from: `whatsapp:+${process.env.STEVE_WA_NUMBER}`,
    to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    body: body,
  });
}
```

## Steve Chat — Personalidad para WhatsApp

```typescript
// steve-wa-brain.ts — Instrucciones extra para Steve cuando habla por WA

export const WA_SYSTEM_PROMPT = `
Estás hablando por WhatsApp con el DUEÑO de una tienda e-commerce.
El merchant te habla como le hablaría a un amigo que sabe de marketing.

REGLAS PARA WHATSAPP:
- Respuestas CORTAS. Máximo 3-4 líneas. No es un email, es un chat.
- Usa emojis con moderación (1-2 por mensaje máximo).
- Si necesitas dar datos largos, resume y ofrece: "¿Quieres el detalle completo?"
- Si el merchant pide algo que requiere la web, dile: "Eso lo puedes ver mejor en app.steveads.com/[sección]"
- Habla en español chileno natural. "Wena", "cachai", "dale" están bien.
- NO uses jerga de marketing a menos que el merchant la use primero.

QUÉ PUEDES HACER:
- Reportar ventas del día/semana/mes
- Analizar campañas de Meta (qué funciona, qué no)
- Sugerir acciones ("Deberías pausar esa campaña, el CPA se disparó")
- Crear campañas simples por comando ("Crea una promo de 20% en toda la tienda")
- Alertar problemas ("Tu stock de X producto está bajo")
- Responder cualquier pregunta sobre su negocio

QUÉ NO PUEDES HACER POR WHATSAPP:
- Diseñar emails (mandar a Steve Mail)
- Editar configuraciones complejas (mandar a la web)
- Mostrar tablas o datos extensos (mandar link)
`;
```

## Steve — Mensajes proactivos

```typescript
// Cron jobs que Steve envía por su cuenta al merchant

// 1. Reporte matutino (8am Chile)
// cron: 0 8 * * *
async function morningReport(client: Client) {
  const sales = await getYesterdaySales(client.id);
  const topProduct = await getTopProduct(client.id);
  const adSpend = await getMetaSpend(client.id);

  const msg = `Buenos días ${client.first_name}! 📊\n\n` +
    `Ayer vendiste ${formatCLP(sales.total)} en ${sales.orders} pedidos.\n` +
    `Top producto: ${topProduct.name}\n` +
    `Gasto en ads: ${formatUSD(adSpend)}\n` +
    `ROAS: ${sales.roas}x\n\n` +
    `¿Quieres que analice algo?`;

  await sendWhatsApp(`whatsapp:+${client.phone}`, msg);
}

// 2. Alerta de CPA alto (cada 2 horas)
async function cpaAlert(client: Client, campaign: Campaign) {
  const msg = `⚠️ ${client.first_name}, tu campaña "${campaign.name}" ` +
    `tiene CPA de ${formatUSD(campaign.cpa)} — está sobre tu objetivo.\n\n` +
    `¿La pauso o le damos más tiempo?`;

  await sendWhatsApp(`whatsapp:+${client.phone}`, msg);
  // Si merchant responde "pausa" → Steve la pausa automáticamente
}

// 3. Alerta de stock bajo
async function stockAlert(client: Client, product: Product) {
  const msg = `🔴 ${product.title} tiene solo ${product.inventory} unidades ` +
    `y se están vendiendo rápido. ¿Quieres que pause los ads de este producto?`;

  await sendWhatsApp(`whatsapp:+${client.phone}`, msg);
}

// 4. Resumen semanal (lunes 9am)
async function weeklyReport(client: Client) {
  const week = await getWeeklyMetrics(client.id);
  const msg = `📈 Resumen semanal:\n\n` +
    `Ventas: ${formatCLP(week.revenue)} (${week.revenueChange})\n` +
    `Pedidos: ${week.orders}\n` +
    `Ticket promedio: ${formatCLP(week.avgTicket)}\n` +
    `ROAS Meta: ${week.roas}x\n` +
    `Emails enviados: ${week.emailsSent} (${week.openRate}% apertura)\n\n` +
    `¿Quieres que te cuente más de algo?`;

  await sendWhatsApp(`whatsapp:+${client.phone}`, msg);
}
```

---

# ═══════════════════════════════════════════
# PRODUCTO 2: MERCHANT WA (B2C)
# ═══════════════════════════════════════════

## Qué es
Los CLIENTES de la tienda hablan con la tienda por WhatsApp. Steve responde automáticamente como si fuera la tienda. Cada merchant tiene su propio número.

## Onboarding de número (automático)

```typescript
// create-sub-account.ts — Se ejecuta cuando merchant activa WhatsApp en Steve Ads

import twilio from 'twilio';

const masterClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function setupMerchantWhatsApp(clientId: string, businessName: string) {

  // 1. Crear sub-account en Twilio
  const subAccount = await masterClient.api.accounts.create({
    friendlyName: `steve-ads-${businessName.toLowerCase().replace(/\s/g, '-')}`
  });

  // 2. Comprar número chileno para la sub-account
  const subClient = twilio(subAccount.sid, subAccount.authToken);

  // Buscar números disponibles en Chile
  const available = await subClient.availablePhoneNumbers('CL')
    .mobile.list({ limit: 1 });

  if (available.length === 0) {
    throw new Error('No hay números chilenos disponibles en Twilio');
  }

  // Comprar el número
  const number = await subClient.incomingPhoneNumbers.create({
    phoneNumber: available[0].phoneNumber,
    friendlyName: businessName,
  });

  // 3. Configurar webhook para WhatsApp
  // Twilio WhatsApp usa "WhatsApp Senders" — hay que registrar el número
  // para WhatsApp Business y configurar el webhook

  // El webhook apunta a nuestro Cloud Run con el client_id
  const webhookUrl = `${process.env.API_URL}/api/whatsapp/merchant-wa/${clientId}`;

  // 4. Guardar en Supabase
  await supabase.from('wa_twilio_accounts').insert({
    client_id: clientId,
    twilio_account_sid: subAccount.sid,
    twilio_auth_token: encrypt(subAccount.authToken),
    phone_number: number.phoneNumber,
    phone_number_sid: number.sid,
    display_name: businessName,
  });

  // 5. Crear balance de créditos inicial (bonus de bienvenida)
  await supabase.from('wa_credits').insert({
    client_id: clientId,
    balance: 100,           // 100 créditos gratis de bienvenida
    total_purchased: 100,
  });

  await supabase.from('wa_credit_transactions').insert({
    client_id: clientId,
    type: 'bonus',
    amount: 100,
    description: 'Créditos de bienvenida',
    balance_after: 100,
  });

  return {
    phoneNumber: number.phoneNumber,
    subAccountSid: subAccount.sid,
  };
}
```

## Webhook del merchant (cliente → tienda)

```typescript
// merchant-wa.ts — POST /api/whatsapp/merchant-wa/:clientId
// Cuando un CLIENTE de la tienda escribe al número del merchant

export async function POST(req: Request, { params }: { params: { clientId: string } }) {
  const body = await req.formData();
  const from = body.get('From') as string;
  const messageBody = body.get('Body') as string;
  const profileName = body.get('ProfileName') as string;
  const clientId = params.clientId;

  const phone = from.replace('whatsapp:', '').replace('+', '');

  // Obtener datos del merchant
  const { data: client } = await supabase
    .from('clients')
    .select('*, wa_twilio_accounts(*)')
    .eq('id', clientId)
    .single();

  if (!client) return new Response('Not found', { status: 404 });

  // Guardar mensaje entrante
  await supabase.from('wa_messages').insert({
    client_id: clientId,
    channel: 'merchant_wa',
    direction: 'inbound',
    from_number: phone,
    to_number: client.wa_twilio_accounts[0].phone_number,
    body: messageBody,
    contact_name: profileName,
    contact_phone: phone,
  });

  // Actualizar o crear conversación
  await supabase.from('wa_conversations').upsert({
    client_id: clientId,
    channel: 'merchant_wa',
    contact_phone: phone,
    contact_name: profileName,
    status: 'open',
    last_message_at: new Date().toISOString(),
    last_message_preview: messageBody.substring(0, 100),
    unread_count: supabase.raw('unread_count + 1'),
  }, { onConflict: 'client_id,channel,contact_phone' });

  // Steve responde COMO LA TIENDA
  const response = await generateMerchantResponse(clientId, phone, messageBody, profileName);

  if (response.action === 'auto_reply') {
    // Steve puede responder automáticamente
    await sendMerchantWhatsApp(client, from, response.message);

    await supabase.from('wa_messages').insert({
      client_id: clientId,
      channel: 'merchant_wa',
      direction: 'outbound',
      from_number: client.wa_twilio_accounts[0].phone_number,
      to_number: phone,
      body: response.message,
    });

  } else if (response.action === 'escalate') {
    // Steve no puede responder — escalar al merchant
    await supabase.from('wa_conversations')
      .update({ status: 'escalated', assigned_to: 'human' })
      .eq('client_id', clientId)
      .eq('contact_phone', phone);

    // Notificar al merchant por Steve Chat
    await sendWhatsApp(
      `whatsapp:+${client.phone}`,
      `👋 ${client.first_name}, ${profileName} escribió a tu WhatsApp ` +
      `y necesita atención humana:\n\n"${messageBody}"\n\n` +
      `Responde desde app.steveads.com/whatsapp`
    );
  }

  return new Response('OK');
}
```

## Cerebro del merchant WA (Steve responde como la tienda)

```typescript
// merchant-wa-brain.ts

export async function generateMerchantResponse(
  clientId: string,
  customerPhone: string,
  message: string,
  customerName: string
): Promise<{ action: 'auto_reply' | 'escalate'; message: string }> {

  // Cargar contexto de la tienda
  const products = await getShopifyProducts(clientId);
  const brand = await getBrandBrief(clientId);
  const orderHistory = await getCustomerOrders(clientId, customerPhone);

  const systemPrompt = `
Eres el asistente de atención al cliente de "${brand.business_name}".
Respondes como si fueras la tienda, NO como Steve Ads.
El cliente NO sabe que está hablando con IA.

INFORMACIÓN DE LA TIENDA:
- Nombre: ${brand.business_name}
- Rubro: ${brand.industry}
- Tono: ${brand.tone || 'amigable y profesional'}

PRODUCTOS DISPONIBLES:
${products.map(p => `- ${p.title}: $${p.price} (stock: ${p.inventory})`).join('\n')}

HISTORIAL DEL CLIENTE (${customerName}):
${orderHistory.length > 0
  ? orderHistory.map(o => `- Pedido #${o.number}: ${o.items} - ${o.status}`).join('\n')
  : 'Sin compras anteriores'}

REGLAS:
- Respuestas cortas (WhatsApp, no email)
- Si preguntan por stock/precio → responder con datos reales
- Si preguntan por estado de pedido → responder con datos reales
- Si hacen un reclamo → ESCALAR (no inventar soluciones)
- Si piden algo que no puedes resolver → ESCALAR
- Si quieren comprar → mandar link directo al producto
- Habla en español chileno natural, como lo haría el dueño de la tienda
- NUNCA digas que eres IA, bot, o Steve Ads
- NUNCA inventes información que no tengas

ESCALAR CUANDO:
- Reclamos o problemas con pedidos
- Solicitudes de devolución/reembolso
- Preguntas que no puedes responder con los datos disponibles
- Temas sensibles o emocionales
- El cliente explícitamente pide hablar con una persona

Para escalar, responde con: {"action": "escalate", "reason": "motivo"}
Para responder, responde con: {"action": "auto_reply", "message": "tu respuesta"}
`;

  const response = await callClaude(systemPrompt, message);
  return JSON.parse(response);
}
```

---

# ═══════════════════════════════════════════
# SISTEMA DE CRÉDITOS
# ═══════════════════════════════════════════

## Pricing de créditos

```typescript
// Paquetes de créditos (CLP)
export const CREDIT_PACKAGES = [
  { credits: 500,   price_clp: 9900,   per_credit: 19.8  },   // ~$10 USD
  { credits: 1000,  price_clp: 14900,  per_credit: 14.9  },   // ~$16 USD (más vendido)
  { credits: 5000,  price_clp: 59900,  per_credit: 11.98 },   // ~$65 USD
  { credits: 10000, price_clp: 99900,  per_credit: 9.99  },   // ~$108 USD (mejor precio)
];

// Costo real por mensaje en Twilio (Chile):
// Meta fee: ~$0.05 USD (~$47 CLP)
// Twilio markup: ~$0.005 USD (~$5 CLP)
// Total costo: ~$52 CLP por mensaje
// Venta a 1 crédito = 1 mensaje:
// Paquete 1000 créditos: $14.9 CLP/crédito → vendemos a ~$15 lo que cuesta ~$52
// WAIT — eso NO da margen positivo.

// CORRECCIÓN: 1 crédito ≠ 1 mensaje. 
// 1 crédito = $14.9 CLP. 1 mensaje cuesta ~$52 CLP.
// Entonces: 1 mensaje = 4 créditos.
// O mejor: vender paquetes de MENSAJES directamente.

export const MESSAGE_PACKAGES = [
  { messages: 250,   price_clp: 19900,  per_msg_clp: 79.6 },  // margen: ~35%
  { messages: 500,   price_clp: 34900,  per_msg_clp: 69.8 },  // margen: ~25%
  { messages: 1000,  price_clp: 59900,  per_msg_clp: 59.9 },  // margen: ~13%
  { messages: 5000,  price_clp: 249900, per_msg_clp: 49.98 }, // margen: ~-4% (loss leader)
];

// Simplificar: "1 crédito = 1 mensaje de WhatsApp"
// Paquete 500 créditos = $34.900 CLP (~$38 USD)
// Costo real 500 msgs = ~$27.5 USD
// Margen: ~$10.5 USD = ~28%
```

## Descontar créditos

```typescript
// deduct.ts — Se llama antes de cada envío

export async function deductCredits(
  clientId: string,
  amount: number,
  description: string,
  campaignId?: string
): Promise<{ success: boolean; balance: number; error?: string }> {

  // Verificar balance actual
  const { data: credits } = await supabase
    .from('wa_credits')
    .select('balance')
    .eq('client_id', clientId)
    .single();

  if (!credits || credits.balance < amount) {
    return {
      success: false,
      balance: credits?.balance || 0,
      error: `Créditos insuficientes. Necesitas ${amount}, tienes ${credits?.balance || 0}.`
    };
  }

  // Descontar atómicamente
  const newBalance = credits.balance - amount;

  await supabase.from('wa_credits')
    .update({
      balance: newBalance,
      total_used: supabase.raw(`total_used + ${amount}`),
    })
    .eq('client_id', clientId);

  // Registrar transacción
  await supabase.from('wa_credit_transactions').insert({
    client_id: clientId,
    type: 'usage',
    amount: -amount,
    description,
    campaign_id: campaignId,
    balance_after: newBalance,
  });

  // Si queda poco → alertar al merchant por Steve Chat
  if (newBalance < 50) {
    await sendWhatsApp(
      `whatsapp:+${await getMerchantPhone(clientId)}`,
      `⚠️ Te quedan ${newBalance} créditos de WhatsApp. ` +
      `Compra más en app.steveads.com/whatsapp/creditos`
    );
  }

  return { success: true, balance: newBalance };
}
```

---

# ═══════════════════════════════════════════
# AUTOMATIZACIONES
# ═══════════════════════════════════════════

## Carrito abandonado

```typescript
// abandoned-cart.ts
// Trigger: Shopify webhook "checkouts/create" + cron que verifica si se completó

export async function checkAbandonedCarts() {
  // Buscar checkouts sin orden completada hace >1 hora
  const abandonedCarts = await supabase
    .from('shopify_checkouts')  // tabla que llena el webhook de Shopify
    .select('*')
    .is('completed_at', null)
    .lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .eq('wa_reminder_sent', false);

  for (const cart of abandonedCarts?.data || []) {
    // Verificar que el merchant tiene automatización activa
    const { data: automation } = await supabase
      .from('wa_automations')
      .select('*')
      .eq('client_id', cart.client_id)
      .eq('trigger_type', 'abandoned_cart')
      .eq('is_active', true)
      .single();

    if (!automation) continue;

    // Verificar créditos
    const deduction = await deductCredits(cart.client_id, 1, 'Carrito abandonado automático');
    if (!deduction.success) continue;

    // Enviar WhatsApp al cliente
    const product = cart.line_items[0];
    const message = automation.template_body
      .replace('{{customer_name}}', cart.customer_name || 'Hola')
      .replace('{{product_name}}', product.title)
      .replace('{{cart_url}}', cart.abandoned_checkout_url);

    await sendMerchantWhatsApp(
      await getMerchantTwilioAccount(cart.client_id),
      `whatsapp:+${cart.customer_phone}`,
      message
    );

    // Marcar como enviado
    await supabase.from('shopify_checkouts')
      .update({ wa_reminder_sent: true })
      .eq('id', cart.id);

    // Registrar
    await supabase.from('wa_messages').insert({
      client_id: cart.client_id,
      channel: 'merchant_wa',
      direction: 'outbound',
      body: message,
      template_name: 'abandoned_cart',
      credits_used: 1,
    });
  }
}
```

---

# ═══════════════════════════════════════════
# FRONTEND — UI COMPLETO
# ═══════════════════════════════════════════

## Camila implementa las siguientes pantallas:

### Pantalla 1: Setup (primera vez)
```
Si el merchant no tiene WhatsApp configurado:
- Título: "Activa WhatsApp para tu tienda"
- Descripción: "Tus clientes podrán escribirte por WhatsApp y Steve responderá automáticamente"
- Botón: "Activar WhatsApp" → crea sub-account + compra número
- Loading: "Configurando tu número..." (15-30 segundos)
- Resultado: "Tu número es +56 9 XXXX XXXX ✓"
- 100 créditos de regalo de bienvenida
```

### Pantalla 2: Inbox
```
Lista de conversaciones ordenadas por última actividad.
Cada conversación muestra:
  - Nombre del contacto (o número si no tiene nombre)
  - Preview del último mensaje
  - Timestamp
  - Badge: "Steve respondió" (verde) | "Necesita atención" (amarillo) | "Cerrada" (gris)
  
Click en una conversación → se abre el chat.
El merchant puede:
  - Ver toda la conversación (mensajes de Steve + del cliente)
  - Escribir manualmente (toma control de la conversación)
  - Marcar como resuelta

Filtros: Todos | Abiertos | Escalados | Cerrados
```

### Pantalla 3: Chat (dentro de una conversación)
```
Vista tipo WhatsApp/iMessage:
  - Burbujas verdes (mensajes salientes — de la tienda/Steve)
  - Burbujas grises (mensajes entrantes — del cliente)
  - Timestamps
  - Status: enviado ✓ | entregado ✓✓ | leído ✓✓ azul
  
Si Steve respondió → badge "Respuesta automática de Steve"
Si fue escalado → banner "Steve escaló esta conversación"

Input de texto para que el merchant responda manualmente.
Botón: "Dejar que Steve siga respondiendo" (devuelve control a Steve)
```

### Pantalla 4: Campañas
```
Lista de campañas enviadas + botón "Nueva campaña"

Crear campaña:
  1. Nombre de la campaña
  2. Seleccionar segmento (todos, compradores, carrito abandonado, etc)
  3. Escribir mensaje (o pedir a Steve que lo genere)
  4. Preview del mensaje
  5. Conteo de destinatarios + créditos que va a costar
  6. Botón "Enviar ahora" o "Programar"
  7. Confirmación: "¿Enviar a 230 personas? (costo: 230 créditos)"

Vista de campaña enviada:
  - Enviados / Entregados / Leídos / Respondidos
  - Conversiones (si alguno compró después)
  - Costo en créditos
```

### Pantalla 5: Automatizaciones
```
Lista de automatizaciones con toggle on/off:

- Carrito abandonado (1hr)
  "Si deja carrito → espera 1 hora → WhatsApp con el producto"
  [ON/OFF toggle] | Enviados: 472 | Conversión: 12%

- Bienvenida nuevo cliente
  "Primera compra → WhatsApp de agradecimiento + cupón"
  [ON/OFF toggle] | Enviados: 89 | Conversión: 23%

- Post-compra (3 días)
  "3 días después → '¿Cómo te fue con tu pedido?'"
  [ON/OFF toggle] | Enviados: 156 | Conversión: 8%

- Recompra (30 días)
  "30 días sin comprar → oferta especial"
  [ON/OFF toggle] | Enviados: 234 | Conversión: 5%

Cada automatización tiene:
  - Editar mensaje (o pedir a Steve que lo escriba)
  - Configurar delay (cuánto esperar antes de enviar)
  - Ver métricas
```

### Pantalla 6: Créditos
```
Balance actual: 743 créditos

Historial:
  - Hoy: -47 créditos (Carrito abandonado automático)
  - Ayer: -230 créditos (Campaña "Promo fin de semana")
  - Mar 15: +1000 créditos (Compra paquete)

Comprar créditos:
  [ 250 msgs  — $19.900 ]
  [ 500 msgs  — $34.900 ] ← más vendido
  [ 1000 msgs — $59.900 ]
  [ 5000 msgs — $249.900 ]

Pago: Stripe o Flow (pasarela chilena)
```

### Pantalla 7: Métricas
```
Dashboard con:
  - Mensajes enviados (hoy / 7d / 30d)
  - Tasa de entrega
  - Tasa de lectura
  - Tasa de respuesta
  - Conversiones (ventas atribuidas a WhatsApp)
  - Créditos usados en el período
  - ROI: revenue por WhatsApp / costo de créditos
  
Gráfico de tendencia: mensajes enviados vs conversiones por día
```

---

# ═══════════════════════════════════════════
# TWILIO — SETUP INICIAL
# ═══════════════════════════════════════════

```bash
# 1. Crear cuenta en twilio.com
# 2. Agregar método de pago
# 3. Obtener Account SID + Auth Token
# 4. Habilitar WhatsApp Sandbox (para testing)
# 5. Comprar número chileno para Steve
# 6. Registrar número para WhatsApp Business
#    (Twilio te guía por el proceso con Meta)
# 7. Configurar webhook del número de Steve:
#    https://steve-api-XXXXX.run.app/api/whatsapp/steve-chat

# ENV VARS para Cloud Run:
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
STEVE_WA_NUMBER=56912345678
```

---

# ═══════════════════════════════════════════
# PRIORIDAD DE IMPLEMENTACIÓN
# ═══════════════════════════════════════════

```
SEMANA 1: Steve Chat WA (lo más rápido para ver valor)
  1. Crear cuenta Twilio + comprar número chileno
  2. Webhook steve-wa-chat + conectar con steve-chat existente
  3. Tabla wa_messages
  4. Probar: escribir a Steve → Steve responde con datos reales
  5. Agregar reporte matutino (cron 8am)
  6. Probar con tu propio número primero
  7. Probar con Jardín de Eva o Badim

SEMANA 2: Merchant WA — backend
  8. Twilio sub-accounts + compra de número automática
  9. Webhook merchant-wa + brain que responde como la tienda
  10. Sistema de créditos (tablas + deduct + check balance)
  11. Tabla wa_conversations + wa_messages para merchant
  12. Probar con tienda de prueba + tu número como "cliente"

SEMANA 3: Merchant WA — frontend
  13. Pantalla de Setup (activar WhatsApp)
  14. Inbox con conversaciones
  15. Chat view (ver y responder)
  16. Pantalla de créditos + comprar (Stripe/Flow)
  17. Probar flujo completo end-to-end

SEMANA 4: Automatizaciones + campañas
  18. Carrito abandonado automático
  19. Bienvenida + post-compra
  20. Pantalla de automatizaciones con toggles
  21. Crear y enviar campaña masiva
  22. Métricas post-envío

SEMANA 5: Pulir + lanzar
  23. Métricas dashboard completo
  24. Alertas de créditos bajos
  25. QA completo
  26. Lanzar con 1 merchant real
```

---

# ═══════════════════════════════════════════
# COSTOS MENSUALES
# ═══════════════════════════════════════════

```
Twilio:
  Número de Steve: $15/mes
  10 merchants × $15/número: $150/mes
  Mensajes de Steve Chat (proactivos): ~$50/mes

Revenue (10 merchants × 500 msgs promedio):
  10 × $34.900 CLP = $349.000 CLP (~$380 USD)

Costo Twilio msgs:
  5.000 msgs × $0.055: $275 USD

Margen:
  Revenue: $380 USD
  Costos: $275 (msgs) + $150 (números) + $15 (Steve) + $50 (Steve proactivo) = $490
  
  Con 10 merchants: -$110 (pérdida leve — normal al empezar)
  Con 30 merchants: +$650/mes (profitable)
  Con 100 merchants: +$3.500/mes (muy rentable)
  
El margen mejora con volumen porque el costo fijo
(número de Steve, infra) se diluye.
```

---

# ═══════════════════════════════════════════
# RESTRICCIONES INQUEBRANTABLES
# ═══════════════════════════════════════════

1. **El cliente NUNCA sabe que habla con IA.** Steve responde como la tienda. Si no puede resolver → escala al humano.
2. **Créditos primero.** NUNCA enviar sin verificar créditos. Si no tiene → no se envía.
3. **Un solo billing.** Twilio te cobra a ti. Tú le cobras al merchant. El merchant nunca ve Twilio.
4. **Templates aprobados.** Los mensajes proactivos (que la tienda inicia) DEBEN ser templates aprobados por Meta. Los mensajes reactivos (respuesta al cliente) son libres dentro de la ventana de 24hrs.
5. **Opt-in obligatorio.** Solo enviar WhatsApp a clientes que dieron consentimiento. Shopify checkout con checkbox es suficiente.
6. **Unsubscribe funcional.** Si el cliente dice "no quiero más mensajes" → Steve deja de enviarle. Obligatorio por políticas de Meta.
7. **Rate limiting.** No enviar más de X mensajes por segundo por número. Twilio maneja esto pero verificar.
8. **Datos sensibles.** Los mensajes de WhatsApp contienen datos de clientes. RLS estricto. El merchant A nunca ve los mensajes del merchant B.
9. **Steve Chat es gratis para el merchant.** Los créditos son solo para el canal B2C (merchant → sus clientes). Steve hablando con el merchant no cuesta créditos.
10. **Sin spam.** Meta banea números que hacen spam. Steve sugiere frecuencia razonable y respeta las políticas.
