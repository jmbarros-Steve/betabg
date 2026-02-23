import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle, Users, Eye, MessageCircle, TrendingUp, Heart,
  Share2, Send, Loader2, Bot, ChevronRight
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface MetaAdsConfigPanelProps {
  clientId: string;
}

interface MockPage {
  id: string;
  name: string;
  category: string;
  followers: number;
  profilePic: string;
}

const MOCK_PAGES: MockPage[] = [
  { id: '1', name: 'Mi Tienda CL', category: 'E-commerce', followers: 12500, profilePic: 'https://api.dicebear.com/7.x/initials/svg?seed=MT&backgroundColor=3b82f6' },
  { id: '2', name: 'Haciendola Oficial', category: 'Ropa y moda', followers: 24000, profilePic: 'https://api.dicebear.com/7.x/initials/svg?seed=HO&backgroundColor=8b5cf6' },
  { id: '3', name: 'Tienda Demo', category: 'Tienda online', followers: 3200, profilePic: 'https://api.dicebear.com/7.x/initials/svg?seed=TD&backgroundColor=ec4899' },
];

const MOCK_POSTS = [
  { id: '1', thumbnail: 'https://api.dicebear.com/7.x/shapes/svg?seed=post1', text: 'Nuestra nueva colección de verano ya está disponible. Descubre los diseños que...', date: '2026-02-20', likes: 342, comments: 28, shares: 15, reach: 8420 },
  { id: '2', thumbnail: 'https://api.dicebear.com/7.x/shapes/svg?seed=post2', text: '¡OFERTA FLASH! 30% de descuento en toda la tienda solo por hoy. No te...', date: '2026-02-18', likes: 567, comments: 45, shares: 32, reach: 12300 },
  { id: '3', thumbnail: 'https://api.dicebear.com/7.x/shapes/svg?seed=post3', text: 'Antes y después de usar nuestro producto estrella. Los resultados hablan por...', date: '2026-02-15', likes: 891, comments: 72, shares: 54, reach: 18900 },
  { id: '4', thumbnail: 'https://api.dicebear.com/7.x/shapes/svg?seed=post4', text: '¿Sabías que nuestros productos son 100% sustentables? Conoce nuestro proceso...', date: '2026-02-12', likes: 234, comments: 19, shares: 8, reach: 5600 },
  { id: '5', thumbnail: 'https://api.dicebear.com/7.x/shapes/svg?seed=post5', text: 'Gracias a todos por el apoyo. Ya somos más de 24,000 seguidores. ¡Esto...', date: '2026-02-10', likes: 1023, comments: 89, shares: 67, reach: 22400 },
];

