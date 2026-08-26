import { useState, useEffect, useCallback } from "react";
import {
  MapPin,
  CheckCircle2,
  Navigation,
  Camera,
  User as UserIcon,
  RefreshCw,
  X,
  Package,
  AlertCircle,
  AlertTriangle,
  Send,
  Sun,
  Moon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { uploadImage } from "@/lib/uploadImage";
import { useTheme } from "@/context/theme-provider";
import { motion, AnimatePresence } from "framer-motion";
import { TIPOS_OCORRENCIA } from "@/lib/ocorrencias";

interface Delivery {
  id: string;
  nf: string;
  client: string;
  address: string;
  status: "pending" | "completed" | "failed";
  time?: string;
  value: string;
  image?: string;
  instructions?: string;
  romCode: string;
  romDate?: string;
}

export function MotoristaView() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const [loading, setLoading] = useState(true);
  const [entregas, setEntregas] = useState<Delivery[]>([]);
  const [driverName, setDriverName] = useState("");
  const [driverAvatar, setDriverAvatar] = useState<string | null>(null);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
  const [isOcorrenciaModalOpen, setIsOcorrenciaModalOpen] = useState(false);
  const [ocorrenciaTipo, setOcorrenciaTipo] = useState("");
  const [ocorrenciaDescricao, setOcorrenciaDescricao] = useState("");
  const [ocorrenciaFoto, setOcorrenciaFoto] = useState<File | null>(null);
  const [ocorrenciaBloqueia, setOcorrenciaBloqueia] = useState(false);
  const [enviandoOcorrencia, setEnviandoOcorrencia] = useState(false);

  const searchParams = new URLSearchParams(window.location.search);
  const driverCode = searchParams.get("v") || "geral";
  const hoje = new Date().toISOString().split('T')[0];

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const { data: users } = await supabase
        .from("usuarios")
        .select("avatar, name")
        .eq("operator_code", driverCode)
        .limit(1);
      
      if (users && users.length > 0) {
        setDriverAvatar(users[0].avatar || null);
      }
 
      const { data: deliveriesData } = await supabase
        .from("entregas")
        .select("*")
        .eq("driver_cod", driverCode)
        .eq("rom_date", hoje)
        .order("created_at", { ascending: true });
 
      if (deliveriesData && deliveriesData.length > 0) {
        setDriverName(deliveriesData[0].driver_name || "Motorista");
        setEntregas(deliveriesData.map(d => ({
          id: d.id,
          nf: d.nf,
          client: d.client,
          address: d.address,
          status: d.status,
          time: d.time,
          value: `R$ ${Number(d.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          image: d.image,
          instructions: d.instructions,
          romCode: d.rom_code,
          romDate: d.rom_date
        })));
      } else {
        setEntregas([]);
      }
    } catch (error) {
      console.error("Erro ao buscar entregas:", error);
    } finally {
      setLoading(false);
    }
  }, [driverCode, hoje]);

  useEffect(() => {
    fetchData();
    // Sincronização Ultra-Rápida: Qualquer alteração no romaneio atualiza a tela do motorista
    const channel = supabase
      .channel('motorista_entregas_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, (p) => {
        console.log("[Mobile] Mudança detectada:", p);
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [driverCode, fetchData]);

  const handleFinish = async (file: File) => {
    if (!selectedDelivery) return;
    try {
      setUploading(true);
      const publicUrl = await uploadImage(file, "entregas", false, true);
      if (!publicUrl) {
        alert("Erro ao enviar imagem do comprovante.");
        return;
      }
      const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const { error } = await supabase.from("entregas").update({ status: "completed", image: publicUrl, time: nowTime }).eq("id", selectedDelivery.id);
      if (error) throw error;

      // VERIFICAÇÃO DE ENCERRAMENTO DO ROMANEIO
      // Buscar todas as entregas desse romaneio para ver se acabou tudo
      const { data: allEntregas } = await supabase
        .from("entregas")
        .select("status")
        .eq("rom_code", selectedDelivery.romCode);

      if (allEntregas) {
        const hasPending = allEntregas.some(e => e.status === "pending");
        if (!hasPending) {
          console.log("[Mobile] Roteiro finalizado! Atualizando status do romaneio...");
          await supabase
            .from("entregas")
            .update({ rom_status: "concluido" })
            .eq("rom_code", selectedDelivery.romCode);
        }
      }

      setIsFinishModalOpen(false);
      setSelectedDelivery(null);
      fetchData();
    } catch (err) {
      console.error(err);
      alert("Erro ao finalizar entrega.");
    } finally {
      setUploading(false);
    }
  };

  const abrirOcorrencia = (delivery: Delivery) => {
    setSelectedDelivery(delivery);
    setOcorrenciaTipo("");
    setOcorrenciaDescricao("");
    setOcorrenciaFoto(null);
    setOcorrenciaBloqueia(false);
    setIsOcorrenciaModalOpen(true);
  };

  const handleRegistrarOcorrencia = async () => {
    if (!selectedDelivery || !ocorrenciaTipo) return;
    try {
      setEnviandoOcorrencia(true);

      let publicUrl: string | null = null;
      if (ocorrenciaFoto) {
        publicUrl = await uploadImage(ocorrenciaFoto, "entregas", false, true);
        if (!publicUrl) {
          alert("Erro ao enviar a foto da ocorrência. Tente novamente ou envie sem foto.");
          return;
        }
      }

      const { error } = await supabase.from("entregas_ocorrencias").insert({
        entrega_id: selectedDelivery.id,
        rom_code: selectedDelivery.romCode,
        rom_date: selectedDelivery.romDate || hoje,
        nf: selectedDelivery.nf,
        client: selectedDelivery.client,
        address: selectedDelivery.address,
        driver_cod: driverCode,
        driver_name: driverName || null,
        tipo: ocorrenciaTipo,
        descricao: ocorrenciaDescricao.trim() || null,
        image: publicUrl,
        bloqueou_entrega: ocorrenciaBloqueia,
        status: "aberta"
      });
      if (error) throw error;

      // Ocorrência que impede a entrega marca a parada como não realizada, para
      // ela sair das pendências do motorista e o romaneio poder ser encerrado.
      if (ocorrenciaBloqueia) {
        const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        await supabase.from("entregas").update({ status: "failed", time: nowTime }).eq("id", selectedDelivery.id);

        const { data: allEntregas } = await supabase
          .from("entregas")
          .select("status")
          .eq("rom_code", selectedDelivery.romCode);
        if (allEntregas && !allEntregas.some(e => e.status === "pending")) {
          await supabase
            .from("entregas")
            .update({ rom_status: "concluido" })
            .eq("rom_code", selectedDelivery.romCode);
        }
      }

      setIsOcorrenciaModalOpen(false);
      setSelectedDelivery(null);
      fetchData();
    } catch (err) {
      console.error(err);
      alert("Erro ao registrar a ocorrência.");
    } finally {
      setEnviandoOcorrencia(false);
    }
  };

  const handleNavigate = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, "_blank");
  };

  const stats = {
    total: entregas.length,
    concluidas: entregas.filter(e => e.status === "completed").length,
    pendentes: entregas.filter(e => e.status === "pending").length
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 pb-12 font-sans antialiased text-slate-900 dark:text-slate-100 leading-relaxed transition-colors">

      {/* APP BAR - LIMPISSIMA */}
      <nav className="sticky top-0 z-40 px-4 pt-4 pb-2 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-xl">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-3 shadow-xl shadow-slate-200/50 dark:shadow-black/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center text-white border-2 border-white shadow-lg overflow-hidden shrink-0">
               {driverAvatar ? (
                  <img src={driverAvatar} alt="Motorista" className="w-full h-full object-cover" />
               ) : (
                  <span className="text-lg font-black">{driverName ? driverName.charAt(0) : <UserIcon size={20}/>}</span>
               )}
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-tight leading-none text-slate-900 dark:text-white">
                {driverName.split(' ')[0] || "Motorista"}
              </h1>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
              </p>
            </div>
          </div>
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label="Alternar tema"
            title={isDark ? "Modo claro" : "Modo escuro"}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-amber-400 dark:border-slate-700 transition-colors active:scale-95"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </nav>

      {/* DASHBOARD STATUS - PILLS */}
      <div className="grid grid-cols-3 gap-3 px-4 mt-2">
        {[
          { label: "Carga", val: stats.total, color: "bg-slate-900", text: "text-white" },
          { label: "Feito", val: stats.concluidas, color: "bg-emerald-500", text: "text-white" },
          { label: "Faltam", val: stats.pendentes, color: "bg-blue-600", text: "text-white" }
        ].map((s, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={s.label} 
            className={cn(s.color, "p-4 rounded-3xl shadow-lg border border-white/10 flex flex-col items-center justify-center")}
          >
            <span className={cn(s.text, "text-[9px] font-black uppercase tracking-[0.2em] opacity-60 mb-0.5")}>{s.label}</span>
            <span className={cn(s.text, "text-xl font-black")}>{s.val}</span>
          </motion.div>
        ))}
      </div>

      {/* SELETOR DE ABAS */}
      <div className="px-4 mt-6">
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl gap-1">
          <button
            onClick={() => setActiveTab("pending")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              activeTab === "pending" ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-400 dark:text-slate-500"
            )}
          >
            <Package size={14} />
            Entregas
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              activeTab === "history" ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm" : "text-slate-400 dark:text-slate-500"
            )}
          >
            <RefreshCw size={14} />
            Histórico
          </button>
        </div>
      </div>

      {/* LISTA DE ENTREGAS */}
      <main className="flex-1 px-4 mt-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1 h-4 bg-blue-600 rounded-full" />
          <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
            {activeTab === "pending" ? "Pendentes para Hoje" : "Finalizadas Hoje"}
          </h2>
        </div>
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-44 w-full bg-slate-100 dark:bg-slate-800 animate-pulse rounded-[32px]" />
            ))}
          </div>
        ) : (() => {
          const filtered = entregas.filter(e => activeTab === "pending" ? e.status === "pending" : e.status !== "pending");
          
          if (filtered.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-[40px] flex items-center justify-center mb-6 border-4 border-white dark:border-slate-700 shadow-sm">
                  {activeTab === "pending" ? <CheckCircle2 className="text-emerald-500" size={40} /> : <AlertCircle className="text-slate-300 dark:text-slate-600" size={40} />}
                </div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  {activeTab === "pending" ? "Tudo Pronto!" : "Histórico Vazio"}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  {activeTab === "pending" ? "Você não tem entregas pendendas para hoje." : "Nenhuma entrega concluída ainda neste turno."}
                </p>
              </div>
            );
          }

          return filtered.map((e, idx) => (
            <motion.div 
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              key={e.id} 
              className={cn(
                "bg-white dark:bg-slate-900 rounded-[32px] p-6 border-2 transition-all relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
                e.status === "completed" ? "border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/10 dark:bg-emerald-950/20 grayscale-[0.5] opacity-80"
                  : e.status === "failed" ? "border-amber-100 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/20"
                  : "border-slate-50 dark:border-slate-800"
              )}
            >
              {/* BADGE CONCLUIDO */}
              {e.status === "completed" && (
                <div className="absolute top-4 right-6 flex items-center gap-2 px-3 py-1.5 bg-emerald-500 rounded-full text-white text-[9px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 size={12} />
                  Entregue às {e.time}
                </div>
              )}
              {e.status === "failed" && (
                <div className="absolute top-4 right-6 flex items-center gap-2 px-3 py-1.5 bg-amber-500 rounded-full text-white text-[9px] font-black uppercase tracking-widest shadow-lg shadow-amber-500/20">
                  <AlertTriangle size={12} />
                  Não entregue{e.time ? ` às ${e.time}` : ""}
                </div>
              )}

              <div className="flex items-center gap-3 mb-5">
                <div className={cn(
                  "w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-black",
                  e.status === "completed" ? "bg-emerald-500 text-white" : e.status === "failed" ? "bg-amber-500 text-white" : "bg-slate-900 text-white"
                )}>
                  {idx + 1}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-wider">NF #{e.nf}</span>
                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-md uppercase tracking-wider">{e.value}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 mb-6">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight leading-tight mb-2">{e.client}</h3>
                <div className="flex items-start gap-2 text-slate-400">
                  <MapPin size={14} className="shrink-0 mt-0.5" />
                  <p className="text-[10px] font-bold uppercase tracking-tight leading-normal">{e.address}</p>
                </div>
                {e.instructions && (
                  <div className="flex items-start gap-2 text-blue-500 mt-2 bg-blue-50 px-3 py-2 rounded-2xl border border-blue-100">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <p className="text-[10px] font-bold uppercase tracking-tight leading-normal">{e.instructions}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-slate-50 dark:border-slate-800">
                {e.status === "pending" ? (
                  <div className="w-full space-y-3">
                    <div className="grid grid-cols-2 gap-3 w-full">
                        <motion.button 
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleNavigate(e.address)}
                          className="h-14 bg-slate-900 text-white rounded-[24px] text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-lg shadow-slate-900/20"
                        >
                            <Navigation size={18} />
                            Rota
                        </motion.button>
                        <motion.button 
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            setSelectedDelivery(e);
                            setIsFinishModalOpen(true);
                          }}
                          className="h-14 bg-blue-600 text-white rounded-[24px] text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-lg shadow-blue-600/20"
                        >
                            <Camera size={18} />
                            Finalizar
                        </motion.button>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={() => abrirOcorrencia(e)}
                      className="w-full h-12 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-2 border-amber-200 dark:border-amber-900/50 rounded-[24px] text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3"
                    >
                      <AlertTriangle size={16} />
                      Registrar Ocorrência
                    </motion.button>
                  </div>
                ) : e.status === "failed" ? (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => abrirOcorrencia(e)}
                    className="w-full h-14 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-2 border-amber-200 dark:border-amber-900/50 rounded-[24px] text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3"
                  >
                    <AlertTriangle size={18} />
                    Nova Ocorrência
                  </motion.button>
                ) : (
                  <motion.button 
                    whileTap={{ scale: 0.98 }}
                    onClick={() => e.image && window.open(e.image, "_blank")}
                    className="w-full h-14 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-slate-400 dark:text-slate-300 rounded-[24px] text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3"
                  >
                    <Package size={18} />
                    Ver Comprovante
                  </motion.button>
                )}
              </div>
            </motion.div>
          ));
        })()}
      </main>

      {/* FINISH MODAL - PURE MOBILE STYLE */}
      <AnimatePresence>
        {isFinishModalOpen && selectedDelivery && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
              onClick={() => !uploading && setIsFinishModalOpen(false)}
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative bg-white dark:bg-slate-900 rounded-t-[48px] p-8 pb-12 space-y-6 shadow-2xl"
            >
              <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full mx-auto" />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Finalizar Entrega</h3>
                  <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2 flex items-center gap-2">
                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md">NF #{selectedDelivery.nf}</span>
                    <span>•</span>
                    <span className="truncate max-w-[150px]">{selectedDelivery.client}</span>
                  </p>
                </div>
                <button
                  onClick={() => setIsFinishModalOpen(false)}
                  className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-300 border border-slate-100 dark:border-slate-700"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 bg-blue-50/50 dark:bg-blue-950/20 rounded-[40px] border-2 border-blue-100 dark:border-blue-900/40 flex flex-col items-center justify-center text-center gap-6">
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-20 h-20 rounded-3xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-xl shadow-blue-600/10"
                >
                  <Camera size={38} className="text-blue-600" />
                </motion.div>
                
                <div className="space-y-2">
                   <p className="text-sm font-black text-blue-900 dark:text-blue-200 uppercase tracking-tight">Comprovante de Entrega</p>
                   <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest leading-relaxed">
                     Capture uma foto legível do canhoto<br/>para confirmar a entrega.
                   </p>
                </div>
                
                <label className="w-full h-18 bg-blue-600 text-white rounded-[28px] flex items-center justify-center gap-4 font-black text-sm uppercase tracking-widest shadow-2xl shadow-blue-500/40 cursor-pointer active:scale-[0.98] transition-all overflow-hidden relative group">
                  {uploading ? (
                    <div className="flex items-center gap-3">
                      <RefreshCw size={20} className="animate-spin" />
                      Enviando...
                    </div>
                  ) : (
                    <>
                      <Camera size={24} />
                      Tirar Foto Agora
                    </>
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    className="hidden" 
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFinish(file);
                    }}
                  />
                  {uploading && (
                    <motion.div 
                      initial={{ left: "-100%" }}
                      animate={{ left: "100%" }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 bg-white/20 skew-x-12"
                    />
                  )}
                </label>
              </div>

              <p className="text-[9px] font-bold text-slate-300 text-center uppercase tracking-widest leading-loose px-4">
                Esta ação é definitiva e atualizará o status no Carflax HUB administrativo em tempo real.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE OCORRENCIA */}
      <AnimatePresence>
        {isOcorrenciaModalOpen && selectedDelivery && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
              onClick={() => !enviandoOcorrencia && setIsOcorrenciaModalOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative bg-white dark:bg-slate-900 rounded-t-[48px] p-6 pb-10 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto"
            >
              <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full mx-auto" />

              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Ocorrência</h3>
                  <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2 flex items-center gap-2">
                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md">NF #{selectedDelivery.nf}</span>
                    <span>&bull;</span>
                    <span className="truncate max-w-[140px]">{selectedDelivery.client}</span>
                  </p>
                </div>
                <button
                  onClick={() => !enviandoOcorrencia && setIsOcorrenciaModalOpen(false)}
                  className="w-12 h-12 shrink-0 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-300 border border-slate-100 dark:border-slate-700"
                >
                  <X size={24} />
                </button>
              </div>

              {/* TIPO */}
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">O que aconteceu?</p>
                <div className="grid grid-cols-1 gap-2">
                  {TIPOS_OCORRENCIA.map(t => (
                    <button
                      key={t.value}
                      onClick={() => {
                        setOcorrenciaTipo(t.value);
                        setOcorrenciaBloqueia(t.bloqueiaPadrao);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-3 rounded-2xl border-2 text-[11px] font-black uppercase tracking-tight transition-all",
                        ocorrenciaTipo === t.value
                          ? "bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/20"
                          : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-300"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* DESCRICAO */}
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Detalhe (opcional)</p>
                <textarea
                  value={ocorrenciaDescricao}
                  onChange={(ev) => setOcorrenciaDescricao(ev.target.value)}
                  rows={3}
                  placeholder="Ex: portaria não autorizou a entrada, cliente pediu para voltar amanhã..."
                  className="w-full rounded-3xl border-2 border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-5 py-4 text-xs font-semibold text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none focus:border-amber-400 resize-none"
                />
              </div>

              {/* FOTO */}
              <label className={cn(
                "w-full h-14 rounded-[24px] flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] border-2 cursor-pointer active:scale-[0.98] transition-all",
                ocorrenciaFoto
                  ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400"
                  : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-400 dark:text-slate-300"
              )}>
                <Camera size={18} />
                {ocorrenciaFoto ? "Foto anexada — trocar" : "Anexar foto (opcional)"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={enviandoOcorrencia}
                  onChange={(ev) => setOcorrenciaFoto(ev.target.files?.[0] || null)}
                />
              </label>

              {/* NAO FOI POSSIVEL ENTREGAR */}
              {selectedDelivery.status === "pending" && (
                <button
                  onClick={() => setOcorrenciaBloqueia(v => !v)}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-[28px] border-2 text-left transition-all",
                    ocorrenciaBloqueia
                      ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50"
                      : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700"
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 rounded-lg shrink-0 flex items-center justify-center border-2 transition-all",
                    ocorrenciaBloqueia ? "bg-red-500 border-red-500 text-white" : "border-slate-200 dark:border-slate-600"
                  )}>
                    {ocorrenciaBloqueia && <CheckCircle2 size={14} />}
                  </div>
                  <div>
                    <p className={cn(
                      "text-[11px] font-black uppercase tracking-tight",
                      ocorrenciaBloqueia ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"
                    )}>
                      Não foi possível entregar
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 leading-relaxed">
                      Tira a parada das pendências de hoje
                    </p>
                  </div>
                </button>
              )}

              <motion.button
                whileTap={{ scale: 0.98 }}
                disabled={!ocorrenciaTipo || enviandoOcorrencia}
                onClick={handleRegistrarOcorrencia}
                className="w-full h-16 bg-amber-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white rounded-[28px] text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-xl shadow-amber-500/30 disabled:shadow-none transition-all"
              >
                {enviandoOcorrencia ? (
                  <>
                    <RefreshCw size={20} className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    Enviar Ocorrência
                  </>
                )}
              </motion.button>

              <p className="text-[9px] font-bold text-slate-300 text-center uppercase tracking-widest leading-loose px-4">
                A ocorrência chega na hora em Entregas &rsaquo; Ocorrências, no Carflax HUB.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
