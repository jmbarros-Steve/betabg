import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_API = 'https://graph.facebook.com/v18.0';

type Action =
  | 'list_pages'
  | 'list_conversations'
  | 'get_messages'
  | 'list_post_comments'
  | 'list_ad_comments'
  | 'reply_message'
  | 'reply_comment';

interface RequestBody {
  action: Action;
  connection_id: string;
  page_id?: string;
  conversation_id?: string;
  comment_id?: string;
  ad_id?: string;
  message?: string;
  after?: string; // pagination cursor
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function metaGet(endpoint: string, token: string, params?: Record<string, string>) {
  const url = new URL(`${META_API}/${endpoint}`);
  url.searchParams.set('access_token', token);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) {
    console.error(`Meta GET /${endpoint} error:`, data);
    return { ok: false as const, error: data?.error?.message || 'Meta API error', data: null };
  }
  return { ok: true as const, error: null, data };
}

async function metaPost(endpoint: string, token: string, body: Record<string, string>) {
  const url = new URL(`${META_API}/${endpoint}`);
  url.searchParams.set('access_token', token);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`Meta POST /${endpoint} error:`, data);
    return { ok: false as const, error: data?.error?.message || 'Meta API error', data: null };
  }
  return { ok: true as const, error: null, data };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Action Handlers ────────────────────────────────────────────────────────

/** List all Facebook pages and Instagram accounts the user manages */
async function handleListPages(token: string) {
  // Get Facebook pages with Instagram business account
  const result = await metaGet('me/accounts', token, {
    fields: 'id,name,category,picture{url},access_token,instagram_business_account{id,name,username,profile_picture_url}',
    limit: '100',
  });

  if (!result.ok) return jsonResponse({ success: false, error: result.error }, 502);

  const pages = (result.data?.data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    category: p.category || null,
    picture_url: p.picture?.data?.url || null,
    page_access_token: p.access_token || null,
    instagram: p.instagram_business_account
      ? {
          id: p.instagram_business_account.id,
          name: p.instagram_business_account.name,
          username: p.instagram_business_account.username,
          profile_picture_url: p.instagram_business_account.profile_picture_url,
        }
      : null,
  }));

  return jsonResponse({ success: true, pages });
}

/** List Messenger and Instagram conversations for a page */
async function handleListConversations(
  token: string,
  body: RequestBody,
) {
  const { page_id, after } = body;
  if (!page_id) return jsonResponse({ success: false, error: 'page_id required' }, 400);

  // Fetch page access token first
  const pageTokenResult = await metaGet(page_id, token, {
    fields: 'access_token,instagram_business_account{id}',
  });
  if (!pageTokenResult.ok) return jsonResponse({ success: false, error: pageTokenResult.error }, 502);

  const pageToken = pageTokenResult.data?.access_token || token;
  const igAccountId = pageTokenResult.data?.instagram_business_account?.id;

  // Fetch Messenger conversations
  const messengerParams: Record<string, string> = {
    fields: 'id,participants{name,id,email},updated_time,message_count,unread_count,snippet',
    limit: '25',
  };
  if (after) messengerParams.after = after;

  const messengerResult = await metaGet(`${page_id}/conversations`, pageToken, messengerParams);

  const conversations: any[] = [];

  if (messengerResult.ok && messengerResult.data?.data) {
    for (const conv of messengerResult.data.data) {
      const participant = conv.participants?.data?.find((p: any) => p.id !== page_id) || {};
      conversations.push({
        id: conv.id,
        platform: 'messenger',
        type: 'messages',
        user_name: participant.name || 'Usuario',
        user_id: participant.id || '',
        snippet: conv.snippet || '',
        updated_time: conv.updated_time,
        unread_count: conv.unread_count || 0,
        message_count: conv.message_count || 0,
      });
    }
  }

  // Fetch Instagram conversations if available
  if (igAccountId) {
    const igParams: Record<string, string> = {
      fields: 'id,participants{username,id},updated_time,message_count,snippet',
      platform: 'instagram',
      limit: '25',
    };

    const igResult = await metaGet(`${igAccountId}/conversations`, pageToken, igParams);

    if (igResult.ok && igResult.data?.data) {
      for (const conv of igResult.data.data) {
        const participant = conv.participants?.data?.find((p: any) => p.id !== igAccountId) || {};
        conversations.push({
          id: conv.id,
          platform: 'instagram',
          type: 'messages',
          user_name: participant.username || participant.name || 'Usuario IG',
          user_id: participant.id || '',
          snippet: conv.snippet || '',
          updated_time: conv.updated_time,
          unread_count: 0,
          message_count: conv.message_count || 0,
        });
      }
    }
  }

  // Sort by updated_time descending
  conversations.sort((a, b) => new Date(b.updated_time).getTime() - new Date(a.updated_time).getTime());

  return jsonResponse({
    success: true,
    conversations,
    paging: messengerResult.data?.paging || null,
  });
}

