import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronRight, ChevronLeft, Sparkles, 
  Link2, MessageCircle, FileText, Mail, Megaphone, 
  CheckCircle2, Rocket
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import avatarSteve from '@/assets/avatar-steve.png';
import avatarChonga from '@/assets/avatar-chonga.png';

interface ClientOnboardingProps {
  onComplete: () => void;
  clientName?: string;
}

const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    title: '¡Bienvenido a BG Consult!',
    description: 'Tu portal de marketing digital está listo. Te explicamos rápidamente cómo sacarle el máximo provecho.',
    icon: Sparkles,
    color: 'from-primary/20 to-purple-500/20',
  },
  {
    id: 'connections',
    title: 'Conecta tus Plataformas',
    description: 'En la pestaña "Conexiones" puedes vincular Shopify, Meta Ads, Google Ads y Klaviyo. Así veremos tus métricas en tiempo real.',
    icon: Link2,
    color: 'from-green-500/20 to-emerald-500/20',
    tips: [
      'Shopify: Para ver ventas, pedidos e ingresos',
      'Meta Ads: Para métricas de campañas de Facebook/Instagram',
      'Google Ads: Para campañas de búsqueda y display',
      'Klaviyo: Para email marketing automatizado',
    ],
  },
  {
    id: 'steve',
    title: 'Conoce a Steve 🐕',
    description: 'Steve es un Bulldog Francés PhD de Stanford. Te hará preguntas para crear tu Brief de Marca - la base para todos tus anuncios.',
    icon: MessageCircle,
    color: 'from-blue-500/20 to-indigo-500/20',
    avatar: avatarSteve,
    tips: [
      'Responde con honestidad y detalle',
      'Steve puede ser directo, pero es para ayudarte',
      'El Brief toma ~15 minutos pero vale oro',
    ],
  },
  {
    id: 'copies',
    title: 'Genera Copies de Meta',
    description: 'Una vez tengas tu Brief, podrás generar anuncios de Meta Ads personalizados con un clic. Headlines, descripciones y textos primarios.',
    icon: Megaphone,
    color: 'from-orange-500/20 to-amber-500/20',
  },
  {
    id: 'klaviyo',
    title: 'Email Marketing con Klaviyo',
    description: 'Planifica secuencias de email: bienvenida, carrito abandonado, winback y campañas puntuales. Con variables de Klaviyo listas para copiar.',
    icon: Mail,
    color: 'from-purple-500/20 to-pink-500/20',
  },
  {
    id: 'chonga',
    title: '¿Dudas? Pregunta a Chonga 🐕',
    description: 'Chonga es una English Bulldog que te ayuda con soporte técnico. Está siempre en la esquina inferior derecha, lista para ayudarte.',
    icon: FileText,
    color: 'from-teal-500/20 to-cyan-500/20',
    avatar: avatarChonga,
  },
  {
    id: 'ready',
    title: '¡Todo Listo!',
    description: 'Ya conoces las herramientas principales. Comienza conectando tus plataformas y completando tu Brief con Steve.',
    icon: Rocket,
    color: 'from-primary/30 to-accent/30',
  },
];

export function ClientOnboarding({ onComplete, clientName }: ClientOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = ONBOARDING_STEPS[currentStep];
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;
  const Icon = step.icon;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-lg overflow-hidden">
        {/* Progress */}
        <div className="h-1 bg-muted">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${((currentStep + 1) / ONBOARDING_STEPS.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <CardContent className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Icon/Avatar */}
              <div className={cn(
                'mx-auto w-20 h-20 rounded-2xl flex items-center justify-center bg-gradient-to-br',
                step.color
              )}>
                {'avatar' in step && step.avatar ? (
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={step.avatar} alt="" />
                    <AvatarFallback>🐕</AvatarFallback>
                  </Avatar>
                ) : (
                  <Icon className="h-10 w-10 text-foreground" />
                )}
              </div>

              {/* Content */}
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">
                  {currentStep === 0 && clientName
                    ? `¡Bienvenido${clientName ? `, ${clientName}` : ''}!`
                    : step.title}
                </h2>
                <p className="text-muted-foreground">{step.description}</p>
              </div>

              {/* Tips */}
              {'tips' in step && step.tips && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  {step.tips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Step Indicators */}
              <div className="flex justify-center gap-1.5">
                {ONBOARDING_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentStep(i)}
                    className={cn(
                      'h-2 rounded-full transition-all',
                      i === currentStep 
                        ? 'w-6 bg-primary' 
                        : i < currentStep 
                          ? 'w-2 bg-primary/50' 
                          : 'w-2 bg-muted-foreground/30'
                    )}
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <div>
                  {currentStep > 0 ? (
                    <Button variant="ghost" onClick={handleBack}>
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Atrás
                    </Button>
                  ) : (
                    <Button variant="ghost" onClick={handleSkip}>
                      Omitir
                    </Button>
                  )}
                </div>
                <Button onClick={handleNext}>
                  {isLastStep ? (
                    <>
                      Comenzar
                      <Rocket className="h-4 w-4 ml-2" />
                    </>
                  ) : (
                    <>
                      Siguiente
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}
