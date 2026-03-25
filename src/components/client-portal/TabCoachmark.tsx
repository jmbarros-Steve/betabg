import { Coachmark } from "./Coachmark";

const TAB_TIPS: Record<string, string> = {
  steve: "Aqui puedes crear tu Brand Brief respondiendo preguntas. Steve analiza tu negocio automaticamente.",
  metrics: "Tus metricas se sincronizan cada 6 horas. Conecta Shopify para ver datos completos.",
  connections: "Conecta tus plataformas para desbloquear todas las funcionalidades de Steve.",
  campaigns: "Analiza el rendimiento de tus campanas de Meta y Google Ads.",
  klaviyo: "Gestiona tus campanas de email marketing y flujos automatizados.",
};

interface TabCoachmarkProps {
  tabId: string;
}

export function TabCoachmark({ tabId }: TabCoachmarkProps) {
  const tip = TAB_TIPS[tabId];
  if (!tip) return null;

  return <Coachmark id={`tab_tip_${tabId}`} message={tip} className="mx-4 mb-4" />;
}