/** Get messages for a specific conversation */
async function handleGetMessages(token: string, body: RequestBody) {
  const { page_id, conversation_id, after } = body;
  if (!page_id || !conversation_id) {
    return jsonResponse({ success: false, error: 'page_id and conversation_id required' }, 400);
  }

  // Get page access token
  const pageTokenResult = await metaGet(page_id, token, { fields: 'access_token' });
  const pageToken = pageTokenResult.ok ? pageTokenResult.data?.access_token || token : token;

  const params: Record<string, string> = {
    fields: 'id,message,from{name,id},created_time,attachments{mime_type,name,size,image_data}',
    limit: '50',
  };
  if (after) params.after = after;

  const result = await metaGet(`${conversation_id}/messages`, pageToken, params);

  if (!result.ok) return jsonResponse({ success: false, error: result.error }, 502);

  const messages = (result.data?.data || []).map((m: any) => ({
    id: m.id,
    message: m.message || '',
    from_name: m.from?.name || 'Usuario',
    from_id: m.from?.id || '',
    created_time: m.created_time,
    is_page: m.from?.id === page_id,
    attachments: m.attachments?.data || [],
  }));

  // Messages come newest first from API — reverse for chat display
  messages.reverse();

  return jsonResponse({
    success: true,
    messages,
    paging: result.data?.paging || null,
  });
}

/** List comments on page's recent posts */
async function handleListPostComments(token: string, body: RequestBody) {
  const { page_id, after } = body;
  if (!page_id) return jsonResponse({ success: false, error: 'page_id required' }, 400);

  // Get page access token
  const pageTokenResult = await metaGet(page_id, token, { fields: 'access_token' });
  const pageToken = pageTokenResult.ok ? pageTokenResult.data?.access_token || token : token;

  // Get recent posts with their comments
  const postsResult = await metaGet(`${page_id}/feed`, pageToken, {
    fields: 'id,message,created_time,comments{id,message,from{name,id,picture},created_time,comment_count,like_count}',
    limit: '15',
  });

  if (!postsResult.ok) return jsonResponse({ success: false, error: postsResult.error }, 502);

  const comments: any[] = [];

  for (const post of postsResult.data?.data || []) {
    for (const comment of post.comments?.data || []) {
      comments.push({
        id: comment.id,
        post_id: post.id,
        post_text: (post.message || '').slice(0, 100),
        platform: 'facebook',
        type: 'comments',
        user_name: comment.from?.name || 'Usuario',
        user_id: comment.from?.id || '',
        user_picture: comment.from?.picture?.data?.url || null,
        message: comment.message || '',
        created_time: comment.created_time,
        like_count: comment.like_count || 0,
        reply_count: comment.comment_count || 0,
      });
    }
  }

  // Sort newest first
  comments.sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime());

  return jsonResponse({ success: true, comments });
}

