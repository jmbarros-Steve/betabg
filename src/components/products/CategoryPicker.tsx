import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search, Check, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface CategoryResult {
  id: string;
  name: string;
  domain: string | null;
  path: string;
}

interface CategoryPickerProps {
  selected: { id: string; name: string; path: string } | null;
  onSelect: (category: { id: string; name: string; path: string }) => void;
  initialQuery?: string;
}

export function CategoryPicker({ selected, onSelect, initialQuery }: CategoryPickerProps) {
  const [query, setQuery] = useState(initialQuery || '');
  const [results, setResults] = useState<CategoryResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);

    const { data, error } = await supabase.functions.invoke('ml-search-categories', {
      body: { query: query.trim() },
    });

    if (!error && data?.categories) {
      setResults(data.categories);
    }
    setLoading(false);
  }

  async function selectCategory(cat: CategoryResult) {
    // Fetch full path if not available
    if (!cat.path) {
      const { data } = await supabase.functions.invoke('ml-search-categories', {
        body: { categoryId: cat.id },
      });
      if (data?.category) {
        onSelect({ id: cat.id, name: cat.name, path: data.category.path });
        return;
      }
    }
    onSelect({ id: cat.id, name: cat.name, path: cat.path });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Buscar categoría... ej: vestidos, zapatillas, electrónica"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button onClick={handleSearch} disabled={loading} size="sm">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>

      {selected && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
          <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-green-800">{selected.name}</p>
            {selected.path && <p className="text-xs text-green-600 truncate">{selected.path}</p>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelect(null as any)}
            className="ml-auto text-xs"
          >
            Cambiar
          </Button>
        </div>
      )}

      {!selected && results.length > 0 && (
        <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
          {results.map((cat) => (
            <button
              key={cat.id}
              onClick={() => selectCategory(cat)}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 transition-colors"
            >
              <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{cat.name}</p>
                {cat.domain && <p className="text-xs text-muted-foreground">{cat.domain}</p>}
                {cat.path && <p className="text-xs text-muted-foreground truncate">{cat.path}</p>}
              </div>
              <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">{cat.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
