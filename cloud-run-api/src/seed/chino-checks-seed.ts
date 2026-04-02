// El Chino — Seed checks 51-800
// Bloque 2: 51-100 (specs exactas)
// Bloque 3: 101-200 (seguridad, edge cases, visual, datos fantasma, chat tortura, rendimiento)
// Bloque 4: 201-400 (tipografía, micro-interacciones, empty states, email, Meta, onboarding, consistencia, webhooks, IA)
// Bloque 5: 401-600 (Meta Ads diamante, Klaviyo diamante)
// Bloque 6: 601-800 (Shopify, integración cruzada, SteveMail avanzado)

import { getSupabaseAdmin } from '../lib/supabase.js';

interface CheckDef {
  check_number: number;
  description: string;
  check_type: string;
  platform: string;
  severity: string;
  check_config?: Record<string, any>;
}

// ─── Bloque 2: Checks 51-100 (specs exactas) ────────────────────

const bloque2: CheckDef[] = [
  // Klaviyo avanzado
  { check_number: 51, description: 'Klaviyo: flow "Welcome Series" tiene al menos 3 emails activos', check_type: 'api_compare', platform: 'klaviyo', severity: 'high' },
  { check_number: 52, description: 'Klaviyo: open rate promedio últimos 7 días > 15%', check_type: 'data_quality', platform: 'klaviyo', severity: 'high' },
  { check_number: 53, description: 'Klaviyo: no hay flows con 0 emails (flows vacíos)', check_type: 'data_quality', platform: 'klaviyo', severity: 'medium' },
  { check_number: 54, description: 'Klaviyo: bounce rate < 5% en últimos 30 días', check_type: 'data_quality', platform: 'klaviyo', severity: 'high' },
  { check_number: 55, description: 'Klaviyo: unsubscribe rate < 1% en último envío masivo', check_type: 'data_quality', platform: 'klaviyo', severity: 'medium' },
  { check_number: 56, description: 'Klaviyo: contactos activos > 100 por merchant con conexión', check_type: 'api_compare', platform: 'klaviyo', severity: 'medium' },
  { check_number: 57, description: 'Klaviyo: templates importados tienen subject y body no vacíos', check_type: 'data_quality', platform: 'klaviyo', severity: 'medium' },
  { check_number: 58, description: 'Klaviyo: last sync < 24 horas para merchants activos', check_type: 'data_quality', platform: 'klaviyo', severity: 'high' },
  { check_number: 59, description: 'Klaviyo: API key válida (test call no retorna 401)', check_type: 'token_health', platform: 'klaviyo', severity: 'critical' },
  { check_number: 60, description: 'Klaviyo: push emails endpoint responde < 5s', check_type: 'performance', platform: 'klaviyo', severity: 'medium' },
  // SteveMail
  { check_number: 61, description: 'SteveMail: tabla email_campaigns tiene registros para merchants activos', check_type: 'data_quality', platform: 'stevemail', severity: 'medium' },
  { check_number: 62, description: 'SteveMail: SES webhooks endpoint responde 200', check_type: 'api_exists', platform: 'stevemail', severity: 'high' },
  { check_number: 63, description: 'SteveMail: tracking pixel endpoint /email-track/open responde 200', check_type: 'api_exists', platform: 'stevemail', severity: 'high' },
  { check_number: 64, description: 'SteveMail: click tracking /email-track/click redirige correctamente', check_type: 'functional', platform: 'stevemail', severity: 'high' },
  { check_number: 65, description: 'SteveMail: unsubscribe link funciona y actualiza estado en DB', check_type: 'functional', platform: 'stevemail', severity: 'critical' },
  { check_number: 66, description: 'SteveMail: send-email endpoint responde < 3s', check_type: 'performance', platform: 'stevemail', severity: 'medium' },
  { check_number: 67, description: 'SteveMail: email templates gallery tiene al menos 5 templates sistema', check_type: 'data_quality', platform: 'stevemail', severity: 'low' },
  { check_number: 68, description: 'SteveMail: AB testing crea variantes correctamente', check_type: 'functional', platform: 'stevemail', severity: 'medium' },
  { check_number: 69, description: 'SteveMail: flow engine ejecuta pasos en orden correcto', check_type: 'functional', platform: 'stevemail', severity: 'high' },
  { check_number: 70, description: 'SteveMail: dominio verificado para al menos 1 merchant', check_type: 'data_quality', platform: 'stevemail', severity: 'medium' },
  // Steve Chat
  { check_number: 71, description: 'Steve Chat: /api/steve-chat responde < 10s con mensaje válido', check_type: 'performance', platform: 'steve_chat', severity: 'high' },
  { check_number: 72, description: 'Steve Chat: historial de conversación se guarda en wa_messages', check_type: 'data_quality', platform: 'steve_chat', severity: 'high' },
  { check_number: 73, description: 'Steve Chat: no hay mensajes vacíos en wa_messages últimas 24h', check_type: 'data_quality', platform: 'steve_chat', severity: 'medium' },
  { check_number: 74, description: 'Steve Chat: PII scrubber activo (no hay RUTs/emails en body)', check_type: 'security', platform: 'steve_chat', severity: 'critical' },
  { check_number: 75, description: 'Steve Chat: context builder incluye datos de Shopify/Meta/Klaviyo', check_type: 'functional', platform: 'steve_chat', severity: 'medium' },
  { check_number: 76, description: 'Steve Chat: knowledge base tiene > 50 entries', check_type: 'data_quality', platform: 'steve_chat', severity: 'low' },
  { check_number: 77, description: 'Steve Chat: prospect flow detecta URLs y hace scraping', check_type: 'functional', platform: 'steve_chat', severity: 'medium' },
  { check_number: 78, description: 'Steve Chat: multi-brain (investigator, strategist, conversationalist) responde', check_type: 'functional', platform: 'steve_chat', severity: 'medium' },
  { check_number: 79, description: 'Steve Chat: audio transcription funciona para audios WhatsApp', check_type: 'functional', platform: 'steve_chat', severity: 'medium' },
  { check_number: 80, description: 'Steve Chat: image vision funciona para imágenes WhatsApp', check_type: 'functional', platform: 'steve_chat', severity: 'medium' },
  // Infra
  { check_number: 81, description: 'Infra: Cloud Run steve-api health endpoint responde 200', check_type: 'api_exists', platform: 'infra', severity: 'critical' },
  { check_number: 82, description: 'Infra: Supabase connection pool < 80% utilización', check_type: 'performance', platform: 'infra', severity: 'high' },
  { check_number: 83, description: 'Infra: no hay errores 500 en últimos 30 min (chino_reports)', check_type: 'data_quality', platform: 'infra', severity: 'high' },
  { check_number: 84, description: 'Infra: cron jobs ejecutados en últimas 6 horas', check_type: 'data_quality', platform: 'infra', severity: 'medium' },
  { check_number: 85, description: 'Infra: storage buckets accesibles (avatars, assets, emails)', check_type: 'api_exists', platform: 'infra', severity: 'medium' },
  { check_number: 86, description: 'Infra: ANTHROPIC_API_KEY válida y con créditos', check_type: 'token_health', platform: 'infra', severity: 'critical' },
  { check_number: 87, description: 'Infra: Twilio WhatsApp credentials funcionando', check_type: 'token_health', platform: 'infra', severity: 'critical' },
  { check_number: 88, description: 'Infra: Resend API key válida para SteveMail', check_type: 'token_health', platform: 'infra', severity: 'high' },
  { check_number: 89, description: 'Infra: memory usage Cloud Run < 512MB', check_type: 'performance', platform: 'infra', severity: 'medium' },
  { check_number: 90, description: 'Infra: p95 latency de endpoints < 5s', check_type: 'performance', platform: 'infra', severity: 'high' },
  // Security
  { check_number: 91, description: 'Security: no hay tokens expirados en platform_connections', check_type: 'security', platform: 'security', severity: 'critical' },
  { check_number: 92, description: 'Security: RLS policies activas en todas las tablas con client_id', check_type: 'security', platform: 'security', severity: 'critical' },
  { check_number: 93, description: 'Security: no hay API keys en plain text en logs', check_type: 'security', platform: 'security', severity: 'critical' },
  { check_number: 94, description: 'Security: auth middleware presente en endpoints que lo requieren', check_type: 'security', platform: 'security', severity: 'high' },
  { check_number: 95, description: 'Security: webhook endpoints validan HMAC/signatures', check_type: 'security', platform: 'security', severity: 'high' },
  { check_number: 96, description: 'Security: X-Cron-Secret validado en todos los cron endpoints', check_type: 'security', platform: 'security', severity: 'high' },
  { check_number: 97, description: 'Security: no hay usuarios con role admin que no sean super_admin', check_type: 'security', platform: 'security', severity: 'medium' },
  { check_number: 98, description: 'Security: encrypted columns usan pgcrypto, no plain text', check_type: 'security', platform: 'security', severity: 'critical' },
  { check_number: 99, description: 'Security: CORS configurado correctamente (no wildcard en producción)', check_type: 'security', platform: 'security', severity: 'high' },
  { check_number: 100, description: 'Security: rate limiting activo en endpoints públicos', check_type: 'security', platform: 'security', severity: 'medium' },
];

