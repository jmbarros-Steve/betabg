// FlowTemplates — 10 automated email flow templates for Klaviyo

export type FlowCategory = 'revenue' | 'engagement' | 'retention' | 'lifecycle';
export type FlowPriority = 'critical' | 'high' | 'medium';
export type ProductStrategy = 'cart_items' | 'most_viewed' | 'best_sellers' | 'none';
export type DiscountType = 'percentage' | 'fixed_amount' | 'free_shipping';

export interface FlowEmail {
  subject: string;
  previewText: string;
  delayHours: number;
  description: string;
  purpose: string;
}

export interface FlowTemplate {
  id: string;
  name: string;
  nameEs: string;
  description: string;
  icon: string;
  category: FlowCategory;
  priority: FlowPriority;
  triggerDescription: string;
  emails: FlowEmail[];
  bestPractices: string[];
  expectedImpact: string;
  productStrategy: ProductStrategy;
  discountEmail: number | null; // index of email that carries coupon (2 = 3rd email)
  defaultDiscountType: DiscountType | null;
  defaultDiscountValue: number;
}

export const FLOW_TEMPLATES: FlowTemplate[] = [
  // 1. Welcome Series (critical, lifecycle)
  {
    id: 'welcome_series',
    name: 'Welcome Series',
    nameEs: 'Serie de Bienvenida',
    description: 'Convierte suscriptores nuevos en clientes con una secuencia de 4 emails que presenta tu marca, genera confianza y motiva la primera compra.',
    icon: 'HandHeart',
    category: 'lifecycle',
    priority: 'critical',
    triggerDescription: 'Se activa cuando un nuevo suscriptor se une a tu lista principal.',
    emails: [
      {
        subject: 'Bienvenido/a a nuestra familia',
        previewText: 'Tu descuento exclusivo te espera dentro',
        delayHours: 0,
        description: 'Email de bienvenida inmediato con descuento de primera compra y presentacion de la marca.',
        purpose: 'Generar primera impresion positiva y motivar compra inmediata con descuento.',
      },
      {
        subject: 'Conoce nuestra historia',
        previewText: 'Esto es lo que nos hace diferentes',
        delayHours: 48,
        description: 'Cuenta la historia de la marca, valores y mision para crear conexion emocional.',
        purpose: 'Construir confianza y conexion emocional con la marca.',
      },
      {
        subject: 'Lo que mas eligen nuestros clientes',
        previewText: 'Productos favoritos con resenas reales',
        delayHours: 96,
        description: 'Muestra los productos mas vendidos con resenas y prueba social.',
        purpose: 'Reducir friccion mostrando lo que otros ya compraron y aprobaron.',
      },
      {
        subject: 'Una sorpresa solo para ti',
        previewText: 'Oferta exclusiva por tiempo limitado',
        delayHours: 168,
        description: 'Oferta exclusiva de cierre para quienes aun no han comprado.',
        purpose: 'Ultima oportunidad para convertir al suscriptor en cliente.',
      },
    ],
    bestPractices: [
      'Envia el primer email de forma inmediata para aprovechar el interes inicial.',
      'Incluye un descuento claro en el primer email (10-15% funciona bien).',
      'Usa fotos reales de clientes o del equipo en el email de historia.',
      'Segmenta: si compran despues del email 1, salta al post-purchase.',
    ],
    expectedImpact: 'Tasa de conversion de suscriptor a cliente del 8-12%. Revenue incremental del 15-20% en nuevos suscriptores.',
    productStrategy: 'most_viewed',
    discountEmail: 2,
    defaultDiscountType: 'percentage',
    defaultDiscountValue: 10,
  },

  // 2. Abandoned Cart (critical, revenue)
  {
    id: 'abandoned_cart',
    name: 'Abandoned Cart',
    nameEs: 'Carrito Abandonado',
    description: 'Recupera ventas perdidas con 3 emails estrategicos que recuerdan, generan urgencia y ofrecen un incentivo final.',
    icon: 'ShoppingCart',
    category: 'revenue',
    priority: 'critical',
    triggerDescription: 'Se activa cuando un cliente agrega productos al carrito pero no completa la compra.',
    emails: [
      {
        subject: 'Dejaste algo en tu carrito',
        previewText: 'Tus productos te estan esperando',
        delayHours: 1,
        description: 'Recordatorio suave con imagen de los productos abandonados y enlace directo al carrito.',
        purpose: 'Recordar sin presionar. Muchos abandonos son por distraccion.',
      },
      {
        subject: 'Tu carrito se esta agotando',
        previewText: 'Otros clientes estan viendo lo mismo',
        delayHours: 24,
        description: 'Email con urgencia y prueba social. Muestra cuantas personas estan viendo el mismo producto.',
        purpose: 'Crear urgencia real y aprovechar FOMO para motivar la compra.',
      },
      {
        subject: 'Ultima oportunidad + envio gratis',
        previewText: 'Te guardamos un beneficio especial',
        delayHours: 72,
        description: 'Oferta final con descuento o envio gratis para cerrar la venta.',
        purpose: 'Incentivo final para los mas indecisos. Ultimo intento de recuperacion.',
      },
    ],
    bestPractices: [
      'Muestra imagenes reales de los productos abandonados en cada email.',
      'No ofrezcas descuento en el primer email, reservalo para el tercero.',
      'Incluye un boton directo al carrito, no a la tienda general.',
      'Agrega resenas del producto abandonado para generar confianza.',
    ],
    expectedImpact: 'Recuperacion del 5-15% de carritos abandonados. ROI promedio de 30x sobre el costo del flujo.',
    productStrategy: 'cart_items',
    discountEmail: 2,
    defaultDiscountType: 'free_shipping',
    defaultDiscountValue: 0,
  },

  // 3. Post Purchase (high, retention)
  {
    id: 'post_purchase',
    name: 'Post Purchase',
    nameEs: 'Post Compra',
    description: 'Fideliza clientes despues de su compra con agradecimiento, solicitud de resena y recomendaciones cruzadas.',
    icon: 'PackageCheck',
    category: 'retention',
    priority: 'high',
    triggerDescription: 'Se activa cuando un cliente completa una compra exitosamente.',
    emails: [
      {
        subject: 'Gracias por tu compra',
        previewText: 'Tips para sacar el maximo provecho',
        delayHours: 72,
        description: 'Agradecimiento sincero con tips de uso, cuidado o aprovechamiento del producto.',
        purpose: 'Reducir arrepentimiento post-compra y fortalecer la relacion.',
      },
      {
        subject: 'Tu opinion nos importa mucho',
        previewText: 'Cuentanos como te fue con tu compra',
        delayHours: 336,
        description: 'Solicitud de resena con enlace directo. Incentivo opcional por dejar review.',
        purpose: 'Generar prueba social y feedback valioso para la marca.',
      },
      {
        subject: 'Pensamos que esto te encantara',
        previewText: 'Seleccion especial basada en tu compra',
        delayHours: 720,
        description: 'Recomendaciones de productos complementarios basados en la compra anterior.',
        purpose: 'Generar segunda compra con cross-sell inteligente.',
      },
    ],
    bestPractices: [
      'Espera al menos 3 dias antes del primer email para que reciban el producto.',
      'Personaliza las recomendaciones segun la categoria del producto comprado.',
      'Incluye un enlace directo para dejar resena, sin pasos extras.',
      'Ofrece un pequeno incentivo (5-10%) por dejar una resena con foto.',
    ],
    expectedImpact: 'Aumento del 20-30% en tasa de resenas. Tasa de recompra del 15-25% desde el email de cross-sell.',
    productStrategy: 'none',
    discountEmail: null,
    defaultDiscountType: null,
    defaultDiscountValue: 0,
  },

  // 4. Customer Winback (high, retention)
  {
    id: 'customer_winback',
    name: 'Customer Winback',
    nameEs: 'Recuperacion de Clientes',
    description: 'Reactiva clientes inactivos con una secuencia emotiva que los invita a volver con ofertas personalizadas.',
    icon: 'UserCheck',
    category: 'retention',
    priority: 'high',
    triggerDescription: 'Se activa cuando un cliente no ha comprado en los ultimos 60 dias.',
    emails: [
      {
        subject: 'Te extranamos mucho',
        previewText: 'Ha pasado tiempo sin verte por aqui',
        delayHours: 1440,
        description: 'Email emotivo que reconoce la ausencia y muestra novedades de la tienda.',
        purpose: 'Reconectar emocionalmente y mostrar que la marca los valora.',
      },
      {
        subject: 'Un regalo especial para ti',
        previewText: 'Descuento exclusivo para clientes VIP',
        delayHours: 1800,
        description: 'Oferta exclusiva de reactivacion con descuento significativo.',
        purpose: 'Incentivar la vuelta con una oferta que no puedan rechazar.',
      },
      {
        subject: 'Es nuestra ultima carta',
        previewText: 'No queremos perderte, pero entendemos',
        delayHours: 2160,
        description: 'Ultimo intento con el mejor descuento disponible. Pregunta si quieren seguir recibiendo emails.',
        purpose: 'Ultimo esfuerzo de reactivacion o limpieza de lista.',
      },
    ],
    bestPractices: [
      'Usa un tono personal y emotivo, no comercial agresivo.',
      'Muestra productos nuevos que no conocen desde su ultima visita.',
      'Ofrece un descuento progresivo (10% > 15% > 20%) en cada email.',
      'Si no responden al tercer email, moverlos al flujo de sunset.',
    ],
    expectedImpact: 'Reactivacion del 5-10% de clientes inactivos. Mejor salud de lista al limpiar contactos no comprometidos.',
    productStrategy: 'best_sellers',
    discountEmail: 1,
    defaultDiscountType: 'percentage',
    defaultDiscountValue: 15,
  },

  // 5. Browse Abandonment (high, revenue)
  {
    id: 'browse_abandonment',
    name: 'Browse Abandonment',
    nameEs: 'Abandono de Navegacion',
    description: 'Recaptura el interes de visitantes que miraron productos pero no los agregaron al carrito.',
    icon: 'Eye',
    category: 'revenue',
    priority: 'high',
    triggerDescription: 'Se activa cuando un visitante identificado ve un producto pero no lo agrega al carrito.',
    emails: [
      {
        subject: 'Sigues interesado/a en esto?',
        previewText: 'Vimos que estabas mirando algo especial',
        delayHours: 2,
        description: 'Recordatorio del producto visto con imagen, precio y enlace directo.',
        purpose: 'Recapturar atencion mientras el interes aun esta fresco.',
      },
      {
        subject: 'Mas opciones que te van a gustar',
        previewText: 'Alternativas similares seleccionadas para ti',
        delayHours: 24,
        description: 'El producto visto mas alternativas similares o complementarias.',
        purpose: 'Ampliar opciones para quienes no se convencieron con el primer producto.',
      },
    ],
    bestPractices: [
      'Envia el primer email dentro de 2 horas para captar atencion fresca.',
      'Incluye la imagen del producto exacto que vieron, no productos genericos.',
      'Agrega resenas del producto para dar confianza al indeciso.',
      'No incluyas descuento en browse abandonment, reservalo para cart abandonment.',
    ],
    expectedImpact: 'Conversion del 2-5% de navegantes a compradores. Complementa al flujo de carrito abandonado.',
    productStrategy: 'none',
    discountEmail: null,
    defaultDiscountType: null,
    defaultDiscountValue: 0,
  },

  // 6. VIP Loyalty (medium, engagement)
  {
    id: 'vip_loyalty',
    name: 'VIP Loyalty',
    nameEs: 'Programa VIP',
    description: 'Premia a tus mejores clientes con acceso exclusivo, ofertas anticipadas y reconocimiento especial.',
    icon: 'Crown',
    category: 'engagement',
    priority: 'medium',
    triggerDescription: 'Se activa cuando un cliente alcanza un hito de compras (3+ compras o monto acumulado).',
    emails: [
      {
        subject: 'Eres parte de nuestros VIP',
        previewText: 'Gracias por ser un cliente increible',
        delayHours: 0,
        description: 'Reconocimiento del hito alcanzado con agradecimiento genuino y beneficios VIP.',
        purpose: 'Hacer que el cliente se sienta especial y valorado.',
      },
      {
        subject: 'Acceso anticipado solo para ti',
        previewText: 'Ve lo nuevo antes que nadie',
        delayHours: 168,
        description: 'Acceso exclusivo anticipado a nuevos productos o colecciones.',
        purpose: 'Reforzar el sentimiento de exclusividad y privilegio.',
      },
      {
        subject: 'Celebramos contigo este mes',
        previewText: 'Un regalo especial en tu mes',
        delayHours: 720,
        description: 'Oferta especial de cumpleanos o aniversario como cliente.',
        purpose: 'Mantener la relacion activa con celebraciones personalizadas.',
      },
    ],
    bestPractices: [
      'Define criterios claros de VIP (3+ compras o $X acumulado).',
      'Ofrece beneficios reales y exclusivos, no descuentos genericos.',
      'Personaliza con el nombre del cliente y su historial de compras.',
      'Envia acceso anticipado 24-48 horas antes del lanzamiento publico.',
    ],
    expectedImpact: 'Aumento del 25-40% en valor de vida del cliente VIP. Mayor tasa de recompra y referidos.',
    productStrategy: 'none',
    discountEmail: 0,
    defaultDiscountType: 'percentage',
    defaultDiscountValue: 20,
  },

  // 7. Sunset Flow (high, retention)
  {
    id: 'sunset_flow',
    name: 'Sunset Flow',
    nameEs: 'Flujo de Despedida',
    description: 'Limpia tu lista de suscriptores inactivos de forma elegante, mejorando la entregabilidad.',
    icon: 'Sunset',
    category: 'retention',
    priority: 'high',
    triggerDescription: 'Se activa cuando un suscriptor no abre ni hace clic en emails durante 120 dias.',
    emails: [
      {
        subject: 'Queremos reconectarnos contigo',
        previewText: 'Hace tiempo que no nos vemos',
        delayHours: 2880,
        description: 'Intento de re-engagement con contenido atractivo y pregunta sobre preferencias.',
        purpose: 'Dar una oportunidad genuina de reconexion antes de la despedida.',
      },
      {
        subject: 'Seguimos enviandote emails?',
        previewText: 'Tu opinion nos importa mucho',
        delayHours: 3240,
        description: 'Pregunta directa sobre si desean seguir recibiendo emails con opciones claras.',
        purpose: 'Obtener consentimiento explicito o preparar la limpieza.',
      },
      {
        subject: 'Nos despedimos (por ahora)',
        previewText: 'Siempre seras bienvenido/a de vuelta',
        delayHours: 3600,
        description: 'Despedida respetuosa con enlace para volver a suscribirse si cambian de opinion.',
        purpose: 'Limpieza de lista manteniendo la puerta abierta.',
      },
    ],
    bestPractices: [
      'Nunca elimines suscriptores sin darles oportunidad de quedarse.',
      'Usa asuntos directos y honestos, no clickbait.',
      'Incluye un boton grande y claro de "Quiero seguir recibiendo emails".',
      'Suprime (no elimines) los contactos del flujo final para cumplir regulaciones.',
    ],
    expectedImpact: 'Mejora del 10-20% en tasa de apertura general. Mejor reputacion de dominio y entregabilidad.',
    productStrategy: 'none',
    discountEmail: null,
    defaultDiscountType: null,
    defaultDiscountValue: 0,
  },

  // 8. Birthday (medium, lifecycle)
  {
    id: 'birthday',
    name: 'Birthday',
    nameEs: 'Cumpleanos',
    description: 'Celebra el cumpleanos de tus clientes con un regalo especial que genera ventas y lealtad.',
    icon: 'Gift',
    category: 'lifecycle',
    priority: 'medium',
    triggerDescription: 'Se activa el dia del cumpleanos del suscriptor (requiere dato de fecha de nacimiento).',
    emails: [
      {
        subject: 'Feliz cumpleanos! Tu regalo',
        previewText: 'Preparamos algo especial para ti',
        delayHours: 0,
        description: 'Felicitacion de cumpleanos con regalo exclusivo: descuento, envio gratis o producto.',
        purpose: 'Crear momento memorable que asocien con la marca.',
      },
      {
        subject: 'Tu regalo sigue disponible',
        previewText: 'No dejes pasar tu beneficio de cumple',
        delayHours: 72,
        description: 'Recordatorio de que el beneficio de cumpleanos sigue activo con urgencia suave.',
        purpose: 'Asegurar la conversion de quienes no usaron el regalo inmediatamente.',
      },
    ],
    bestPractices: [
      'Envia el email temprano en la manana del cumpleanos.',
      'Ofrece un descuento generoso (15-25%) que expire en 7 dias.',
      'Usa un diseno festivo y personal, no un email comercial tipico.',
      'Recolecta fechas de cumpleanos en el formulario de suscripcion.',
    ],
    expectedImpact: 'Tasa de conversion del 15-20% en emails de cumpleanos. Excelente herramienta de fidelizacion.',
    productStrategy: 'none',
    discountEmail: 0,
    defaultDiscountType: 'percentage',
    defaultDiscountValue: 20,
  },

  // 9. Back in Stock (medium, revenue)
  {
    id: 'back_in_stock',
    name: 'Back in Stock',
    nameEs: 'Producto Disponible',
    description: 'Notifica instantaneamente cuando un producto agotado vuelve a estar disponible.',
    icon: 'PackagePlus',
    category: 'revenue',
    priority: 'medium',
    triggerDescription: 'Se activa cuando un producto marcado como agotado vuelve a tener inventario.',
    emails: [
      {
        subject: 'Ya esta disponible lo que querias',
        previewText: 'Corre antes de que se agote otra vez',
        delayHours: 0,
        description: 'Notificacion inmediata con imagen del producto, precio y boton de compra directa. Enfasis en urgencia.',
        purpose: 'Convertir inmediatamente el interes previo en compra antes de que se agote de nuevo.',
      },
    ],
    bestPractices: [
      'Envia de forma inmediata, cada minuto cuenta con stock limitado.',
      'Muestra cuantas unidades hay disponibles si es posible.',
      'Incluye un boton de compra directa, sin pasos intermedios.',
      'Permite que los clientes se suscriban a alertas de stock desde la pagina del producto.',
    ],
    expectedImpact: 'Tasa de conversion del 10-20%. Los clientes que pidieron alerta tienen intencion de compra altisima.',
    productStrategy: 'none',
    discountEmail: null,
    defaultDiscountType: null,
    defaultDiscountValue: 0,
  },

  // 10. Price Drop (medium, revenue)
  {
    id: 'price_drop',
    name: 'Price Drop',
    nameEs: 'Alerta de Precio',
    description: 'Notifica a los clientes interesados cuando un producto baja de precio.',
    icon: 'TrendingDown',
    category: 'revenue',
    priority: 'medium',
    triggerDescription: 'Se activa cuando un producto que el cliente vio o guardo tiene una reduccion de precio.',
    emails: [
      {
        subject: 'Bajo el precio de tu favorito',
        previewText: 'Aprovecha antes de que vuelva a subir',
        delayHours: 0,
        description: 'Notificacion de baja de precio con comparacion visual del precio anterior vs actual. Urgencia por tiempo limitado.',
        purpose: 'Convertir compradores sensibles al precio que estaban esperando una rebaja.',
      },
    ],
    bestPractices: [
      'Muestra claramente el precio anterior tachado vs el precio nuevo.',
      'Indica si la oferta es por tiempo limitado para crear urgencia.',
      'Incluye productos similares que tambien bajaron de precio.',
      'Segmenta solo a quienes realmente vieron o guardaron el producto.',
    ],
    expectedImpact: 'Tasa de conversion del 8-15%. Muy efectivo para productos de consideracion alta.',
    productStrategy: 'none',
    discountEmail: null,
    defaultDiscountType: null,
    defaultDiscountValue: 0,
  },
];

export const FLOW_CATEGORY_LABELS: Record<FlowCategory, string> = {
  revenue: 'Ingresos',
  engagement: 'Engagement',
  retention: 'Retencion',
  lifecycle: 'Ciclo de Vida',
};

export const FLOW_PRIORITY_COLORS: Record<FlowPriority, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#3b82f6',
};
