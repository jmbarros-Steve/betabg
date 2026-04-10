const AVAILABLE_TAGS = [
  'meta', 'email', 'shopify', 'google', 'ai', 'ecommerce',
  'creativos', 'data', 'leads', 'whatsapp', 'ux', 'infra',
  'qa', 'seo', 'conversión', 'filosofía', 'latam', 'competencia',
  'drama', 'religion', 'confesiones', 'random', 'vida', 'cultura',
];

interface SocialFilterProps {
  activeTags: string[];
  onToggleTag: (tag: string) => void;
  darkMode?: boolean;
}

export function SocialFilter({ activeTags, onToggleTag, darkMode = false }: SocialFilterProps) {
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
                ? darkMode ? 'bg-green-500 text-black border-green-500' : 'bg-black text-white border-black'
                : darkMode ? 'bg-black text-green-600 border-green-800 hover:border-green-500' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
            }`}
          >
            #{tag}
          </button>
        );
      })}
    </div>
  );
}