// ─── Bloque 3: Checks 101-200 (generated by category) ──────────

function generateBloque3(): CheckDef[] {
  const checks: CheckDef[] = [];
  let n = 101;

  // 101-120: Security avanzada
  const securityChecks = [
    'SQL injection protection en parámetros de búsqueda',
    'XSS sanitization en campos de texto renderizados',
    'CSRF tokens presentes en formularios',
    'Session timeout configurado < 24h',
    'Password hashing usa bcrypt/argon2 (no md5/sha1)',
    'API responses no exponen stack traces en producción',
    'File upload valida tipo MIME real (no solo extensión)',
    'Redirect URLs validadas contra whitelist',
    'JWT expiration < 1 hora para access tokens',
    'Refresh tokens rotan en cada uso',
    'OAuth state parameter presente en todos los flujos',
    'Webhook retry no causa duplicación de datos',
    'Admin endpoints requieren role check adicional',
    'Supabase service key no expuesta en frontend',
    'Environment variables sensibles no en git',
    'HTTPS enforced en todos los endpoints',
    'Content-Security-Policy headers presentes',
    'No hay endpoints sin autenticación que modifiquen datos',
    'Backup automático de DB configurado',
    'Audit log registra cambios en datos sensibles',
  ];
  for (const desc of securityChecks) {
    checks.push({ check_number: n++, description: `Security: ${desc}`, check_type: 'security', platform: 'security', severity: n <= 108 ? 'critical' : 'high' });
  }

  // 121-140: Edge cases & datos fantasma
  const edgeCases = [
    'No hay merchants con 0 connections pero status activo',
    'No hay campañas Meta sin ad account asociado',
    'No hay emails programados con fecha en el pasado',
    'No hay flows con steps que referencian templates eliminados',
    'No hay descuentos Shopify expirados marcados como activos',
    'No hay wa_conversations sin client_id válido',
    'No hay chino_reports sin check_id válido (FK integrity)',
    'No hay tasks con status "in_progress" por más de 48h',
    'No hay duplicate check_numbers en chino_routine',
    'No hay platform_connections con access_token NULL y status connected',
    'No hay emails enviados sin from_address configurado',
    'No hay campañas Meta con budget 0 y status active',
    'No hay subscribers con email inválido (regex check)',
    'No hay productos Shopify con precio negativo',
    'No hay audiencias Meta con 0 miembros y status ready',
    'No hay knowledge entries con score < 0',
    'No hay wa_messages con body > 4096 chars (WhatsApp limit)',
    'No hay cron jobs ejecutándose simultáneamente (lock check)',
    'No hay reports con duration_ms > 60000 (timeout probable)',
    'No hay fixes en cola por más de 24h sin resolución',
  ];
  for (const desc of edgeCases) {
    checks.push({ check_number: n++, description: `Data: ${desc}`, check_type: 'data_quality', platform: 'all', severity: 'medium' });
  }

  // 141-160: Visual & UI
  const visualChecks = [
    'Dashboard principal carga en < 3s',
    'Gráficos de métricas renderizan sin error',
    'Tabla de campañas muestra datos reales (no placeholder)',
    'Modal de crear campaña abre y cierra correctamente',
    'Filtros de fecha funcionan y actualizan datos',
    'Responsive: portal funciona en mobile (320px)',
    'Dark mode no rompe contraste de texto',
    'Loading states presentes en todas las tablas',
    'Empty states con mensaje útil (no pantalla blanca)',
    'Paginación funciona en listas > 50 items',
    'Sidebar navigation funciona en todas las rutas',
    'Formularios muestran errores de validación inline',
    'Botones deshabilitados durante submit (no doble click)',
    'Toasts/notifications aparecen y desaparecen',
    'Imágenes de productos cargan con fallback',
    'Skeleton loaders presentes durante fetch',
    'Scroll infinito funciona en listas largas',
    'Copy buttons copian al clipboard correctamente',
    'Dropdown menus se cierran al hacer click fuera',
    'Modal overlay bloquea interacción con fondo',
  ];
  for (const desc of visualChecks) {
    checks.push({ check_number: n++, description: `Visual: ${desc}`, check_type: 'visual', platform: 'all', severity: 'medium' });
  }

  // 161-180: Chat tortura
  const chatTorture = [
    'Steve Chat responde coherentemente a "hola"',
    'Steve Chat no crashea con mensaje vacío',
    'Steve Chat maneja emoji-only messages',
    'Steve Chat maneja mensajes de 1000+ caracteres sin truncar respuesta',
    'Steve Chat no repite la misma respuesta en mensajes consecutivos',
    'Steve Chat mantiene contexto en conversación de 10+ mensajes',
    'Steve Chat responde en español chileno informal',
    'Steve Chat detecta idioma inglés y responde apropiadamente',
    'Steve Chat maneja pregunta sobre precios sin inventar datos',
    'Steve Chat sugiere reunión cuando detecta interés de compra',
    'Steve Chat no expone datos internos de otros merchants',
    'Steve Chat maneja "quiero cancelar" sin panic',
    'Steve Chat responde a audio transcription correctamente',
    'Steve Chat maneja imagen con vision y da feedback útil',
    'Steve Chat no genera URLs inventadas',
    'Steve Chat maneja rate limiting gracefully',
    'Steve Chat guarda historial completo en wa_messages',
    'Steve Chat detecta spam/bot y responde mínimo',
    'Steve Chat maneja números de teléfono sin crashear',
    'Steve Chat timeout < 30s para cualquier respuesta',
  ];
  for (const desc of chatTorture) {
    checks.push({ check_number: n++, description: `Chat: ${desc}`, check_type: 'functional', platform: 'steve_chat', severity: n <= 168 ? 'high' : 'medium' });
  }

  // 181-200: Rendimiento
  const perfChecks = [
    'API: /api/steve-chat p95 < 10s',
    'API: /api/fetch-shopify-products p95 < 5s',
    'API: /api/sync-meta-metrics p95 < 15s',
    'API: /api/generate-meta-copy p95 < 8s',
    'API: /api/manage-meta-campaign p95 < 5s',
    'API: /api/send-email p95 < 3s',
    'API: /api/generate-image p95 < 20s',
    'API: /api/steve-strategy p95 < 12s',
    'DB: query time promedio < 100ms',
    'DB: no hay queries > 5s en pg_stat_statements',
    'Supabase: realtime subscriptions activas < 100',
    'Cloud Run: cold start < 3s',
    'Cloud Run: instances activas < 10',
    'Cloud Run: request count / min < 1000',
    'Anthropic API: latency < 5s para llamadas simples',
    'Meta API: rate limit usage < 80%',
    'Shopify API: rate limit bucket > 20%',
    'Klaviyo API: rate limit no hitting 429',
    'WhatsApp: message delivery rate > 95%',
    'Overall: error rate < 2% en últimas 6 horas',
  ];
  for (const desc of perfChecks) {
    checks.push({ check_number: n++, description: `Perf: ${desc}`, check_type: 'performance', platform: 'infra', severity: n <= 190 ? 'high' : 'medium' });
  }

  return checks;
}

