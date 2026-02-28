import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import {
  MessageSquare,
  AtSign,
  MessageCircle,
  Send,
  Sparkles,
  Clock,
  Flag,
  CheckCircle2,
  Users,
  Search,
  MailCheck,
  Timer,
  BarChart3,
  ShoppingBag,
  Mail,
  Phone,
  X,
  Loader2,
  ArrowLeft,
  UserPlus,
  AlertCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetaSocialInboxProps {
  clientId: string;
}

type ConversationTab = 'comments' | 'messages' | 'mentions';

type SentimentType = 'positive' | 'neutral' | 'negative';

type PlatformType = 'facebook' | 'instagram';

interface ConversationItem {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  platform: PlatformType;
  type: ConversationTab;
  lastMessage: string;
  timestamp: Date;
  unread: boolean;
  sentiment: SentimentType;
  adName?: string;
  resolved: boolean;
  flagged: boolean;
}

interface MessageItem {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  timestamp: Date;
  isOwn: boolean;
  reaction?: string;
}

interface CustomerInfo {
  name: string;
  email: string | null;
  phone: string | null;
  platform: PlatformType;
  totalInteractions: number;
  firstInteraction: string;
  previousPurchases: number;
  totalSpent: number;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_CONVERSATIONS: ConversationItem[] = [
  {
    id: 'conv-1',
    userId: 'u1',
    userName: 'Maria Gonzalez',
    userAvatar: '',
    platform: 'facebook',
    type: 'comments',
    lastMessage: 'Hola! Me encanta este producto. Donde puedo comprarlo? Lo vi en su anuncio y quiero saber si hacen envio a Temuco.',
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
    unread: true,
    sentiment: 'positive',
    adName: 'Promo Verano 2026',
    resolved: false,
    flagged: false,
  },
  {
    id: 'conv-2',
    userId: 'u2',
    userName: 'Carlos Mendoza',
    userAvatar: '',
    platform: 'instagram',
    type: 'messages',
    lastMessage: 'Buenas tardes, hice un pedido hace 5 dias y aun no me llega. El numero de seguimiento no actualiza. Me pueden ayudar?',
    timestamp: new Date(Date.now() - 12 * 60 * 1000),
    unread: true,
    sentiment: 'negative',
    resolved: false,
    flagged: true,
  },
  {
    id: 'conv-3',
    userId: 'u3',
    userName: 'Ana Rojas',
    userAvatar: '',
    platform: 'facebook',
    type: 'comments',
    lastMessage: 'Que bonito! Los colores son preciosos. Tienen en talla M?',
    timestamp: new Date(Date.now() - 25 * 60 * 1000),
    unread: true,
    sentiment: 'positive',
    adName: 'Nueva Coleccion Otono',
    resolved: false,
    flagged: false,
  },
  {
    id: 'conv-4',
    userId: 'u4',
    userName: 'Pedro Soto',
    userAvatar: '',
    platform: 'instagram',
    type: 'comments',
    lastMessage: 'Pesimo servicio al cliente. Llevo una semana esperando respuesta a mi reclamo. No volveria a comprar aca.',
    timestamp: new Date(Date.now() - 45 * 60 * 1000),
    unread: true,
    sentiment: 'negative',
    adName: 'Oferta Flash',
    resolved: false,
    flagged: true,
  },
  {
    id: 'conv-5',
    userId: 'u5',
    userName: 'Luisa Fernandez',
    userAvatar: '',
    platform: 'facebook',
    type: 'messages',
    lastMessage: 'Hola, queria consultar si tienen algun descuento para compras mayoristas? Tengo una tienda y me interesa revender sus productos.',
    timestamp: new Date(Date.now() - 1.5 * 60 * 60 * 1000),
    unread: false,
    sentiment: 'neutral',
    resolved: false,
    flagged: false,
  },
  {
    id: 'conv-6',
    userId: 'u6',
    userName: 'Roberto Diaz',
    userAvatar: '',
    platform: 'instagram',
    type: 'mentions',
    lastMessage: '@tienda Miren lo que me llego! Increible la calidad, super recomendado para todos. 10/10 la experiencia de compra.',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    unread: false,
    sentiment: 'positive',
    resolved: false,
    flagged: false,
  },
  {
    id: 'conv-7',
    userId: 'u7',
    userName: 'Carmen Vega',
    userAvatar: '',
    platform: 'facebook',
    type: 'comments',
    lastMessage: 'Cuanto cuesta el envio a Santiago? Y cuantos dias demora?',
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
    unread: false,
    sentiment: 'neutral',
    adName: 'Catalogo Completo',
    resolved: false,
    flagged: false,
  },
  {
    id: 'conv-8',
    userId: 'u8',
    userName: 'Diego Martinez',
    userAvatar: '',
    platform: 'instagram',
    type: 'messages',
    lastMessage: 'Hola! Quiero hacer un cambio de talla. Me queda grande la polera que compre. Como lo hago?',
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
    unread: false,
    sentiment: 'neutral',
    resolved: false,
    flagged: false,
  },
  {
    id: 'conv-9',
    userId: 'u9',
    userName: 'Valentina Paredes',
    userAvatar: '',
    platform: 'facebook',
    type: 'mentions',
    lastMessage: '@tienda Los amo! Mejor marca chilena sin duda. Todos mis amigos ya compraron gracias a mi recomendacion jaja',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
    unread: false,
    sentiment: 'positive',
    resolved: true,
    flagged: false,
  },
  {
    id: 'conv-10',
    userId: 'u10',
    userName: 'Felipe Alvarez',
    userAvatar: '',
    platform: 'instagram',
    type: 'comments',
    lastMessage: 'Buenisimo el diseno pero el precio esta un poco elevado comparado con la competencia. Tienen algun cupon de descuento?',
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
    unread: false,
    sentiment: 'neutral',
    adName: 'Lanzamiento Premium',
    resolved: false,
    flagged: false,
  },
  {
    id: 'conv-11',
    userId: 'u11',
    userName: 'Isabel Torres',
    userAvatar: '',
    platform: 'facebook',
    type: 'messages',
    lastMessage: 'Me llego el paquete danado. Las cajas estaban abiertas y faltaban 2 productos. Necesito solucion urgente.',
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
    unread: false,
    sentiment: 'negative',
    resolved: false,
    flagged: true,
  },
  {
    id: 'conv-12',
    userId: 'u12',
    userName: 'Andres Reyes',
    userAvatar: '',
    platform: 'instagram',
    type: 'mentions',
    lastMessage: '@tienda Probando el nuevo serum facial. Llevo 3 dias y ya noto diferencia. Contenido patrocinado? No, es puro amor jaja',
    timestamp: new Date(Date.now() - 10 * 60 * 60 * 1000),
    unread: false,
    sentiment: 'positive',
    resolved: true,
    flagged: false,
  },
];

const MOCK_MESSAGES: Record<string, MessageItem[]> = {
  'conv-1': [
    {
      id: 'm1-1',
      senderId: 'u1',
      senderName: 'Maria Gonzalez',
      senderAvatar: '',
      content: 'Hola! Vi su anuncio de la promo de verano y me encanto!',
      timestamp: new Date(Date.now() - 10 * 60 * 1000),
      isOwn: false,
    },
    {
      id: 'm1-2',
      senderId: 'u1',
      senderName: 'Maria Gonzalez',
      senderAvatar: '',
      content: 'Me encanta este producto. Donde puedo comprarlo? Lo vi en su anuncio y quiero saber si hacen envio a Temuco.',
      timestamp: new Date(Date.now() - 5 * 60 * 1000),
      isOwn: false,
    },
  ],
  'conv-2': [
    {
      id: 'm2-1',
      senderId: 'u2',
      senderName: 'Carlos Mendoza',
      senderAvatar: '',
      content: 'Hola, necesito ayuda con mi pedido #4521',
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
      isOwn: false,
    },
    {
      id: 'm2-2',
      senderId: 'brand',
      senderName: 'Tu marca',
      senderAvatar: '',
      content: 'Hola Carlos! Claro, dejame revisar tu pedido. Dame un momento por favor.',
      timestamp: new Date(Date.now() - 28 * 60 * 1000),
      isOwn: true,
    },
    {
      id: 'm2-3',
      senderId: 'u2',
      senderName: 'Carlos Mendoza',
      senderAvatar: '',
      content: 'Ok, espero. Ya llevo varios dias esperando.',
      timestamp: new Date(Date.now() - 25 * 60 * 1000),
      isOwn: false,
    },
    {
      id: 'm2-4',
      senderId: 'u2',
      senderName: 'Carlos Mendoza',
      senderAvatar: '',
      content: 'Buenas tardes, hice un pedido hace 5 dias y aun no me llega. El numero de seguimiento no actualiza. Me pueden ayudar?',
      timestamp: new Date(Date.now() - 12 * 60 * 1000),
      isOwn: false,
    },
  ],
  'conv-3': [
    {
      id: 'm3-1',
      senderId: 'u3',
      senderName: 'Ana Rojas',
      senderAvatar: '',
      content: 'Que bonito! Los colores son preciosos. Tienen en talla M?',
      timestamp: new Date(Date.now() - 25 * 60 * 1000),
      isOwn: false,
    },
  ],
  'conv-4': [
    {
      id: 'm4-1',
      senderId: 'u4',
      senderName: 'Pedro Soto',
      senderAvatar: '',
      content: 'Hola, compre un producto y vino defectuoso.',
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      isOwn: false,
    },
    {
      id: 'm4-2',
      senderId: 'brand',
      senderName: 'Tu marca',
      senderAvatar: '',
      content: 'Lamentamos mucho eso Pedro. Podrias enviarnos fotos del producto?',
      timestamp: new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000),
      isOwn: true,
    },
    {
      id: 'm4-3',
      senderId: 'u4',
      senderName: 'Pedro Soto',
      senderAvatar: '',
      content: 'Ya las envie por correo hace 3 dias y nadie me responde.',
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      isOwn: false,
    },
    {
      id: 'm4-4',
      senderId: 'u4',
      senderName: 'Pedro Soto',
      senderAvatar: '',
      content: 'Pesimo servicio al cliente. Llevo una semana esperando respuesta a mi reclamo. No volveria a comprar aca.',
      timestamp: new Date(Date.now() - 45 * 60 * 1000),
      isOwn: false,
    },
  ],
  'conv-5': [
    {
      id: 'm5-1',
      senderId: 'u5',
      senderName: 'Luisa Fernandez',
      senderAvatar: '',
      content: 'Hola, buenas tardes!',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      isOwn: false,
    },
    {
      id: 'm5-2',
      senderId: 'brand',
      senderName: 'Tu marca',
      senderAvatar: '',
      content: 'Hola Luisa! Como podemos ayudarte?',
      timestamp: new Date(Date.now() - 1.8 * 60 * 60 * 1000),
      isOwn: true,
    },
    {
      id: 'm5-3',
      senderId: 'u5',
      senderName: 'Luisa Fernandez',
      senderAvatar: '',
      content: 'Hola, queria consultar si tienen algun descuento para compras mayoristas? Tengo una tienda y me interesa revender sus productos.',
      timestamp: new Date(Date.now() - 1.5 * 60 * 60 * 1000),
      isOwn: false,
    },
  ],
};

const MOCK_CUSTOMER_INFO: Record<string, CustomerInfo> = {
  'u1': {
    name: 'Maria Gonzalez',
    email: 'maria.gonzalez@gmail.com',
    phone: '+56 9 1234 5678',
    platform: 'facebook',
    totalInteractions: 3,
    firstInteraction: '2025-11-15',
    previousPurchases: 1,
    totalSpent: 45990,
    tags: ['cliente recurrente', 'interesada en promos'],
  },
  'u2': {
    name: 'Carlos Mendoza',
    email: 'carlos.mendoza@hotmail.com',
    phone: '+56 9 8765 4321',
    platform: 'instagram',
    totalInteractions: 8,
    firstInteraction: '2025-08-20',
    previousPurchases: 3,
    totalSpent: 189970,
    tags: ['reclamo activo', 'cliente frecuente'],
  },
  'u3': {
    name: 'Ana Rojas',
    email: null,
    phone: null,
    platform: 'facebook',
    totalInteractions: 1,
    firstInteraction: '2026-02-27',
    previousPurchases: 0,
    totalSpent: 0,
    tags: ['nuevo lead'],
  },
  'u4': {
    name: 'Pedro Soto',
    email: 'pedro.soto@gmail.com',
    phone: '+56 9 5555 1234',
    platform: 'instagram',
    totalInteractions: 12,
    firstInteraction: '2025-06-10',
    previousPurchases: 5,
    totalSpent: 324950,
    tags: ['reclamo activo', 'riesgo churn', 'VIP'],
  },
  'u5': {
    name: 'Luisa Fernandez',
    email: 'luisa.fernandez@empresa.cl',
    phone: '+56 9 4444 8888',
    platform: 'facebook',
    totalInteractions: 2,
    firstInteraction: '2026-02-25',
    previousPurchases: 0,
    totalSpent: 0,
    tags: ['B2B prospect', 'mayorista'],
  },
};

const AI_REPLIES: Record<string, string> = {
  'conv-1': 'Hola Maria! Muchas gracias por tu interes. Si, hacemos envios a Temuco y a todo Chile. El envio tiene un costo de $3.990 y demora entre 3 a 5 dias habiles. Puedes comprar directamente en nuestra tienda online: [link]. Si necesitas ayuda con el proceso, estamos para ayudarte!',
  'conv-2': 'Hola Carlos, lamentamos mucho la demora. Ya revise tu pedido #4521 y veo que el despacho tuvo un retraso en la bodega del courier. Te acabo de enviar por correo el nuevo numero de seguimiento actualizado. Deberia llegarte manana. Como compensacion, te ofrecemos un 15% de descuento en tu proxima compra. Disculpa las molestias!',
  'conv-3': 'Hola Ana! Gracias por tu lindo comentario. Si, tenemos disponible en talla M en todos los colores de la nueva coleccion. Te dejo el link directo para que puedas verla: [link]. Ademas, si compras hoy tienes envio gratis!',
  'conv-4': 'Estimado Pedro, entendemos tu frustracion y te ofrecemos nuestras sinceras disculpas. He escalado tu caso al equipo de post-venta y te contactaran dentro de las proximas 2 horas para coordinar la devolucion y reemplazo del producto. Ademas, como gesto de buena voluntad, te ofrecemos un vale de $20.000 para tu proxima compra. Gracias por tu paciencia.',
  'conv-5': 'Hola Luisa! Que bueno que te interese trabajar con nosotros. Si tenemos un programa de ventas mayoristas con descuentos escalonados desde un 20% para pedidos de 50+ unidades. Te envio por correo nuestro catalogo mayorista con precios y condiciones. Tambien podemos agendar una llamada para revisar tus necesidades en detalle. Que dia te acomoda?',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Ahora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatCLP(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(value);
}

const SENTIMENT_CONFIG: Record<SentimentType, { label: string; color: string; dotClass: string }> = {
  positive: { label: 'Positivo', color: 'text-green-600', dotClass: 'bg-green-500' },
  neutral: { label: 'Neutral', color: 'text-yellow-600', dotClass: 'bg-yellow-500' },
  negative: { label: 'Negativo', color: 'text-red-600', dotClass: 'bg-red-500' },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Stats bar shown at the top */
function StatsBar({ conversations }: { conversations: ConversationItem[] }) {
  const total = conversations.length;
  const resolved = conversations.filter((c) => c.resolved).length;
  const responseRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
  const positive = conversations.filter((c) => c.sentiment === 'positive').length;
  const sentimentScore = total > 0 ? Math.round((positive / total) * 100) : 0;

  const stats = {
    totalToday: total,
    responseRate,
    avgResponseTime: '12m',
    sentimentScore,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card className="relative overflow-hidden">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Mensajes Hoy
              </p>
              <p className="text-xl font-bold mt-0.5">{stats.totalToday}</p>
            </div>
            <div className="p-2 rounded-md bg-blue-500/10">
              <MessageSquare className="w-4 h-4 text-blue-500" />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500/40 to-blue-500/10" />
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Tasa Respuesta
              </p>
              <p className="text-xl font-bold mt-0.5">{stats.responseRate}%</p>
            </div>
            <div className="p-2 rounded-md bg-green-500/10">
              <MailCheck className="w-4 h-4 text-green-500" />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-green-500/40 to-green-500/10" />
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Tiempo Resp.
              </p>
              <p className="text-xl font-bold mt-0.5">{stats.avgResponseTime}</p>
            </div>
            <div className="p-2 rounded-md bg-purple-500/10">
              <Timer className="w-4 h-4 text-purple-500" />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500/40 to-purple-500/10" />
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Sentimiento
              </p>
              <p className="text-xl font-bold mt-0.5 text-green-600">{stats.sentimentScore}%</p>
            </div>
            <div className="p-2 rounded-md bg-amber-500/10">
              <BarChart3 className="w-4 h-4 text-amber-500" />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500/40 to-amber-500/10" />
        </CardContent>
      </Card>
    </div>
  );
}

/** Conversation list item */
function ConversationListItem({
  conversation,
  isActive,
  onClick,
}: {
  conversation: ConversationItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const sentiment = SENTIMENT_CONFIG[conversation.sentiment];

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left p-3 border-b border-border/50 transition-colors duration-150
        hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
        ${isActive ? 'bg-primary/5 border-l-2 border-l-primary' : ''}
        ${conversation.unread ? 'bg-muted/30' : ''}
      `}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div className="relative shrink-0">
          <Avatar className="h-9 w-9">
            {conversation.userAvatar ? (
              <AvatarImage src={conversation.userAvatar} alt={conversation.userName} />
            ) : null}
            <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
              {getInitials(conversation.userName)}
            </AvatarFallback>
          </Avatar>
          {conversation.unread && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-background" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5 mb-0.5">
            <span
              className={`text-sm truncate ${
                conversation.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'
              }`}
            >
              {conversation.userName}
            </span>
            <span className="text-[11px] text-muted-foreground shrink-0">
              {timeAgo(conversation.timestamp)}
            </span>
          </div>

          <p
            className={`text-xs leading-relaxed line-clamp-2 mb-1.5 ${
              conversation.unread ? 'text-foreground/80' : 'text-muted-foreground'
            }`}
          >
            {conversation.lastMessage}
          </p>

          {/* Bottom row: badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Platform badge */}
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 h-[18px] ${
                conversation.platform === 'facebook'
                  ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                  : 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-pink-600 border-pink-500/20'
              }`}
            >
              {conversation.platform === 'facebook' ? 'FB' : 'IG'}
            </Badge>

            {/* Sentiment dot */}
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${sentiment.dotClass}`} />
            </div>

            {/* Ad name */}
            {conversation.adName && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                {conversation.adName}
              </span>
            )}

            {/* Flagged indicator */}
            {conversation.flagged && (
              <Flag className="w-3 h-3 text-orange-500 shrink-0" />
            )}

            {/* Resolved indicator */}
            {conversation.resolved && (
              <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

/** Active thread / conversation view */
function ActiveThread({
  conversation,
  messages,
  onSend,
  onGenerateAI,
  aiReply,
  generatingAI,
  onBack,
}: {
  conversation: ConversationItem;
  messages: MessageItem[];
  onSend: (text: string) => void;
  onGenerateAI: () => void;
  aiReply: string | null;
  generatingAI: boolean;
  onBack: () => void;
}) {
  const [replyText, setReplyText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // If AI reply generated, put it in the textarea
  useEffect(() => {
    if (aiReply) {
      setReplyText(aiReply);
    }
  }, [aiReply]);

  function handleSend() {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setReplyText('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  const sentiment = SENTIMENT_CONFIG[conversation.sentiment];

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0 bg-background/50">
        {/* Back button (mobile) */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 lg:hidden shrink-0"
          onClick={onBack}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
            {getInitials(conversation.userName)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{conversation.userName}</span>
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 h-[18px] ${
                conversation.platform === 'facebook'
                  ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                  : 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-pink-600 border-pink-500/20'
              }`}
            >
              {conversation.platform === 'facebook' ? 'Facebook' : 'Instagram'}
            </Badge>
            <div className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${sentiment.dotClass}`} />
              <span className={`text-[11px] ${sentiment.color}`}>{sentiment.label}</span>
            </div>
          </div>
          {conversation.adName && (
            <p className="text-[11px] text-muted-foreground truncate">
              En: {conversation.adName}
            </p>
          )}
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          {conversation.flagged && (
            <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px]">
              <Flag className="w-3 h-3 mr-1" />
              Marcado
            </Badge>
          )}
          {conversation.resolved && (
            <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Resuelto
            </Badge>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-end gap-2 ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
          >
            {!msg.isOwn && (
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="text-[10px] font-medium bg-muted">
                  {getInitials(msg.senderName)}
                </AvatarFallback>
              </Avatar>
            )}

            <div
              className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                msg.isOwn
                  ? 'bg-primary text-primary-foreground rounded-br-md'
                  : 'bg-muted rounded-bl-md'
              }`}
            >
              <p className="text-sm leading-relaxed">{msg.content}</p>
              <p
                className={`text-[10px] mt-1 ${
                  msg.isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'
                }`}
              >
                {msg.timestamp.toLocaleTimeString('es-CL', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              {msg.reaction && (
                <span className="inline-block mt-0.5 text-sm">{msg.reaction}</span>
              )}
            </div>

            {msg.isOwn && (
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="text-[10px] font-medium bg-primary/10 text-primary">
                  TM
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick reactions */}
      <div className="px-4 py-1.5 border-t border-border/50 flex items-center gap-1 shrink-0">
        <span className="text-[11px] text-muted-foreground mr-1.5">Reacciones:</span>
        {['👍', '❤️', '😄', '😮', '😢', '🔥'].map((emoji) => (
          <button
            key={emoji}
            className="p-1 rounded hover:bg-muted transition-colors text-base"
            title={`Reaccionar con ${emoji}`}
            onClick={() => toast.success(`Reaccion ${emoji} enviada`)}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Reply area */}
      <div className="px-4 py-3 border-t border-border shrink-0 space-y-2">
        <Textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe tu respuesta... (Ctrl+Enter para enviar)"
          className="min-h-[60px] max-h-[120px] resize-none text-sm"
          rows={2}
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onGenerateAI}
            disabled={generatingAI}
            className="gap-1.5"
          >
            {generatingAI ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {generatingAI ? 'Generando...' : 'Generar con IA'}
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!replyText.trim()}
            className="gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Right panel: AI insights + customer info + actions */
function InfoPanel({
  conversation,
  customerInfo,
  onAction,
}: {
  conversation: ConversationItem;
  customerInfo: CustomerInfo | null;
  onAction: (action: string) => void;
}) {
  const sentiment = SENTIMENT_CONFIG[conversation.sentiment];

  return (
    <div className="h-full overflow-y-auto">
      {/* Sentiment Analysis */}
      <div className="p-4 border-b border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Analisis de Sentimiento
        </h3>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span className="text-sm">Positivo</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: '45%' }} />
              </div>
              <span className="text-xs text-muted-foreground w-8 text-right">45%</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
              <span className="text-sm">Neutral</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-yellow-500 rounded-full" style={{ width: '30%' }} />
              </div>
              <span className="text-xs text-muted-foreground w-8 text-right">30%</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-sm">Negativo</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full" style={{ width: '25%' }} />
              </div>
              <span className="text-xs text-muted-foreground w-8 text-right">25%</span>
            </div>
          </div>
          <div className="mt-2 p-2 rounded-md bg-muted/50 flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${sentiment.dotClass}`} />
            <span className="text-xs">
              Esta conversacion: <span className={`font-medium ${sentiment.color}`}>{sentiment.label}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Suggested Reply */}
      <div className="p-4 border-b border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          Respuesta Sugerida
        </h3>
        <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/10">
          <p className="text-xs leading-relaxed text-foreground/80">
            {AI_REPLIES[conversation.id] ||
              'Hola! Gracias por tu mensaje. Estamos revisando tu consulta y te responderemos a la brevedad. Cualquier duda adicional, no dudes en escribirnos.'}
          </p>
        </div>
      </div>

      {/* Customer Info */}
      <div className="p-4 border-b border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Informacion del Cliente
        </h3>
        {customerInfo ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                  {getInitials(customerInfo.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold">{customerInfo.name}</p>
                <Badge
                  variant="secondary"
                  className={`text-[10px] px-1.5 py-0 h-[16px] mt-0.5 ${
                    customerInfo.platform === 'facebook'
                      ? 'bg-blue-500/10 text-blue-600'
                      : 'bg-pink-500/10 text-pink-600'
                  }`}
                >
                  {customerInfo.platform === 'facebook' ? 'Facebook' : 'Instagram'}
                </Badge>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {customerInfo.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate text-xs">{customerInfo.email}</span>
                </div>
              )}
              {customerInfo.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs">{customerInfo.phone}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-md bg-muted/50 text-center">
                <p className="text-lg font-bold">{customerInfo.previousPurchases}</p>
                <p className="text-[10px] text-muted-foreground">Compras</p>
              </div>
              <div className="p-2 rounded-md bg-muted/50 text-center">
                <p className="text-lg font-bold">{customerInfo.totalInteractions}</p>
                <p className="text-[10px] text-muted-foreground">Interacciones</p>
              </div>
            </div>

            {customerInfo.totalSpent > 0 && (
              <div className="p-2 rounded-md bg-green-500/5 border border-green-500/10">
                <div className="flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-xs text-muted-foreground">Total gastado</span>
                </div>
                <p className="text-sm font-bold text-green-600 mt-0.5">{formatCLP(customerInfo.totalSpent)}</p>
              </div>
            )}

            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>Primera interaccion: {customerInfo.firstInteraction}</span>
            </div>

            {/* Tags */}
            {customerInfo.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {customerInfo.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-[18px]"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <Users className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">
              No hay informacion disponible para este usuario.
            </p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Acciones Rapidas
        </h3>
        <div className="space-y-1.5">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 text-xs h-8"
            onClick={() => onAction('resolve')}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            Marcar como resuelto
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 text-xs h-8"
            onClick={() => onAction('flag')}
          >
            <Flag className="w-3.5 h-3.5 text-orange-500" />
            Marcar para seguimiento
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 text-xs h-8"
            onClick={() => onAction('assign')}
          >
            <UserPlus className="w-3.5 h-3.5 text-blue-500" />
            Asignar al equipo
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 text-xs h-8"
            onClick={() => onAction('escalate')}
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
            Escalar caso
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function MetaSocialInbox({ clientId }: MetaSocialInboxProps) {
  const [activeTab, setActiveTab] = useState<ConversationTab>('comments');
  const [conversations, setConversations] = useState<ConversationItem[]>(MOCK_CONVERSATIONS);
  const [selectedConversation, setSelectedConversation] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  // Filter conversations by tab and search
  const filteredConversations = conversations.filter((c) => {
    const matchesTab = c.type === activeTab;
    const matchesSearch =
      !searchQuery ||
      c.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  // Unread counts per tab
  const unreadCounts = {
    comments: conversations.filter((c) => c.type === 'comments' && c.unread).length,
    messages: conversations.filter((c) => c.type === 'messages' && c.unread).length,
    mentions: conversations.filter((c) => c.type === 'mentions' && c.unread).length,
  };

  // Select a conversation
  const handleSelectConversation = useCallback((conv: ConversationItem) => {
    setSelectedConversation(conv);
    setAiReply(null);
    setMobileShowThread(true);

    // Load messages for conversation
    const convMessages = MOCK_MESSAGES[conv.id] || [
      {
        id: `fallback-${conv.id}`,
        senderId: conv.userId,
        senderName: conv.userName,
        senderAvatar: conv.userAvatar,
        content: conv.lastMessage,
        timestamp: conv.timestamp,
        isOwn: false,
      },
    ];
    setMessages(convMessages);

    // Mark as read
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, unread: false } : c)),
    );
  }, []);

  // Send a message
  const handleSend = useCallback(
    (text: string) => {
      if (!selectedConversation) return;

      const newMessage: MessageItem = {
        id: `msg-${Date.now()}`,
        senderId: 'brand',
        senderName: 'Tu marca',
        senderAvatar: '',
        content: text,
        timestamp: new Date(),
        isOwn: true,
      };

      setMessages((prev) => [...prev, newMessage]);
      setAiReply(null);

      // Update conversation preview
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConversation.id
            ? { ...c, lastMessage: text, timestamp: new Date() }
            : c,
        ),
      );

      toast.success('Mensaje enviado');
    },
    [selectedConversation],
  );

  // Generate AI reply
  const handleGenerateAI = useCallback(() => {
    if (!selectedConversation) return;

    setGeneratingAI(true);

    // Simulate AI generation delay
    setTimeout(() => {
      const reply =
        AI_REPLIES[selectedConversation.id] ||
        'Hola! Gracias por contactarnos. Hemos recibido tu mensaje y estamos trabajando para darte la mejor solucion. Te responderemos a la brevedad con toda la informacion que necesitas. Cualquier duda adicional, no dudes en escribirnos.';
      setAiReply(reply);
      setGeneratingAI(false);
      toast.success('Respuesta IA generada');
    }, 1500);
  }, [selectedConversation]);

  // Handle quick actions
  const handleAction = useCallback(
    (action: string) => {
      if (!selectedConversation) return;

      switch (action) {
        case 'resolve':
          setConversations((prev) =>
            prev.map((c) =>
              c.id === selectedConversation.id ? { ...c, resolved: true } : c,
            ),
          );
          setSelectedConversation((prev) => (prev ? { ...prev, resolved: true } : null));
          toast.success('Conversacion marcada como resuelta');
          break;
        case 'flag':
          setConversations((prev) =>
            prev.map((c) =>
              c.id === selectedConversation.id ? { ...c, flagged: !c.flagged } : c,
            ),
          );
          setSelectedConversation((prev) =>
            prev ? { ...prev, flagged: !prev.flagged } : null,
          );
          toast.success('Conversacion marcada para seguimiento');
          break;
        case 'assign':
          toast.success('Asignacion de equipo disponible proximamente');
          break;
        case 'escalate':
          toast.success('Caso escalado al supervisor');
          break;
        default:
          break;
      }
    },
    [selectedConversation],
  );

  // Go back to list on mobile
  const handleMobileBack = useCallback(() => {
    setMobileShowThread(false);
    setSelectedConversation(null);
  }, []);

  // Get customer info for selected conversation
  const customerInfo = selectedConversation
    ? MOCK_CUSTOMER_INFO[selectedConversation.userId] || null
    : null;

  // Tab configuration
  const TABS: { key: ConversationTab; label: string; icon: React.ElementType }[] = [
    { key: 'comments', label: 'Comentarios', icon: MessageCircle },
    { key: 'messages', label: 'Mensajes', icon: MessageSquare },
    { key: 'mentions', label: 'Menciones', icon: AtSign },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Social Inbox</h2>
          <p className="text-muted-foreground text-sm">
            Gestiona comentarios, mensajes y menciones de Facebook e Instagram
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          <span className="w-2 h-2 rounded-full bg-green-500 mr-1.5 animate-pulse" />
          En vivo
        </Badge>
      </div>

      {/* Stats Bar */}
      <StatsBar conversations={conversations} />

      {/* Main Three-Column Layout */}
      <Card className="overflow-hidden border">
        <div className="flex h-[calc(100vh-360px)] min-h-[500px]">
          {/* ============================================================= */}
          {/* LEFT COLUMN: Conversation List                                 */}
          {/* ============================================================= */}
          <div
            className={`
              w-full lg:w-[320px] xl:w-[360px] shrink-0 border-r border-border flex flex-col
              bg-background
              ${mobileShowThread ? 'hidden lg:flex' : 'flex'}
            `}
          >
            {/* Tabs */}
            <div className="flex border-b border-border shrink-0">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const count = unreadCounts[tab.key];
                const isActive = activeTab === tab.key;

                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`
                      flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium
                      transition-colors border-b-2 -mb-px
                      ${
                        isActive
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                      }
                    `}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    {count > 0 && (
                      <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="p-2.5 border-b border-border/50 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar conversaciones..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
                  >
                    <X className="w-3 h-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <MessageSquare className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground text-center">
                    {searchQuery
                      ? 'No se encontraron conversaciones'
                      : 'No hay conversaciones en esta seccion'}
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv) => (
                  <ConversationListItem
                    key={conv.id}
                    conversation={conv}
                    isActive={selectedConversation?.id === conv.id}
                    onClick={() => handleSelectConversation(conv)}
                  />
                ))
              )}
            </div>

            {/* List footer */}
            <div className="px-3 py-2 border-t border-border/50 text-[11px] text-muted-foreground text-center shrink-0">
              {filteredConversations.length} conversacion{filteredConversations.length !== 1 ? 'es' : ''}
            </div>
          </div>

          {/* ============================================================= */}
          {/* CENTER COLUMN: Active Thread                                    */}
          {/* ============================================================= */}
          <div
            className={`
              flex-1 flex flex-col min-w-0
              ${!mobileShowThread ? 'hidden lg:flex' : 'flex'}
            `}
          >
            {selectedConversation ? (
              <ActiveThread
                conversation={selectedConversation}
                messages={messages}
                onSend={handleSend}
                onGenerateAI={handleGenerateAI}
                aiReply={aiReply}
                generatingAI={generatingAI}
                onBack={handleMobileBack}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <MessageSquare className="w-16 h-16 text-muted-foreground/20 mb-4" />
                <p className="text-lg font-medium mb-1">Selecciona una conversacion</p>
                <p className="text-sm text-muted-foreground/70">
                  Elige una conversacion de la lista para ver los mensajes
                </p>
              </div>
            )}
          </div>

          {/* ============================================================= */}
          {/* RIGHT COLUMN: Info Panel (hidden on mobile + tablet)            */}
          {/* ============================================================= */}
          <div className="hidden xl:flex w-[280px] shrink-0 border-l border-border flex-col bg-background/50">
            {selectedConversation ? (
              <InfoPanel
                conversation={selectedConversation}
                customerInfo={customerInfo}
                onAction={handleAction}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-4 text-muted-foreground">
                <Users className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-xs text-center">
                  Selecciona una conversacion para ver la informacion del cliente
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