const MOCK_COMMENTS = [
  { id: '1', user: 'María González', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Maria', comment: '¿Tienen envío gratis a regiones? Me interesa el set de verano.', date: '2026-02-22', postText: 'Nueva colección...' },
  { id: '2', user: 'Carlos Pérez', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos', comment: '¡Me encantó el producto! ¿Cuándo vuelven a tener stock del color rosa?', date: '2026-02-21', postText: 'Oferta flash...' },
  { id: '3', user: 'Ana Martínez', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ana', comment: 'Compré la semana pasada y aún no me llega. ¿Pueden revisar mi pedido #4521?', date: '2026-02-21', postText: 'Antes y después...' },
  { id: '4', user: 'Diego Rojas', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Diego', comment: '¿Hacen precio por mayor? Tengo una tienda y me gustaría revender.', date: '2026-02-20', postText: 'Productos sustentables...' },
];

const MOCK_GROWTH_DATA = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  seguidores: 23500 + Math.floor(i * 28 + Math.random() * 40),
}));

function formatFollowers(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toString();
}

export function MetaAdsConfigPanel({ clientId }: MetaAdsConfigPanelProps) {
  const [connectedPageId, setConnectedPageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [generatingReply, setGeneratingReply] = useState<string | null>(null);

  const connectedPage = MOCK_PAGES.find(p => p.id === connectedPageId);

  const handleGenerateReply = (commentId: string, comment: string) => {
    setGeneratingReply(commentId);
    setReplyingTo(commentId);
    setTimeout(() => {
      const replies: Record<string, string> = {
        '1': '¡Hola María! 😊 Sí, tenemos envío gratis a todo Chile en compras sobre $30.000. El set de verano está disponible. ¿Te gustaría que te envíe el link directo?',
        '2': '¡Gracias Carlos! 🙌 El color rosa vuelve la próxima semana. ¿Quieres que te avise cuando esté disponible?',
        '3': 'Hola Ana, lamentamos la demora. Ya revisamos tu pedido #4521 y está en camino. Debería llegar mañana. Te enviamos el tracking por DM. 📦',
        '4': '¡Hola Diego! Sí, tenemos precios mayoristas. Escríbenos por DM con los productos que te interesan y te armamos una cotización especial. 💼',
      };
      setReplyText(replies[commentId] || '¡Gracias por tu comentario! Te respondemos por DM.');
      setGeneratingReply(null);
    }, 1500);
  };

  return (
    <div className="space-y-8">
      {/* SECCIÓN 1 — Conexión de Página */}
      <div>
        <h3 className="text-lg font-bold mb-1">¿Cuál es la página de tu negocio?</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Selecciona la página de Facebook asociada a tu e-commerce para vincularla con Steve Ads.
        </p>

        <div className="grid gap-3">
          {MOCK_PAGES.map(page => {
            const isConnected = connectedPageId === page.id;
            return (
              <Card key={page.id} className={`transition-all ${isConnected ? 'border-green-500 bg-green-500/5' : ''}`}>
                <CardContent className="flex items-center justify-between py-4 px-5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={page.profilePic} alt={page.name} />
                      <AvatarFallback>{page.name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{page.name}</p>
                        {isConnected && (
                          <Badge className="bg-green-500/10 text-green-600 border-green-500/30 text-xs gap-1">
                            <CheckCircle className="w-3 h-3" /> Conectada
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{page.category}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="w-3 h-3" /> {formatFollowers(page.followers)} seguidores
                      </p>
                    </div>
                  </div>
                  <Button
                    variant={isConnected ? 'outline' : 'default'}
                    size="sm"
                    onClick={() => setConnectedPageId(isConnected ? null : page.id)}
                  >
                    {isConnected ? 'Desconectar' : 'Conectar'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* SECCIÓN 2 — Métricas Orgánicas */}
      {connectedPage && (
        <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold">Métricas Orgánicas</h3>
            <Badge variant="outline" className="text-xs">{connectedPage.name}</Badge>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Seguidores', value: '24,350', change: '+2.3%', icon: Users, positive: true },
              { label: 'Alcance mensual', value: '45,200', change: '+8.1%', icon: Eye, positive: true },
              { label: 'Engagement rate', value: '4.2%', change: '+0.3%', icon: Heart, positive: true },
              { label: 'Mensajes sin responder', value: '12', change: '', icon: MessageCircle, positive: false },
            ].map((kpi) => (
              <Card key={kpi.label}>
                <CardContent className="py-4 px-4">
                  <div className="flex items-center justify-between mb-2">
                    <kpi.icon className="w-4 h-4 text-muted-foreground" />
                    {kpi.change && (
                      <span className={`text-xs font-medium ${kpi.positive ? 'text-green-600' : 'text-red-500'}`}>
                        {kpi.change}
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Gráfico de crecimiento */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Crecimiento de seguidores — Últimos 30 días
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={MOCK_GROWTH_DATA}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} domain={['dataMin - 100', 'dataMax + 100']} className="text-muted-foreground" />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid hsl(var(--border))' }}
                      formatter={(value: number) => [value.toLocaleString(), 'Seguidores']}
                      labelFormatter={(label) => `Día ${label}`}
                    />
                    <Line type="monotone" dataKey="seguidores" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Últimos posts */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Últimos posts</CardTitle>
              <CardDescription className="text-xs">Rendimiento orgánico de tus publicaciones recientes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {MOCK_POSTS.map(post => (
                  <div key={post.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                    <img src={post.thumbnail} alt="" className="w-12 h-12 rounded-md object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{post.text}</p>
                      <p className="text-xs text-muted-foreground">{post.date}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                      <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{post.likes}</span>
                      <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{post.comments}</span>
                      <span className="flex items-center gap-1"><Share2 className="w-3 h-3" />{post.shares}</span>
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatFollowers(post.reach)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Comentarios sin responder */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-orange-500" />
                Comentarios sin responder
              </CardTitle>
              <CardDescription className="text-xs">Steve IA puede sugerir respuestas para cada comentario</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {MOCK_COMMENTS.map(c => (
                  <div key={c.id} className="border border-border rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={c.avatar} alt={c.user} />
                        <AvatarFallback>{c.user[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{c.user}</p>
                          <span className="text-xs text-muted-foreground">{c.date}</span>
                        </div>
                        <p className="text-sm mt-0.5">{c.comment}</p>
                        <p className="text-xs text-muted-foreground mt-1">En: "{c.postText}"</p>
                      </div>
                    </div>

                    {replyingTo === c.id ? (
                      <div className="space-y-2 pl-12">
                        <Textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Escribe tu respuesta..."
                          className="text-sm min-h-[80px]"
                        />
                        <div className="flex items-center gap-2">
                          <Button size="sm" className="gap-1.5">
                            <Send className="w-3.5 h-3.5" /> Responder
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setReplyingTo(null); setReplyText(''); }}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 pl-12">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs"
                          onClick={() => handleGenerateReply(c.id, c.comment)}
                          disabled={generatingReply === c.id}
                        >
                          {generatingReply === c.id ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Generando...</>
                          ) : (
                            <><Bot className="w-3 h-3" /> Responder con Steve IA</>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-xs"
                          onClick={() => setReplyingTo(c.id)}
                        >
                          <ChevronRight className="w-3 h-3" /> Responder manual
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
