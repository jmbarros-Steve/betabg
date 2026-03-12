import { useEffect, useState } from "react";
import { Check, Circle, ChevronDown, ChevronUp, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SetupProgressTrackerProps {
  clientId: string;
  onNavigate: (tab: string) => void;
}

export function SetupProgressTracker({ clientId, onNavigate }: SetupProgressTrackerProps) {
  const [steps, setSteps] = useState<{ label: string; done: boolean; tab: string }[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!clientId) return;

    const checkSetup = async () => {
      // Check connections
      const { data: connections } = await supabase
        .from("platform_connections")
        .select("platform, is_active")
        .eq("client_id", clientId);

      const hasShopify = connections?.some(c => c.platform === "shopify" && c.is_active) ?? false;
      const hasMeta = connections?.some(c => c.platform === "meta" && c.is_active) ?? false;
      const hasGoogle = connections?.some(c => c.platform === "google" && c.is_active) ?? false;

      // Check brief
      const { data: briefs } = await supabase
        .from("brand_briefs")
        .select("id")
        .eq("client_id", clientId)
        .limit(1);
      const hasBrief = (briefs?.length ?? 0) > 0;

      // Check financial config
      const { data: config } = await supabase
        .from("client_financial_config")
        .select("id")
        .eq("client_id", clientId)
        .limit(1);
      const hasConfig = (config?.length ?? 0) > 0;

      setSteps([
        { label: "Conectar Shopify", done: hasShopify, tab: "conexiones" },
        { label: "Conectar Meta", done: hasMeta, tab: "conexiones" },
        { label: "Conectar Google Ads", done: hasGoogle, tab: "conexiones" },
        { label: "Completar Brand Brief", done: hasBrief, tab: "steve" },
        { label: "Configurar finanzas", done: hasConfig, tab: "configuracion" },
      ]);
    };

    checkSetup();

    // Listen for sync events to refresh
    const handler = () => checkSetup();
    window.addEventListener("bg:sync-complete", handler);
    return () => window.removeEventListener("bg:sync-complete", handler);
  }, [clientId]);

  const completedCount = steps.filter(s => s.done).length;
  const allDone = completedCount === steps.length;

  // Don't show if all done or dismissed or no steps loaded
  if (allDone || dismissed || steps.length === 0) return null;

  return (
    <div className="mx-4 mb-4 border rounded-lg bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-sm">Setup del portal</h4>
          <span className="text-xs text-muted-foreground">
            {completedCount}/{steps.length}
          </span>
          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCollapsed(!collapsed)} className="p-1 hover:bg-muted rounded">
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button onClick={() => setDismissed(true)} className="p-1 hover:bg-muted rounded">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="space-y-1.5">
          {steps.map((step, i) => (
            <button
              key={i}
              onClick={() => !step.done && onNavigate(step.tab)}
              className={`flex items-center gap-2 text-sm w-full text-left px-2 py-1 rounded transition-colors ${
                step.done ? "text-muted-foreground" : "hover:bg-muted cursor-pointer"
              }`}
              disabled={step.done}
            >
              {step.done ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={step.done ? "line-through" : ""}>{step.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
