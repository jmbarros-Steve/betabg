import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ChevronUp, ChevronDown, Copy, Trash2, X, Type, Image, MousePointerClick, Heading, CircleDot, Minus, Share2, MoveVertical, ShoppingBag, Ticket, Table2, Star, Play, Code2, Columns3, SquareDashedBottom, SplitSquareHorizontal, Layers } from 'lucide-react';
import { BLOCK_DEFINITIONS, createBlock, type EmailBlock, type BlockType, type BlockDefinition } from './blockTypes';
import { renderBlockToHtml } from './blockRenderer';
import BlockConfigPanel from './BlockConfigPanel';

const ICON_MAP: Record<string, React.ReactNode> = {
  text: <Type className="w-4 h-4" />,
  image: <Image className="w-4 h-4" />,
  split: <SplitSquareHorizontal className="w-4 h-4" />,
  button: <MousePointerClick className="w-4 h-4" />,
  header_bar: <Heading className="w-4 h-4" />,
  drop_shadow: <Layers className="w-4 h-4" />,
  divider: <Minus className="w-4 h-4" />,
  social_links: <Share2 className="w-4 h-4" />,
  spacer: <MoveVertical className="w-4 h-4" />,
  product: <ShoppingBag className="w-4 h-4" />,
  coupon: <Ticket className="w-4 h-4" />,
  table: <Table2 className="w-4 h-4" />,
  review: <Star className="w-4 h-4" />,
  video: <Play className="w-4 h-4" />,
  html: <Code2 className="w-4 h-4" />,
  columns: <Columns3 className="w-4 h-4" />,
  section: <SquareDashedBottom className="w-4 h-4" />,
};

interface EmailBlockEditorProps {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
  templateColors?: {
    primary: string; secondary: string; accent: string; button: string; buttonText: string; font: string;
  };
  assets?: { url: string; name: string }[];
}

export default function EmailBlockEditor({ blocks, onChange, templateColors, assets }: EmailBlockEditorProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const selectedBlock = blocks.find(b => b.id === selectedBlockId) || null;

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

  // Drag from sidebar
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

  const previewHtml = blocks.map(b => renderBlockToHtml(b, templateColors)).join('');

  return (
    <div className="grid grid-cols-12 gap-3 h-[calc(100vh-280px)] min-h-[700px]">
      {/* LEFT SIDEBAR — Block palette */}
      <div className="col-span-3 border rounded-lg overflow-hidden flex flex-col">
        <div className="p-2 border-b bg-muted/50">
          <p className="text-xs font-semibold text-muted-foreground">Bloques</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            <div className="grid grid-cols-3 gap-1">
              {blockDefs.map(def => (
                <BlockPaletteItem key={def.type} def={def} onDragStart={handleDragStart} onAdd={addBlock} />
              ))}
            </div>
            <p className="text-xs font-semibold text-muted-foreground mt-3 mb-1.5">Diseño</p>
            <div className="grid grid-cols-2 gap-1">
              {designDefs.map(def => (
                <BlockPaletteItem key={def.type} def={def} onDragStart={handleDragStart} onAdd={addBlock} />
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* CENTER — Canvas */}
      <div className="col-span-5 border rounded-lg overflow-hidden flex flex-col">
        <div className="p-2 border-b bg-muted/50 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">Contenido ({blocks.length} bloques)</p>
          <Badge variant="secondary" className="text-[10px]">Arrastra bloques aquí</Badge>
        </div>
        <ScrollArea className="flex-1">
          <div
            className="p-3 min-h-full"
            onDragOver={e => { e.preventDefault(); if (blocks.length === 0) setDragOverIdx(0); }}
            onDrop={e => blocks.length === 0 ? handleDropEnd(e) : null}
          >
            {blocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border-2 border-dashed rounded-lg"
                onDragOver={e => e.preventDefault()} onDrop={handleDropEnd}>
                <p className="text-sm">Arrastra bloques aquí para empezar</p>
                <p className="text-xs mt-1">O haz clic en un bloque del panel izquierdo</p>
              </div>
            ) : (
              blocks.map((block, idx) => (
                <div key={block.id}>
                  {/* Drop zone indicator */}
                  <div
                    className={`h-1 rounded transition-all ${dragOverIdx === idx ? 'bg-primary h-2' : ''}`}
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
              ))
            )}
            {blocks.length > 0 && (
              <div
                className={`h-4 rounded transition-all ${dragOverIdx === blocks.length ? 'bg-primary h-2' : ''}`}
                onDragOver={e => handleDragOver(e, blocks.length)}
                onDrop={e => handleDrop(e, blocks.length)}
              />
            )}
          </div>
        </ScrollArea>
      </div>

      {/* RIGHT — Config panel */}
      <div className="col-span-4 border rounded-lg overflow-hidden flex flex-col">
        <div className="p-2 border-b bg-muted/50 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">
            {selectedBlock ? `⚙️ ${BLOCK_DEFINITIONS.find(d => d.type === selectedBlock.type)?.label || selectedBlock.type}` : 'Configuración'}
          </p>
          {selectedBlock && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedBlockId(null)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3">
            {selectedBlock ? (
              <BlockConfigPanel
                block={selectedBlock}
                onChange={newProps => updateBlock(selectedBlock.id, newProps)}
                assets={assets}
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Selecciona un bloque para configurarlo</p>
                <p className="text-xs mt-1">O arrastra uno nuevo desde el panel izquierdo</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
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
      className="flex flex-col items-center gap-1 p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-muted/60 cursor-grab active:cursor-grabbing transition-all text-center group"
      title={def.label}
    >
      <span className="text-muted-foreground group-hover:text-foreground transition-colors">
        {ICON_MAP[def.icon] || <Code2 className="w-4 h-4" />}
      </span>
      <span className="text-[10px] text-muted-foreground group-hover:text-foreground leading-tight font-medium">{def.label}</span>
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
      className={`relative group rounded-lg border transition-all cursor-pointer mb-1 ${isSelected ? 'border-primary ring-1 ring-primary/30' : 'border-transparent hover:border-border'}`}
      onClick={onSelect}
    >
      {/* Block toolbar */}
      <div className={`absolute -top-0 right-0 flex items-center gap-0.5 bg-background border rounded-md shadow-sm p-0.5 z-10 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <span className="text-[10px] px-1 text-muted-foreground flex items-center gap-1">{ICON_MAP[def?.icon || ''] || null} {def?.label}</span>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={e => { e.stopPropagation(); onMoveUp(); }} disabled={isFirst}>
          <ChevronUp className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={e => { e.stopPropagation(); onMoveDown(); }} disabled={isLast}>
          <ChevronDown className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={e => { e.stopPropagation(); onDuplicate(); }}>
          <Copy className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={e => { e.stopPropagation(); onRemove(); }}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>

      {/* Block preview */}
      <div className="p-1 pointer-events-none overflow-hidden max-h-40" style={{ fontSize: '11px' }}>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
