import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ChevronUp, ChevronDown, Copy, Trash2, X, Type, Image, MousePointerClick,
  Heading, Minus, Share2, MoveVertical, ShoppingBag, Ticket, Table2, Star,
  Play, Code2, Columns3, SquareDashedBottom, SplitSquareHorizontal, Layers,
  Eye, Monitor, Smartphone, MousePointer2,
} from 'lucide-react';
import { BLOCK_DEFINITIONS, createBlock, type EmailBlock, type BlockType, type BlockDefinition } from './blockTypes';
import { renderBlockToHtml } from './blockRenderer';
import BlockConfigPanel from './BlockConfigPanel';

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
  const fullHtml = blocks.map(b => renderBlockToHtml(b, templateColors)).join('');
  const canvasWidth = viewMode === 'mobile' ? 'max-w-[360px]' : 'max-w-[600px]';

  return (
    <>
      <div className="flex h-[calc(100vh-160px)] min-h-[600px] border rounded-xl overflow-hidden bg-muted/30">
        {/* ═══ LEFT SIDEBAR — Block palette (200px fixed) ═══ */}
        <div className="w-[200px] min-w-[200px] border-r bg-background flex flex-col">
          <div className="px-3 py-2.5 border-b">
            <p className="text-xs font-bold text-foreground tracking-wide uppercase">Bloques</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {blockDefs.map(def => (
                <BlockPaletteItem key={def.type} def={def} onDragStart={handleDragStart} onAdd={addBlock} />
              ))}
              <div className="pt-2 pb-1">
                <p className="text-[10px] font-bold text-muted-foreground tracking-wide uppercase px-2">Diseño</p>
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
                            isSelected={selectedBlockId === block.id}
                            onSelect={() => setSelectedBlockId(block.id)}
                            onRemove={() => removeBlock(block.id)}
                            onDuplicate={() => duplicateBlock(block.id)}
                            onMoveUp={() => moveBlock(block.id, 'up')}
                            onMoveDown={() => moveBlock(block.id, 'down')}
                            isFirst={idx === 0}
                            isLast={idx === blocks.length - 1}
                            templateColors={templateColors}
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
              <p className="text-xs font-bold text-foreground tracking-wide uppercase">Configuración</p>
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
          <div className="border rounded-lg overflow-auto max-h-[70vh] bg-white">
            <div
              className="mx-auto"
              style={{ maxWidth: viewMode === 'mobile' ? 360 : 600 }}
              dangerouslySetInnerHTML={{ __html: fullHtml }}
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

function BlockCanvasItem({ block, isSelected, onSelect, onRemove, onDuplicate, onMoveUp, onMoveDown, isFirst, isLast, templateColors }: {
  block: EmailBlock;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  templateColors?: any;
}) {
  const def = BLOCK_DEFINITIONS.find(d => d.type === block.type);
  const html = renderBlockToHtml(block, templateColors);

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
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
