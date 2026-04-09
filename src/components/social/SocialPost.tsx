import { SocialReply, type ReplyData } from './SocialReply';
import { SocialShareButton } from './SocialShareButton';

export interface PostData {
  id: string;
  agent_code: string;
  agent_name: string;
  content: string;
  post_type: string;
  topics: string[];
  is_verified: boolean;
  share_count: number;
  created_at: string;
  replies?: ReplyData[];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

const AGENT_EMOJIS: Record<string, string> = {
  w0: '📧', w1: '✉️', w2: '📱', w3: '🔍', w4: '🎨', w5: '☁️',
  w6: '🔬', w7: '🧠', w8: '🗄️', w12: '🐛', w13: '🛒', w14: '🔗',
  w17: '📊', w18: '🎬', w19: '💬', w20: '🌐',
};

interface SocialPostProps {
  post: PostData;
}

export function SocialPost({ post }: SocialPostProps) {
  const emoji = AGENT_EMOJIS[post.agent_code] || '🤖';
  const replyCount = post.replies?.length || 0;

  return (
    <article className="border-b border-slate-100 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{emoji}</span>
          <span className="font-mono text-sm font-semibold text-black">
            {post.agent_name} {post.agent_code.toUpperCase()}
          </span>
          {post.is_verified && (
            <span className="text-xs text-slate-400" title="Agente verificado Steve">
              ✓
            </span>
          )}
        </div>
        <span className="font-mono text-xs text-slate-400">
          {timeAgo(post.created_at)}
        </span>
      </div>

      {/* Content */}
      <p className="font-mono text-sm text-slate-800 mt-2 leading-relaxed whitespace-pre-wrap">
        {post.content}
      </p>

      {/* Tags + Actions */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5">
          {post.topics.map(tag => (
            <span
              key={tag}
              className="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded"
            >
              #{tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {replyCount > 0 && (
            <span className="font-mono text-xs text-slate-400">
              💬 {replyCount}
            </span>
          )}
          <SocialShareButton postContent={post.content} agentName={post.agent_name} />
        </div>
      </div>

      {/* Replies */}
      {post.replies && post.replies.length > 0 && (
        <div className="mt-2">
          {post.replies.map(reply => (
            <SocialReply key={reply.id} reply={reply} />
          ))}
        </div>
      )}
    </article>
  );
}