// ─── Bloque 4: Checks 201-400 ──────────────────────────────────

function generateBloque4(): CheckDef[] {
  const checks: CheckDef[] = [];
  let n = 201;

  // 201-230: Tipografía & consistencia visual
  const typoChecks = [
    'Fuentes cargan correctamente (no flash of unstyled text)',
    'Font size mínimo 12px en todo el portal',
    'Line height adecuado en bloques de texto (≥1.4)',
    'No hay texto cortado por overflow hidden sin tooltip',
    'Números formateados con separador de miles',
    'Fechas en formato chileno (dd/mm/yyyy)',
    'Moneda siempre muestra $ con separador de miles',
    'Porcentajes muestran máximo 1 decimal',
    'Labels de formularios consistentes (mayúscula inicial)',
    'Placeholders no repiten el label',
    'Error messages en español (no "undefined" o "null")',
    'Success messages confirmatorios y específicos',
    'Breadcrumbs presentes en páginas interiores',
    'Page titles actualizados por ruta',
    'Favicon presente y correcto',
    'Logo Steve renderiza sin distorsión',
    'Colores de estado consistentes (verde=ok, rojo=error, amarillo=warning)',
    'Icons SVG renderizan correctamente',
    'Tooltips no se cortan en bordes de pantalla',
    'Tablas con headers sticky en scroll',
    'Sorting indicators visibles en columnas ordenables',
    'Badge counts actualizados en real-time',
    'Animaciones suaves (no janky)',
    'Transiciones de página sin flash blanco',
    'Print stylesheet no rompe layout',
    'Zoom 200% no rompe layout principal',
    'Alto contraste cumple WCAG AA mínimo',
    'Focus indicators visibles en navegación por teclado',
    'Alt text en imágenes principales',
    'Aria labels en botones de solo ícono',
  ];
  for (const desc of typoChecks) {
    checks.push({ check_number: n++, description: `Visual: ${desc}`, check_type: 'visual', platform: 'all', severity: 'low' });
  }

  // 231-270: Empty states & micro-interacciones
  const emptyStates = [
    'Dashboard sin merchants muestra onboarding',
    'Lista de campañas vacía muestra CTA para crear',
    'Métricas sin datos muestra "Conecta tu tienda"',
    'Inbox WhatsApp vacío muestra mensaje amigable',
    'Knowledge base vacía muestra "Entrena a Steve"',
    'Reportes sin data muestra rango de fechas sugerido',
    'Competitor analysis sin competidores muestra búsqueda',
    'Flows de email vacíos muestra templates sugeridos',
    'Productos sin imágenes muestra placeholder',
    'Audiencias Meta vacías muestra cómo crear',
    'Historial de cambios vacío muestra "No hay actividad"',
    'Notificaciones vacías muestra "Todo al día"',
    'Pipeline de ventas vacío muestra "Busca prospectos"',
    'Calendario sin eventos muestra horarios disponibles',
    'Tasks vacías muestra "Nada pendiente"',
    'Email subscribers 0 muestra importar/conectar',
    'Shopify sin productos muestra conectar tienda',
    'Google Ads sin cuenta muestra configurar',
    'Steve strategy sin brief muestra crear brief',
    'Creative library vacía muestra generar contenido',
  ];
  for (const desc of emptyStates) {
    checks.push({ check_number: n++, description: `UX: ${desc}`, check_type: 'visual', platform: 'all', severity: 'low' });
  }

  // Micro-interactions 251-270
  const microInt = [
    'Hover effects en cards del dashboard',
    'Click feedback en todos los botones (ripple o scale)',
    'Pull-to-refresh en listas mobile',
    'Swipe gestures en inbox WhatsApp',
    'Drag and drop en email editor',
    'Auto-save en formularios largos',
    'Undo disponible después de borrar',
    'Confirmation dialog antes de acciones destructivas',
    'Progress bar en uploads',
    'Character count en campos con límite',
    'Auto-complete en búsqueda de productos',
    'Real-time preview en editor de emails',
    'Color picker funcional en brand settings',
    'Date picker con calendar visual',
    'Time picker para programar envíos',
    'Multi-select con chips visuales',
    'Inline editing en tablas',
    'Expand/collapse en accordions',
    'Tab navigation con keyboard',
    'Context menu con right-click',
  ];
  for (const desc of microInt) {
    checks.push({ check_number: n++, description: `UX: ${desc}`, check_type: 'visual', platform: 'all', severity: 'low' });
  }

  // 271-320: Email & SteveMail avanzado
  const emailChecks = [
    'Email: subject line no vacío en campañas enviadas',
    'Email: from_name configurado por merchant',
    'Email: reply-to apunta a dirección válida',
    'Email: unsubscribe header presente (CAN-SPAM)',
    'Email: List-Unsubscribe-Post header presente',
    'Email: contenido no tiene links rotos',
    'Email: imágenes tienen alt text',
    'Email: responsive en mobile (max-width: 600px)',
    'Email: preheader text configurado',
    'Email: merge tags reemplazados (no {{first_name}})',
    'Email: bounce handling actualiza subscriber status',
    'Email: complaint handling marca como unsubscribed',
    'Email: delivery rate > 95% en último envío',
    'Email: open rate tracking funciona (pixel loads)',
    'Email: click tracking funciona (redirect works)',
    'Email: AB test selecciona ganador correctamente',
    'Email: scheduled campaigns se envían a la hora correcta',
    'Email: flow delays respetan duración configurada',
    'Email: suppression list se respeta en envíos',
    'Email: duplicate emails no se envían al mismo subscriber',
    'Email: templates renderizados pasan litmus check',
    'Email: smart send time calcula basado en historial',
    'Email: revenue attribution trackea conversiones',
    'Email: signup forms capturan email correctamente',
    'Email: double opt-in envía confirmación',
    'Email: segmentation filters funcionan correctamente',
    'Email: list cleanup elimina bounces e inactivos',
    'Email: image upload comprime a < 200KB',
    'Email: universal blocks se renderizan en templates',
    'Email: winback flow se triggerea para inactivos > 60 días',
    'Email: birthday flow se triggerea en fecha correcta',
    'Email: browse abandonment trackea productos vistos',
    'Email: product alert notifica cuando hay stock',
    'Email: form widget carga en < 1s en Shopify',
    'Email: campaign analytics muestra datos reales',
    'Email: send queue procesa en orden FIFO',
    'Email: rate limiting respeta 14/s de SES',
    'Email: domain verification status actualizado',
    'Email: HTML sanitizado (no XSS en templates)',
    'Email: plain text version generada automáticamente',
    'Email: UTM parameters agregados a links',
    'Email: preview text no repite subject',
    'Email: mobile preview muestra layout correcto',
    'Email: dark mode compatible en templates',
    'Email: emoji en subject line renderiza correcto',
    'Email: bulk send no excede 50,000/día',
    'Email: subscriber import maneja CSV con headers variados',
    'Email: export subscribers genera CSV válido',
    'Email: campaign clone duplica todos los settings',
    'Email: draft auto-save cada 30 segundos',
  ];
  for (const desc of emailChecks) {
    checks.push({ check_number: n++, description: desc, check_type: 'functional', platform: 'stevemail', severity: n <= 280 ? 'high' : 'medium' });
  }

  // 321-360: Meta Ads funcional
  const metaChecks = [
    'Meta: create campaign endpoint funciona end-to-end',
    'Meta: audience creation con Klaviyo sync',
    'Meta: pixel events se registran correctamente',
    'Meta: ad preview genera imagen válida',
    'Meta: budget update respeta límites de cuenta',
    'Meta: campaign status changes (pause/resume) funcionan',
    'Meta: targeting search retorna resultados relevantes',
    'Meta: audience overlap detection funciona',
    'Meta: social inbox messages se cargan',
    'Meta: social inbox reply se envía correctamente',
    'Meta: ad account selection funciona con múltiples cuentas',
    'Meta: business hierarchy carga completa',
    'Meta: campaign metrics sync trae datos reales',
    'Meta: adset budget optimization respeta reglas',
    'Meta: creative rotation no repite mismos ads',
    'Meta: ROAS calculation es correcta (revenue/spend)',
    'Meta: CPA tracking coincide con dashboard Meta',
    'Meta: frequency cap se aplica correctamente',
    'Meta: audience exclusions funcionan',
    'Meta: catalog sync trae productos actualizados',
    'Meta: dynamic ads muestran producto correcto',
    'Meta: retargeting audience se actualiza diariamente',
    'Meta: lookalike audience se crea con source válido',
    'Meta: conversions API envía eventos correctamente',
    'Meta: data deletion callback funciona',
    'Meta: OAuth refresh token renueva automáticamente',
    'Meta: scopes check detecta permisos faltantes',
    'Meta: rate limiting maneja 429 con retry',
    'Meta: batch operations funcionan para múltiples adsets',
    'Meta: campaign recommendations son relevantes',
    'Meta: copy generator usa contexto de marca',
    'Meta: A/B test setup funciona correctamente',
    'Meta: rules engine ejecuta acciones programadas',
    'Meta: performance tracker graba métricas cada 48h',
    'Meta: fatigue detector identifica ads cansados',
    'Meta: adset action (duplicate/pause/scale) funciona',
    'Meta: budget allocation across adsets es proporcional',
    'Meta: creatives library muestra todos los formatos',
    'Meta: carousel ads renderizan correctamente',
    'Meta: video ads upload y processing funciona',
  ];
  for (const desc of metaChecks) {
    checks.push({ check_number: n++, description: desc, check_type: 'functional', platform: 'meta', severity: n <= 335 ? 'high' : 'medium' });
  }

  // 361-380: Onboarding & consistencia
  const onboarding = [
    'Onboarding: self-signup crea usuario + client correctamente',
    'Onboarding: email de bienvenida se envía',
    'Onboarding: WhatsApp de bienvenida se envía',
    'Onboarding: wizard de conexión de tienda funciona',
    'Onboarding: primer sync de datos se triggerea automático',
    'Onboarding: dashboard muestra progreso de setup',
    'Onboarding: help tooltips presentes en primer uso',
    'Onboarding: demo data disponible para pruebas',
    'Onboarding: trial period tracking funciona',
    'Onboarding: upsell triggers se configuran post-trial',
  ];
  for (const desc of onboarding) {
    checks.push({ check_number: n++, description: desc, check_type: 'functional', platform: 'all', severity: 'medium' });
  }

  // 371-390: Webhooks & integraciones
  const webhooks = [
    'Webhook: Shopify order/create se procesa correctamente',
    'Webhook: Shopify product/update actualiza datos',
    'Webhook: Shopify fulfillment events se registran',
    'Webhook: Shopify checkout webhook triggerea abandoned cart',
    'Webhook: Twilio status callback actualiza wa_messages',
    'Webhook: SES bounce notification marca subscriber',
    'Webhook: SES complaint notification marca subscriber',
    'Webhook: Meta data deletion procesa request',
    'Webhook: Shopify GDPR webhooks responden correctamente',
    'Webhook: email flow webhooks triggerean steps',
    'Webhook: retry logic maneja failures correctamente',
    'Webhook: idempotency previene procesamiento doble',
    'Webhook: signature validation presente en todos',
    'Webhook: timeout handling no pierde eventos',
    'Webhook: dead letter queue para webhooks fallidos',
    'Webhook: logging completo para debugging',
    'Webhook: order amounts reconcilian con Shopify',
    'Webhook: customer data sync bidireccional',
    'Webhook: inventory updates reflejados en tiempo real',
    'Webhook: discount usage tracking funciona',
  ];
  for (const desc of webhooks) {
    checks.push({ check_number: n++, description: desc, check_type: 'functional', platform: 'all', severity: n <= 385 ? 'high' : 'medium' });
  }

  // 391-400: IA quality
  const iaChecks = [
    'IA: generate-meta-copy produce copy relevante al producto',
    'IA: steve-strategy da recomendaciones basadas en data',
    'IA: analyze-brand extrae colores y tono correctamente',
    'IA: generate-image produce imagen usable',
    'IA: steve-email-content genera HTML válido',
    'IA: criterio-meta evalúa campañas con criterios reales',
    'IA: criterio-email evalúa emails con estándares de industria',
    'IA: espejo compara visual con referencia correctamente',
    'IA: angle-detector identifica ángulos de copy distintos',
    'IA: creative-context enriquece prompts con historial',
  ];
  for (const desc of iaChecks) {
    checks.push({ check_number: n++, description: desc, check_type: 'functional', platform: 'brief', severity: 'medium' });
  }

  return checks;
}