/** List comments on ads */
async function handleListAdComments(token: string, body: RequestBody) {
  const { page_id, ad_id } = body;
  if (!page_id) return jsonResponse({ success: false, error: 'page_id required' }, 400);

  // Get page access token
  const pageTokenResult = await metaGet(page_id, token, { fields: 'access_token' });
  const pageToken = pageTokenResult.ok ? pageTokenResult.data?.access_token || token : token;

  // If specific ad_id provided, get comments for that ad
  if (ad_id) {
    const result = await metaGet(`${ad_id}/comments`, pageToken, {
      fields: 'id,message,from{name,id,picture},created_time,like_count,comment_count',
      limit: '50',
    });

    if (!result.ok) return jsonResponse({ success: false, error: result.error }, 502);

    const comments = (result.data?.data || []).map((c: any) => ({
      id: c.id,
      ad_id,
      platform: 'facebook',
      type: 'ad_comments',
      user_name: c.from?.name || 'Usuario',
      user_id: c.from?.id || '',
      user_picture: c.from?.picture?.data?.url || null,
      message: c.message || '',
      created_time: c.created_time,
      like_count: c.like_count || 0,
      reply_count: c.comment_count || 0,
    }));

    return jsonResponse({ success: true, comments });
  }

  // Otherwise get promoted posts (ads) and their comments
  const promotedResult = await metaGet(`${page_id}/promotable_posts`, pageToken, {
    fields: 'id,message,created_time,is_published,comments{id,message,from{name,id},created_time,like_count}',
    limit: '10',
  });

  const comments: any[] = [];

  if (promotedResult.ok) {
    for (const post of promotedResult.data?.data || []) {
      for (const comment of post.comments?.data || []) {
        comments.push({
          id: comment.id,
          ad_id: post.id,
          ad_text: (post.message || '').slice(0, 100),
          platform: 'facebook',
          type: 'ad_comments',
          user_name: comment.from?.name || 'Usuario',
          user_id: comment.from?.id || '',
          message: comment.message || '',
          created_time: comment.created_time,
          like_count: comment.like_count || 0,
        });
      }
    }
  }

  comments.sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime());
  return jsonResponse({ success: true, comments });
}

/** Reply to a message in a conversation */
async function handleReplyMessage(token: string, body: RequestBody) {
  const { page_id, conversation_id, message } = body;
  if (!page_id || !conversation_id || !message) {
    return jsonResponse({ success: false, error: 'page_id, conversation_id, and message required' }, 400);
  }

  // Get page access token
  const pageTokenResult = await metaGet(page_id, token, { fields: 'access_token' });
  const pageToken = pageTokenResult.ok ? pageTokenResult.data?.access_token || token : token;

  const result = await metaPost(`${conversation_id}/messages`, pageToken, { message });

  if (!result.ok) return jsonResponse({ success: false, error: result.error }, 502);

  return jsonResponse({ success: true, message_id: result.data?.id });
}

/** Reply to a comment */
async function handleReplyComment(token: string, body: RequestBody) {
  const { page_id, comment_id, message } = body;
  if (!page_id || !comment_id || !message) {
    return jsonResponse({ success: false, error: 'page_id, comment_id, and message required' }, 400);
  }

  // Get page access token
  const pageTokenResult = await metaGet(page_id, token, { fields: 'access_token' });
  const pageToken = pageTokenResult.ok ? pageTokenResult.data?.access_token || token : token;

  const result = await metaPost(`${comment_id}/comments`, pageToken, { message });

  if (!result.ok) return jsonResponse({ success: false, error: result.error }, 502);

  return jsonResponse({ success: true, comment_id: result.data?.id });
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401);
    }

    const jwtToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwtToken);

    if (authError || !user) {
      return jsonResponse({ error: 'Invalid token' }, 401);
    }

    const body: RequestBody = await req.json();
    const { action, connection_id } = body;

    if (!action || !connection_id) {
      return jsonResponse({ error: 'action and connection_id required' }, 400);
    }

    console.log(`[meta-social-inbox] action=${action} connection=${connection_id}`);

    // Fetch connection and verify ownership
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`
        id, platform, access_token_encrypted, client_id,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .single();

    if (connError || !connection) {
      return jsonResponse({ error: 'Connection not found' }, 404);
    }

    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;
    if (!isOwner) {
      return jsonResponse({ error: 'Unauthorized' }, 403);
    }

    if (!connection.access_token_encrypted) {
      return jsonResponse({ error: 'Missing Meta access token' }, 400);
    }

    // Decrypt token
    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !decryptedToken) {
      console.error('Token decryption error:', decryptError);
      return jsonResponse({ error: 'Failed to decrypt token' }, 500);
    }

    // Route to action handler
    switch (action) {
      case 'list_pages':
        return await handleListPages(decryptedToken);
      case 'list_conversations':
        return await handleListConversations(decryptedToken, body);
      case 'get_messages':
        return await handleGetMessages(decryptedToken, body);
      case 'list_post_comments':
        return await handleListPostComments(decryptedToken, body);
      case 'list_ad_comments':
        return await handleListAdComments(decryptedToken, body);
      case 'reply_message':
        return await handleReplyMessage(decryptedToken, body);
      case 'reply_comment':
        return await handleReplyComment(decryptedToken, body);
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error('[meta-social-inbox] Unhandled error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
