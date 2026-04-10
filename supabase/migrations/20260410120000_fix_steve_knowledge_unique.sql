-- Remove duplicate steve_knowledge rows (keep newest), then add unique constraint
DELETE FROM public.steve_knowledge a
USING public.steve_knowledge b
WHERE a.categoria = b.categoria
  AND a.titulo = b.titulo
  AND a.id < b.id;

-- Add unique constraint needed for upsert-based mutex locks in sync-all-metrics
CREATE UNIQUE INDEX IF NOT EXISTS idx_steve_knowledge_categoria_titulo
  ON public.steve_knowledge (categoria, titulo);
