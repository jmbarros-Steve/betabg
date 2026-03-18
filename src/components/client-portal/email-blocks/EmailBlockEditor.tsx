import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ChevronUp, ChevronDown, Copy, Trash2, X, Type, Image, MousePointerClick,
  Heading, Minus, Share2, MoveVertical, ShoppingBag, Ticket, Table2, Star,
  Play, Code2, Columns3, SquareDashedBottom, SplitSquareHorizontal, Layers,
  Eye, Monitor, Smartphone, MousePointer2, MailMinus,
} from 'lucide-react';
import { BLOCK_DEFINITIONS, createBlock, type EmailBlock, type BlockType, type BlockDefinition } from './blockTypes';
import { renderBlockToHtml } from './blockRenderer';
import BlockConfigPanel from './BlockConfigPanel';
import { useShopifyPreviewProducts, type ShopifyPreviewProduct } from '@/hooks/useShopifyPreviewProducts';

const ICON_MAP: Record<string, React.ReactNode> = {
  text: <Type className="w-5 h-5" />,
  image: <Image className="w-5 h-5" />,
  split: <SplitSquareHorizontal className="w-5 h-5" />,
  button: <MousePointerClick className="w-5 h-5" />,
  header_bar: <Heading className="w-5 h-5" />,
  drop_shadow: <Layers className="w-5 h-5" />,
  divider: <Minus className="w-5 h-5" />,
  social_links: <Share2 className="w-5 h-5" />,
  spacer: <MoveVertical className="w-5 h-5" />,
  product: <ShoppingBag className="w-5 h-5" />,
  coupon: <Ticket className="w-5 h-5" />,
  table: <Table2 className="w-5 h-5" />,
  review: <Star className="w-5 h-5" />,
  video: <Play className="w-5 h-5" />,
  html: <Code2 className="w-5 h-5" />,
  columns: <Columns3 className="w-5 h-5" />,
  section: <SquareDashedBottom className="w-5 h-5" />,
  footer: <MailMinus className="w-5 h-5" />,
  product_grid: <ShoppingBag className="w-5 h-5" />,
};

const ICON_MAP_SM: Record<string, React.ReactNode> = {
  text: <Type className="w-3.5 h-3.5" />,
  image: <Image className="w-3.5 h-3.5" />,
  split: <SplitSquareHorizontal className="w-3.5 h-3.5" />,
  button: <MousePointerClick className="w-3.5 h-3.5" />,
  header_bar: <Heading className="w-3.5 h-3.5" />,
  drop_shadow: <Layers className="w-3.5 h-3.5" />,
  divider: <Minus className="w-3.5 h-3.5" />,
  social_links: <Share2 className="w-3.5 h-3.5" />,
  spacer: <MoveVertical className="w-3.5 h-3.5" />,
  product: <ShoppingBag className="w-3.5 h-3.5" />,
  coupon: <Ticket className="w-3.5 h-3.5" />,
  table: <Table2 className="w-3.5 h-3.5" />,
  review: <Star className="w-3.5 h-3.5" />,
  video: <Play className="w-3.5 h-3.5" />,
  html: <Code2 className="w-3.5 h-3.5" />,
  columns: <Columns3 className="w-3.5 h-3.5" />,
  section: <SquareDashedBottom className="w-3.5 h-3.5" />,
  footer: <MailMinus className="w-3.5 h-3.5" />,
  product_grid: <ShoppingBag className="w-3.5 h-3.5" />,
};

interface EmailBlockEditorProps {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
  templateColors?: {
    primary: string; secondary: string; accent: string; button: string; buttonText: string; font: string;
  };
  assets?: { url: string; name: string }[];
  clientId?: string;
}

// Map alternative block type names to canonical ones
const TYPE_ALIASES: Record<string, BlockType> = {
  heading: 'text',
  header: 'header_bar',
  footer: 'html',
  social: 'social_links',
  separator: 'divider',
};