// ─── Bloque 5: Checks 401-600 (Meta & Klaviyo diamante) ────────

function generateBloque5(): CheckDef[] {
  const checks: CheckDef[] = [];
  let n = 401;

  // 401-500: Meta Ads diamante
  const metaDiamante = [
    'Meta API: campaign list retorna datos reales vs Steve DB',
    'Meta API: adset metrics coinciden con API',
    'Meta API: ad creative content matches stored version',
    'Meta API: spend total coincide con facturación',
    'Meta API: impressions count es consistente',
    'Meta API: clicks count es consistente',
    'Meta API: conversions count es consistente',
    'Meta API: CPC calculado correctamente',
    'Meta API: CPM calculado correctamente',
    'Meta API: CTR calculado correctamente',
    'Meta API: ROAS calculado correctamente',
    'Meta API: frequency no excede cap configurado',
    'Meta API: reach es consistente con impresiones',
    'Meta API: audience size matches configuración',
    'Meta API: budget daily matches configuración',
    'Meta API: budget lifetime matches configuración',
    'Meta API: bid strategy matches configuración',
    'Meta API: placement matches configuración',
    'Meta API: schedule matches configuración',
    'Meta API: creative link matches landing page',
    'Meta API: pixel fires correctamente en landing',
    'Meta API: custom conversion tracks correctly',
    'Meta API: attribution window matches configuración',
    'Meta API: campaign objective matches configuración',
    'Meta API: adset status matches expected state',
    'Meta API: ad status matches expected state',
    'Meta API: age breakdown data disponible',
    'Meta API: gender breakdown data disponible',
    'Meta API: placement breakdown data disponible',
    'Meta API: device breakdown data disponible',
    'Meta API: country breakdown data disponible',
    'Meta API: hourly breakdown data disponible',
    'Meta API: video metrics (views, completions) disponibles',
    'Meta API: engagement metrics (likes, comments, shares)',
    'Meta API: lead gen forms data sincronizada',
    'Meta API: dynamic product ads catalog synced',
    'Meta API: retargeting audience updated < 24h',
    'Meta API: conversion API events deduplicated',
    'Meta API: ad account spend limit checked',
    'Meta API: business verification status checked',
    'Meta: campaign duplication preserves all settings',
    'Meta: campaign archiving removes from active list',
    'Meta: budget pacing on track (not overspending)',
    'Meta: campaign naming convention enforced',
    'Meta: UTM parameters in all ad links',
    'Meta: landing page loads < 3s',
    'Meta: creative refresh recommended after 2 weeks',
    'Meta: audience refresh recommended after 30 days',
    'Meta: minimum audience size check (>1000)',
    'Meta: maximum overlap between audiences < 30%',
  ];
  for (let i = 0; i < metaDiamante.length && n <= 450; i++) {
    checks.push({ check_number: n++, description: metaDiamante[i], check_type: i < 20 ? 'api_compare' : 'data_quality', platform: 'meta', severity: i < 15 ? 'high' : 'medium' });
  }

  // 451-500: More Meta rules & campaign health
  const metaRules = [
    'Meta Rule: pause ad if CPA > 2x target',
    'Meta Rule: scale adset if ROAS > 3x',
    'Meta Rule: alert if spend > budget by 10%',
    'Meta Rule: alert if frequency > 3 in 7 days',
    'Meta Rule: pause creative if CTR < 0.5%',
    'Meta Rule: duplicate winning adset to new audience',
    'Meta Rule: reduce budget if ROAS < 1.5x',
    'Meta Rule: alert if no conversions in 48h',
    'Meta Rule: pause campaign if rejected by Meta',
    'Meta Rule: alert on sudden CPC spike (>50%)',
    'Meta Rule: alert on sudden CTR drop (>30%)',
    'Meta Rule: alert if daily spend < 50% budget',
    'Meta Rule: alert if mobile vs desktop CPA diff > 40%',
    'Meta Rule: alert if audience saturation > 80%',
    'Meta Rule: weekly performance vs benchmark comparison',
    'Meta Rule: creative fatigue score > 7 triggers alert',
    'Meta Rule: competitor ad detection triggers notification',
    'Meta Rule: new audience suggestion based on converters',
    'Meta Rule: budget reallocation suggestion weekly',
    'Meta Rule: creative testing cadence (min 2 new/week)',
    'Meta Reconciliation: spend totals match billing',
    'Meta Reconciliation: conversion count matches pixel',
    'Meta Reconciliation: audience sizes match API',
    'Meta Reconciliation: ad status matches campaign status',
    'Meta Reconciliation: budget allocation matches strategy',
    'Meta Reconciliation: scheduling matches time zones',
    'Meta Reconciliation: creative assets all accessible',
    'Meta Reconciliation: tracking URLs all resolve',
    'Meta Reconciliation: exclusion audiences applied',
    'Meta Reconciliation: frequency caps per ad set applied',
    'Meta Health: no campaigns without active ads',
    'Meta Health: no adsets without active ads',
    'Meta Health: no campaigns in learning phase > 7 days',
    'Meta Health: all campaigns have conversion tracking',
    'Meta Health: all ads have valid creative',
    'Meta Health: no campaigns with conflicting objectives',
    'Meta Health: no overlapping schedules on same audience',
    'Meta Health: all pages have pixel installed',
    'Meta Health: conversion API setup verified',
    'Meta Health: business manager access roles correct',
    'Meta Health: ad account currency matches merchant',
    'Meta Health: timezone matches merchant locale',
    'Meta Health: automated rules not conflicting',
    'Meta Health: campaign budget optimization working',
    'Meta Health: A/B tests have sufficient sample size',
    'Meta Health: all active campaigns have budget',
    'Meta Health: no draft campaigns older than 7 days',
    'Meta Health: creative library organized by date',
    'Meta Health: all ads comply with Meta policies',
    'Meta Health: no flagged ads in review > 48h',
  ];
  for (let i = 0; i < metaRules.length && n <= 500; i++) {
    checks.push({ check_number: n++, description: metaRules[i], check_type: i < 20 ? 'functional' : 'data_quality', platform: 'meta', severity: i < 10 ? 'high' : 'medium' });
  }

  // 501-600: Klaviyo diamante
  const klaviyoDiamante: string[] = [
    'Klaviyo API: list count matches Steve DB',
    'Klaviyo API: profile count matches Steve DB',
    'Klaviyo API: flow count matches Steve DB',
    'Klaviyo API: campaign count matches Steve DB',
    'Klaviyo API: segment count matches Steve DB',
    'Klaviyo API: template count matches Steve DB',
    'Klaviyo API: metric totals match Steve DB',
    'Klaviyo API: revenue attribution matches Shopify',
    'Klaviyo API: open rates consistent with dashboard',
    'Klaviyo API: click rates consistent with dashboard',
    'Klaviyo API: bounce rates consistent with dashboard',
    'Klaviyo API: unsubscribe rates consistent with dashboard',
    'Klaviyo API: flow email performance data available',
    'Klaviyo API: campaign send count matches expected',
    'Klaviyo API: list growth rate positive',
    'Klaviyo Flow: Welcome Series has 3+ emails',
    'Klaviyo Flow: Abandoned Cart triggers < 1h',
    'Klaviyo Flow: Post-Purchase sends after 3 days',
    'Klaviyo Flow: Winback triggers after 60 days',
    'Klaviyo Flow: Browse Abandonment triggers < 4h',
    'Klaviyo Flow: Birthday sends on correct date',
    'Klaviyo Flow: Sunset triggers after 90 days inactivity',
    'Klaviyo Flow: VIP detection based on purchase history',
    'Klaviyo Flow: Price drop notification works',
    'Klaviyo Flow: Back in stock notification works',
    'Klaviyo Flow: all flows have proper filters',
    'Klaviyo Flow: no flows with broken conditions',
    'Klaviyo Flow: all emails have valid sender',
    'Klaviyo Flow: all emails have unsubscribe link',
    'Klaviyo Flow: all delays are reasonable (1h-30d)',
    'Klaviyo Segment: purchasers segment auto-updates',
    'Klaviyo Segment: engaged subscribers segment updates',
    'Klaviyo Segment: VIP segment based on LTV',
    'Klaviyo Segment: at-risk segment based on recency',
    'Klaviyo Segment: no empty segments marked active',
    'Klaviyo Campaign: A/B test samples are 15%+',
    'Klaviyo Campaign: send time optimization enabled',
    'Klaviyo Campaign: smart send enabled (no duplicates)',
    'Klaviyo Campaign: suppression list applied',
    'Klaviyo Campaign: UTM parameters configured',
    'Klaviyo Template: all templates render correctly',
    'Klaviyo Template: dynamic content blocks work',
    'Klaviyo Template: product recommendation blocks work',
    'Klaviyo Template: countdown timers render correctly',
    'Klaviyo Template: all images load',
    'Klaviyo Integration: Shopify sync active',
    'Klaviyo Integration: order data flowing',
    'Klaviyo Integration: product catalog synced',
    'Klaviyo Integration: customer profiles complete',
    'Klaviyo Integration: website tracking active',
    'Klaviyo Metrics: revenue per email calculated',
    'Klaviyo Metrics: list growth rate tracked',
    'Klaviyo Metrics: churn rate tracked',
    'Klaviyo Metrics: CLV by segment tracked',
    'Klaviyo Metrics: flow performance benchmarked',
    'Klaviyo Deliverability: DKIM configured',
    'Klaviyo Deliverability: SPF configured',
    'Klaviyo Deliverability: DMARC configured',
    'Klaviyo Deliverability: dedicated IP reputation > 90',
    'Klaviyo Deliverability: spam complaint rate < 0.1%',
    'Klaviyo Reconciliation: subscriber count Steve vs Klaviyo',
    'Klaviyo Reconciliation: campaign metrics Steve vs Klaviyo',
    'Klaviyo Reconciliation: revenue attribution Steve vs Klaviyo',
    'Klaviyo Reconciliation: flow trigger counts match',
    'Klaviyo Reconciliation: suppression lists match',
    'Klaviyo Health: API key not expired',
    'Klaviyo Health: webhook endpoint reachable',
    'Klaviyo Health: no failed campaign sends in 24h',
    'Klaviyo Health: no stuck flows (pending > 1h)',
    'Klaviyo Health: profile sync < 6h old',
    'Klaviyo Health: no duplicate profiles',
    'Klaviyo Health: all flows have at least 1 active email',
    'Klaviyo Health: campaign schedule not in past',
    'Klaviyo Health: list hygiene score > 80',
    'Klaviyo Health: engagement scoring working',
    'Klaviyo Health: consent tracking compliant',
    'Klaviyo Health: GDPR data deletion working',
    'Klaviyo Health: no campaigns targeting entire list (needs segment)',
    'Klaviyo Health: test sends working',
    'Klaviyo Health: preview renders correctly',
    'Klaviyo Health: all forms have CAPTCHA',
    'Klaviyo Health: no broken form embeds',
    'Klaviyo Health: all integrations status=connected',
    'Klaviyo Health: metric definitions not stale',
    'Klaviyo Health: custom properties synced from Shopify',
    'Klaviyo Health: event tracking complete (placed order, viewed product)',
    'Klaviyo Health: attribution model matches merchant preference',
    'Klaviyo Health: reporting timezone correct',
    'Klaviyo Health: no zombie subscribers (bounced but active)',
    'Klaviyo Health: re-engagement campaign exists',
    'Klaviyo Health: preference center configured',
    'Klaviyo Health: compliance footer in all emails',
    'Klaviyo Health: dynamic coupon codes working',
    'Klaviyo Health: review request flow configured',
    'Klaviyo Health: cross-sell recommendations working',
    'Klaviyo Health: SMS consent properly tracked',
    'Klaviyo Health: multi-channel (email+SMS) orchestration',
    'Klaviyo Health: all API calls under rate limit',
    'Klaviyo Health: webhook retries configured',
  ];
  for (let i = 0; i < klaviyoDiamante.length && n <= 600; i++) {
    checks.push({
      check_number: n++,
      description: klaviyoDiamante[i],
      check_type: i < 15 ? 'api_compare' : (i < 65 ? 'functional' : 'data_quality'),
      platform: 'klaviyo',
      severity: i < 20 ? 'high' : 'medium',
    });
  }

  return checks;
}

