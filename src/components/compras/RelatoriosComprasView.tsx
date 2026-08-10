import { useState } from "react";
import {
  ShoppingCart,
  Clock,
  RefreshCw,
  Construction,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "historico" | "leadtime" | "recompra";

const TABS: { id: TabId; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "historico", label: "Histórico de Compras", icon: ShoppingCart, desc: "Compras realizadas por período, fornecedor e marca" },
  { id: "leadtime", label: "Lead Time", icon: Clock, desc: "Tempo médio de entrega por fornecedor" },
  { id: "recompra", label: "Curva de Recompra", icon: RefreshCw, desc: "Análise de recompra e sugestões automáticas" },
];

function EmDev({ tab }: { tab: typeof TABS[number] }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Construction className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-black text-foreground uppercase tracking-tight mb-2">{tab.label}</h3>
        <p className="text-sm text-muted-foreground font-medium">{tab.desc}</p>
        <p className="text-xs text-muted-foreground/60 font-bold uppercase tracking-widest mt-4">Em desenvolvimento</p>
      </div>
    </div>
  );
}

export function RelatoriosComprasView() {
  const [tab, setTab] = useState<TabId>("historico");

  return (
    <div className="h-full bg-background flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-0 space-y-4">
        <div>
          <h2 className="text-xl font-black text-foreground tracking-tight uppercase leading-none">
            Relatórios de Compras
          </h2>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
            Análises e indicadores de compras
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl border border-border/80 bg-card/50 w-fit">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-2 px-4 h-9 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95",
                  tab === t.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-6">
        <EmDev tab={TABS.find((t) => t.id === tab)!} />
      </div>
    </div>
  );
}
