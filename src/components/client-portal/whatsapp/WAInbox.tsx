import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Search, Filter, Send, ArrowLeft, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';

interface Conversation {
  id: string;
  contact_phone: string;
  contact_name: string | null;
  status: string;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  assigned_to: string | null;
}

interface Message {
  id: string;
  direction: string;
  body: string | null;
  status: string;
  created_at: string;
  contact_name: string | null;
}

interface Props {
  clientId: string;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open: { label: 'Abierta', className: 'bg-green-100 text-green-700' },
  escalated: { label: 'Escalada', className: 'bg-yellow-100 text-yellow-700' },
  closed: { label: 'Cerrada', className: 'bg-gray-100 text-gray-600' },
};

export function WAInbox({ clientId }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<'all' | 'open' | 'escalated' | 'closed'>('all');
  const [search, setSearch] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();
  }, [clientId, filter]);

  // Issue 7: Supabase Realtime for live conversation updates
  useEffect(() => {
    const channel = supabase
      .channel(`wa-conversations-${clientId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wa_conversations',
          filter: `client_id=eq.${clientId}`,
        },
        (payload: any) => {
          const newConv = payload.new as Conversation;
          if (newConv.channel === 'merchant_wa') {
            setConversations(prev => [newConv, ...prev.filter(c => c.id !== newConv.id)]);
          }
        },
      )
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wa_conversations',
          filter: `client_id=eq.${clientId}`,
        },
        (payload: any) => {
          const updated = payload.new as Conversation;
          setConversations(prev =>
            prev.map(c => (c.id === updated.id ? updated : c)),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  // Bug #117 + Bug #139 fix: Realtime subscription for new wa_messages
  // Use primitive deps (convId, convPhone) to avoid stale closure and unnecessary re-subscribes.
  // Channel name includes convId to prevent collision when switching conversations.
  const convId = selectedConv?.id;
  const convPhone = selectedConv?.contact_phone;

  useEffect(() => {
    if (!clientId || !convPhone) return;

    const channelName = `wa-messages-${clientId}-${convId || 'none'}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wa_messages',
          filter: `contact_phone=eq.${convPhone}`,
        },
        (payload: any) => {
          const newMsg = payload.new as Message & { contact_phone?: string; channel?: string };
          if (newMsg.channel === 'merchant_wa' || !newMsg.channel) {
            setMessages(prev => {
              // Deduplicate: don't add if already present (e.g. optimistic insert from sendReply)
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, convId, convPhone]);

  // Bug #155 fix: Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchConversations() {
    setLoading(true);
    let query = supabase
      .from('wa_conversations' as any)
      .select('*')
      .eq('client_id', clientId)
      .eq('channel', 'merchant_wa')
      .order('last_message_at', { ascending: false })
      .limit(50);

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data } = await query;
    setConversations((data as any[]) || []);
    setLoading(false);
  }

  async function selectConversation(conv: Conversation) {
    setSelectedConv(conv);

    const { data } = await supabase
      .from('wa_messages' as any)
      .select('*')
      .eq('client_id', clientId)
      .eq('contact_phone', conv.contact_phone)
      .eq('channel', 'merchant_wa')
      .order('created_at', { ascending: true })
      .limit(100);

    setMessages((data as any[]) || []);

    // Bug #98 fix: Mark as read via backend API to bypass missing UPDATE RLS.
    // Only clear the badge in UI if the update actually succeeds.
    if (conv.unread_count > 0) {
      try {
        const { error: markError } = await callApi('whatsapp/mark-read', {
          body: { conversation_id: conv.id, client_id: clientId },
        });
        if (markError) {
          // Fallback: try direct Supabase update (may fail due to RLS)
          const { error: directError } = await supabase
            .from('wa_conversations' as any)
            .update({ unread_count: 0 })
            .eq('id', conv.id);
          if (directError) {
            console.warn('[WAInbox] mark-as-read failed (RLS?):', directError.message);
            // Don't update the badge — the unread count is still non-zero server-side
            return;
          }
        }
        // Only clear badge after confirmed server-side update
        setConversations(prev =>
          prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c)
        );
      } catch (err) {
        console.warn('[WAInbox] mark-as-read error:', err);
        // Don't optimistically remove the badge if update fails
      }
    }
  }

  async function sendReply() {
    if (!reply.trim() || !selectedConv) return;
    setSending(true);

    try {
      const { error } = await callApi('whatsapp/send-message', {
        body: {
          client_id: clientId,
          to_phone: selectedConv.contact_phone,
          body: reply,
          channel: 'merchant_wa',
        },
      });

      if (error) {
        toast.error(error || 'No se pudo enviar el mensaje');
        return;
      }

      setMessages(prev => [...prev, {
        id: `temp-${Date.now()}`,
        direction: 'outbound',
        body: reply,
        status: 'sent',
        created_at: new Date().toISOString(),
        contact_name: null,
      }]);
      setReply('');
    } catch (err: any) {
      toast.error(err.message || 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  }

  const filtered = conversations.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.contact_name?.toLowerCase().includes(s)) || c.contact_phone.includes(s);
  });

  // Chat view
  if (selectedConv) {
    return (
      <Card>
        <CardHeader className="border-b py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setSelectedConv(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <User className="h-8 w-8 text-gray-400 bg-gray-100 rounded-full p-1.5" />
            <div className="flex-1">
              <p className="font-medium">{selectedConv.contact_name || selectedConv.contact_phone}</p>
              <p className="text-xs text-gray-500">{selectedConv.contact_phone}</p>
            </div>
            <Badge className={STATUS_BADGE[selectedConv.status]?.className || ''}>
              {STATUS_BADGE[selectedConv.status]?.label || selectedConv.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Messages */}
          <div className="h-[400px] overflow-y-auto p-4 space-y-3 bg-gray-50">
            {messages.length === 0 ? (
              <p className="text-center text-gray-400 py-8">No hay mensajes</p>
            ) : (
              messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                      msg.direction === 'outbound'
                        ? 'bg-green-500 text-white rounded-br-md'
                        : 'bg-white border rounded-bl-md'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                    <div className={`flex items-center gap-1 mt-1 ${
                      msg.direction === 'outbound' ? 'justify-end' : ''
                    }`}>
                      <span className={`text-xs ${
                        msg.direction === 'outbound' ? 'text-green-100' : 'text-gray-400'
                      }`}>
                        {new Date(msg.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.direction === 'outbound' && (
                        <span className={`text-xs ${msg.status === 'read' ? 'text-blue-300' : 'text-green-100'}`}>
                          {msg.status === 'read' || msg.status === 'delivered' ? '✓✓' : '✓'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply input */}
          <div className="border-t p-3 flex gap-2">
            <Input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Escribe un mensaje..."
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
              disabled={sending}
            />
            <Button
              onClick={sendReply}
              disabled={!reply.trim() || sending}
              className="bg-green-600 hover:bg-green-700"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Conversation list view
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Conversaciones
          </CardTitle>
        </div>
        <div className="flex gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o telefono..."
              className="pl-9"
            />
          </div>
          <div className="flex gap-1">
            {(['all', 'open', 'escalated', 'closed'] as const).map(f => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(f)}
                className={filter === f ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                {f === 'all' ? 'Todos' : f === 'open' ? 'Abiertos' : f === 'escalated' ? 'Escalados' : 'Cerrados'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-green-500 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No hay conversaciones</p>
            <p className="text-sm text-gray-400 mt-1">
              Cuando tus clientes te escriban por WhatsApp, apareceran aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map(conv => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left"
              >
                <div className="relative">
                  <User className="h-10 w-10 text-gray-400 bg-gray-100 rounded-full p-2" />
                  {conv.unread_count > 0 && (
                    <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">
                      {conv.contact_name || conv.contact_phone}
                    </p>
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                      {conv.last_message_at
                        ? new Date(conv.last_message_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                        : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-gray-500 truncate">
                      {conv.last_message_preview || 'Sin mensajes'}
                    </p>
                    <Badge className={`text-xs ml-2 ${STATUS_BADGE[conv.status]?.className || ''}`}>
                      {conv.assigned_to === 'steve' ? 'Steve' : STATUS_BADGE[conv.status]?.label || conv.status}
                    </Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