// ─── Bloque 6: Checks 601-800 (Shopify, cross-integration, SteveMail avanzado) ─

function generateBloque6(): CheckDef[] {
  const checks: CheckDef[] = [];
  let n = 601;

  // 601-670: Shopify diamante
  const shopifyChecks = [
    'Shopify API: product count matches Steve DB',
    'Shopify API: order count (30d) matches Steve DB',
    'Shopify API: collection count matches Steve DB',
    'Shopify API: discount count matches Steve DB',
    'Shopify API: customer count matches Steve DB',
    'Shopify API: inventory levels consistent',
    'Shopify API: variant prices match Steve DB',
    'Shopify API: product images accessible',
    'Shopify API: fulfillment status matches Steve DB',
    'Shopify API: refund amounts match Steve DB',
    'Shopify: product sync < 6h old',
    'Shopify: order sync < 1h old',
    'Shopify: webhook registration valid',
    'Shopify: access token not expired',
    'Shopify: API version not deprecated',
    'Shopify: rate limit bucket > 20%',
    'Shopify: store URL resolves correctly',
    'Shopify: checkout webhook fires on purchase',
    'Shopify: abandoned cart detection < 1h',
    'Shopify: discount codes validate correctly',
    'Shopify: collection assignments correct',
    'Shopify: product descriptions not empty',
    'Shopify: product SEO titles configured',
    'Shopify: product images alt text present',
    'Shopify: variant options consistent',
    'Shopify: inventory tracking enabled',
    'Shopify: shipping zones configured',
    'Shopify: tax settings correct for Chile',
    'Shopify: payment gateway active',
    'Shopify: store analytics accessible',
    'Shopify: cross-sell recommendations accurate',
    'Shopify: collection revenue calculation correct',
    'Shopify: combo/bundle creation works',
    'Shopify: product description AI generation works',
    'Shopify: product update propagates to Steve DB',
    'Shopify: customer data syncs bidirectionally',
    'Shopify: order notes sync to Steve',
    'Shopify: gift cards tracked correctly',
    'Shopify: multi-currency support working',
    'Shopify: draft orders handled correctly',
    'Shopify: GDPR data export works',
    'Shopify: GDPR data deletion works',
    'Shopify: customer redact works',
    'Shopify: shop redact works',
    'Shopify: session token validation works',
    'Shopify: OAuth install flow works end-to-end',
    'Shopify: OAuth callback processes correctly',
    'Shopify: store credentials encrypted in DB',
    'Shopify: webhook HMAC validation enforced',
    'Shopify: fulfillment webhooks process correctly',
    'Shopify: product sync handles pagination',
    'Shopify: order sync handles pagination',
    'Shopify: bulk operations complete < 30min',
    'Shopify: metafields synced if configured',
    'Shopify: smart collections rules evaluated correctly',
    'Shopify: product tags used for categorization',
    'Shopify: inventory alerts at low stock (< 5 units)',
    'Shopify: bestseller ranking updated daily',
    'Shopify: conversion rate tracked by product',
    'Shopify: AOV tracked by collection',
    'Shopify: customer LTV calculated correctly',
    'Shopify: repeat purchase rate tracked',
    'Shopify: cart abandonment rate tracked',
    'Shopify: product velocity score calculated',
    'Shopify: seasonal trends identified',
    'Shopify: price change history tracked',
    'Shopify: out of stock alerts triggered',
    'Shopify: new product notification sent',
    'Shopify: revenue by channel tracked',
  ];
  for (let i = 0; i < shopifyChecks.length && n <= 670; i++) {
    checks.push({
      check_number: n++,
      description: shopifyChecks[i],
      check_type: i < 10 ? 'api_compare' : (i < 30 ? 'functional' : 'data_quality'),
      platform: 'shopify',
      severity: i < 15 ? 'high' : 'medium',
    });
  }

  // 671-730: Cross-integration
  const crossChecks = [
    'Cross: Shopify orders sync to Klaviyo profiles',
    'Cross: Klaviyo segments sync to Meta audiences',
    'Cross: Meta conversions match Shopify orders',
    'Cross: Email revenue attribution matches Shopify',
    'Cross: SteveMail subscribers match Shopify customers',
    'Cross: WhatsApp abandoned cart matches Shopify checkout',
    'Cross: Product recommendations match Shopify inventory',
    'Cross: Campaign performance aggregated across channels',
    'Cross: Customer journey tracked across touchpoints',
    'Cross: Revenue attributed to correct channel',
    'Cross: ROAS calculated including all channels',
    'Cross: LTV includes email + ads + organic revenue',
    'Cross: Churn prediction uses multi-channel signals',
    'Cross: Anomaly detection compares across platforms',
    'Cross: Weekly report includes all channel data',
    'Cross: Dashboard shows unified metrics',
    'Cross: Audience overlap between Klaviyo and Meta < 50%',
    'Cross: Product feed consistent across platforms',
    'Cross: Pricing consistent across channels',
    'Cross: Discount codes work across channels',
    'Cross: Customer profile merged across platforms',
    'Cross: Communication frequency capped across channels',
    'Cross: Opt-out respected across all channels',
    'Cross: Brand voice consistent across AI outputs',
    'Cross: Creative assets reused efficiently',
    'Cross: Budget allocation optimized across channels',
    'Cross: Performance benchmarks cross-channel',
    'Cross: Alert thresholds consistent across platforms',
    'Cross: Timezone handling consistent across syncs',
    'Cross: Currency conversion correct across platforms',
    'Cross: Data freshness < 6h across all platforms',
    'Cross: Error handling consistent across integrations',
    'Cross: Retry logic consistent across API calls',
    'Cross: Rate limiting handled across all platforms',
    'Cross: Auth token refresh handled across all platforms',
    'Cross: Webhook processing order correct',
    'Cross: Data deduplication across sources',
    'Cross: Conflict resolution for overlapping data',
    'Cross: Audit trail across all modifications',
    'Cross: Rollback capability for failed syncs',
    'Cross: Sync status dashboard accurate',
    'Cross: Integration health check covers all',
    'Cross: no orphaned data after disconnection',
    'Cross: reconnection restores full sync',
    'Cross: historical data preserved on reconnect',
    'Cross: multi-merchant isolation verified',
    'Cross: super admin can see all merchants',
    'Cross: merchant cannot see other merchant data',
    'Cross: shared resources (templates) properly scoped',
    'Cross: system templates available to all merchants',
    'Cross: notification preferences respected per merchant',
    'Cross: branding customization per merchant',
    'Cross: reporting period aligned across platforms',
    'Cross: export data includes all platforms',
    'Cross: import data validates across platforms',
    'Cross: API version compatibility across integrations',
    'Cross: deprecation warnings tracked',
    'Cross: migration path documented for API changes',
    'Cross: backward compatibility maintained',
    'Cross: feature flags consistent across platforms',
  ];
  for (let i = 0; i < crossChecks.length && n <= 730; i++) {
    checks.push({
      check_number: n++,
      description: crossChecks[i],
      check_type: i < 15 ? 'api_compare' : 'data_quality',
      platform: 'all',
      severity: i < 10 ? 'high' : 'medium',
    });
  }

  // 731-800: SteveMail avanzado + scraping + brief
  const advancedChecks = [
    'SteveMail: email heatmap tracking captures clicks by section',
    'SteveMail: unsubscribe reasons tracked and categorized',
    'SteveMail: re-engagement series triggers correctly',
    'SteveMail: suppression list shared with Klaviyo',
    'SteveMail: email rendering across 10+ email clients',
    'SteveMail: GrapeJS editor saves HTML correctly',
    'SteveMail: drag-drop blocks maintain order',
    'SteveMail: image library manages assets per merchant',
    'SteveMail: merge tag validation before send',
    'SteveMail: email size < 100KB after optimization',
    'SteveMail: preheader customizable per campaign',
    'SteveMail: RSS-to-email feeds working',
    'SteveMail: transactional emails separated from marketing',
    'SteveMail: compliance with CAN-SPAM fully met',
    'SteveMail: compliance with GDPR data rights',
    'SteveMail: subscriber lifecycle stages tracked',
    'SteveMail: engagement scoring drives segmentation',
    'SteveMail: predictive send time improves open rates',
    'SteveMail: content personalization based on purchase history',
    'SteveMail: multivariate testing beyond A/B (up to 4 variants)',
    'Scraping: competitor ad library fetches correctly',
    'Scraping: web scraper respects robots.txt',
    'Scraping: scraper handles rate limiting',
    'Scraping: scraped content sanitized before storage',
    'Scraping: Apify integration delivers results',
    'Scraping: competitor data refreshes weekly',
    'Scraping: no duplicate competitor entries',
    'Scraping: competitor brand analysis generates insights',
    'Scraping: industry benchmark data available',
    'Scraping: content hunter finds relevant sources',
    'Brief: brand analysis produces actionable output',
    'Brief: copy generation uses brand voice',
    'Brief: campaign brief includes all required fields',
    'Brief: visual brief includes mood board references',
    'Brief: strategy recommendations data-backed',
    'Brief: competitive analysis in briefs accurate',
    'Brief: target audience definition matches segments',
    'Brief: channel mix recommendation makes sense',
    'Brief: budget allocation in brief is realistic',
    'Brief: timeline in brief is achievable',
    'Brief: KPI targets in brief based on historical data',
    'Brief: copy variants cover different angles',
    'Brief: headline variants are distinct (not repetitive)',
    'Brief: CTA suggestions are varied and testable',
    'Brief: image prompts produce usable AI images',
    'Brief: video script follows brand guidelines',
    'Brief: email content follows best practices',
    'Brief: social media copy fits platform limits',
    'Brief: Google Ads copy fits character limits',
    'Brief: Meta copy includes required disclaimers',
    'Infra: Cloud Run autoscaling responds to load',
    'Infra: Cloud Run min instances configured for cold start',
    'Infra: Cloud Scheduler jobs all healthy',
    'Infra: Sentry captures errors correctly',
    'Infra: log level appropriate (no debug in prod)',
    'Infra: secret management via env vars (not hardcoded)',
    'Infra: CI/CD pipeline passes before deploy',
    'Infra: smoke tests pass after deploy',
    'Infra: rollback mechanism available',
    'Infra: monitoring dashboard shows key metrics',
    'Infra: alerting configured for error spikes',
    'Infra: backup restoration tested',
    'Infra: disaster recovery plan documented',
    'Infra: SSL certificates not expiring < 30 days',
    'Infra: DNS records correct for all domains',
    'Infra: CDN configured for static assets',
    'Infra: image optimization pipeline working',
    'Infra: database migrations applied cleanly',
    'Infra: no pending migrations in queue',
    'Infra: database size monitored (< 10GB)',
  ];
  for (let i = 0; i < advancedChecks.length && n <= 800; i++) {
    const platform = i < 20 ? 'stevemail' : (i < 30 ? 'scraping' : (i < 50 ? 'brief' : 'infra'));
    checks.push({
      check_number: n++,
      description: advancedChecks[i],
      check_type: i < 20 ? 'functional' : (i < 30 ? 'functional' : (i < 50 ? 'functional' : 'data_quality')),
      platform,
      severity: 'medium',
    });
  }

  return checks;
}

