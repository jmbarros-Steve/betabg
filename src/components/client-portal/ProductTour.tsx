import { useState, useEffect } from "react";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface TourStep {
  title: string;
  description: string;
  targetTab: string;
}

interface ProductTourProps {
  userId: string;
  onNavigate: (tab: string) => void;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Steve — Tu asistente IA",
    description: "Aquí creas tu Brand Brief respondiendo preguntas sobre tu marca. Steve analiza todo y genera tu estrategia.",
    targetTab: "steve",
  },
  {
    title: "Métricas en tiempo real",
    description: "Revenue, ROAS, pedidos y rentabilidad — todo en un solo lugar. Puedes exportar a CSV y elegir rangos de fecha personalizados.",
    targetTab: "metrics",
  },
  {
    title: "Conexiones",
    description: "Conecta Shopify, Meta, Google Ads y Klaviyo para sincronizar datos automáticamente.",
    targetTab: "connections",
  },
  {
    title: "Meta Ads Manager",
    description: "Crea y gestiona campañas de Meta directamente desde Steve. Incluye audiencias, pixel y Social Inbox.",
    targetTab: "copies",
  },
  {
    title: "Tip: Usa Cmd+K",
    description: "Presiona Cmd+K (o Ctrl+K) en cualquier momento para saltar rápidamente a cualquier sección del portal.",
    targetTab: "metrics",
  },
];

export function ProductTour({ userId, onNavigate }: ProductTourProps) {
  const storageKey = `steve_tour_${userId}`;
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show tour only once, after a short delay
    const seen = localStorage.getItem(storageKey);
    if (!seen) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [storageKey]);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(storageKey, "true");
  };

  const next = () => {
    if (step < TOUR_STEPS.length - 1) {
      const nextStep = step + 1;
      setStep(nextStep);
      onNavigate(TOUR_STEPS[nextStep].targetTab);
    } else {
      dismiss();
    }
  };

  const prev = () => {
    if (step > 0) {
      const prevStep = step - 1;
      setStep(prevStep);
      onNavigate(TOUR_STEPS[prevStep].targetTab);
    }
  };

  if (!visible) return null;

  const currentStep = TOUR_STEPS[step];

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center pb-24 md:items-center md:pb-0 pointer-events-none">
      {/* Semi-transparent backdrop */}
      <div className="fixed inset-0 bg-black/40 pointer-events-auto" onClick={dismiss} />

      <Card className="relative z-[91] w-[90vw] max-w-md shadow-2xl pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Paso {step + 1} de {TOUR_STEPS.length}
              </p>
              <h3 className="font-semibold text-base">{currentStep.title}</h3>
            </div>
            <button onClick={dismiss} className="p-1 hover:bg-muted rounded">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground mb-4">{currentStep.description}</p>
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="ghost" size="sm" onClick={prev}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                </Button>
              )}
              <Button size="sm" onClick={next}>
                {step === TOUR_STEPS.length - 1 ? "¡Listo!" : "Siguiente"}
                {step < TOUR_STEPS.length - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
