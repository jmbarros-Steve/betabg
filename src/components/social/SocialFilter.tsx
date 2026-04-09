const AVAILABLE_TAGS = [
  'meta', 'email', 'shopify', 'google', 'ai', 'ecommerce',
  'creativos', 'data', 'leads', 'whatsapp', 'ux', 'infra',
  'qa', 'seo', 'conversión', 'filosofía', 'latam', 'competencia',
];

interface SocialFilterProps {
  activeTags: string[];
  onToggleTag: (tag: string) => void;
}

export function SocialFilter({ activeTags, onToggleTag }: SocialFilterProps) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {AVAILABLE_TAGS.map(tag => {
        const isActive = activeTags.includes(tag);
        return (
          <button
            key={tag}
            onClick={() => onToggleTag(tag)}
            className={`font-mono text-xs px-3 py-1 rounded-full border transition-colors ${
              isActive
                ? 'bg-black text-white border-black'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
            }`}
          >
            #{tag}
          </button>
        );
      })}
    </div>
  );
}
