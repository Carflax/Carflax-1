import {
  MapPin,
  Navigation,
  Trash2,
  CheckCircle2,
  Plus,
  Clock,
  Link2,
  ChevronRight,
  User as UserIcon,
  Package,
  X,
  GripVertical,
  Camera,
  Truck
} from "lucide-react";
import { Reorder } from "framer-motion";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback, useRef } from "react";
import { apiMotoristas, apiAdminSQL, apiDescobrirVeiculos, apiSalvarVeiculo } from "@/lib/api";
import { supabase } from "@/lib/supabase";

import type { UserProfile } from "@/App";

export interface Delivery {
  id: string;
  nf: string;
  client: string;
  address: string;
  status: "pending" | "completed" | "failed";
  time?: string;
  value: string;
  image?: string;
  priority?: "low" | "medium" | "high";
  instrucoes?: string;
  driverName?: string;
  driverCode?: string;
  romCode?: string;
  romStatus?: string;
  romDate?: string;
  veiculoId?: string | null;
}

interface VeiculoOpc {
  id: string;
  placa: string;
  modelo: string | null;
}

interface MovGerRecord {
  NF: string;
  CLIENTE: string;
  ENDERECO: string;
  BAIRRO: string;
  CIDADE: string;
  VALOR: string | number;
  OBS: string;
  VENDEDOR_COD: string;
}

