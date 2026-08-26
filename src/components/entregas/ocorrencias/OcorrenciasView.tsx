import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Search,
  CheckCircle2,
  MapPin,
  Truck,
  User as UserIcon,
  Image as ImageIcon,
  X,
  Clock,
  RotateCcw,
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { TIPOS_OCORRENCIA, labelOcorrencia } from "@/lib/ocorrencias";
import type { UserProfile } from "@/App";

interface Ocorrencia {
  id: string;
  entrega_id: string | null;
  rom_code: string | null;
  rom_date: string | null;
  nf: string | null;
  client: string | null;
  address: string | null;
  driver_cod: string | null;
  driver_name: string | null;
  tipo: string;
  descricao: string | null;
  image: string | null;
  status: string;
  bloqueou_entrega: boolean;
  resolucao: string | null;
  resolvido_por: string | null;
  resolvido_em: string | null;
  created_at: string;
}

export function OcorrenciasView({ userProfile }: { userProfile?: UserProfile }) {
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"aberta" | "resolvida">("aberta");
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [driverAvatars, setDriverAvatars] = useState<Record<string, string>>({});
  const [selecionada, setSelecionada] = useState<Ocorrencia | null>(null);
  const [resolucao, setResolucao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("entregas_ocorrencias")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      setOcorrencias(data || []);

      const { data: users } = await supabase.from("usuarios").select("operator_code, avatar");
      if (users) {
        const map: Record<string, string> = {};
        users.forEach(u => { if (u.operator_code) map[u.operator_code] = u.avatar; });
        setDriverAvatars(map);
      }
    } catch (err) {
      console.error("Erro ao buscar ocorrências:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Realtime: a ocorrência registrada pelo motorista aparece aqui na hora
    const channel = supabase
      .channel("ocorrencias_sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "entregas_ocorrencias" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const resolver = async () => {
    if (!selecionada) return;
    try {
      setSalvando(true);
      const { error } = await supabase
        .from("entregas_ocorrencias")
        .update({
          status: "resolvida",
          resolucao: resolucao.trim() || null,
          resolvido_por: userProfile?.name || null,
          resolvido_em: new Date().toISOString()
        })
        .eq("id", selecionada.id);
      if (error) throw error;
      setSelecionada(null);
      setResolucao("");
      fetchData();
    } catch (err) {
      console.error(err);
      alert("Erro ao resolver a ocorrência.");
    } finally {
      setSalvando(false);
    }
  };

  const reabrir = async (o: Ocorrencia) => {
    await supabase
      .from("entregas_ocorrencias")
      .update({ status: "aberta", resolucao: null, resolvido_por: null, resolvido_em: null })
      .eq("id", o.id);
    fetchData();
  };

  const termo = searchTerm.toLowerCase();
  const filtradas = ocorrencias.filter(o => {
    if (o.status !== activeTab) return false;
    if (tipoFiltro && o.tipo !== tipoFiltro) return false;
    if (!termo) return true;
    return [o.nf, o.client, o.driver_name, o.rom_code, o.descricao, labelOcorrencia(o.tipo)]
      .some(v => (v || "").toLowerCase().includes(termo));
  });

  const abertas = ocorrencias.filter(o => o.status === "aberta");
  const hoje = new Date().toISOString().split("T")[0];
  const stats = {
    abertas: abertas.length,
    bloqueando: abertas.filter(o => o.bloqueou_entrega).length,
    hoje: ocorrencias.filter(o => o.created_at.slice(0, 10) === hoje).length
  };

  const formatarData = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex-1 flex flex-col gap-4 pt-0 pb-6 px-0 overflow-hidden bg-background">
      {/* TOOLBAR */}
      <div className="flex flex-col gap-3 shrink-0 px-1">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-black text-foreground uppercase tracking-tight leading-none">Ocorrências</h2>
            <p className="text-muted-foreground text-[9px] font-bold uppercase tracking-[0.2em] mt-1.5 flex items-center gap-2">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              Registradas pelos motoristas durante a rota
            </p>
          </div>

          <div className="flex items-center gap-2">
            {[
              { label: "Abertas", val: stats.abertas, color: "text-amber-500" },
              { label: "Sem entrega", val: stats.bloqueando, color: "text-red-500" },
              { label: "Hoje", val: stats.hoje, color: "text-foreground" }
            ].map(s => (
              <div key={s.label} className="px-4 py-2 rounded-2xl bg-muted/50 border border-border flex flex-col items-center min-w-[86px]">
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">{s.label}</span>
                <span className={cn("text-lg font-black leading-none mt-0.5", s.color)}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-muted/60 p-1 rounded-xl gap-1">
            {([
              { id: "aberta", label: "Abertas" },
              { id: "resolvida", label: "Resolvidas" }
            ] as const).map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-[0.15em] transition-all",
                  activeTab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por NF, cliente, motorista ou romaneio..."
              className="w-full h-10 pl-9 pr-4 rounded-xl bg-muted/50 border border-border text-xs font-semibold text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-400"
            />
          </div>

          <select
            value={tipoFiltro}
            onChange={e => setTipoFiltro(e.target.value)}
            className="h-10 px-3 rounded-xl bg-muted/50 border border-border text-[10px] font-black uppercase tracking-wider text-foreground outline-none"
          >
            <option value="">Todos os tipos</option>
            {TIPOS_OCORRENCIA.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* LISTA */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-1 space-y-3">
        {loading ? (
          [1, 2, 3].map(i => <div key={i} className="h-32 w-full bg-muted/50 animate-pulse rounded-3xl" />)
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-3xl bg-muted/50 flex items-center justify-center mb-4 border border-border">
              <CheckCircle2 className="text-emerald-500" size={30} />
            </div>
            <h3 className="text-sm font-black text-foreground uppercase tracking-tight">
              {activeTab === "aberta" ? "Nenhuma ocorrência aberta" : "Nada resolvido ainda"}
            </h3>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em] mt-1.5">
              {activeTab === "aberta" ? "As rotas estão correndo sem problemas" : "As ocorrências tratadas aparecem aqui"}
            </p>
          </div>
        ) : (
          filtradas.map(o => (
            <div
              key={o.id}
              className={cn(
                "rounded-3xl border p-5 bg-card transition-all",
                o.status === "aberta"
                  ? o.bloqueou_entrega ? "border-red-200 dark:border-red-900/50" : "border-amber-200 dark:border-amber-900/50"
                  : "border-border opacity-80"
              )}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0",
                    o.status === "resolvida" ? "bg-emerald-500/10 text-emerald-500"
                      : o.bloqueou_entrega ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"
                  )}>
                    {o.status === "resolvida" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        {labelOcorrencia(o.tipo)}
                      </span>
                      {o.bloqueou_entrega && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md bg-red-500/10 text-red-500">
                          Não entregue
                        </span>
                      )}
                      {o.nf && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md bg-blue-500/10 text-blue-500">
                          NF #{o.nf}
                        </span>
                      )}
                      {o.rom_code && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md bg-muted text-muted-foreground">
                          {o.rom_code}
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-black text-foreground uppercase tracking-tight mt-2 truncate">
                      {o.client || "Cliente não informado"}
                    </h3>

                    {o.address && (
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight mt-1 flex items-start gap-1.5">
                        <MapPin size={12} className="shrink-0 mt-0.5" />
                        {o.address}
                      </p>
                    )}

                    {o.descricao && (
                      <p className="text-xs font-semibold text-foreground/80 mt-3 bg-muted/50 rounded-2xl px-4 py-3 leading-relaxed">
                        {o.descricao}
                      </p>
                    )}

                    {o.status === "resolvida" && (
                      <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-3 flex items-start gap-1.5">
                        <FileText size={12} className="shrink-0 mt-0.5" />
                        <span>
                          {o.resolucao || "Resolvida"}
                          {o.resolvido_por ? ` — ${o.resolvido_por}` : ""}
                          {o.resolvido_em ? ` • ${formatarData(o.resolvido_em)}` : ""}
                        </span>
                      </p>
                    )}

                    <div className="flex items-center gap-4 mt-3 flex-wrap">
                      <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        {o.driver_cod && driverAvatars[o.driver_cod] ? (
                          <img src={driverAvatars[o.driver_cod]} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <UserIcon size={12} />
                        )}
                        {o.driver_name || "Motorista"}
                      </span>
                      <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        <Clock size={12} />
                        {formatarData(o.created_at)}
                      </span>
                      {o.rom_date && (
                        <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                          <Truck size={12} />
                          Rota {new Date(`${o.rom_date}T12:00:00`).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {o.image && (
                    <button
                      onClick={() => window.open(o.image!, "_blank")}
                      className="h-10 px-4 rounded-xl border border-border bg-muted/50 text-muted-foreground text-[9px] font-black uppercase tracking-widest flex items-center gap-2 hover:text-foreground transition-colors"
                    >
                      <ImageIcon size={14} />
                      Foto
                    </button>
                  )}
                  {o.status === "aberta" ? (
                    <button
                      onClick={() => { setSelecionada(o); setResolucao(""); }}
                      className="h-10 px-4 rounded-xl bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                      <CheckCircle2 size={14} />
                      Resolver
                    </button>
                  ) : (
                    <button
                      onClick={() => reabrir(o)}
                      className="h-10 px-4 rounded-xl border border-border bg-muted/50 text-muted-foreground text-[9px] font-black uppercase tracking-widest flex items-center gap-2 hover:text-foreground transition-colors"
                    >
                      <RotateCcw size={14} />
                      Reabrir
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL RESOLVER */}
      {selecionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !salvando && setSelecionada(null)} />
          <div className="relative w-full max-w-lg bg-card border border-border rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-foreground uppercase tracking-tight">Resolver Ocorrência</h3>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em] mt-1.5">
                  {labelOcorrencia(selecionada.tipo)}{selecionada.nf ? ` • NF #${selecionada.nf}` : ""}
                </p>
              </div>
              <button
                onClick={() => !salvando && setSelecionada(null)}
                className="w-9 h-9 rounded-xl bg-muted/50 border border-border flex items-center justify-center text-muted-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <textarea
              value={resolucao}
              onChange={e => setResolucao(e.target.value)}
              rows={4}
              placeholder="Como foi tratada? Ex: reagendado para amanhã, NF cancelada, cliente contatado..."
              className="w-full rounded-2xl bg-muted/50 border border-border px-4 py-3 text-xs font-semibold text-foreground placeholder:text-muted-foreground outline-none focus:border-emerald-400 resize-none"
            />

            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelecionada(null)}
                disabled={salvando}
                className="flex-1 h-12 rounded-2xl border border-border bg-muted/50 text-muted-foreground text-[10px] font-black uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button
                onClick={resolver}
                disabled={salvando}
                className="flex-1 h-12 rounded-2xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 disabled:opacity-60"
              >
                {salvando ? "Salvando..." : "Marcar como resolvida"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
