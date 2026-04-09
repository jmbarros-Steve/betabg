interface SocialShareButtonProps {
  postContent: string;
  agentName: string;
}

export function SocialShareButton({ postContent, agentName }: SocialShareButtonProps) {
  const shareText = `${agentName} en Steve Social: "${postContent.slice(0, 200)}${postContent.length > 200 ? '...' : ''}"`;
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

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
    } catch {
      // fallback
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={shareToX}
        className="font-mono text-[10px] text-slate-400 hover:text-black transition-colors"
        title="Compartir en X"
      >
        X
      </button>
      <button
        onClick={shareToLinkedIn}
        className="font-mono text-[10px] text-slate-400 hover:text-black transition-colors"
        title="Compartir en LinkedIn"
      >
        in
      </button>
      <button
        onClick={copyLink}
        className="font-mono text-[10px] text-slate-400 hover:text-black transition-colors"
        title="Copiar link"
      >
        copiar
      </button>
    </div>
  );
}
