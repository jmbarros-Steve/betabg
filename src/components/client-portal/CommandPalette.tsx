import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  BarChart3, Bot, FileText, Link2, Settings, ShoppingBag,
  PieChart, Code, Lightbulb, Sparkles, Target,
  Mail, MailCheck
} from "lucide-react";

interface CommandPaletteProps {
  onNavigate: (tab: string) => void;
}

const sections = [
  { id: "steve", label: "Steve — Brief IA", icon: Bot, group: "Principal" },
  { id: "brief", label: "Brief de Marca", icon: FileText, group: "Principal" },
  { id: "metrics", label: "Métricas & KPIs", icon: BarChart3, group: "Principal" },
  { id: "connections", label: "Conexiones", icon: Link2, group: "Principal" },
  { id: "config", label: "Configuración Financiera", icon: Settings, group: "Principal" },
  { id: "shopify", label: "Shopify Dashboard", icon: ShoppingBag, group: "Herramientas" },
  { id: "campaigns", label: "Campañas Analytics", icon: PieChart, group: "Herramientas" },
  { id: "deepdive", label: "Deep Dive Competencia", icon: Code, group: "Herramientas" },
  { id: "estrategia", label: "Estrategia", icon: Lightbulb, group: "Herramientas" },
  { id: "copies", label: "Meta Ads Manager", icon: Sparkles, group: "Plataformas" },
  { id: "google", label: "Google Ads", icon: Target, group: "Plataformas" },
  { id: "klaviyo", label: "Klaviyo Email Studio", icon: Mail, group: "Plataformas" },
  { id: "email", label: "Steve Mail", icon: MailCheck, group: "Plataformas" },
];

export function CommandPalette({ onNavigate }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = (tabId: string) => {
    setOpen(false);
    onNavigate(tabId);
  };

  const groups = [...new Set(sections.map((s) => s.group))];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar sección..." />
      <CommandList>
        <CommandEmpty>No se encontraron resultados.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group} heading={group}>
            {sections
              .filter((s) => s.group === group)
              .map((section) => (
                <CommandItem
                  key={section.id}
                  value={section.label}
                  onSelect={() => handleSelect(section.id)}
                >
                  <section.icon className="mr-2 h-4 w-4" />
                  <span>{section.label}</span>
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
