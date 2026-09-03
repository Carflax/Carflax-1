import { CoachView } from "@/components/marketing/CoachView";
import { Megaphone, Calendar } from "lucide-react";
import { WhatsappApiView } from "./whatsapp/WhatsappApiView";
import { AutomacaoView } from "./automacao/AutomacaoView";
import { ClientesView } from "./ClientesView";
import { LeadsView } from "./LeadsView";
import { ReportsView } from "./ReportsView";
import { CronogramaView } from "./CronogramaView";
import { EventosView } from "./eventos/EventosView";
import { AvaliacoesView } from "./avaliacoes/AvaliacoesView";
import { PosVendaView } from "./PosVendaView";
import { CriativoView } from "./criativo/CriativoView";
import { BlogView } from "./blog/BlogView";

interface UserProfile {
  id?: string;
  name: string;
  email?: string;
  role: string;
}

interface MarketingViewProps {
  activeTab: string;
  userProfile?: UserProfile | null;
}

export function MarketingView({ activeTab, userProfile }: MarketingViewProps) {
  const firstName = userProfile?.name ? userProfile.name.split(' ')[0] : 'Usuário';

  if (activeTab === "Whatsapp API") {
    return <WhatsappApiView userProfile={userProfile} />;
  }

  if (activeTab === "Automação") {
    return <AutomacaoView />;
  }

  if (activeTab === "Clientes") {
    return <ClientesView />;
  }

  if (activeTab === "Leads") {
    return <LeadsView />;
  }

  if (activeTab === "Blog Marketing" || activeTab === "Blog") {
    return <BlogView />;
  }


  if (activeTab === "Criativo") {
    return <CriativoView />;
  }

  if (activeTab === "Cronograma") {
    return <CronogramaView />;
  }

  if (activeTab === "Eventos Marketing") {
    return <EventosView />;
  }

  if (activeTab === "Avaliações") {
    return <AvaliacoesView userProfile={userProfile} />;
  }

  if (activeTab === "Coach IA") {
    return <CoachView />;
  }

  if (activeTab === "Pós-Venda") {
    return <PosVendaView userProfile={userProfile} />;
  }

  if (activeTab.includes("Relatórios")) {
    return <ReportsView />;
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-background h-full">
      <div className="text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
          {activeTab === "Cronograma" ? (
            <Calendar className="w-10 h-10 text-primary" />
          ) : (
            <Megaphone className="w-10 h-10 text-primary" />
          )}
        </div>
        <h2 className="text-4xl font-black text-foreground mb-4 uppercase tracking-tighter">
          Marketing: {activeTab}
        </h2>
        <p className="text-muted-foreground text-lg font-medium max-w-md mx-auto">
          Olá {firstName}, esta seção de marketing está sendo preparada. Em breve você terá acesso a todas as ferramentas de {activeTab.toLowerCase()}.
        </p>
      </div>
    </div>
  );
}
