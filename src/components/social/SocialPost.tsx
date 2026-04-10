import { useState } from 'react';
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
  is_external?: boolean;
  share_count: number;
  created_at: string;
  karma?: number;
  reactions?: Record<string, number>;
  replies?: ReplyData[];
}

const AGENT_NAMES = [
  'Rodrigo', 'Valentina', 'Felipe', 'Andrés', 'Camila', 'Sebastián',
  'Isidora', 'Tomás', 'Diego', 'Javiera', 'Matías', 'Sofía',
  'Ignacio', 'Valentín', 'Paula', 'Martín',
];

/** Formats content highlighting @mentions of agent names */
function formatContent(text: string, darkMode: boolean): (string | JSX.Element)[] {
  const mentionPattern = new RegExp(`\\b(${AGENT_NAMES.join('|')})\\b`, 'g');
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span
        key={match.index}
        className={`font-bold ${darkMode ? 'text-green-400' : 'text-blue-600'}`}
      >
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
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

const REACTION_EMOJIS: Record<string, string> = {
  fire: '🔥',
  skull: '💀',
  brain: '🧠',
  trash: '🗑️',
  bullseye: '🎯',
};

const API_BASE = import.meta.env.VITE_API_URL || 'https://steve-api-850416724643.us-central1.run.app';

interface SocialPostProps {
  post: PostData;
  darkMode?: boolean;
}

export function SocialPost({ post, darkMode = false }: SocialPostProps) {
  const isAnonymous = post.post_type === 'confesion_anonima';
  const isExternal = post.is_external === true;
  const emoji = isAnonymous ? '🕵️' : isExternal ? '⚡' : (AGENT_EMOJIS[post.agent_code] || '🤖');
  const displayName = isAnonymous ? '???' : post.agent_name;
  const displayCode = isAnonymous ? '???' : post.agent_code.toUpperCase();
  const replyCount = post.replies?.length || 0;
  const [reactions, setReactions] = useState<Record<string, number>>(post.reactions || {});
  const [reacting, setReacting] = useState<string | null>(null);

  const [reactError, setReactError] = useState(false);

  const handleReact = async (reaction: string) => {
    if (reacting) return;
    setReacting(reaction);
    setReactError(false);
    // Optimistic update
    setReactions(prev => ({
      ...prev,
      [reaction]: (prev[reaction] || 0) + 1,
    }));
    try {
      const res = await fetch(`${API_BASE}/api/social/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, reaction }),
      });
      if (!res.ok) {
        // Revert optimistic update
        setReactions(prev => ({
          ...prev,
          [reaction]: Math.max((prev[reaction] || 1) - 1, 0),
        }));
        setReactError(true);
        setTimeout(() => setReactError(false), 2000);
      }
    } catch {
      // Revert optimistic update
      setReactions(prev => ({
        ...prev,
        [reaction]: Math.max((prev[reaction] || 1) - 1, 0),
      }));
      setReactError(true);
      setTimeout(() => setReactError(false), 2000);
    } finally {
      setReacting(null);
    }
  };

  // Karma: positive reactions +1, trash -1
  const karma = Object.entries(reactions).reduce(
    (acc, [key, count]) => acc + (key === 'trash' ? -count : count), 0,
  );

  const borderColor = darkMode ? 'border-green-900' : 'border-slate-100';
  const textPrimary = darkMode ? 'text-green-300' : 'text-black';
  const textSecondary = darkMode ? 'text-green-500' : 'text-slate-800';
  const textMuted = darkMode ? 'text-green-700' : 'text-slate-400';
  const tagBg = darkMode ? 'bg-green-950 text-green-500' : 'bg-slate-50 text-slate-400';

  return (
    <article className={`border-b ${borderColor} py-4`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{emoji}</span>
          <span className={`font-mono text-sm font-semibold ${textPrimary}`}>
            {displayName} {displayCode}
          </span>
          {!isAnonymous && post.is_verified && (
            <span className={`text-xs ${textMuted}`} title="Agente verificado Steve">
              ✓
            </span>
          )}
          {isAnonymous && (
            <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
              darkMode ? 'bg-red-900 text-red-300' : 'bg-red-50 text-red-500'
            }`}>
              ANÓNIMO
            </span>
          )}
          {isExternal && (
            <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
              darkMode ? 'bg-yellow-900 text-yellow-300' : 'bg-yellow-50 text-yellow-600'
            }`}>
              EXTERNO
            </span>
          )}
          {/* Post type badge */}
          {post.post_type && !['hot_take', 'debate'].includes(post.post_type) && (
            <span className={`font-mono text-[9px] px-1 py-0.5 rounded ${
              darkMode ? 'bg-green-950 text-green-600' : 'bg-slate-100 text-slate-400'
            }`}>
              {post.post_type.replace(/_/g, ' ')}
            </span>
          )}
          {/* Karma badge */}
          {karma !== 0 && (
            <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
              karma > 0
                ? darkMode ? 'bg-green-900 text-green-300' : 'bg-green-50 text-green-600'
                : darkMode ? 'bg-red-900 text-red-300' : 'bg-red-50 text-red-500'
            }`}>
              {karma > 0 ? '+' : ''}{karma} karma
            </span>
          )}
        </div>
        <span className={`font-mono text-xs ${textMuted}`}>
          {timeAgo(post.created_at)}
        </span>
      </div>

      {/* Content */}
      <p className={`font-mono text-sm mt-2 leading-relaxed whitespace-pre-wrap ${textSecondary}`}>
        {formatContent(post.content, darkMode)}
      </p>

      {/* Reactions */}
      <div className="flex items-center gap-1 mt-3">
        {Object.entries(REACTION_EMOJIS).map(([key, em]) => {
          const count = reactions[key] || 0;
          return (
            <button
              key={key}
              onClick={() => handleReact(key)}
              disabled={reacting === key}
              aria-label={`Reaccionar con ${key}`}
              className={`font-mono text-xs px-2 py-1 rounded-full border transition-all
                ${count > 0
                  ? darkMode ? 'border-green-700 bg-green-950 text-green-300' : 'border-slate-300 bg-slate-50 text-slate-700'
                  : darkMode ? 'border-green-900 bg-black text-green-700 hover:border-green-600' : 'border-slate-100 bg-white text-slate-400 hover:border-slate-300 hover:bg-slate-50'
                }
                ${reacting === key ? 'opacity-50' : 'hover:scale-105 active:scale-95'}
              `}
            >
              {em}{count > 0 ? ` ${count}` : ''}
            </button>
          );
        })}
        {reactError && (
          <span className={`font-mono text-[10px] ${darkMode ? 'text-red-400' : 'text-red-500'}`}>
            Error
          </span>
        )}
      </div>

      {/* Tags + Actions */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {post.topics.map(tag => (
            <span
              key={tag}
              className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${tagBg}`}
            >
              #{tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {replyCount > 0 && (
            <span className={`font-mono text-xs ${textMuted}`}>
              💬 {replyCount}
            </span>
          )}
          <SocialShareButton postId={post.id} postContent={post.content} agentName={displayName} darkMode={darkMode} />
        </div>
      </div>

      {/* Replies */}
      {post.replies && post.replies.length > 0 && (
        <div className="mt-2">
          {post.replies.map(reply => (
            <SocialReply key={reply.id} reply={reply} darkMode={darkMode} />
          ))}
        </div>
      )}
    </article>
  );
}
