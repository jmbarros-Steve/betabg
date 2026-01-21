import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronRight, ChevronLeft, Store, 
  BarChart3, Sparkles, Mail, Bot,
  CheckCircle2, Rocket, PartyPopper, Key
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import avatarSteve from '@/assets/avatar-steve.png';

interface ShopifyOnboardingTourProps {
  onComplete: () => void;
  storeName: string;
  userEmail: string;
}

const TOUR_STEPS = [
  {
    id: 'welcome',
    title: '¡Tienda Conectada!',
    description: 'Tu tienda de Shopify ya está sincronizada. Ahora tienes acceso a todas las herramientas de Steve para potenciar tu marketing.',
    icon: PartyPopper,
    color: 'from-green-500/20 to-emerald-500/20',
  },
  {
    id: 'credentials',
    title: 'Guarda tus Credenciales',
    description: 'Hemos creado una cuenta para ti. Te recomendamos guardar tu email y cambiar tu contraseña en Configuración.',
    icon: Key,
    color: 'from-amber-500/20 to-orange-500/20',
    tips: [
      'Tu email de acceso es el mismo de tu tienda Shopify',
      'Puedes cambiar tu contraseña en cualquier momento',
      'Pronto recibirás un email con tus datos de acceso',
    ],
  },
  {
    id: 'metrics',
    title: 'Tus Métricas en Tiempo Real',
    description: 'Accede a las métricas de tu tienda: ventas, pedidos, productos más vendidos y análisis de rentabilidad.',
    icon: BarChart3,
    color: 'from-blue-500/20 to-indigo-500/20',
    tips: [
      'Ventas totales y tendencias',
      'Productos más vendidos (Top SKUs)',
      'Análisis de P&L y márgenes',
      'Carritos abandonados',
    ],
  },
  {
    id: 'steve',
    title: 'Conoce a Steve 🐕',
    description: 'Steve es tu estratega de marketing. Completa el Brief de Marca respondiendo sus preguntas y él creará la base para todos tus anuncios.',
    icon: Bot,
    color: 'from-primary/20 to-purple-500/20',
    avatar: avatarSteve,
    tips: [
      'Brief de marca personalizado',
      'Análisis de competencia',
      'Propuesta de valor única',
    ],
  },
  {
    id: 'copies',
    title: 'Genera Anuncios con IA',
    description: 'Crea copies de Meta Ads y Google Ads optimizados para tu marca. Headlines, descripciones y textos listos para usar.',
    icon: Sparkles,
    color: 'from-orange-500/20 to-amber-500/20',
  },
  {
    id: 'klaviyo',
    title: 'Email Marketing Automatizado',
    description: 'Planifica secuencias de email: bienvenida, carrito abandonado, winback. Con variables de Klaviyo listas para copiar.',
    icon: Mail,
    color: 'from-purple-500/20 to-pink-500/20',
  },
  {
    id: 'ready',
    title: '¡Estás Listo!',
    description: 'Tu tienda está conectada y tienes acceso a todas las herramientas. Comienza explorando tus métricas o completando tu Brief con Steve.',
    icon: Rocket,
    color: 'from-primary/30 to-accent/30',
  },
];

export function ShopifyOnboardingTour({ onComplete, storeName, userEmail }: ShopifyOnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = TOUR_STEPS[currentStep];
  const isLastStep = currentStep === TOUR_STEPS.length - 1;
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
      <Card className="w-full max-w-lg overflow-hidden border-2 border-primary/20">
        {/* Progress */}
        <div className="h-1.5 bg-muted">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-green-500"
            initial={{ width: 0 }}
            animate={{ width: `${((currentStep + 1) / TOUR_STEPS.length) * 100}%` }}
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
              {/* Store badge for first step */}
              {currentStep === 0 && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Store className="h-4 w-4" />
                  <span className="font-medium">{storeName}</span>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
              )}

              {/* Email badge for credentials step */}
              {step.id === 'credentials' && (
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-sm text-muted-foreground">Tu email de acceso:</p>
                  <p className="font-mono text-sm font-medium">{userEmail}</p>
                </div>
              )}

              {/* Icon/Avatar */}
              <div className={cn(
                'mx-auto w-20 h-20 rounded-2xl flex items-center justify-center bg-gradient-to-br',
                step.color
              )}>
                {'avatar' in step && step.avatar ? (
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={step.avatar} alt="Steve" />
                    <AvatarFallback>🐕</AvatarFallback>
                  </Avatar>
                ) : (
                  <Icon className="h-10 w-10 text-foreground" />
                )}
              </div>

              {/* Content */}
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">{step.title}</h2>
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
                {TOUR_STEPS.map((_, i) => (
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
                      Omitir tour
                    </Button>
                  )}
                </div>
                <Button onClick={handleNext} className="gap-2">
                  {isLastStep ? (
                    <>
                      <Rocket className="h-4 w-4" />
                      Ir al Portal
                    </>
                  ) : (
                    <>
                      Siguiente
                      <ChevronRight className="h-4 w-4" />
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
