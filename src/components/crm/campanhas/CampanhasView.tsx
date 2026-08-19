import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { apiElegiveisParaSorteio, apiCampaignRanking, type MetaVendedor, type RankingVendedor } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { Target, Plus, X, Trophy, ChevronLeft, ChevronRight, Gift, Star, AlertCircle, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AmancoModal } from "./AmancoModal";

export interface Campaign {
  id: string | number;
  type: "highlight" | "brand";
  name: string;
  description?: string;
  badge?: string;
  color?: string;
  icon?: React.ElementType;
  date?: string;
  status?: string;
  logo?: string;
  fornecedor?: string;
  data_ini?: string;
  data_fim?: string;
}

interface PremioMes {
  id: string;
  mes: number;
  ano: number;
  nome: string;
  descricao: string | null;
  valor: number | null;
  imagem: string | null;
  vendedor_codigo?: string | null;
  vendedor_nome?: string | null;
  vendedor_avatar?: string | null;
}

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function offsetMes(mes: number, ano: number, delta: number): { mes: number; ano: number } {
  let m = mes + delta;
  let a = ano;
  if (m > 12) { m -= 12; a += 1; }
  if (m < 1)  { m += 12; a -= 1; }
  return { mes: m, ano: a };
}

export function CampanhasView({ userProfile }: { userProfile?: any }) {
  const canManage = userProfile?.permissions?.includes("Criar Campanha") || userProfile?.role === "admin";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isNewCampaignModalOpen, setIsNewCampaignModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | number | null>(null);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [formData, setFormData] = useState({ name: "", fornecedor: "", data_ini: "", data_fim: "", logo: "" });
  const [fornecedores, setFornecedores] = useState<string[]>([]);
  const [imagePreview, setImagePreview] = useState<string>("");

  // Modal Prêmio do Mês
  const [isPremioModalOpen, setIsPremioModalOpen] = useState(false);
  const [mesSelecionado, setMesSelecionado] = useState({ mes: new Date().getMonth() + 1, ano: new Date().getFullYear() });
  const [premioAtual, setPremioAtual] = useState<PremioMes | null>(null);
  const [proximosPremios, setProximosPremios] = useState<PremioMes[]>([]);
  const [loadingPremio, setLoadingPremio] = useState(false);
  const [elegiveis, setElegiveis] = useState<MetaVendedor[] | null>(null);
  const [loadingElegiveis, setLoadingElegiveis] = useState(false);
  const [erroApi, setErroApi] = useState(false);

  // Ranking da campanha selecionada
  const [rankingCampanha, setRankingCampanha] = useState<RankingVendedor[]>([]);
  const [loadingRanking, setLoadingRanking] = useState(false);

  // Card do mês atual (visível no grid)
  const [premioCard, setPremioCard] = useState<PremioMes | null>(null);

  // Modal Amanco
  const [isAmancoModalOpen, setIsAmancoModalOpen] = useState(false);

  useEffect(() => {
    const now = new Date();
    async function fetchData() {
      try {
        const [campanhasRes, premioRes] = await Promise.all([
          supabase.from("campanhas").select("*"),
          supabase.from("premio_mes").select("*").eq("mes", now.getMonth() + 1).eq("ano", now.getFullYear()).limit(1).maybeSingle(),
        ]);

        if (campanhasRes.error) console.error("Campanhas erro:", campanhasRes.error);
        if (premioRes.error) console.error("Premio Mes erro:", premioRes.error);
        
        const campanhasData = campanhasRes.data;
        const premioData = premioRes.data;

        if (premioData) setPremioCard(premioData);
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        setCampaigns((campanhasData ?? []).map((c) => {
          const fim = c.periodo_fim ? new Date(c.periodo_fim) : null;
          const ini = c.date ? new Date(c.date) : null;
          const status = fim && fim < hoje ? "encerrada" : ini && ini > hoje ? "futura" : "ativa";
          const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
          const dateRange = ini && fim ? `${fmtDate(ini)} → ${fmtDate(fim)}` : ini ? fmtDate(ini) : fim ? `até ${fmtDate(fim)}` : "";
          return {
            id: c.id, type: "brand" as const, name: c.name, description: "",
            date: dateRange, status,
            logo: c.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(c.name)}`,
            fornecedor: c.fornecedor || c.name, data_ini: c.date || undefined, data_fim: c.periodo_fim || undefined,
          };
        }));
      } catch (err) {
        console.error("fetchData erro:", err);
      } finally {
        setLoadingCampaigns(false);
      }

      // Fornecedores/marcas em background para o autocomplete
      fetch("/api-campaign/api/fornecedores?type=marca")
        .then(r => r.json()).then(d => { if (d?.fornecedores?.length) setFornecedores(d.fornecedores); })
        .catch(() => {});
    }
    fetchData();
  }, []);

  const carregarPremio = useCallback(async (mes: number, ano: number) => {
    setLoadingPremio(true);
    setLoadingElegiveis(true);
    setErroApi(false);
    setPremioAtual(null);
    setElegiveis(null);

    const now = new Date();
    const mesAtual = now.getMonth() + 1;
    const anoAtual = now.getFullYear();
    const mesano = `${String(mes).padStart(2, "0")}${ano}`;

    const [{ data: premio, error: errP }, { data: proximos }] = await Promise.all([
      supabase.from("premio_mes").select("*").eq("mes", mes).eq("ano", ano).limit(1).maybeSingle(),
      supabase.from("premio_mes")
        .select("*")
        .or(`ano.gt.${anoAtual},and(ano.eq.${anoAtual},mes.gt.${mesAtual})`)
        .order("ano").order("mes")
        .limit(6),
    ]);

    if (errP) console.error("[Campanhas] Erro ao buscar prêmio:", errP);
    if (premio) setPremioAtual(premio);
    setProximosPremios(proximos || []);
    setLoadingPremio(false);

    // Busca elegíveis na API do ERP (≥97% da meta)
    try {
      const elig = await apiElegiveisParaSorteio(mesano);
      
      if (elig && elig.length > 0) {
        const { data: userAvatars } = await supabase
          .from("usuarios")
          .select("avatar, operator_code")
          .in("operator_code", elig.map(v => v.COD_VENDEDOR));
        
        const mappedElig = elig.map(v => ({
          ...v,
          avatar: userAvatars?.find(u => u.operator_code === v.COD_VENDEDOR)?.avatar
        }));
        setElegiveis(mappedElig);
      } else {
        setElegiveis(elig || []);
      }
    } catch (err) {
      console.error("[Campanhas] Erro ao buscar elegíveis:", err);
      setErroApi(true);
      setElegiveis([]);
    }
    setLoadingElegiveis(false);
  }, []);

  const abrirModalPremio = () => {
    const now = new Date();
    const ms = { mes: now.getMonth() + 1, ano: now.getFullYear() };
    setMesSelecionado(ms);
    setIsPremioModalOpen(true);
    carregarPremio(ms.mes, ms.ano);
  };

  const triggerSorteio = async () => {
    if (!premioAtual || !elegiveis || elegiveis.length === 0) return;
    
    const confirmSorteio = window.confirm(`Deseja realmente realizar o sorteio de ${premioAtual.nome}? Esta ação escolherá um dos ${elegiveis.length} vendedores elegíveis.`);
    if (!confirmSorteio) return;

    // Pick a random seller
    const randomIndex = Math.floor(Math.random() * elegiveis.length);
    const winner = elegiveis[randomIndex];
    
    try {
      // Update Supabase DB
      const { error: dbError } = await supabase
        .from("premio_mes")
        .update({
          vendedor_codigo: winner.COD_VENDEDOR,
          vendedor_nome: winner.NOME_VENDEDOR,
          vendedor_avatar: winner.avatar || null,
          atualizado_em: new Date().toISOString()
        })
        .eq("id", premioAtual.id);
        
      if (dbError) throw dbError;
      
      // Update states
      setPremioAtual(prev => prev ? {
        ...prev,
        vendedor_codigo: winner.COD_VENDEDOR,
        vendedor_nome: winner.NOME_VENDEDOR,
        vendedor_avatar: winner.avatar || null
      } : null);
      
      if (premioCard && premioCard.id === premioAtual.id) {
        setPremioCard(prev => prev ? {
          ...prev,
          vendedor_codigo: winner.COD_VENDEDOR,
          vendedor_nome: winner.NOME_VENDEDOR,
          vendedor_avatar: winner.avatar || null
        } : null);
      }

      // Broadcast via Supabase Realtime — inscreve antes de enviar para evitar fallback REST
      const channel = supabase.channel('sorteio_campanha', {
        config: { broadcast: { self: true } },
      });
      const payload = {
        mes: mesSelecionado.mes,
        ano: mesSelecionado.ano,
        elegiveis,
        ganhador: {
          COD_VENDEDOR: winner.COD_VENDEDOR,
          NOME_VENDEDOR: winner.NOME_VENDEDOR,
          avatar: winner.avatar || null,
        },
        premio: premioAtual,
      };
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.send({ type: 'broadcast', event: 'sorteio_iniciado', payload });
          // Remove o canal logo após o envio (não precisa ficar ouvindo)
          setTimeout(() => supabase.removeChannel(channel), 3000);
        }
      });
      
    } catch (err: any) {
      console.error("Erro no sorteio:", err);
      alert(`Erro ao realizar sorteio: ${err.message || err}`);
    }
  };

  const navegarMes = (delta: number) => {
    const novo = offsetMes(mesSelecionado.mes, mesSelecionado.ano, delta);
    setMesSelecionado(novo);
    carregarPremio(novo.mes, novo.ano);
  };

  const abrirRankingCampanha = async (camp: Campaign) => {
    setSelectedCampaign(camp);
    setRankingCampanha([]);
    setLoadingRanking(true);
    try {
      const ranking = await apiCampaignRanking({
        fornecedor: camp.fornecedor || camp.name,
        data_ini: camp.data_ini,
        data_fim: camp.data_fim,
      });
      setRankingCampanha(ranking);
    } catch (err) {
      console.error("[Campanhas] Erro ao buscar ranking:", err);
      setRankingCampanha([]);
    }
    setLoadingRanking(false);
  };

  const mapCampaign = (c: any) => {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const fim = c.periodo_fim ? new Date(c.periodo_fim) : null;
    const ini = c.date ? new Date(c.date) : null;
    const status = fim && fim < hoje ? "encerrada" : ini && ini > hoje ? "futura" : "ativa";
    const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const dateRange = ini && fim ? `${fmtDate(ini)} → ${fmtDate(fim)}` : ini ? fmtDate(ini) : fim ? `até ${fmtDate(fim)}` : "";
    return {
      id: c.id, type: "brand" as const, name: c.name, description: "",
      date: dateRange, status, logo: c.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(c.name)}`,
      fornecedor: c.fornecedor || c.name, data_ini: c.date || undefined, data_fim: c.periodo_fim || undefined,
    } as Campaign;
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Preview imediato
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    // Guarda o File para upload no save
    setFormData(f => ({ ...f, _imageFile: file } as any));
  };


  const abrirNovaCampanha = () => {
    setFormData({ name: "", fornecedor: "", data_ini: "", data_fim: "", logo: "" });
    setImagePreview("");
    setIsNewCampaignModalOpen(true);
  };

  const salvarNovaCampanha = async () => {
    if (!formData.name.trim()) return;
    setSavingCampaign(true);
    const imageFile = (formData as any)._imageFile as File | undefined;
    const logoUrl = imageFile ? await uploadImage(imageFile, "campanhas") : null;
    const { error } = await supabase.from("campanhas").insert({
      name: formData.name.trim(),
      fornecedor: formData.fornecedor || null,
      date: formData.data_ini || null,
      periodo_fim: formData.data_fim || null,
      logo: logoUrl,
      type: "highlight",
      status: "ativa",
    });
    setSavingCampaign(false);
    if (error) { console.error("[Campanhas] Erro ao criar:", error); alert(`Erro ao criar campanha: ${error.message}`); return; }
    setIsNewCampaignModalOpen(false);
    const { data: lista } = await supabase.from("campanhas").select("*");
    if (lista) setCampaigns(lista.map(mapCampaign));
  };

  const abrirEdicao = (camp: Campaign, e: React.MouseEvent) => {
    e.stopPropagation();
    const logoAtual = camp.logo?.startsWith("data:") ? camp.logo : "";
    setFormData({ name: camp.name, fornecedor: camp.fornecedor || "", data_ini: camp.data_ini || "", data_fim: camp.data_fim || "", logo: logoAtual });
    setImagePreview(logoAtual);
    setEditingCampaign(camp);
  };

  const salvarEdicao = async () => {
    if (!editingCampaign || !formData.name.trim()) return;
    setSavingCampaign(true);
    const imageFile = (formData as any)._imageFile as File | undefined;
    const logoUrl = imageFile
      ? await uploadImage(imageFile, "campanhas")
      : (editingCampaign.logo?.startsWith("http") ? editingCampaign.logo : null);
    const { error } = await supabase.from("campanhas").update({
      name: formData.name.trim(),
      fornecedor: formData.fornecedor || null,
      date: formData.data_ini || null,
      periodo_fim: formData.data_fim || null,
      logo: logoUrl,
    }).eq("id", editingCampaign.id);
    setSavingCampaign(false);
    if (error) { console.error("[Campanhas] Erro ao editar:", error); alert(`Erro ao salvar: ${error.message}`); return; }
    const updated = mapCampaign({
      id: editingCampaign.id,
      name: formData.name.trim(),
      fornecedor: formData.fornecedor || null,
      date: formData.data_ini || null,
      periodo_fim: formData.data_fim || null,
      logo: logoUrl,
    });
    setCampaigns(prev => prev.map(c => c.id === editingCampaign.id ? updated : c));
    setEditingCampaign(null);
  };

  const confirmarExclusao = async () => {
    if (confirmDeleteId === null) return;
    
    const idToDelete = isNaN(Number(confirmDeleteId)) ? confirmDeleteId : Number(confirmDeleteId);
    console.log("[Campanhas] Tentando excluir ID:", idToDelete, "Tipo:", typeof idToDelete);
    
    // Tentamos deletar e pedimos o retorno do que foi deletado
    const { data, error } = await supabase
      .from("campanhas")
      .delete()
      .eq("id", idToDelete)
      .select();

    if (error) { 
      console.error("[Campanhas] Erro Supabase:", error); 
      alert(`Erro ao excluir: ${error.message}`); 
      return; 
    }

    if (!data || data.length === 0) {
      // Se não deletou no banco, não vamos tirar da tela para não enganar o usuário
      alert("Aviso: A campanha não pôde ser removida do servidor. Verifique suas permissões.");
      setConfirmDeleteId(null);
      return;
    }

    setCampaigns((prev) => prev.filter((c) => c.id !== confirmDeleteId));
    setConfirmDeleteId(null);
  };

  const now = new Date();
  const mesAtual = now.getMonth() + 1;
  const anoAtual = now.getFullYear();
  const isMesAtual = mesSelecionado.mes === mesAtual && mesSelecionado.ano === anoAtual;

  return (
    <div className="h-full flex flex-col pt-4 px-3 sm:px-6 pb-2 overflow-hidden bg-background">
      <style>{`
        @keyframes border-trace {
          0%, 100% { clip-path: inset(0 0 98% 0); }
          25%  { clip-path: inset(0 0 0 98%); }
          50%  { clip-path: inset(98% 0 0 0); }
          75%  { clip-path: inset(0 98% 0 0); }
        }
        .animate-border-trace { animation: border-trace 4s linear infinite; }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0 bg-secondary/20 p-4 rounded-3xl border border-border/40">
        <div>
          <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Campanhas Ativas</h2>
          <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em] mt-1 opacity-70">Programas de Incentivo e Vendas Digitais</p>
        </div>
        {canManage && (
          <button
            onClick={abrirNovaCampanha}
            className="h-10 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[11px] font-black transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2 uppercase tracking-widest active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Nova Campanha
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto scrollbar-hide pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 pb-6">

          {/* Card Campanha Amanco — Seleção de Prêmios */}
          <div
            onClick={() => setIsAmancoModalOpen(true)}
            className="aspect-[4/5] rounded-[32px] p-6 flex flex-col border border-cyan-500/30 transition-all duration-500 cursor-pointer group relative overflow-hidden bg-card/60 backdrop-blur-xl shadow-2xl shadow-cyan-600/10 hover:shadow-cyan-500/20 hover:scale-[1.02]"
          >
            <div className="absolute inset-0 z-0 pointer-events-none">
              <div className="absolute inset-0 border-2 border-cyan-500 rounded-[32px] animate-border-trace opacity-40 shadow-[0_0_15px_rgba(6,182,212,0.2)]" />
              <div className="absolute inset-0 bg-gradient-to-b from-cyan-600/5 via-blue-600/5 to-transparent" />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 relative z-10">
              <div className="w-20 h-20 rounded-[28px] bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-2xl shadow-cyan-600/40 group-hover:scale-110 transition-all duration-700 group-hover:rotate-6">
                <span className="text-white font-black text-[11px] uppercase tracking-tight leading-tight text-center px-1">AMANCO</span>
              </div>
              <div className="space-y-1.5">
                <p className="text-[9px] font-black text-cyan-500 uppercase tracking-[0.2em] opacity-80">Campanha Especial</p>
                <h3 className="text-[11px] font-black text-foreground tracking-tight leading-tight uppercase">
                  Seleção de Prêmios
                </h3>
                <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">Amanco</p>
              </div>
              <div className="px-4 py-1.5 rounded-2xl bg-cyan-600/10 border border-cyan-500/20 flex items-center gap-2 group-hover:bg-cyan-600 group-hover:text-white transition-all">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-ping" />
                <span className="text-[9px] font-black tracking-[0.1em] uppercase">Ver Ranking</span>
              </div>
            </div>
          </div>

          {/* Card Prêmio do Mês — sempre visível, abre modal */}
          <div
            onClick={abrirModalPremio}
            className="aspect-[4/5] rounded-[32px] p-6 flex flex-col border border-blue-500/30 transition-all duration-500 cursor-pointer group relative overflow-hidden bg-card/60 backdrop-blur-xl shadow-2xl shadow-blue-600/10 hover:shadow-blue-500/20 hover:scale-[1.02]"
          >
            <div className="absolute inset-0 z-0 pointer-events-none">
              <div className="absolute inset-0 border-2 border-blue-500 rounded-[32px] animate-border-trace opacity-40 shadow-[0_0_15px_rgba(59,130,246,0.2)]" />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 relative z-10">
              {premioCard?.imagem ? (
                <img src={premioCard.imagem} alt={premioCard.nome} className="w-24 h-24 object-contain group-hover:scale-125 transition-transform duration-700 drop-shadow-[0_10px_20px_rgba(59,130,246,0.3)]" />
              ) : (
                <div className="w-20 h-20 rounded-[28px] bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center shadow-2xl shadow-blue-600/40 group-hover:scale-110 transition-all duration-700 group-hover:rotate-6">
                  <Trophy className="w-10 h-10 text-white" />
                </div>
              )}
              <div className="space-y-1.5">
                <p className="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em] opacity-80">Prêmio Especial</p>
                <h3 className="text-[12px] font-black text-foreground tracking-tight leading-tight line-clamp-3 uppercase">
                  {premioCard?.nome ?? "Consultar Prêmio"}
                </h3>
                {premioCard?.valor && (
                  <p className="text-lg font-black text-blue-500 tracking-tighter">
                    R$ {Number(premioCard.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
              <div className="px-4 py-1.5 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center gap-2 group-hover:bg-blue-600 group-hover:text-white transition-all">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                <span className="text-[9px] font-black tracking-[0.1em] uppercase">Meta Ativa</span>
              </div>
            </div>
          </div>

          {/* Skeletons enquanto carrega */}
          {loadingCampaigns && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] rounded-xl border border-border/60 bg-card overflow-hidden animate-pulse">
              <div className="h-3/5 bg-secondary/60 m-3 rounded-lg" />
              <div className="px-4 space-y-2">
                <div className="h-2.5 bg-secondary/60 rounded w-3/4" />
                <div className="h-2 bg-secondary/60 rounded w-1/2" />
                <div className="h-4 bg-secondary/60 rounded w-1/4 mt-1" />
              </div>
            </div>
          ))}

          {/* Cards de Campanhas */}
          {!loadingCampaigns && campaigns.map((camp) => (
            <div
              key={camp.id}
              onClick={() => abrirRankingCampanha(camp)}
              className="aspect-[4/5] rounded-[32px] p-6 flex flex-col border border-border/40 transition-all duration-500 cursor-pointer group relative overflow-hidden bg-card/40 backdrop-blur-md shadow-lg hover:shadow-2xl hover:border-blue-500/30 hover:scale-[1.02]"
            >
              {/* Ações editar/excluir */}
              <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 z-10">
                {canManage && (
                  <>
                    <button
                      onClick={(e) => abrirEdicao(camp, e)}
                      className="w-8 h-8 bg-card border border-border rounded-xl shadow-lg text-muted-foreground hover:text-blue-500 hover:border-blue-500/50 flex items-center justify-center transition-all bg-secondary/50"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(camp.id); }}
                      className="w-8 h-8 bg-card border border-border rounded-xl shadow-lg text-muted-foreground hover:text-rose-500 hover:border-rose-500/50 flex items-center justify-center transition-all bg-secondary/50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>

              <div className="flex-1 bg-secondary/30 rounded-[24px] p-6 flex items-center justify-center border border-border/20 mb-4 transition-all group-hover:bg-blue-500/5 group-hover:rotate-1 relative overflow-hidden group-hover:border-blue-500/20">
                <img
                  src={camp.logo}
                  alt={camp.name}
                  onLoad={(e) => {
                    e.currentTarget.style.opacity = "1";
                    const skeleton = e.currentTarget.parentElement?.querySelector(".img-skeleton") as HTMLElement;
                    if (skeleton) skeleton.style.display = "none";
                  }}
                  style={{ opacity: 0, transition: "all 0.5s", position: "relative", zIndex: 1 }}
                  className="max-h-16 w-auto object-contain group-hover:scale-125 transition-all duration-700 grayscale group-hover:grayscale-0 contrast-125 group-hover:contrast-100"
                />
                <div className="img-skeleton absolute inset-0 bg-secondary/20 animate-pulse rounded-lg" />
              </div>
              <div className="space-y-2">
                <h3 className="text-[11px] font-black text-foreground truncate uppercase tracking-tight group-hover:text-blue-500 transition-colors">{camp.name}</h3>
                <p className="text-[9px] font-bold text-muted-foreground tracking-widest leading-none border-l-2 border-blue-500/30 pl-2">{camp.date}</p>
                <div className="pt-1">
                  <span className={cn(
                    "inline-flex px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all",
                    camp.status === "ativa" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]" :
                    camp.status === "futura" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                    "bg-secondary/40 text-muted-foreground border-border opacity-50"
                  )}>
                    {camp.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── MODAL PRÊMIO DO MÊS ── */}
      {isPremioModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setIsPremioModalOpen(false)} />
          <div className="relative w-full max-w-2xl bg-card border border-border/50 rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10 animate-in zoom-in-95 duration-300">

            {/* Header */}
            <div className="px-8 py-6 flex items-center justify-between border-b border-border/40 bg-secondary/30 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600 rounded-[18px] flex items-center justify-center shadow-lg shadow-blue-600/20 rotate-3">
                  <Trophy className="w-6 h-6 text-white -rotate-3" />
                </div>
                <div>
                  <h2 className="text-[15px] font-black text-foreground uppercase tracking-tight">Vantagens & Prêmios</h2>
                  <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em] opacity-70">Bata a meta • Concorra ao sorteio</p>
                </div>
              </div>
              <button onClick={() => setIsPremioModalOpen(false)} className="w-10 h-10 rounded-2xl bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-white hover:bg-rose-500 transition-all active:scale-90">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide p-4">

              {/* Seletor de Mês */}
              <div className="px-6 pt-2 pb-6 flex items-center justify-center gap-6">
                <button onClick={() => navegarMes(-1)} className="w-8 h-8 flex items-center justify-center bg-secondary border border-border rounded-xl transition-all text-muted-foreground hover:text-blue-500 hover:border-blue-500/50">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="text-center min-w-[140px]">
                  <span className="text-[13px] font-black text-foreground uppercase tracking-[0.1em]">
                    {MESES[mesSelecionado.mes - 1]} {mesSelecionado.ano}
                  </span>
                  {isMesAtual && (
                    <div className="mt-1">
                      <span className="px-3 py-1 rounded-full bg-blue-600/20 border border-blue-500/20 text-[9px] font-black text-blue-500 uppercase tracking-widest">Atendimento Ativo</span>
                    </div>
                  )}
                </div>
                <button onClick={() => navegarMes(+1)} className="w-8 h-8 flex items-center justify-center bg-secondary border border-border rounded-xl transition-all text-muted-foreground hover:text-blue-500 hover:border-blue-500/50">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
 
                {/* Prêmio do Mês Selecionado */}
                <div className="px-6 pb-5">
                  {!loadingPremio && premioAtual?.vendedor_codigo && (
                    <div className="mb-5 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-amber-500/10 border-2 border-amber-500/30 rounded-[24px] p-5 flex items-center justify-between shadow-lg relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl -mr-16 -mt-16" />
                      <div className="flex items-center gap-4 relative z-10">
                        <div className="w-14 h-14 rounded-full border-2 border-amber-500 shadow-xl overflow-hidden flex items-center justify-center bg-blue-600/10 shrink-0">
                          {premioAtual.vendedor_avatar ? (
                            <img src={premioAtual.vendedor_avatar} alt={premioAtual.vendedor_nome || ""} className="w-full h-full object-cover" />
                          ) : (
                            <Trophy className="w-7 h-7 text-amber-500" />
                          )}
                        </div>
                        <div className="text-left">
                          <p className="text-[9px] font-black text-amber-500 uppercase tracking-[0.25em]">Ganhador do Sorteio 🏆</p>
                          <h4 className="text-sm font-black text-foreground uppercase tracking-tight">{premioAtual.vendedor_nome}</h4>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">Código: {premioAtual.vendedor_codigo}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 relative z-10 shrink-0">
                        <span className="text-[9px] font-black text-amber-600 bg-amber-500/15 border border-amber-500/20 px-2 py-0.5 rounded-md uppercase tracking-widest">Premiado</span>
                      </div>
                    </div>
                  )}

                  {loadingPremio ? (
                    <div className="bg-secondary/40 rounded-xl p-6 flex items-center justify-center h-40">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : premioAtual ? (
                  <div className="bg-card/40 backdrop-blur-xl border border-blue-500/20 rounded-[32px] p-8 flex gap-8 items-center relative overflow-hidden group shadow-2xl shadow-blue-900/10">
                    <div className="absolute inset-0 border-2 border-blue-500 rounded-[32px] animate-border-trace opacity-20 pointer-events-none group-hover:opacity-40 transition-opacity" />
                    {premioAtual.imagem ? (
                      <div className="w-32 h-32 shrink-0 rounded-2xl bg-white p-3 shadow-2xl group-hover:scale-105 transition-transform duration-500">
                        <img src={premioAtual.imagem} alt={premioAtual.nome} className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-32 h-32 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                        <Gift className="w-12 h-12 text-blue-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-lg bg-blue-600 text-white text-[9px] font-black uppercase tracking-[0.2em]">
                          {MESES[premioAtual.mes - 1]} {premioAtual.ano}
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-foreground leading-tight uppercase tracking-tight">{premioAtual.nome}</h3>
                      {premioAtual.descricao && (
                        <p className="text-[11px] text-muted-foreground/80 leading-relaxed line-clamp-3 font-medium">{premioAtual.descricao}</p>
                      )}
                      <div className="pt-2 flex items-baseline gap-2">
                        <span className="text-[10px] font-black text-blue-500 uppercase">Preço Estimado</span>
                        <p className="text-3xl font-black text-blue-500 tracking-tighter">
                          R$ {Number(premioAtual.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-secondary/40 border border-dashed border-border/60 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-2">
                    <Gift className="w-8 h-8 text-slate-300" />
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Nenhum prêmio definido para este mês</p>
                  </div>
                )}
              </div>

              {/* Vendedores Elegíveis */}
              <div className="px-6 pb-5">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-3.5 h-3.5 text-amber-500" />
                  <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Vendedores Elegíveis</h4>
                  <span className="text-[9px] font-bold text-muted-foreground/50">≥ 97% da meta</span>
                  {elegiveis && !loadingElegiveis && (
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-950/30 rounded-full px-2 py-0.5">
                        {elegiveis.length} elegíveis
                      </span>
                      {canManage && premioAtual && !premioAtual.vendedor_codigo && elegiveis.length > 0 && (
                        <button
                          onClick={triggerSorteio}
                          className="h-8 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-md shadow-amber-500/10 flex items-center gap-1.5"
                        >
                          <Trophy className="w-3 h-3" />
                          Sortear Ganhador
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {loadingElegiveis ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[1,2,3].map(i => (
                      <div key={i} className="bg-secondary/60 rounded-xl h-20 animate-pulse" />
                    ))}
                  </div>
                ) : erroApi ? (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center gap-3 animate-pulse">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-[11px] text-amber-500/90 font-black uppercase tracking-tight">Sincronização ERP: API offline ou servidor não respondendo.</p>
                  </div>
                ) : elegiveis && elegiveis.length === 0 ? (
                  <div className="bg-secondary/40 border border-border/60 rounded-xl p-5 text-center">
                    <p className="text-[11px] font-bold text-muted-foreground">Nenhum vendedor atingiu 97% da meta neste mês ainda.</p>
                  </div>
                ) : elegiveis && elegiveis.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {elegiveis.map((v) => {
                        const pct = parseFloat(v.PERC_META_BATIDA);
                        const borderColor = pct >= 100 ? "border-emerald-500/40" : "border-amber-500/40";
                        const pctColor = pct >= 100 ? "text-emerald-500" : "text-amber-500";
                        
                        return (
                          <div key={v.COD_VENDEDOR} className={cn("bg-card/40 backdrop-blur-md border-2 rounded-2xl p-3 flex flex-col items-center text-center gap-1 group hover:bg-card/60 transition-all shadow-lg", borderColor)}>
                            <div className="w-12 h-12 rounded-full border-2 border-slate-700/50 shadow-xl overflow-hidden mb-1 flex items-center justify-center bg-blue-600/20 shrink-0">
                              {v.avatar ? (
                                <img src={v.avatar} alt={v.NOME_VENDEDOR} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-white text-[10px] font-black uppercase">
                                  {v.NOME_VENDEDOR.split(" ").map(n => n[0]).slice(0,2).join("")}
                                </span>
                              )}
                            </div>
                            <p className="text-[9px] font-black text-foreground uppercase leading-tight line-clamp-1">{v.NOME_VENDEDOR}</p>
                            <p className={cn("text-[11px] font-black", pctColor)}>{pct.toFixed(1)}%</p>
                          </div>
                        );
                      })}
                  </div>
                ) : null}
              </div>

              {/* Próximos Prêmios */}
              {proximosPremios.length > 0 && (
                <div className="px-6 pb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Gift className="w-3.5 h-3.5 text-muted-foreground" />
                    <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Próximos Prêmios</h4>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {proximosPremios.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => { setMesSelecionado({ mes: p.mes, ano: p.ano }); carregarPremio(p.mes, p.ano); }}
                        className="bg-secondary/40 border border-border/60 rounded-xl p-3 flex flex-col items-center text-center gap-2 cursor-pointer hover:border-blue-300 hover:bg-blue-50/50 transition-all group"
                      >
                        {p.imagem ? (
                          <img src={p.imagem} alt={p.nome} className="w-12 h-12 object-contain group-hover:scale-110 transition-transform" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-secondary/60 flex items-center justify-center">
                            <Gift className="w-5 h-5 text-slate-300" />
                          </div>
                        )}
                        <div>
                          <p className="text-[9px] font-black text-blue-500 uppercase tracking-wider">{MESES[p.mes - 1].slice(0,3)} {p.ano}</p>
                          <p className="text-[10px] font-black text-foreground leading-tight line-clamp-2 uppercase">{p.nome}</p>
                          {p.valor && <p className="text-[10px] font-black text-blue-500/80 mt-0.5">R$ {Number(p.valor).toLocaleString("pt-BR")}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── MODAL RANKING CAMPANHA ── */}
      {selectedCampaign && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setSelectedCampaign(null)} />
          <div className="relative w-full max-w-4xl bg-card border border-border/50 rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10 animate-in zoom-in-95 duration-300">
            <div className="px-10 py-8 flex items-center justify-between border-b border-border/40 bg-secondary/30 shrink-0">
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 bg-blue-600 rounded-[18px] flex items-center justify-center shadow-lg shadow-blue-600/30">
                  <Target className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-[17px] font-black text-foreground uppercase tracking-tight">Ranking de Performance</h2>
                  <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.3em] mt-1 opacity-70">{selectedCampaign.name} • MONITORAMENTO REAL-TIME</p>
                </div>
              </div>
              <button onClick={() => setSelectedCampaign(null)} className="w-12 h-12 rounded-2xl bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-white hover:bg-rose-500 transition-all active:scale-95">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 scrollbar-hide bg-background/40">
              {loadingRanking ? (
                <div className="space-y-2">
                  {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-secondary/60 rounded-lg animate-pulse" />)}
                </div>
              ) : rankingCampanha.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center h-40">
                  <AlertCircle className="w-8 h-8 text-slate-200" />
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    {erroApi ? "API não disponível" : "Nenhum dado de faturamento encontrado para este fornecedor"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-12 px-4 mb-2 text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                    <div className="col-span-1">Pos</div>
                    <div className="col-span-7">Vendedor</div>
                    <div className="col-span-2 text-right">Qtd</div>
                    <div className="col-span-2 text-right">Faturado</div>
                  </div>
                  {rankingCampanha.map((v, i) => (
                    <div key={v.COD_VENDEDOR} className="grid grid-cols-12 items-center bg-card/60 hover:bg-secondary/40 px-6 py-4 rounded-3xl border border-border/40 transition-all group mb-2 hover:border-blue-500/30">
                      <div className="col-span-1">
                        <div className={cn(
                          "w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-black shadow-lg",
                          i === 0 ? "bg-amber-400 text-amber-950 rotate-3 scale-110 shadow-amber-400/20 border-2 border-white/20" : 
                          i === 1 ? "bg-slate-300 text-foreground shadow-slate-300/20" : 
                          i === 2 ? "bg-orange-300 text-orange-950 shadow-orange-300/20" : 
                          "bg-secondary/50 text-muted-foreground border border-border/40"
                        )}>{i + 1}</div>
                      </div>
                      <div className="col-span-7 pl-4">
                        <span className="text-[12px] font-black text-foreground uppercase tracking-tight group-hover:text-blue-500 transition-colors">{v.NOME_VENDEDOR}</span>
                      </div>
                      <div className="col-span-2 text-right">
                        <span className="text-[11px] font-bold text-muted-foreground opacity-60 uppercase">{v.QTD_VENDAS} VDS</span>
                      </div>
                      <div className="col-span-2 text-right">
                        <span className="text-[13px] font-black text-emerald-500 tabular-nums">
                          {parseFloat(v.FATURADO).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-border/40 bg-card shrink-0">
              <button onClick={() => setSelectedCampaign(null)} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-[0.98]">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL AMANCO ── */}
      {isAmancoModalOpen && <AmancoModal onClose={() => setIsAmancoModalOpen(false)} />}

      {/* ── MODAL NOVA / EDITAR CAMPANHA ── */}
      {(isNewCampaignModalOpen || editingCampaign) && (() => {
        const isEdit = !!editingCampaign;
        const onClose = () => isEdit ? setEditingCampaign(null) : setIsNewCampaignModalOpen(false);
        const onSave = () => isEdit ? salvarEdicao() : salvarNovaCampanha();
        return (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />
            <div className="relative w-full max-w-[480px] bg-card border border-border/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
              <div className="px-8 py-6 flex items-center justify-between border-b border-border/40 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center border border-blue-100">
                    {isEdit ? <Pencil className="w-5 h-5 text-blue-600" /> : <Plus className="w-5 h-5 text-blue-600" />}
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-foreground uppercase tracking-tight">{isEdit ? "Editar Campanha" : "Nova Campanha"}</h2>
                    <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-0.5">{isEdit ? editingCampaign.name : "Cadastro de Incentivo"}</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 text-muted-foreground hover:text-slate-600 hover:bg-secondary/40 rounded-lg transition-all"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-5 scrollbar-hide">
                {/* Imagem */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground/80 uppercase tracking-wider ml-1">Logo / Imagem</label>
                  <label className="flex flex-col items-center justify-center gap-2 w-full h-32 bg-secondary/40 border-2 border-dashed border-border/60 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all relative overflow-hidden">
                    {imagePreview ? (
                      <img src={imagePreview} alt="preview" className="absolute inset-0 w-full h-full object-contain p-3" />
                    ) : (
                      <>
                        <div className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center">
                          <Plus className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Clique para enviar imagem</span>
                        <span className="text-[9px] text-slate-300">JPG, PNG, SVG</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  </label>
                  {imagePreview && (
                    <button onClick={() => { setImagePreview(""); setFormData(f => ({ ...f, logo: "" })); }} className="text-[9px] font-bold text-red-400 hover:text-red-600 uppercase tracking-wider">
                      Remover imagem
                    </button>
                  )}
                </div>

                {/* Nome */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-muted-foreground/80 uppercase tracking-wider ml-1">Nome da Campanha <span className="text-red-400">*</span></label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Campanha IVM – Abril 2026" className="w-full bg-secondary/40 border border-border/60 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-600/50 focus:ring-4 focus:ring-blue-600/5 transition-all" />
                </div>

                {/* Fornecedor */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-muted-foreground/80 uppercase tracking-wider ml-1">Fornecedor</label>
                  <select
                    value={formData.fornecedor}
                    onChange={(e) => setFormData(f => ({ ...f, fornecedor: e.target.value }))}
                    className="w-full bg-secondary/40 border border-border/60 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-600/50 focus:ring-4 focus:ring-blue-600/5 transition-all appearance-none"
                  >
                    <option value="">Selecionar fornecedor...</option>
                    {fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>

                {/* Período */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-muted-foreground/80 uppercase tracking-wider ml-1">Início</label>
                    <input type="date" value={formData.data_ini} onChange={(e) => setFormData(f => ({ ...f, data_ini: e.target.value }))} className="w-full bg-secondary/40 border border-border/60 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-600/50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-muted-foreground/80 uppercase tracking-wider ml-1">Término</label>
                    <input type="date" value={formData.data_fim} onChange={(e) => setFormData(f => ({ ...f, data_fim: e.target.value }))} className="w-full bg-secondary/40 border border-border/60 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-600/50" />
                  </div>
                </div>
              </div>

              <div className="p-8 border-t border-border/40 shrink-0">
                <button onClick={onSave} disabled={savingCampaign || !formData.name.trim()} className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-[0.98] shadow-lg shadow-blue-600/10">
                  {savingCampaign ? "Salvando..." : isEdit ? "Salvar Alterações" : "Criar Campanha"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── CONFIRMAÇÃO EXCLUIR ── */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="fixed inset-0" onClick={() => setConfirmDeleteId(null)} />
          <div className="relative w-full max-w-sm bg-card border border-border/60 rounded-2xl shadow-2xl p-8 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center border border-red-100">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h3 className="text-sm font-black text-foreground uppercase tracking-tight">Excluir campanha?</h3>
              <p className="text-[11px] text-muted-foreground mt-1">Esta ação não pode ser desfeita.</p>
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-3 bg-secondary hover:bg-secondary/80 text-muted-foreground rounded-xl font-black text-xs uppercase tracking-widest transition-all">Cancelar</button>
              <button onClick={confirmarExclusao} className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-600/20">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
