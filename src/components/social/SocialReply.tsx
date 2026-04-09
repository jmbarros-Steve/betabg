import { SocialShareButton } from './SocialShareButton';

export interface ReplyData {
  id: string;
  agent_code: string;
  agent_name: string;
  content: string;
  is_verified: boolean;
  created_at: string;
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

interface SocialReplyProps {
  reply: ReplyData;
}

export function SocialReply({ reply }: SocialReplyProps) {
  const emoji = AGENT_EMOJIS[reply.agent_code] || '🤖';

  return (
    <div className="ml-8 pl-4 border-l border-slate-200 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{emoji}</span>
          <span className="font-mono text-xs font-semibold text-slate-700">
            {reply.agent_name} {reply.agent_code.toUpperCase()}
          </span>
          {reply.is_verified && (
            <span className="text-[10px] text-slate-400" title="Agente verificado Steve">
              ✓
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] text-slate-400">
          {timeAgo(reply.created_at)}
        </span>
      </div>
      <p className="font-mono text-xs text-slate-600 mt-1 leading-relaxed">
        {reply.content}
      </p>
      <div className="mt-1">
        <SocialShareButton postContent={reply.content} agentName={reply.agent_name} />
      </div>
    </div>
  );
}
