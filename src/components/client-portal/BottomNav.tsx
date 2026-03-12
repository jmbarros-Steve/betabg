import { useState } from "react";
import { BarChart3, Bot, Link2, Settings, MoreHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface BottomNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  secondaryTabs: { id: string; label: string; icon: React.ReactNode }[];
}

const primaryItems = [
  { id: "metrics", label: "Métricas", icon: BarChart3 },
  { id: "steve", label: "Steve", icon: Bot },
  { id: "connections", label: "Conexiones", icon: Link2 },
  { id: "config", label: "Config", icon: Settings },
];

export function BottomNav({ activeTab, onNavigate, secondaryTabs }: BottomNavProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden">
      <div className="flex items-center justify-around h-16">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full text-xs transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button className={`flex flex-col items-center justify-center gap-1 flex-1 h-full text-xs transition-colors ${
              secondaryTabs.some(t => t.id === activeTab) ? "text-primary" : "text-muted-foreground"
            }`}>
              <MoreHorizontal className="h-5 w-5" />
              <span>Más</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto max-h-[70vh]">
            <SheetHeader>
              <SheetTitle>Más secciones</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-3 py-4">
              {secondaryTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setSheetOpen(false);
                    onNavigate(tab.id);
                  }}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-colors ${
                    activeTab === tab.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}
                >
                  {tab.icon}
                  <span className="text-xs text-center">{tab.label}</span>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
