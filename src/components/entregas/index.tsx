import { useState, useEffect } from "react";
import { RomaneiosView } from "./romaneios/RomaneiosView";
import { ConcluidasView } from "./concluidas/ConcluidasView";
import { MotoristaView } from "./motorista/MotoristaView";
import { RelatorioRomaneiosView } from "./relatorio/RelatorioRomaneiosView";
import { MapaFrotaLive } from "./relatorio/MapaFrotaLive";

interface EntregasViewProps {
  activeTab?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userProfile?: any;
}

export function EntregasView({ activeTab: externalTab, userProfile }: EntregasViewProps) {
  const [internalTab, setInternalTab] = useState<"romaneios" | "concluidas" | "motorista" | "relatorio" | "mapa">("romaneios");

  // Sincroniza o estado interno se a navegação externa (sidebar) mudar
  useEffect(() => {
    const timer = setTimeout(() => {
      if (externalTab === "Romaneios") setInternalTab("romaneios");
      if (externalTab === "Concluídas") setInternalTab("concluidas");
      if (externalTab === "Motorista") setInternalTab("motorista");
      if (externalTab === "Relatórios Entregas") setInternalTab("relatorio");
      if (externalTab === "Mapa Entregas") setInternalTab("mapa");
    }, 0);
    return () => clearTimeout(timer);
  }, [externalTab]);

  return (
    <div className="flex flex-col h-full bg-background pt-4 px-4 md:px-6 overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0">
        {internalTab === "romaneios" ? (
          <RomaneiosView userProfile={userProfile} />
        ) : internalTab === "concluidas" ? (
          <ConcluidasView />
        ) : internalTab === "relatorio" ? (
          <RelatorioRomaneiosView />
        ) : internalTab === "mapa" ? (
          <div className="flex-1 min-h-0 -mx-4 md:-mx-6 -mt-4">
            <MapaFrotaLive />
          </div>
        ) : (
          <MotoristaView />
        )}
      </div>
    </div>
  );
}
