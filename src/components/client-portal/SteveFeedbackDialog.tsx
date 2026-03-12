import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import avatarSteve from '@/assets/avatar-steve.png';

interface SteveFeedbackDialogProps {
  clientId: string;
  contentType: 'meta_copy' | 'google_copy' | 'klaviyo_email';
  contentId: string;
  onComplete: () => void;
}

const STEVE_COMMENTS = {
  1: "¡WOOF! Ouch, eso duele. Pero hey, el dolor es información valiosa. Cuéntame qué salió mal para que pueda mejorar. 🐕",
  2: "Hmm, no es lo que esperabas. Sin drama - necesito saber qué no funcionó para ajustar mi enfoque contigo. 🐕",
  3: "Okay, estamos en territorio neutral. ¿Qué le faltó para que fuera un HIT? Dame detalles específicos. 🐕",
  4: "¡Arf! Casi llegamos a la excelencia. ¿Qué pequeño ajuste lo hubiera hecho perfecto? 🐕",
  5: "¡WOOF WOOF! 🎉 ¡ESO es lo que buscamos! Me encanta cuando conectamos. ¿Algo que quieras destacar para futuros copies? 🐕",
};

export function SteveFeedbackDialog({ clientId, contentType, contentId, onComplete }: SteveFeedbackDialogProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [rating, setRating] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);

  const handleSubmit = async () => {
    if (!rating) {
      toast.error('Por favor selecciona una calificación');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('steve_feedback')
        .insert({
          client_id: clientId,
          content_type: contentType,
          content_id: contentId,
          rating,
          feedback_text: feedbackText.trim() || null,
        });

      if (error) throw error;

      toast.success('¡Gracias por tu feedback! Steve aprenderá de esto 🐕');
      setIsVisible(false);
      setTimeout(onComplete, 300);
    } catch (error) {
      // Error handled by toast below
      toast.error('Error al enviar feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    setIsVisible(false);
    setTimeout(onComplete, 300);
  };

  const displayRating = hoveredRating ?? rating;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-card border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            {/* Header */}
            <div className="relative p-6 pb-4 bg-gradient-to-br from-primary/10 to-accent/10">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 h-8 w-8"
                onClick={handleSkip}
              >
                <X className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 border-2 border-primary/20">
                  <AvatarImage src={avatarSteve} alt="Steve" />
                  <AvatarFallback>🐕</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    Steve quiere saber
                    <Sparkles className="h-4 w-4 text-primary" />
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    ¿Qué te pareció el copy generado?
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5">
              {/* Star Rating */}
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className="focus:outline-none transition-transform hover:scale-110"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(null)}
                  >
                    <Star
                      className={cn(
                        'h-10 w-10 transition-colors',
                        displayRating && star <= displayRating
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-muted-foreground/30'
                      )}
                    />
                  </button>
                ))}
              </div>

              {/* Steve's Comment */}
              <AnimatePresence mode="wait">
                {rating && (
                  <motion.div
                    key={rating}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-muted/50 rounded-xl p-4"
                  >
                    <p className="text-sm italic">
                      {STEVE_COMMENTS[rating as keyof typeof STEVE_COMMENTS]}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Feedback Text */}
              {rating && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-2"
                >
                  <Textarea
                    placeholder={
                      rating <= 2
                        ? "¿Qué no te gustó? (Sé específico, me ayuda a mejorar)"
                        : rating === 3
                          ? "¿Qué le faltó para ser excelente?"
                          : "¿Qué te gustó más? (Opcional)"
                    }
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Tu feedback ayuda a Steve a generar mejores copies para ti
                  </p>
                </motion.div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1" onClick={handleSkip}>
                  Omitir
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={!rating || isSubmitting}
                >
                  {isSubmitting ? (
                    'Enviando...'
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Enviar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
