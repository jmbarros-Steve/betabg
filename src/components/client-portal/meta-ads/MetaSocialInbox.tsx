import { useState, useEffect, useCallback, useRef } from 'react';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MessageSquare,
  AtSign,
  MessageCircle,
  Send,
  Sparkles,
  Clock,
  Flag,
  CheckCircle2,
  Search,
  MailCheck,
  Timer,
  BarChart3,
  X,
  Loader2,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  Instagram,
  Facebook,
  Megaphone,
} from 'lucide-react';
import MetaScopeAlert from './MetaScopeAlert';
import { useMetaBusiness } from './MetaBusinessContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetaSocialInboxProps {
  clientId: string;
}

type InboxTab = 'all' | 'messages' | 'comments' | 'ad_comments';

interface PageInfo {
  id: string;
  name: string;
  category: string | null;
  picture_url: string | null;
  has_page_token: boolean;
  instagram: {
    id: string;
    name: string;
    username: string;
    profile_picture_url: string | null;
  } | null;
}

interface ConversationItem {
  id: string;
  platform: 'messenger' | 'instagram' | 'facebook';
  type: 'messages' | 'comments' | 'ad_comments';
  user_name: string;
  user_id: string;
  user_picture?: string | null;
  snippet?: string;
  message?: string;
  post_text?: string;
  ad_text?: string;
  updated_time?: string;
  created_time?: string;
  unread_count?: number;
  message_count?: number;
  like_count?: number;
  reply_count?: number;
}

