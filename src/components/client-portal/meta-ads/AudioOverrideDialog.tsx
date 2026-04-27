import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Music } from 'lucide-react';
import { useState, useEffect } from 'react';

interface VoiceInfo {
  source: 'xtts_cloned' | 'preset' | 'none' | string;
  preset_key?: string | null;
}

interface MusicInfo {
  moods?: string[];
}

interface AudioOverrideDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (opts: { useVoice: boolean; useMusic: boolean; rememberSession: boolean }) => void;
  voice: VoiceInfo | null;
  music: MusicInfo | null;
  defaultUseVoice: boolean;
  defaultUseMusic: boolean;
}

export function AudioOverrideDialog({
  open,
  onClose,
  onConfirm,
  voice,
  music,
  defaultUseVoice,
  defaultUseMusic,
}: AudioOverrideDialogProps) {
  const [useVoice, setUseVoice] = useState(defaultUseVoice);
  const [useMusic, setUseMusic] = useState(defaultUseMusic);
  const [rememberSession, setRememberSession] = useState(false);

  useEffect(() => {
    if (open) {
      setUseVoice(defaultUseVoice);
      setUseMusic(defaultUseMusic);
      setRememberSession(false);
    }
  }, [open, defaultUseVoice, defaultUseMusic]);

  const voiceConfigured = Boolean(voice && voice.source !== 'none');
  const musicConfigured = Boolean(music?.moods && music.moods.length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="w-5 h-5 text-primary" /> Audio para este video
          </DialogTitle>
          <DialogDescription>
            Elegí qué audio usar para este video específico. No afecta el Estudio Creativo global.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Voz */}
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="flex-1">
              <Label className="text-sm cursor-pointer font-medium">Usar voz</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {voice?.source === 'xtts_cloned' && 'Tu voz clonada'}
                {voice?.source === 'preset' && `Voz preset: ${voice.preset_key || ''}`}
                {(!voice || voice.source === 'none') && 'Sin voz configurada en el Estudio'}
              </p>
            </div>
            <Switch
              checked={useVoice}
              disabled={!voiceConfigured}
              onCheckedChange={setUseVoice}
            />
          </div>

          {/* Música */}
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="flex-1">
              <Label className="text-sm cursor-pointer font-medium">Usar música de fondo</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {musicConfigured
                  ? `Mood: ${music!.moods!.join(', ')}`
                  : 'Sin moods configurados en el Estudio'}
              </p>
            </div>
            <Switch
              checked={useMusic}
              disabled={!musicConfigured}
              onCheckedChange={setUseMusic}
            />
          </div>

          {/* Warning ambos OFF */}
          {!useVoice && !useMusic && (
            <p className="text-xs text-amber-600 px-1">
              ⚠️ Ambos apagados — el video va a quedar 100% silencioso
            </p>
          )}

          {/* Remember session */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="remember-audio-session"
              checked={rememberSession}
              onChange={(e) => setRememberSession(e.target.checked)}
              className="cursor-pointer"
            />
            <Label htmlFor="remember-audio-session" className="text-xs text-muted-foreground cursor-pointer">
              No volver a preguntar en esta sesión (usar mismas opciones para los próximos videos)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onConfirm({ useVoice, useMusic, rememberSession })}>
            Generar video
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
