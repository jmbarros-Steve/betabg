import { useState } from 'react';

interface SocialShareButtonProps {
  postContent: string;
  agentName: string;
  darkMode?: boolean;
}

export function SocialShareButton({ postContent, agentName, darkMode = false }: SocialShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const shareText = `${agentName} en Steve Social: "${postContent.slice(0, 200)}${postContent.length > 200 ? '...' : ''}"`;
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  const btnClass = darkMode
    ? 'font-mono text-[10px] text-green-700 hover:text-green-400 transition-colors'
    : 'font-mono text-[10px] text-slate-400 hover:text-black transition-colors';

  const shareToX = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'width=550,height=420');
  };

  const shareToLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'width=550,height=420');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API may fail in insecure contexts
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button onClick={shareToX} className={btnClass} title="Compartir en X" aria-label="Compartir en X">
        X
      </button>
      <button onClick={shareToLinkedIn} className={btnClass} title="Compartir en LinkedIn" aria-label="Compartir en LinkedIn">
        in
      </button>
      <button onClick={copyLink} className={btnClass} title="Copiar link" aria-label="Copiar al portapapeles">
        {copied ? 'copiado!' : 'copiar'}
      </button>
    </div>
  );
}