function normalizeBlockType(block: EmailBlock): EmailBlock {
  const canonical = TYPE_ALIASES[block.type];
  if (canonical) return { ...block, type: canonical };
  return block;
}

export default function EmailBlockEditor({ blocks: rawBlocks, onChange, templateColors, assets, clientId }: EmailBlockEditorProps) {
  // Fetch Shopify products for realistic preview
  const { products: previewProducts } = useShopifyPreviewProducts(clientId, 6);

  // Normalize block types on every render so alias types are always recognized
  const blocks = rawBlocks.map(normalizeBlockType);
  // Propagate normalized blocks back if any were changed
  const normalizedJson = JSON.stringify(blocks);
  const rawJson = JSON.stringify(rawBlocks);
  useEffect(() => {
    if (normalizedJson !== rawJson) onChange(blocks);
  }, [normalizedJson, rawJson]);

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [showPreview, setShowPreview] = useState(false);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  const selectedBlock = blocks.find(b => b.id === selectedBlockId) || null;

  // Auto-save indicator (parent handles actual save)
  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      // blocks changed - parent's onChange already called
    }, 10000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [blocks]);

  const addBlock = useCallback((type: BlockType) => {
    const newBlock = createBlock(type);
    onChange([...blocks, newBlock]);
    setSelectedBlockId(newBlock.id);
  }, [blocks, onChange]);

  const updateBlock = useCallback((id: string, newProps: Record<string, any>) => {
    onChange(blocks.map(b => b.id === id ? { ...b, props: newProps } : b));
  }, [blocks, onChange]);

  const removeBlock = useCallback((id: string) => {
    onChange(blocks.filter(b => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId(null);
  }, [blocks, onChange, selectedBlockId]);

  const duplicateBlock = useCallback((id: string) => {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx === -1) return;
    const clone: EmailBlock = { ...JSON.parse(JSON.stringify(blocks[idx])), id: crypto.randomUUID() };
    const newBlocks = [...blocks];
    newBlocks.splice(idx + 1, 0, clone);
    onChange(newBlocks);
    setSelectedBlockId(clone.id);
  }, [blocks, onChange]);

  const moveBlock = useCallback((id: string, direction: 'up' | 'down') => {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    const newBlocks = [...blocks];
    [newBlocks[idx], newBlocks[newIdx]] = [newBlocks[newIdx], newBlocks[idx]];
    onChange(newBlocks);
  }, [blocks, onChange]);

  const handleDragStart = (e: React.DragEvent, type: BlockType) => {
    e.dataTransfer.setData('blockType', type);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(null);
    const type = e.dataTransfer.getData('blockType') as BlockType;
    if (type) {
      const newBlock = createBlock(type);
      const newBlocks = [...blocks];
      newBlocks.splice(idx, 0, newBlock);
      onChange(newBlocks);
      setSelectedBlockId(newBlock.id);
    }
  };

  const handleDropEnd = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIdx(null);
    const type = e.dataTransfer.getData('blockType') as BlockType;
    if (type) {
      const newBlock = createBlock(type);
      onChange([...blocks, newBlock]);
      setSelectedBlockId(newBlock.id);
    }
  };

  const blockDefs = BLOCK_DEFINITIONS.filter(d => d.category === 'blocks');
  const designDefs = BLOCK_DEFINITIONS.filter(d => d.category === 'design');

  // Reusable function to replace ALL template variables with real Shopify data for preview
  const replaceKlaviyoVariables = useCallback((text: string): string => {
    if (!text || typeof text !== 'string') return text;
    let result = text;

    // Profile variables
    result = result.replace(/\{\{[\s]*person\.first_name\|default:['"](.*?)['"][\s]*\}\}/gi, '$1');
    result = result.replace(/\{\{[\s]*person\.first_name[\s]*\}\}/gi, 'María');
    result = result.replace(/\{\{[\s]*first_name[\s]*\}\}/gi, 'María');
    result = result.replace(/\{\{[\s]*email[\s]*\}\}/gi, 'maria@ejemplo.cl');
    result = result.replace(/\{\{[\s]*last_name[\s]*\}\}/gi, 'González');

    // Product variables — rotate through real products
    if (previewProducts.length > 0) {
      let idx = 0;
      const getProduct = () => previewProducts[idx++ % previewProducts.length];

      result = result.replace(/\{\{[\s]*item\.title\|safe[\s]*\}\}/gi, () => getProduct().title);
      idx = 0;
      result = result.replace(/\{\{[\s]*Title[\s]*\}\}/gi, () => getProduct().title);
      idx = 0;
      result = result.replace(/\{\{[\s]*item\.image[\s]*\}\}/gi, () => getProduct().image_url || '');
      idx = 0;
      result = result.replace(/\{\{[\s]*item\.price[^}]*\}\}/gi, () => `$${Number(getProduct().price || 0).toLocaleString('es-CL')}`);
      idx = 0;
      result = result.replace(/\{\{[\s]*item\.metadata\.__variant_price[^}]*\}\}/gi, () => `$${Number(getProduct().price || 0).toLocaleString('es-CL')}`);
      idx = 0;
      result = result.replace(/\{\{[\s]*item\.metadata\.__variant_compare_at_price[^}]*\}\}/gi, () => '');
      idx = 0;
      result = result.replace(/\{\{[\s]*Price[\s]*\}\}/gi, () => `$${Number(getProduct().price || 0).toLocaleString('es-CL')}`);
      idx = 0;
      result = result.replace(/\{\{[\s]*item\.url[\s]*\}\}/gi, () => `#`);
      idx = 0;
      result = result.replace(/\{\{[\s]*event\.extra\.title[\s]*\}\}/gi, () => getProduct().title);
      idx = 0;
      result = result.replace(/\{\{[\s]*event\.extra\.image_url[\s]*\}\}/gi, () => getProduct().image_url || '');
      idx = 0;
      result = result.replace(/\{\{[\s]*event\.extra\.price[\s]*\}\}/gi, () => `$${Number(getProduct().price || 0).toLocaleString('es-CL')}`);
      idx = 0;
      result = result.replace(/\{\{[\s]*event\.extra\.url[\s]*\}\}/gi, () => '#');
      idx = 0;
      result = result.replace(/\{\{[\s]*item\.product\.title[\s]*\}\}/gi, () => getProduct().title);
      idx = 0;
      result = result.replace(/\{\{[\s]*item\.product\.image[\s]*\}\}/gi, () => getProduct().image_url || '');
      idx = 0;
      result = result.replace(/\{\{[\s]*item\.product\.price[^}]*\}\}/gi, () => `$${Number(getProduct().price || 0).toLocaleString('es-CL')}`);
      idx = 0;
      result = result.replace(/\{\{[\s]*item\.product\.url[\s]*\}\}/gi, () => '#');
      idx = 0;
      result = result.replace(/\{\{[\s]*recommended_products\.\d+\.title[\s]*\}\}/gi, () => getProduct().title);
      idx = 0;
      result = result.replace(/\{\{[\s]*recommended_products\.\d+\.image[\s]*\}\}/gi, () => getProduct().image_url || '');
      idx = 0;
      result = result.replace(/\{\{[\s]*recommended_products\.\d+\.price[\s]*\}\}/gi, () => `$${Number(getProduct().price || 0).toLocaleString('es-CL')}`);
      idx = 0;
      result = result.replace(/\{\{[\s]*recommended_products\.\d+\.url[\s]*\}\}/gi, () => '#');
    }

    // Strip remaining template block tags
    result = result.replace(/\{%[^%]*%\}/g, '');

    return result;
  }, [previewProducts]);

  // Generate preview HTML for the modal
  const generatePreviewHtml = useCallback(() => {
    const html = blocks.map(b => renderBlockToHtml(b, templateColors)).join('');
    return replaceKlaviyoVariables(html);
  }, [blocks, templateColors, replaceKlaviyoVariables]);

  const fullHtml = blocks.map(b => renderBlockToHtml(b, templateColors)).join('');
  const canvasWidth = viewMode === 'mobile' ? 'max-w-[360px]' : 'max-w-[600px]';

  return (
    <>
      <div className="flex h-[calc(100vh-160px)] min-h-[600px] border-slate-200 border rounded-xl overflow-hidden bg-muted/30">
        {/* ═══ LEFT SIDEBAR — Block palette (200px fixed) ═══ */}
        <div className="w-[200px] min-w-[200px] border-r bg-background flex flex-col">
          <div className="px-3 py-2.5 border-b">
            <p className="text-sm font-medium text-foreground">Bloques</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {blockDefs.map(def => (
                <BlockPaletteItem key={def.type} def={def} onDragStart={handleDragStart} onAdd={addBlock} />
              ))}
              <div className="pt-2 pb-1">
                <p className="text-[10px] font-medium text-muted-foreground px-2">Diseño</p>
              </div>
              {designDefs.map(def => (
                <BlockPaletteItem key={def.type} def={def} onDragStart={handleDragStart} onAdd={addBlock} />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* ═══ CENTER — Canvas ═══ */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Canvas toolbar */}
          <div className="px-4 py-2 border-b bg-background flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-mono">
                {blocks.length} bloque{blocks.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant={viewMode === 'desktop' ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode('desktop')}
                title="Vista desktop"
              >
                <Monitor className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={viewMode === 'mobile' ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode('mobile')}
                title="Vista mobile"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </Button>
              <div className="w-px h-5 bg-border mx-1" />
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowPreview(true)}>
                <Eye className="w-3.5 h-3.5" />
                Preview
              </Button>
            </div>
          </div>

          {/* Canvas area */}
          <ScrollArea className="flex-1">
            <div
              className="p-6 min-h-full flex justify-center"
              onDragOver={e => { e.preventDefault(); if (blocks.length === 0) setDragOverIdx(0); }}
              onDrop={e => blocks.length === 0 ? handleDropEnd(e) : null}
            >
              <div className={`w-full ${canvasWidth} transition-all duration-300`}>
                {/* Email canvas "paper" */}
                <div className="bg-white rounded-lg shadow-lg border overflow-hidden">
                  {blocks.length === 0 ? (
                    <div
                      className="flex flex-col items-center justify-center py-24 text-muted-foreground border-2 border-dashed border-muted rounded-lg m-4"
                      onDragOver={e => e.preventDefault()}
                      onDrop={handleDropEnd}
                    >
                      <MousePointer2 className="w-8 h-8 mb-3 text-muted-foreground/50" />
                      <p className="text-sm font-medium">Arrastra bloques aquí</p>
                      <p className="text-xs mt-1 text-muted-foreground/70">O haz clic en un bloque del panel izquierdo</p>
                    </div>
                  ) : (
                    <div className="relative">
                      {blocks.map((block, idx) => (
                        <div key={block.id}>
                          {/* Drop zone */}
                          <div
                            className={`transition-all ${dragOverIdx === idx ? 'h-2 bg-primary/40' : 'h-0'}`}
                            onDragOver={e => handleDragOver(e, idx)}
                            onDrop={e => handleDrop(e, idx)}
                          />
                          <BlockCanvasItem
                            block={block}
                            blockIndex={blocks.slice(0, idx).filter(b => b.type === 'product').length}
                            isSelected={selectedBlockId === block.id}
                            onSelect={() => setSelectedBlockId(block.id)}
                            onRemove={() => removeBlock(block.id)}
                            onDuplicate={() => duplicateBlock(block.id)}
                            onMoveUp={() => moveBlock(block.id, 'up')}
                            onMoveDown={() => moveBlock(block.id, 'down')}
                            isFirst={idx === 0}
                            isLast={idx === blocks.length - 1}
                            templateColors={templateColors}
                            previewProducts={previewProducts}
                            replaceVars={replaceKlaviyoVariables}
                          />
                        </div>
                      ))}
                      {/* Final drop zone */}
                      <div
                        className={`transition-all ${dragOverIdx === blocks.length ? 'h-2 bg-primary/40' : 'h-1'}`}
                        onDragOver={e => handleDragOver(e, blocks.length)}
                        onDrop={e => handleDrop(e, blocks.length)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* ═══ RIGHT SIDEBAR — Config panel (350px fixed) ═══ */}
        <div className="w-[350px] min-w-[350px] border-l bg-background flex flex-col">
          <div className="px-4 py-2.5 border-b flex items-center justify-between">
            {selectedBlock ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{ICON_MAP_SM[selectedBlock.type]}</span>
                  <p className="text-sm font-bold text-foreground">
                    {BLOCK_DEFINITIONS.find(d => d.type === selectedBlock.type)?.label || selectedBlock.type}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedBlockId(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <p className="text-sm font-medium text-foreground">Configuración</p>
            )}
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4">
              {selectedBlock ? (
                <BlockConfigPanel
                  block={selectedBlock}
                  onChange={newProps => updateBlock(selectedBlock.id, newProps)}
                  assets={assets}
                  clientId={clientId}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <MousePointer2 className="w-10 h-10 mb-4 text-muted-foreground/30" />
                  <p className="text-sm font-medium">Selecciona un bloque</p>
                  <p className="text-xs mt-1 text-muted-foreground/70">Haz clic en un bloque del canvas para editarlo</p>
                </div>
              )}
            </div>
          </ScrollArea>
          {/* Actions at bottom when block selected */}
          {selectedBlock && (
            <div className="px-4 py-3 border-t flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 text-xs gap-1.5" onClick={() => duplicateBlock(selectedBlock.id)}>
                <Copy className="w-3.5 h-3.5" /> Duplicar
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs gap-1.5 text-destructive hover:text-destructive" onClick={() => removeBlock(selectedBlock.id)}>
                <Trash2 className="w-3.5 h-3.5" /> Eliminar
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Full preview dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" /> Preview del email
            </DialogTitle>
          </DialogHeader>
          {previewProducts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              ⚠️ Preview de ejemplo — Los datos de producto son de tu tienda Shopify. Klaviyo mostrará contenido personalizado al enviar.
            </div>
          )}
          <div className="border rounded-lg overflow-auto max-h-[70vh] bg-white">
            <div
              className="mx-auto"
              style={{ maxWidth: viewMode === 'mobile' ? 360 : 600 }}
              dangerouslySetInnerHTML={{ __html: generatePreviewHtml() }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============ Sub-components ============

function BlockPaletteItem({ def, onDragStart, onAdd }: {
  def: BlockDefinition;
  onDragStart: (e: React.DragEvent, type: BlockType) => void;
  onAdd: (type: BlockType) => void;
}) {
  return (
    <button
      draggable
      onDragStart={e => onDragStart(e, def.type)}
      onClick={() => onAdd(def.type)}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/80 cursor-grab active:cursor-grabbing transition-all text-left group border border-transparent hover:border-border"
      title={def.label}
    >
      <span className="text-muted-foreground group-hover:text-primary transition-colors">
        {ICON_MAP[def.icon] || <Code2 className="w-5 h-5" />}
      </span>
      <span className="text-xs text-muted-foreground group-hover:text-foreground font-medium">{def.label}</span>
    </button>
  );
}

function ProductBlockPreview({ block, previewProducts = [], blockIndex = 0 }: { block: EmailBlock; previewProducts?: ShopifyPreviewProduct[]; blockIndex?: number }) {
  const p = block.props;
  let mode = p.productMode || p._mode || 'fixed';

  // Detect if "fixed" block actually contains Klaviyo variables — treat as dynamic for preview
  const hasKlaviyoVars = (val?: string) => val && typeof val === 'string' && val.includes('{{');
  const isFixedWithVars = mode === 'fixed' && (hasKlaviyoVars(p.name) || hasKlaviyoVars(p.price) || hasKlaviyoVars(p.imageUrl));

  if (mode === 'dynamic' || isFixedWithVars) {
    const typeLabels: Record<string, string> = {
      catalog_feed: 'Feed del catálogo',
      last_viewed: 'Último producto visto',
      lastViewed: 'Último producto visto',
      cart_item: 'Carrito abandonado',
      abandonedCart: 'Carrito abandonado',
      recommended: 'Recomendados',
      collection_dynamic: 'Colección dinámica',
    };
    const count = isFixedWithVars ? 1 : (p.productsCount || 3);
    const isVertical = p.productLayout === 'vertical';
    const hasRealProducts = previewProducts.length > 0;
    const startIdx = isFixedWithVars ? blockIndex : 0;

    return (
      <div className={`${isFixedWithVars ? '' : 'bg-purple-50 border-2 border-dashed border-purple-300 rounded-lg p-4'}`}>
        {!isFixedWithVars && (
          <div className="text-center mb-3">
            <span className="text-2xl">🔄</span>
            <p className="font-bold text-purple-700">
              {typeLabels[p.dynamicType || p._dynamicType || ''] || 'Producto dinámico'}
              {hasRealProducts && <span className="text-xs font-normal text-purple-500"> — Preview con datos reales</span>}
            </p>
          </div>
        )}
        <div className={`flex gap-2 ${isVertical ? 'flex-col' : 'flex-row'}`}>
          {Array.from({ length: count }).map((_, i) => {
            const realProduct = previewProducts[(startIdx + i) % Math.max(previewProducts.length, 1)];
            if (!realProduct) {
              return (
                <div key={i} className="flex-1 bg-white border border-purple-200 rounded-lg p-3 text-center">
                  <div className="w-full h-16 bg-purple-100 rounded mb-2 flex items-center justify-center text-2xl">📦</div>
                  <p className="text-xs font-medium text-purple-600">Producto {i + 1}</p>
                  <p className="text-xs text-purple-400">Conecta Shopify para ver datos reales</p>
                </div>
              );
            }
            return (
              <div key={i} className={`flex-1 ${isFixedWithVars ? 'p-3 flex gap-3' : 'bg-white border border-purple-200 rounded-lg p-3 text-center'}`}>
                {p.showImage !== false && (
                  isFixedWithVars ? (
                    <img src={realProduct.image_url} alt={realProduct.title} className="w-24 h-24 object-cover rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    realProduct.image_url ? (
                      <img src={realProduct.image_url} alt={realProduct.title} className="w-full h-24 object-cover rounded mb-2" onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/200x200/e9d5ff/7c3aed?text=📦'; }} />
                    ) : (
                      <div className="w-full h-16 bg-purple-100 rounded mb-2 flex items-center justify-center text-2xl">📦</div>
                    )
                  )
                )}
                <div className={isFixedWithVars ? 'flex-1' : ''}>
                  <p className={`font-${isFixedWithVars ? 'bold' : 'medium'} text-${isFixedWithVars ? 'sm' : 'xs'} ${isFixedWithVars ? '' : 'text-purple-600'}`}>{realProduct.title}</p>
                  {p.showPrice !== false && (
                    <p className={`font-bold text-${isFixedWithVars ? 'blue-600' : 'xs text-purple-500'}`}>
                      ${Number(realProduct.price || 0).toLocaleString('es-CL')}
                    </p>
                  )}
                  {p.showButton !== false && (
                    <div className={`mt-${isFixedWithVars ? '2' : '1'} ${isFixedWithVars ? 'bg-black' : 'bg-purple-600'} text-white rounded px-${isFixedWithVars ? '4' : '2'} py-${isFixedWithVars ? '2' : '1'} text-${isFixedWithVars ? 'sm' : 'xs'} inline-block`}>{p.buttonText || 'Comprar ahora'}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {!isFixedWithVars && (
          <p className="text-xs text-purple-400 text-center mt-2">
            {hasRealProducts ? '⚠️ Preview de ejemplo — Steve mostrará productos personalizados al enviar' : 'Steve insertará productos reales al enviar'}
          </p>
        )}
      </div>
    );
  }

  if (mode === 'collection') {
    const count = p.productsCount || p.collectionCount || 3;
    const isVertical = p.productLayout === 'vertical';
    const hasRealProducts = previewProducts.length > 0;
    return (
      <div className="bg-green-50 border-2 border-dashed border-green-300 rounded-lg p-4">
        <div className="text-center mb-3">
          <span className="text-2xl">📁</span>
          <p className="font-bold text-green-700">
            {p.collectionName || 'Selecciona colección →'}
            {hasRealProducts && <span className="text-xs font-normal text-green-500"> — Preview con datos reales</span>}
          </p>
        </div>
        <div className={`flex gap-2 ${isVertical ? 'flex-col' : 'flex-row'}`}>
          {Array.from({ length: count }).map((_, i) => {
            const realProduct = previewProducts[i];
            return (
              <div key={i} className="flex-1 bg-white border border-green-200 rounded-lg p-3 text-center">
                {p.showImage !== false && (
                  realProduct?.image_url ? (
                    <img src={realProduct.image_url} alt={realProduct.title} className="w-full h-24 object-cover rounded mb-2" onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/200x200/dcfce7/16a34a?text=🛍️'; }} />
                  ) : (
                    <div className="w-full h-16 bg-green-100 rounded mb-2 flex items-center justify-center text-2xl">🛍️</div>
                  )
                )}
                <p className="text-xs font-medium text-green-600">{realProduct?.title || `Producto ${i + 1}`}</p>
                {p.showPrice !== false && realProduct && (
                  <p className="text-xs text-green-500 font-bold">${Number(realProduct.price || 0).toLocaleString('es-CL')}</p>
                )}
                {p.showButton !== false && (
                  <div className="mt-1 bg-green-600 text-white rounded px-2 py-1 text-xs inline-block">{p.buttonText || 'Ver'}</div>
                )}
              </div>
            );
          })}
        </div>
        {hasRealProducts && (
          <p className="text-xs text-green-400 text-center mt-2">⚠️ Preview de ejemplo — Se mostrarán productos de la colección "{p.collectionName}"</p>
        )}
      </div>
    );
  }

  // Fixed mode (no Klaviyo variables)
  return (
    <div className="p-3 flex gap-3">
      {p.showImage !== false && (
        p.imageUrl ? (
          <img src={p.imageUrl} alt="" className="w-24 h-24 object-cover rounded" />
        ) : (
          <div className="w-24 h-24 bg-gray-100 rounded flex items-center justify-center text-2xl">📦</div>
        )
      )}
      <div className="flex-1">
        <p className="font-bold">{p.name || 'Nombre del producto'}</p>
        <p className="text-blue-600 font-bold">{p.price || '$0'}</p>
        {p.showDescription !== false && p.description && (
          <p className="text-sm text-gray-500 mt-1">{p.description.substring(0, 80)}</p>
        )}
        {p.showButton !== false && (
          <div className="mt-2 bg-black text-white rounded px-4 py-2 text-sm inline-block">{p.buttonText || 'Comprar'}</div>
        )}
      </div>
    </div>
  );
}

function ColumnsBlockPreview({ block, templateColors, previewProducts = [], replaceVars }: { block: EmailBlock; templateColors?: any; previewProducts?: ShopifyPreviewProduct[]; replaceVars?: (html: string) => string }) {
  const cols = block.props.columns || [];
  return (
    <div className="p-2">
      <div className="flex gap-2">
        {cols.map((col: any, colIdx: number) => (
          <div key={colIdx} style={{ width: col.width || `${Math.floor(100 / cols.length)}%` }} className="border border-dashed border-gray-200 rounded p-2">
            {(col.blocks || []).map((innerBlock: EmailBlock, bIdx: number) => {
              if (innerBlock.type === 'product') {
                const hasKlaviyoVars = innerBlock.props.name?.includes('{{');
                const productForColumn = hasKlaviyoVars && previewProducts[colIdx] 
                  ? previewProducts[colIdx] 
                  : undefined;
                const enrichedBlock = productForColumn ? {
                  ...innerBlock,
                  props: {
                    ...innerBlock.props,
                    _mode: 'fixed',
                    name: productForColumn.title,
                    imageUrl: productForColumn.image_url,
                    price: `$${Number(productForColumn.price || 0).toLocaleString('es-CL')}`,
                  }
                } : innerBlock;
                return <div key={bIdx}><ProductBlockPreview block={enrichedBlock} previewProducts={previewProducts} /></div>;
              }
              const innerHtml = renderBlockToHtml(innerBlock, templateColors);
              return <div key={bIdx} dangerouslySetInnerHTML={{ __html: replaceVars ? replaceVars(innerHtml) : innerHtml }} />;
            })}
            {(!col.blocks || col.blocks.length === 0) && (
              <p className="text-xs text-gray-400 text-center py-4">Columna vacía</p>
            )}
          </div>
        ))}
      </div>
      {previewProducts.length > 0 && cols.some((c: any) => (c.blocks || []).some((b: any) => b.type === 'product' && b.props?.name?.includes('{{'))) && (
        <p className="text-xs text-amber-500 text-center mt-1">⚠️ Preview con datos reales de Shopify</p>
      )}
    </div>
  );
}

function BlockCanvasItem({ block, blockIndex = 0, isSelected, onSelect, onRemove, onDuplicate, onMoveUp, onMoveDown, isFirst, isLast, templateColors, previewProducts = [], replaceVars }: {
  block: EmailBlock;
  blockIndex?: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  templateColors?: any;
  previewProducts?: ShopifyPreviewProduct[];
  replaceVars?: (html: string) => string;
}) {
  const def = BLOCK_DEFINITIONS.find(d => d.type === block.type);
  const useCustomPreview = block.type === 'product' || (block.type === 'columns' && block.props.columns);
  const rawHtml = useCustomPreview ? '' : renderBlockToHtml(block, templateColors);
  const html = replaceVars ? replaceVars(rawHtml) : rawHtml;

  return (
    <div
      className={`relative group cursor-pointer transition-all ${
        isSelected
          ? 'ring-2 ring-primary ring-offset-1'
          : 'hover:ring-1 hover:ring-primary/30'
      }`}
      onClick={onSelect}
    >
      {/* Floating toolbar */}
      <div className={`absolute -top-1 right-1 flex items-center gap-0.5 bg-background border rounded-md shadow-md px-1 py-0.5 z-10 transition-opacity ${
        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}>
        <span className="text-[10px] px-1.5 text-muted-foreground flex items-center gap-1">
          {ICON_MAP_SM[def?.icon || '']} {def?.label}
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); onMoveUp(); }} disabled={isFirst}>
          <ChevronUp className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); onMoveDown(); }} disabled={isLast}>
          <ChevronDown className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); onDuplicate(); }}>
          <Copy className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={e => { e.stopPropagation(); onRemove(); }}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>

      {/* Block preview */}
      <div className="pointer-events-none overflow-hidden" style={{ fontSize: '13px' }}>
        {block.type === 'product' ? (
          <ProductBlockPreview block={block} previewProducts={previewProducts} blockIndex={blockIndex} />
        ) : block.type === 'columns' && block.props.columns ? (
          <ColumnsBlockPreview block={block} templateColors={templateColors} previewProducts={previewProducts} replaceVars={replaceVars} />
        ) : (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  );
}