export function RomaneiosView({ userProfile }: { userProfile?: UserProfile }) {
  const canLancar = userProfile?.permissions?.includes("Lançar Entrega") || userProfile?.role === "admin";
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [motoristas, setMotoristas] = useState<{ COD: string; NOME: string }[]>([]);
  const [selectedMotorista, setSelectedMotorista] = useState<string>("");
  const [veiculos, setVeiculos] = useState<VeiculoOpc[]>([]);
  const [selectedVeiculo, setSelectedVeiculo] = useState<string>("");
  const [nfInput, setNfInput] = useState("");
  const [driverAvatars, setDriverAvatars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending");
  const isReordering = useRef(false);
  const reorderDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOrder = useRef<Delivery[] | null>(null);
  
  const hoje = new Date().toISOString().split('T')[0];

  const fetchData = useCallback(async (isSilent = false) => {
    // Ignorar chamadas enquanto o usuário está reordenando
    if (isSilent && isReordering.current) return;
    try {
      if (!isSilent) setLoading(true);
      const motoristasRes = await apiMotoristas();
      if (motoristasRes.success) {
        setMotoristas(motoristasRes.motoristas);
      }
            // 1. Buscar entregas diretamente (Hoje se pendente, ou Histórico se concluído)
      const query = supabase.from("entregas").select("*");
      
      if (activeTab === "pending") {
        query.eq("rom_date", hoje).eq("rom_status", "em_andamento");
      } else {
        query.eq("rom_status", "concluido");
      }
      
      if (selectedMotorista) {
        query.eq("driver_cod", selectedMotorista);
      }

      if (activeTab === "completed") {
        query.order("rom_date", { ascending: false }).limit(100); 
      } else {
        query.order("sort_order", { ascending: true });
      }

      const { data: lancados } = await query;

      if (lancados) {
        const mapped = lancados.map(d => ({
          id: d.id,
          nf: d.nf,
          client: d.client,
          address: d.address,
          status: d.status as "pending" | "completed" | "failed",
          time: d.time || undefined,
          value: `R$ ${Number(d.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          instrucoes: d.instructions || "",
          image: d.image,
          driverName: d.driver_name,
          driverCode: d.driver_cod,
          romCode: d.rom_code,
          romStatus: d.rom_status,
          romDate: d.rom_date,
          veiculoId: d.veiculo_id
        }));
        
        setDeliveries(mapped);

        // Auto-finalização: Se todas as entregas de um rom_code estão prontas, marcar rom_status como concluído
        if (activeTab === "pending") {
          const uniqueRomCodes = Array.from(new Set(mapped.map(m => m.romCode)));
          for (const code of uniqueRomCodes) {
            const romItems = mapped.filter(m => m.romCode === code);
            if (romItems.length > 0 && romItems.every(i => i.status === "completed" || i.status === "failed")) {
              console.log(`[Admin] Finalizando romaneio ${code} automaticamente...`);
              await supabase.from("entregas").update({ rom_status: 'concluido' }).eq("rom_code", code);
              fetchData(true);
            }
          }
        }
      } else {
        if (!isSilent) setDeliveries([]);
      }


      // Buscar fotos dos usuários/motoristas
      const { data: users } = await supabase.from("usuarios").select("operator_code, avatar");
      if (users) {
        const avatarMap: Record<string, string> = {};
        users.forEach(u => {
          if (u.operator_code) avatarMap[u.operator_code] = u.avatar;
        });
        setDriverAvatars(avatarMap);
      }
    } catch (error) {
      console.error("Erro ao buscar entregas:", error);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [hoje, selectedMotorista, activeTab]);

  useEffect(() => {
    fetchData();
    // Sincronização em Tempo Real de Entregas e Status de Romaneio
    const channel = supabase
      .channel('admin_full_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => fetchData(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // Carrega os veículos para vincular ao romaneio: usa os já cadastrados e
  // descobre da API do Link Monitoramento os que ainda não existem, registrando-os.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("frota_veiculos")
          .select("id, placa, modelo")
          .eq("ativo", true)
          .order("placa");
        const lista: VeiculoOpc[] = data || [];
        try {
          const { veiculos: descobertos } = await apiDescobrirVeiculos();
          const placasExistentes = new Set(lista.map(v => v.placa));
          const faltantes = descobertos.filter(d => d.placa && !placasExistentes.has(d.placa));
          for (const d of faltantes) {
            const r = await apiSalvarVeiculo({ placa: d.placa });
            if (r?.veiculo) lista.push({ id: r.veiculo.id, placa: r.veiculo.placa, modelo: r.veiculo.modelo });
          }
          lista.sort((a, b) => a.placa.localeCompare(b.placa));
        } catch {
          /* API do Link indisponível — usa só os já cadastrados */
        }
        setVeiculos(lista);
      } catch (err) {
        console.error("Erro ao carregar veículos:", err);
      }
    })();
  }, []);

  const persistOrder = useCallback(async (newOrder: Delivery[]) => {
    isReordering.current = true;
    try {
      // Salva a posição de cada entrega como 0, 1, 2, 3...
      for (let i = 0; i < newOrder.length; i++) {
        await supabase
          .from("entregas")
          .update({ sort_order: i })
          .eq("id", newOrder[i].id);
      }
    } catch (err) {
      console.error("Erro ao persistir nova ordem:", err);
    } finally {
      // Aguarda um pouco antes de liberar o realtime
      setTimeout(() => { isReordering.current = false; }, 800);
    }
  }, []);

  const handleReorder = useCallback((romCode: string, newOrder: Delivery[]) => {
    // Substitui os items do grupo in-place, preservando a ordem dos outros grupos
    setDeliveries(prev => {
      const result = [...prev];
      // Acha os índices das entregas deste romCode no array global
      const indices: number[] = [];
      result.forEach((d, i) => { if (d.romCode === romCode) indices.push(i); });
      // Reescreve cada posição com o item na nova ordem
      indices.forEach((pos, i) => { result[pos] = newOrder[i]; });
      return result;
    });
    pendingOrder.current = newOrder;

    // Cancela persistência anterior e agenda nova (debounce de 600ms)
    if (reorderDebounce.current) clearTimeout(reorderDebounce.current);
    reorderDebounce.current = setTimeout(() => {
      if (pendingOrder.current) {
        persistOrder(pendingOrder.current);
        pendingOrder.current = null;
      }
    }, 600);
  }, [persistOrder]);

  const handleLancar = async () => {
    try {
      // Limpar a NF: pegar só os números e completar com zeros à esquerda até 12 dígitos
      const cleanNum = nfInput.replace(/\D/g, ''); 
      const nfFormatada = cleanNum.padStart(12, '0');

      const sql = `
        SELECT 
          GER_NUMDOC as NF,
          GER_NOMCON as CLIENTE,
          COALESCE(NULLIF(TRIM(GER_ENDENT), ''), GER_ENDCON) as ENDERECO,
          COALESCE(NULLIF(TRIM(GER_BAIENT), ''), GER_BAICON) as BAIRRO,
          COALESCE(NULLIF(TRIM(GER_CIDENT), ''), GER_CIDCON) as CIDADE,
          GER_VLRCON as VALOR,
          GER_MENEX2 as OBS,
          GER_CODVEN as VENDEDOR_COD
        FROM MOVGER
        WHERE GER_NUMDOC = '${nfFormatada}' AND GER_ESPDOC = 'NF'
        LIMIT 1
      `;
      
      const res = await apiAdminSQL(sql);
      
      if (res.success && res.data && res.data.length > 0) {
        const e = res.data[0] as MovGerRecord;
        const motorista = motoristas.find(m => m.COD === selectedMotorista);
        const driverName = motorista ? motorista.NOME : (selectedMotorista || "Geral");
        const driverCod = selectedMotorista || "geral";
        const romCode = `ROM-${hoje.replace(/-/g, '')}-${driverCod}`;

        const cleanValue = Number(String(e.VALOR).replace(',', '.')) || 0;

        const { error: insError } = await supabase
          .from("entregas")
          .insert([{
            nf: e.NF,
            client: e.CLIENTE,
            address: `${e.ENDERECO}, ${e.BAIRRO} - ${e.CIDADE}`,
            value: cleanValue,
            status: "pending",
            instructions: e.OBS || "",
            driver_name: driverName,
            driver_cod: driverCod,
            rom_code: romCode,
            rom_date: hoje,
            rom_status: 'em_andamento',
            vendedor_codigo: e.VENDEDOR_COD,
            veiculo_id: selectedVeiculo || null
          }]);

        if (insError) throw insError;
        
        fetchData(true);
        setNfInput("");
      } else {
        alert("NF não encontrada no banco de dados.");
      }
    } catch (error) {
      console.error("Erro ao lançar NF:", error);
      alert("Erro ao conectar com o servidor.");
    }
  };

  const handleDeleteDelivery = async (nf: string, romCodeToDel?: string) => {
    if (!romCodeToDel) {
      alert("Não foi possível excluir: Código do romaneio ausente.");
      return;
    }
    if (!confirm(`Deseja remover a NF ${nf} do romaneio?`)) return;
    
    try {
      // Remover da tabela entregas
      const { error } = await supabase
        .from("entregas")
        .delete()
        .eq("nf", nf)
        .eq("rom_code", romCodeToDel);
      
      if (error) throw error;
      
      setDeliveries(prev => prev.filter(d => d.nf !== nf));
    } catch (error) {
      console.error("Erro ao remover do banco:", error);
      alert("Erro ao remover a entrega do banco de dados.");
      setDeliveries(prev => prev.filter(d => d.nf !== nf));
    }
  };

  // Vincula/edita o carro de um romaneio já criado (atualiza todas as NFs do rom_code).
  const handleVincularVeiculo = async (romCode: string | undefined, veiculoId: string) => {
    if (!romCode) return;
    try {
      const { error } = await supabase
        .from("entregas")
        .update({ veiculo_id: veiculoId || null })
        .eq("rom_code", romCode);
      if (error) throw error;
      setDeliveries(prev => prev.map(d => (d.romCode === romCode ? { ...d, veiculoId: veiculoId || null } : d)));
    } catch (err) {
      console.error("Erro ao vincular veículo ao romaneio:", err);
      alert("Erro ao vincular o carro ao romaneio.");
    }
  };

  const [selectedNfItems, setSelectedNfItems] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  return (
    <div className="flex-1 flex flex-col gap-4 pb-6 px-0 overflow-hidden bg-background">
      <div className="flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-foreground uppercase tracking-tight leading-none">Romaneios Diários</h2>
            <p className="text-muted-foreground text-[9px] font-bold uppercase tracking-[0.2em] mt-1.5 flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
              Monitoramento de Entregas em Tempo Real
            </p>
          </div>

          <div className="flex bg-secondary/30 p-1 rounded-xl border border-border/50">
            <button 
              onClick={() => setActiveTab("pending")}
              className={cn(
                "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                activeTab === "pending" ? "bg-white dark:bg-slate-800 text-blue-600 shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Clock className="w-3.5 h-3.5" />
               Em Andamento
            </button>
            <button 
              onClick={() => setActiveTab("completed")}
              className={cn(
                "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                activeTab === "completed" ? "bg-white dark:bg-slate-800 text-emerald-600 shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Concluídos
            </button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-1.5 flex items-center gap-2 shadow-sm">
          <div className="flex-1 flex items-center gap-2 px-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center border border-blue-100 dark:border-blue-900/50">
              <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <input
              type="text"
              value={nfInput}
              onChange={(e) => setNfInput(e.target.value)}
              placeholder="Digite o número da NF para lançar..."
              className="flex-1 bg-transparent border-none text-[11px] font-bold text-foreground placeholder:text-muted-foreground/30 outline-none"
            />
          </div>

          <div className="w-px h-6 bg-border" />

          <div className="flex-1 flex items-center gap-2 px-2">
            <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={selectedMotorista}
              onChange={(e) => setSelectedMotorista(e.target.value)}
              className="flex-1 bg-transparent border-none text-[11px] font-black text-muted-foreground outline-none cursor-pointer appearance-none uppercase tracking-tight"
            >
              <option value="" className="bg-card">Selecionar Motorista</option>
              {motoristas.map(m => (
                <option key={m.COD} value={m.COD} className="bg-card">{m.NOME}</option>
              ))}
            </select>
          </div>

          <div className="w-px h-6 bg-border" />

          <div className="flex-1 flex items-center gap-2 px-2">
            <Truck className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={selectedVeiculo}
              onChange={(e) => setSelectedVeiculo(e.target.value)}
              className="flex-1 bg-transparent border-none text-[11px] font-black text-muted-foreground outline-none cursor-pointer appearance-none uppercase tracking-tight"
            >
              <option value="" className="bg-card">Selecionar Carro</option>
              {veiculos.map(v => (
                <option key={v.id} value={v.id} className="bg-card">{v.placa}{v.modelo ? ` · ${v.modelo}` : ""}</option>
              ))}
            </select>
          </div>

          {canLancar && (
            <button 
              onClick={handleLancar}
              disabled={!nfInput}
              className="h-9 px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-blue-600/10 flex items-center gap-2 active:scale-95"
            >
              Lançar Entrega
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4">
        {loading ? (
          <div className="space-y-3">
            <div className="bg-card border border-border rounded-xl p-4 animate-pulse">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-secondary dark:bg-slate-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/4 bg-secondary dark:bg-slate-800 rounded" />
                  <div className="h-2 w-1/6 bg-secondary/50 dark:bg-slate-800/50 rounded" />
                </div>
              </div>
              <div className="space-y-2 border-t border-border pt-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <div className="h-2 w-1/3 bg-secondary/30 dark:bg-slate-800/30 rounded" />
                    <div className="h-2 w-1/4 bg-secondary/30 dark:bg-slate-800/30 rounded" />
                    <div className="h-2 w-16 bg-secondary/30 dark:bg-slate-800/30 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (() => {
            const filteredDeliveries = deliveries.filter(d => {
              const isRomCompleted = d.romStatus === "concluido";
              return activeTab === "completed" ? isRomCompleted : !isRomCompleted;
            });
            
            // Agrupar por rom_code para exibir os cards
            const romGroups = Array.from(new Set(filteredDeliveries.map(d => d.romCode)));

            return romGroups.length > 0 ? romGroups.map(romCode => {
              const items = filteredDeliveries.filter(d => d.romCode === romCode);
              const motoristaNome = items[0]?.driverName || "Motorista";
              const motoristaCod = items[0]?.driverCode || "000";
              
              return (
                <div key={romCode} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mb-6">
                  <div className="p-4 border-b border-border bg-secondary/20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <img
                          src={driverAvatars[motoristaCod] || `https://api.dicebear.com/7.x/avataaars/svg?seed=${motoristaNome}`}
                          className="w-10 h-10 rounded-xl border border-slate-200 shadow-sm object-cover bg-white"
                          alt="Motorista"
                        />
                        <div className={cn(
                          "absolute -bottom-1 -right-1 w-4 h-4 border-2 border-white rounded-full flex items-center justify-center shadow-sm",
                          items.every(i => i.status === "completed") ? "bg-emerald-500" : "bg-blue-500"
                        )}>
                          <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="text-[12px] font-black text-foreground uppercase tracking-tight leading-none flex items-center gap-2">
                            {motoristaNome}
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 text-[9px] font-black tracking-tight">
                              {items[0]?.romCode}
                            </span>
                          </h4>
                          <span className={cn(
                            "px-2 py-0.5 rounded border text-[8px] font-black tracking-widest uppercase",
                            activeTab === "completed" 
                              ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                              : "bg-blue-50 text-blue-600 border-blue-100"
                          )}>
                            {items.length} ENTREGAS {activeTab === "completed" ? "FINALIZADAS" : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                            CÓD: {motoristaCod}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 h-8 px-3 bg-card border border-border rounded-lg shadow-sm">
                        <Truck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <select
                          value={items[0]?.veiculoId || ""}
                          onChange={(e) => handleVincularVeiculo(romCode, e.target.value)}
                          disabled={!canLancar}
                          title="Carro do romaneio"
                          className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-muted-foreground outline-none cursor-pointer appearance-none disabled:cursor-default"
                        >
                          <option value="" className="bg-card">Sem carro</option>
                          {veiculos.map(v => (
                            <option key={v.id} value={v.id} className="bg-card">{v.modelo || v.placa}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/motorista?v=${motoristaCod}`;
                          navigator.clipboard.writeText(url);
                          alert("Link do motorista copiado!");
                        }}
                        className="h-8 px-3 bg-card border border-border text-muted-foreground rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-secondary transition-all flex items-center gap-2 shadow-sm active:scale-95"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        Link Rota
                      </button>
                    </div>
                  </div>

                  <div className="p-1">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2.5 px-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest">Status</th>
                          <th className="py-2.5 px-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest">NF</th>
                          <th className="py-2.5 px-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest">Cliente / Endereço</th>
                          <th className="py-2.5 px-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest text-right">Valor</th>
                          <th className="py-2.5 px-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest text-center">Ações</th>
                        </tr>
                      </thead>
                      <Reorder.Group 
                        as="tbody" 
                        axis="y" 
                        values={items} 
                        onReorder={(newOrder) => {
                          // Só permitimos reordenar se estivermos na aba de Pendentes
                          if (activeTab === "pending") handleReorder(romCode!, newOrder);
                        }}
                        className="divide-y divide-border/50"
                      >
                        {items.map((delivery) => (
                          <Reorder.Item 
                            as="tr" 
                            key={delivery.id} 
                            value={delivery}
                            dragListener={activeTab === "pending"}
                            className={cn(
                              "hover:bg-secondary/20 transition-colors group bg-card",
                              activeTab === "pending" ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                            )}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                {activeTab === "pending" && <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />}
                                {delivery.status === "completed" ? (
                                  <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center border border-emerald-100/50">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center border border-amber-100/50">
                                    <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 animate-pulse" />
                                  </div>
                                )}
                                <span className={cn(
                                  "text-[9px] font-black uppercase tracking-widest",
                                  delivery.status === "completed" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                                )}>
                                  {delivery.status === "completed"
                                    ? (delivery.time ? `ENTREGUE · ${delivery.time.slice(0, 5)}` : "ENTREGUE")
                                    : "AGUARD."}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-[11px] font-black text-foreground tracking-tighter">#{delivery.nf}</span>
                            </td>
                            <td className="py-3 px-4 max-w-[400px]">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[11px] font-black text-foreground uppercase tracking-tight leading-none mb-0.5">{delivery.client}</span>
                                <div className="flex items-center gap-1.5 opacity-60">
                                  <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="text-[9px] font-bold text-muted-foreground uppercase truncate tracking-tight">{delivery.address}</span>
                                </div>
                                {delivery.instrucoes && (
                                  <div className="mt-1 flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[8px] font-black uppercase tracking-tighter border border-blue-100/50">OBS</span>
                                    <span className="text-[9px] font-bold text-muted-foreground uppercase italic tracking-tight truncate">{delivery.instrucoes}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                             <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-5">
                                {delivery.image && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setViewingImage(delivery.image!);
                                    }}
                                    className="w-10 h-10 rounded-lg border border-border/50 shadow-sm overflow-hidden hover:scale-125 hover:ring-2 hover:ring-blue-500 transition-all bg-muted group relative z-10"
                                  >
                                    <img 
                                      src={delivery.image} 
                                      className="w-full h-full object-cover transition-opacity duration-300" 
                                      alt="Comprovante"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.parentElement?.querySelector('.fallback')?.classList.remove('hidden');
                                      }}
                                    />
                                    <div className="fallback hidden absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800">
                                      <Camera className="w-4 h-4 text-slate-300" />
                                    </div>
                                  </button>
                                )}
                                <span className="text-[11px] font-black text-emerald-600 tracking-tighter whitespace-nowrap">{delivery.value}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-center gap-1.5 transition-all">
                                <button 
                                  onClick={() => setSelectedNfItems(delivery.nf)}
                                  className="p-1.5 rounded-md hover:bg-blue-50 text-slate-300 hover:text-blue-600 transition-colors"
                                  title="Ver Itens"
                                >
                                  <Package className="w-4 h-4" />
                                </button>
                                {canLancar && activeTab === "pending" && (
                                  <button 
                                    onClick={() => handleDeleteDelivery(delivery.nf, delivery.romCode)}
                                    className="p-1.5 rounded-md hover:bg-red-50 text-slate-300 hover:text-red-500" 
                                    title="Excluir"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </Reorder.Item>
                        ))}
                      </Reorder.Group>
                    </table>
                  </div>
                </div>
              );
            }) : (
              <div className="bg-card border border-border border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
                  <Navigation className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="text-[14px] font-black text-foreground uppercase">
                  Nenhum Romaneio {activeTab === "completed" ? "Concluído" : "em Aberto"}
                </h3>
                <p className="text-[11px] font-bold text-muted-foreground max-w-[200px] mt-1 uppercase">
                  {activeTab === "completed" ? "Os romaneios finalizados aparecerão aqui." : "Lance uma NF acima para iniciar."}
                </p>
              </div>
            )
        })()}
      </div>

      <ItemsModal 
        nf={selectedNfItems} 
        onClose={() => setSelectedNfItems(null)} 
      />

      {viewingImage && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setViewingImage(null)}
        >
          <div className="relative max-w-4xl w-full flex flex-col items-center">
            <button 
              className="absolute -top-12 right-0 p-2 text-white hover:text-red-400 transition-colors flex items-center gap-2 font-black uppercase text-[10px] tracking-widest"
              onClick={() => setViewingImage(null)}
            >
              Fechar Visualização <X className="w-5 h-5" />
            </button>
            <img 
              src={viewingImage} 
              className="max-h-[85vh] w-auto rounded-2xl shadow-2xl border-4 border-white/10 ring-1 ring-white/20 object-contain animate-in zoom-in-95 duration-300" 
              alt="Comprovante Full" 
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface NfItem {
  CODIGO: string;
  DESCRICAO: string;
  QTD: number | string;
  PRECO: number | string;
}

// ── MODAL DE ITENS DA NF ──────────────────────────────────────────────────
function ItemsModal({ nf, onClose }: { nf: string | null, onClose: () => void }) {
  const [items, setItems] = useState<NfItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!nf) return;
    setLoading(true);
    try {
      const sql = `
        SELECT 
          COD_ITEM as CODIGO,
          ITEM as DESCRICAO,
          QTD_ITEM as QTD,
          VALOR_UNITARIO as PRECO
        FROM VW_FATURAMENTO
        WHERE DOCUMENTO = '${nf}' OR DOCUMENTO LIKE '%${nf}'
      `;
      const res = await apiAdminSQL(sql);
      if (res.success) setItems((res.data as NfItem[]) || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [nf]);

  useEffect(() => {
    if (nf) fetchItems();
  }, [nf, fetchItems]);

  if (!nf) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh] border border-border">
        <div className="p-6 border-b border-border flex items-center justify-between bg-card">
          <div>
            <h3 className="text-xl font-black text-foreground uppercase tracking-tight leading-none">Itens da NF #{nf}</h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-2 flex items-center gap-2">
              <Package className="w-3 h-3 text-blue-500" />
              Detalhamento de produtos e quantidades
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl transition-all">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 gap-4">
              <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Consultando Banco...</span>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2.5 px-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest">Cód.</th>
                  <th className="py-2.5 px-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest">Produto</th>
                  <th className="py-2.5 px-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest text-center">Qtd.</th>
                  <th className="py-2.5 px-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest text-right">Preço</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-secondary/20 transition-colors group">
                    <td className="py-3 px-4 text-[11px] font-bold text-muted-foreground font-mono italic">{item.CODIGO}</td>
                    <td className="py-3 px-4 text-[11px] font-black text-foreground uppercase tracking-tight">{item.DESCRICAO}</td>
                    <td className="py-3 px-4 text-[11px] font-black text-blue-600 dark:text-blue-400 text-center">{Number(item.QTD).toFixed(0)}</td>
                    <td className="py-3 px-4 text-[11px] font-bold text-foreground/80 text-right">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.PRECO || 0))}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-slate-400 text-[10px] font-black uppercase tracking-widest">
                      Nenhum item encontrado para esta NF.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