// ─── Main seed function ─────────────────────────────────────────

export async function seedChinoChecks(): Promise<{ inserted: number; skipped: number; total: number }> {
  const supabase = getSupabaseAdmin();

  const allChecks: CheckDef[] = [
    ...bloque2,
    ...generateBloque3(),
    ...generateBloque4(),
    ...generateBloque5(),
    ...generateBloque6(),
  ];

  let inserted = 0;
  let skipped = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < allChecks.length; i += BATCH_SIZE) {
    const batch = allChecks.slice(i, i + BATCH_SIZE).map((c) => ({
      check_number: c.check_number,
      description: c.description,
      check_type: c.check_type,
      platform: c.platform,
      severity: c.severity,
      check_config: c.check_config || {},
      is_active: true,
      consecutive_fails: 0,
      added_by: 'seed',
    }));

    const { data, error } = await supabase
      .from('chino_routine')
      .upsert(batch, { onConflict: 'check_number', ignoreDuplicates: true })
      .select('check_number');

    if (error) {
      console.error(`[chino-seed] Batch error at ${i}:`, error.message);
      skipped += batch.length;
    } else {
      inserted += data?.length || 0;
      skipped += batch.length - (data?.length || 0);
    }
  }

  console.log(`[chino-seed] Done: ${inserted} inserted, ${skipped} skipped, ${allChecks.length} total`);
  return { inserted, skipped, total: allChecks.length };
}
