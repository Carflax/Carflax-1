import { ProdutosView } from "@/components/dashboard/products/ProdutosView";
import { AnalyticsView } from "./analytics/AnalyticsView";
import { CampanhasView } from "./campanhas/CampanhasView";
import { OrcamentosView } from "./orcamentos/OrcamentosView";
import { RelatoriosView } from "./relatorios/RelatoriosView";
import { LigacoesView } from "@/components/crm/ligacoes/LigacoesView";
import { CarteiraView } from "./carteira/CarteiraView";
import { AlugueisView } from "./alugueis/AlugueisView";
import { ProspeccoesView } from "./prospeccoes/ProspeccoesView";
import { MeusPedidosView } from "./pedidos/MeusPedidosView";
import { PosVendaView } from "./posvenda/PosVendaView";
import { cn } from "@/lib/utils";

interface UserProfile {
  id?: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  department?: string;
  operator_code?: string;
  operatorCode?: string;
  permissions?: string[];
  is_admin?: boolean;
  is_leader?: boolean;
}

interface CrmSectionProps {
  activeTab: string;
  userProfile?: UserProfile;
}

export function CrmSection({ activeTab, userProfile }: CrmSectionProps) {
  return (
    <div className={cn(
      "flex flex-col h-full bg-background overflow-hidden p-0",
    )}>
      <div className="w-full h-full flex flex-col">
        <div className="flex-1 min-h-0 h-full flex flex-col">
          {activeTab === "Analytics" ? (
            <div className="h-full overflow-y-auto scrollbar-hide py-4">
              <AnalyticsView />
            </div>
          ) : activeTab === "Produtos" ? (
            <ProdutosView />
          ) : activeTab === "Meus Pedidos" ? (
            <MeusPedidosView userProfile={userProfile} />
          ) : activeTab === "Carteira" ? (
            <CarteiraView userProfile={userProfile} />
          ) : activeTab === "Campanhas" ? (
            <div className="h-full overflow-y-auto scrollbar-hide">
              <CampanhasView userProfile={userProfile} />
            </div>
          ) : activeTab === "Ligações" ? (
            <div className="h-full overflow-y-auto scrollbar-hide">
              <LigacoesView />
            </div>
          ) : activeTab === "Relatórios" ? (
            <RelatoriosView orcamentos={[]} userProfile={userProfile} />
          ) : activeTab === "Alugueis" ? (
            <AlugueisView userProfile={userProfile} />
          ) : activeTab === "Prospecções" ? (
            <ProspeccoesView userProfile={userProfile} />
          ) : activeTab === "Pós-Venda" ? (
            <PosVendaView userProfile={userProfile} />
          ) : (
            <OrcamentosView userProfile={userProfile} />
          )}
        </div>
      </div>
    </div>
  );
}