interface MessageItem {
  id: string;
  message: string;
  from_name: string;
  from_id: string;
  created_time: string;
  is_page: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
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

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function MetaSocialInbox({ clientId }: MetaSocialInboxProps) {
  const { connectionId: ctxConnectionId, pageId: ctxPageId } = useMetaBusiness();

  // Connection state
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [noConnection, setNoConnection] = useState(false);

  // Pages
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [loadingPages, setLoadingPages] = useState(true);

  // Conversations
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [activeTab, setActiveTab] = useState<InboxTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Thread
  const [selectedConversation, setSelectedConversation] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // AI suggestions
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const handleAiSuggest = useCallback(async () => {
    if (!selectedConversation || messages.length === 0) return;
    setLoadingSuggestions(true);
    setAiSuggestions([]);
    try {
      const msgContext = messages.slice(-10).map((m) => ({
        role: m.is_page ? 'assistant' : 'user',
        content: m.text,
      }));
      const { data, error } = await callApi('ai/suggest-inbox-reply', {
        body: {
          client_id: clientId,
          messages: msgContext,
          platform: selectedConversation.platform || 'instagram',
        },
      });
      if (error) throw new Error(error);
      setAiSuggestions(data?.suggestions || []);
      if (!data?.suggestions?.length) toast.info('No se generaron sugerencias');
    } catch (err: any) {
      toast.error(err?.message || 'Error al generar sugerencias');
    } finally {
      setLoadingSuggestions(false);
    }
  }, [clientId, selectedConversation, messages]);

  // ─── Fetch connection ─────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      setLoadingPages(true);
      try {
        // Use connectionId from MetaBusinessContext
        if (!ctxConnectionId) {
          setNoConnection(true);
          return;
        }

        setConnectionId(ctxConnectionId);
        setNoConnection(false);

        // Fetch pages
        const { data, error } = await callApi('meta-social-inbox', {
          body: { connection_id: ctxConnectionId, action: 'list_pages' },
        });

        if (error) throw error;
        if (data?.pages) {
          setPages(data.pages);
          if (data.pages.length > 0) {
            // Prefer page from context (selected portfolio), fallback to first page
            const contextMatch = ctxPageId ? data.pages.find((p: PageInfo) => p.id === ctxPageId) : null;
            setSelectedPageId(contextMatch ? contextMatch.id : data.pages[0].id);
          }
        }
      } catch (err) {
        // Init error logged silently
        toast.error('Error cargando Social Inbox');
      } finally {
        setLoadingPages(false);
      }
    }
    init();
  }, [clientId, ctxConnectionId, ctxPageId])

  // ─── Fetch conversations when page changes ────────────────────────────────

  const fetchConversations = useCallback(async () => {
    if (!connectionId || !selectedPageId) return;
    setLoadingConversations(true);
    setConversations([]);
    setSelectedConversation(null);
    setMessages([]);

    try {
      // Fetch in parallel: conversations + post comments + ad comments
      const [convRes, commentsRes, adCommentsRes] = await Promise.allSettled([
        callApi('meta-social-inbox', {
          body: { action: 'list_conversations', connection_id: connectionId, page_id: selectedPageId },
        }),
        callApi('meta-social-inbox', {
          body: { action: 'list_post_comments', connection_id: connectionId, page_id: selectedPageId },
        }),
        callApi('meta-social-inbox', {
          body: { action: 'list_ad_comments', connection_id: connectionId, page_id: selectedPageId },
        }),
      ]);

      const allItems: ConversationItem[] = [];

      // Messenger + Instagram conversations
      if (convRes.status === 'fulfilled' && convRes.value.data?.success) {
        allItems.push(...(convRes.value.data.conversations || []));
      }

      // Post comments
      if (commentsRes.status === 'fulfilled' && commentsRes.value.data?.success) {
        allItems.push(...(commentsRes.value.data.comments || []));
      }

      // Ad comments
      if (adCommentsRes.status === 'fulfilled' && adCommentsRes.value.data?.success) {
        allItems.push(...(adCommentsRes.value.data.comments || []));
      }

      // Sort by most recent
      allItems.sort((a, b) => {
        const dateA = new Date(a.updated_time || a.created_time || 0).getTime();
        const dateB = new Date(b.updated_time || b.created_time || 0).getTime();
        return dateB - dateA;
      });

      setConversations(allItems);

      // Show warning if all 3 requests failed (likely scope issue)
      const allFailed = [convRes, commentsRes, adCommentsRes].every(
        r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.data?.success)
      );
      if (allFailed && allItems.length === 0) {
        toast.error('No se pudieron cargar conversaciones. Verifica que tu token tenga permisos de pages_messaging e instagram_manage_messages.');
      }
    } catch (err) {
      toast.error('Error cargando inbox. Verifica permisos de Meta.');
    } finally {
      setLoadingConversations(false);
    }
  }, [connectionId, selectedPageId]);

  useEffect(() => {
    if (selectedPageId) fetchConversations();
  }, [selectedPageId, fetchConversations]);

  // ─── Fetch messages for a conversation ─────────────────────────────────────

  const handleSelectConversation = useCallback(
    async (conv: ConversationItem) => {
      setSelectedConversation(conv);
      setMobileShowThread(true);
      setReplyText('');

      // Mark as read locally — clear the unread dot immediately
      if ((conv.unread_count || 0) > 0) {
        setConversations((prev) =>
          prev.map((c) => (c.id === conv.id ? { ...c, unread_count: 0 } : c)),
        );

        // Also fire a backend call to mark as read via Meta API (best-effort)
        if (conv.type === 'messages' && connectionId && selectedPageId) {
          callApi('meta-social-inbox', {
            body: {
              action: 'mark_read',
              connection_id: connectionId,
              page_id: selectedPageId,
              conversation_id: conv.id,
            },
          }).catch((err) => {
            console.warn('[MetaSocialInbox] mark_read failed:', err);
          });
        }
      }

      // Only fetch messages for message-type conversations
      if (conv.type === 'messages' && connectionId && selectedPageId) {
        setLoadingMessages(true);
        try {
          const { data, error } = await callApi('meta-social-inbox', {
            body: {
              action: 'get_messages',
              connection_id: connectionId,
              page_id: selectedPageId,
              conversation_id: conv.id,
            },
          });

          if (error || !data?.success) {
            // get_messages error handled via empty state
            setMessages([]);
          } else {
            setMessages(data.messages || []);
          }
        } catch {
          setMessages([]);
        } finally {
          setLoadingMessages(false);
        }
      } else {
        // For comments, show the original comment + load replies from API
        const originalComment: MessageItem = {
          id: conv.id,
          message: conv.message || conv.snippet || '',
          from_name: conv.user_name,
          from_id: conv.user_id,
          created_time: conv.created_time || conv.updated_time || new Date().toISOString(),
          is_page: false,
        };

        setMessages([originalComment]);
        setLoadingMessages(true);

        try {
          const { data, error } = await callApi('meta-social-inbox', {
            body: {
              action: 'get_comment_replies',
              connection_id: connectionId,
              page_id: selectedPageId,
              comment_id: conv.id,
              platform: conv.platform,
            },
          });

          if (!error && data?.success && data.replies?.length > 0) {
            setMessages([originalComment, ...data.replies]);
          }
        } catch {
          // If replies fail, just show the original comment
        } finally {
          setLoadingMessages(false);
        }
      }
    },
    [connectionId, selectedPageId],
  );

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Send reply ────────────────────────────────────────────────────────────

  const handleSendReply = useCallback(async () => {
    if (!replyText.trim() || !selectedConversation || !connectionId || !selectedPageId) return;
    setSending(true);

    try {
      const isMessage = selectedConversation.type === 'messages';
      const action = isMessage ? 'reply_message' : 'reply_comment';

      const { data, error } = await callApi('meta-social-inbox', {
        body: {
          action,
          connection_id: connectionId,
          page_id: selectedPageId,
          ...(isMessage
            ? { conversation_id: selectedConversation.id, message: replyText.trim() }
            : { comment_id: selectedConversation.id, message: replyText.trim(), platform: selectedConversation.platform }),
        },
      });

      if (error || !data?.success) {
        if (data?.error_code === 'WINDOW_EXPIRED') {
          toast.error('Han pasado más de 24h desde el último mensaje. Meta no permite responder fuera de esa ventana.');
        } else {
          toast.error(data?.error || 'Error al enviar respuesta');
        }
        return;
      }

      toast.success('Respuesta enviada');
      setReplyText('');

      // Add the reply to local messages
      setMessages((prev) => [
        ...prev,
        {
          id: data.message_id || data.comment_id || `local-${Date.now()}`,
          message: replyText.trim(),
          from_name: 'Tu marca',
          from_id: selectedPageId,
          created_time: new Date().toISOString(),
          is_page: true,
        },
      ]);
    } catch {
      toast.error('Error al enviar');
    } finally {
      setSending(false);
    }
  }, [replyText, selectedConversation, connectionId, selectedPageId]);

  // ─── Filtering ─────────────────────────────────────────────────────────────

  const filteredConversations = conversations.filter((c) => {
    if (activeTab !== 'all' && c.type !== activeTab) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const text = `${c.user_name} ${c.snippet || ''} ${c.message || ''}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const tabCounts = {
    all: conversations.length,
    messages: conversations.filter((c) => c.type === 'messages').length,
    comments: conversations.filter((c) => c.type === 'comments').length,
    ad_comments: conversations.filter((c) => c.type === 'ad_comments').length,
  };

  // ─── Stats ────────────────────────────────────────────────────────────────

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);

  // ─── Render ───────────────────────────────────────────────────────────────

  const selectedPage = pages.find((p) => p.id === selectedPageId);

  // Loading
  if (loadingPages) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-[400px] rounded-lg" />
      </div>
    );
  }

  // No connection
  if (noConnection) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="text-base font-semibold mb-1">Sin conexión Meta Ads</h3>
          <p className="text-muted-foreground text-sm">
            Conecta tu cuenta de Meta Ads desde la pestaña <strong>Conexiones</strong>.
          </p>
        </CardContent>
      </Card>
    );
  }

  // No pages
  if (pages.length === 0) {
    return (
      <div className="space-y-4">
        <MetaScopeAlert clientId={clientId} requiredFeature="pages" compact />
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold mb-1">Sin páginas de Facebook</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              No se encontraron páginas de Facebook asociadas a tu cuenta. Verifica que tu token
              de Meta tenga los permisos <strong>pages_read_engagement</strong> y{' '}
              <strong>pages_manage_ads</strong>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Scope alert */}
      <MetaScopeAlert clientId={clientId} requiredFeature="pages" compact />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Bandeja Social</h2>
          <p className="text-muted-foreground text-sm">
            Gestiona mensajes, comentarios y menciones en tiempo real
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Page selector */}
          {pages.length > 1 && (
            <Select value={selectedPageId || ''} onValueChange={setSelectedPageId}>
              <SelectTrigger className="w-[220px] h-9 text-xs">
                <SelectValue placeholder="Selecciona página..." />
              </SelectTrigger>
              <SelectContent>
                {pages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="font-medium">{p.name}</span>
                    {p.instagram && (
                      <span className="text-muted-foreground ml-1">(@{p.instagram.username})</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchConversations}
            disabled={loadingConversations}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loadingConversations ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="relative overflow-hidden">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total
                </p>
                <p className="text-xl font-bold mt-0.5">{conversations.length}</p>
              </div>
              <div className="p-2 rounded-md bg-[#1E3A7B]/10">
                <MessageSquare className="w-4 h-4 text-[#2A4F9E]" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#F0F4FA]0/40 to-[#F0F4FA]0/10" />
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Sin Leer
                </p>
                <p className="text-xl font-bold mt-0.5 text-orange-600">{totalUnread}</p>
              </div>
              <div className="p-2 rounded-md bg-orange-500/10">
                <MailCheck className="w-4 h-4 text-orange-500" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500/40 to-orange-500/10" />
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Mensajes
                </p>
                <p className="text-xl font-bold mt-0.5">{tabCounts.messages}</p>
              </div>
              <div className="p-2 rounded-md bg-purple-500/10">
                <MessageCircle className="w-4 h-4 text-purple-500" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500/40 to-purple-500/10" />
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Comentarios
                </p>
                <p className="text-xl font-bold mt-0.5">{tabCounts.comments + tabCounts.ad_comments}</p>
              </div>
              <div className="p-2 rounded-md bg-green-500/10">
                <AtSign className="w-4 h-4 text-green-500" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-green-500/40 to-green-500/10" />
          </CardContent>
        </Card>
      </div>

      {/* Page info bar */}
      {selectedPage && (
        <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50 bg-muted/30">
          <Facebook className="w-4 h-4 text-[#1E3A7B] shrink-0" />
          <span className="text-sm font-medium">{selectedPage.name}</span>
          {selectedPage.instagram && (
            <>
              <span className="text-muted-foreground">|</span>
              <Instagram className="w-4 h-4 text-pink-600 shrink-0" />
              <span className="text-sm text-muted-foreground">@{selectedPage.instagram.username}</span>
            </>
          )}
        </div>
      )}

      {/* Main Layout */}
      <Card className="overflow-hidden border">
        <div className="flex h-[calc(100vh-420px)] min-h-[450px]">
          {/* ─── LEFT: Conversation List ──────────────────────────────────── */}
          <div
            className={`
              w-full lg:w-[340px] shrink-0 border-r border-border flex flex-col bg-background
              ${mobileShowThread ? 'hidden lg:flex' : 'flex'}
            `}
          >
            {/* Tabs */}
            <div className="flex border-b border-border shrink-0">
              {(
                [
                  { key: 'all', label: 'Todo', count: tabCounts.all },
                  { key: 'messages', label: 'Mensajes', count: tabCounts.messages },
                  { key: 'comments', label: 'Posts', count: tabCounts.comments },
                  { key: 'ad_comments', label: 'Ads', count: tabCounts.ad_comments },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`
                    flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium
                    transition-colors border-b-2 -mb-px
                    ${
                      activeTab === tab.key
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }
                  `}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className="ml-1 text-[10px] px-1.5 rounded-full bg-muted">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="p-2.5 border-b border-border/50 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar..."
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

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loadingConversations ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                  ))}
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <MessageSquare className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground text-center max-w-[260px]">
                    {searchQuery
                      ? 'Sin resultados para tu búsqueda.'
                      : 'Aún no hay mensajes. Las conversaciones aparecerán aquí cuando tus clientes interactúen con tus anuncios o página.'}
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isActive = selectedConversation?.id === conv.id;
                  const displayText = conv.snippet || conv.message || '';
                  const displayDate = conv.updated_time || conv.created_time || '';
                  const isUnread = (conv.unread_count || 0) > 0;

                  return (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv)}
                      className={`
                        w-full text-left p-3 border-b border-border/50 transition-colors
                        hover:bg-muted/60 focus:outline-none
                        ${isActive ? 'bg-primary/5 border-l-2 border-l-primary' : ''}
                        ${isUnread ? 'bg-muted/30' : ''}
                      `}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="relative shrink-0">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                              {getInitials(conv.user_name)}
                            </AvatarFallback>
                          </Avatar>
                          {isUnread && (
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#2A4F9E] rounded-full border-2 border-background" aria-label="No leído" role="status" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1.5 mb-0.5">
                            <span
                              className={`text-sm truncate ${
                                isUnread ? 'font-semibold' : 'font-medium text-foreground/80'
                              }`}
                            >
                              {conv.user_name}
                            </span>
                            {displayDate && (
                              <span className="text-[11px] text-muted-foreground shrink-0">
                                {timeAgo(displayDate)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
                            {displayText}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="secondary"
                              className={`text-[10px] px-1.5 py-0 h-[18px] ${
                                conv.platform === 'instagram'
                                  ? 'bg-pink-500/10 text-pink-600 border-pink-500/20'
                                  : 'bg-[#1E3A7B]/10 text-[#1E3A7B] border-[#2A4F9E]/20'
                              }`}
                            >
                              {conv.platform === 'instagram' ? 'IG' : 'FB'}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-[18px]">
                              {conv.type === 'messages'
                                ? 'DM'
                                : conv.type === 'ad_comments'
                                  ? 'Anuncio'
                                  : 'Post'}
                            </Badge>
                            {(conv.like_count || 0) > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {conv.like_count} me gusta
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-border/50 text-[11px] text-muted-foreground text-center shrink-0">
              {filteredConversations.length} interacción
              {filteredConversations.length !== 1 ? 'es' : ''}
            </div>
          </div>

          {/* ─── RIGHT: Thread View ──────────────────────────────────────── */}
          <div
            className={`
              flex-1 flex flex-col min-w-0
              ${!mobileShowThread ? 'hidden lg:flex' : 'flex'}
            `}
          >
            {selectedConversation ? (
              <>
                {/* Thread header */}
                <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0 bg-background/50">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 lg:hidden shrink-0"
                    aria-label="Volver a conversaciones"
                    onClick={() => {
                      setMobileShowThread(false);
                      setSelectedConversation(null);
                    }}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                      {getInitials(selectedConversation.user_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">
                        {selectedConversation.user_name}
                      </span>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 h-[18px] ${
                          selectedConversation.platform === 'instagram'
                            ? 'bg-pink-500/10 text-pink-600'
                            : 'bg-[#1E3A7B]/10 text-[#1E3A7B]'
                        }`}
                      >
                        {selectedConversation.platform === 'instagram' ? 'Instagram' : 'Facebook'}
                      </Badge>
                    </div>
                    {selectedConversation.post_text && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        En: {selectedConversation.post_text}
                      </p>
                    )}
                    {selectedConversation.ad_text && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        Ad: {selectedConversation.ad_text}
                      </p>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Sin mensajes
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex items-end gap-2 ${
                          msg.is_page ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {!msg.is_page && (
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="text-[10px] font-medium bg-muted">
                              {getInitials(msg.from_name)}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div
                          className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                            msg.is_page
                              ? 'bg-primary text-primary-foreground rounded-br-md'
                              : 'bg-muted rounded-bl-md'
                          }`}
                        >
                          <p className="text-sm leading-relaxed">{msg.message}</p>
                          <p
                            className={`text-[10px] mt-1 ${
                              msg.is_page
                                ? 'text-primary-foreground/70'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {new Date(msg.created_time).toLocaleTimeString('es-CL', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        {msg.is_page && (
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="text-[10px] font-medium bg-primary/10 text-primary">
                              TM
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* AI Suggestions */}
                {aiSuggestions.length > 0 && (
                  <div className="px-4 py-2 border-t border-border shrink-0 space-y-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Sugerencias IA
                    </p>
                    {aiSuggestions.map((s, i) => (
                      <button
                        key={i}
                        className="block w-full text-left text-xs p-2 rounded border border-border hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          setReplyText(s);
                          setAiSuggestions([]);
                        }}
                      >
                        {s}
                      </button>
                    ))}
                    <button
                      className="text-[10px] text-muted-foreground hover:underline"
                      onClick={() => setAiSuggestions([])}
                    >
                      Cerrar sugerencias
                    </button>
                  </div>
                )}

                {/* Reply */}
                <div className="px-4 py-3 border-t border-border shrink-0 space-y-2">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    placeholder="Escribe tu respuesta... (Ctrl+Enter para enviar)"
                    className="min-h-[60px] max-h-[120px] resize-none text-sm"
                    rows={2}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAiSuggest}
                      disabled={loadingSuggestions || messages.length === 0}
                      className="gap-1.5"
                    >
                      {loadingSuggestions ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      {loadingSuggestions ? 'Pensando...' : 'Sugerir con IA'}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || sending}
                      className="gap-1.5"
                    >
                      {sending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      {sending ? 'Enviando...' : 'Enviar'}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <MessageSquare className="w-16 h-16 text-muted-foreground/20 mb-4" />
                <p className="text-lg font-medium mb-1">Selecciona una conversación</p>
                <p className="text-sm text-muted-foreground/70">
                  Elige una interacción de la lista para ver los detalles
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
