import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import {
  Timer,
  CalendarDays,
  PackageCheck,
  ClipboardCheck,
  RefreshCw,
  Search,
  User,
  Boxes,
  Award,
  PlayCircle,
  CheckCircle2,
  Hourglass,
  TrendingUp,
  Store,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiSeparacao, apiConferencia, type ExpedicaoResponse } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { buildAvatarResolver } from "@/lib/avatar-by-code";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Tipo = "separacao" | "conferencia";
type TabId = "hoje" | "operadores" | "locais" | "evolucao";

// Formata segundos em "1h 02min", "3min 45s" ou "45s"
function fmtTempo(seg: number | null | undefined) {
  if (seg == null || !Number.isFinite(seg) || seg <= 0) return "—";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = Math.floor(seg % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (m > 0) return `${m}min ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

// TIME "07:47:24" → "07:47"
function fmtHora(t: string | null | undefined) {
  if (!t) return "—";
  return String(t).slice(0, 8);
}

// "049 - NOME" → { cod, nome }
function parseOperador(op: string) {
  const m = op.match(/^\s*(\d+)\s*-\s*(.+)$/);
  if (m) return { cod: m[1], nome: m[2].trim() };
  return { cod: "", nome: op.replace(/^\s*-\s*/, "").trim() || "—" };
}


const getLocalIcon = (localName: string) => {
  const norm = localName.trim().toUpperCase();
  if (norm.includes("ENTREGA")) return <Truck className="w-5 h-5" />;
  if (norm.includes("BALCÃO") || norm.includes("BALCAO")) return <Store className="w-5 h-5" />;
  return <Boxes className="w-5 h-5" />;
};

const getLocalAccent = (localName: string) => {
  const norm = localName.trim().toUpperCase();
  if (norm.includes("ENTREGA")) return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
  if (norm.includes("BALCÃO 1") || norm.includes("BALCAO 1")) return "text-blue-500 bg-blue-500/10 border-blue-500/20";
  if (norm.includes("BALCÃO 2") || norm.includes("BALCAO 2")) return "text-violet-500 bg-violet-500/10 border-violet-500/20";
  return "text-slate-500 bg-slate-500/10 border-slate-500/20";
};

interface EvoTipPayload { name: string; value: number; color: string; dataKey: string }
function EvoTooltip({ active, payload, label }: { active?: boolean; payload?: EvoTipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border/60 rounded-xl shadow-xl p-3 border-l-4 border-l-primary animate-in fade-in zoom-in-95 duration-150">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Dia {label}</p>
      <div className="space-y-1.5">
        {payload.map((p) => {
          const valStr = p.dataKey === "qtd"
            ? `${p.value} ${p.value === 1 ? "pedido" : "pedidos"}`
            : `${p.value.toString().replace(".", ",")} min`;
          return (
            <div key={p.name} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="text-[10px] text-muted-foreground font-medium">{p.name}</span>
              </div>
              <span className="text-[10px] font-bold text-foreground tabular-nums">{valStr}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CONFIG: Record<
  Tipo,
  { titulo: string; sub: string; icon: typeof PackageCheck; api: () => Promise<ExpedicaoResponse>; operadorLabel: string; accent: string }
> = {
  separacao: {
    titulo: "Separação",
    sub: "Tempo de separação de pedidos · hoje e no mês",
    icon: PackageCheck,
    api: apiSeparacao,
    operadorLabel: "Separador",
    accent: "text-blue-500 bg-blue-500/10",
  },
  conferencia: {
    titulo: "Conferência",
    sub: "Tempo de conferência de pedidos · hoje e no mês",
    icon: ClipboardCheck,
    api: apiConferencia,
    operadorLabel: "Conferente",
    accent: "text-violet-500 bg-violet-500/10",
  },
};

function KpiCard({ label, value, hint, icon, accent, valueClass }: { label: string; value: string; hint?: string; icon: ReactNode; accent: string; valueClass?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between mb-2">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", accent)}>{icon}</div>
      </div>
      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn("text-lg font-black tracking-tight mt-0.5", valueClass)}>{value}</p>
      {hint && <p className="text-[11px] font-bold text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

export function ExpedicaoView({ tipo }: { tipo: Tipo }) {
  const cfg = CONFIG[tipo];
  const [data, setData] = useState<ExpedicaoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("hoje");
  const [avatarRows, setAvatarRows] = useState<{ operator_code: string | null; avatar: string | null }[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setData(await cfg.api());
    } catch (err) {
      console.error(`Erro ao carregar ${tipo}:`, err);
      setErro("Não foi possível carregar os dados. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [cfg, tipo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Carrega fotos/avatars de todos os operadores do sistema (Supabase)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("operator_code, avatar")
        .not("avatar", "is", null);
      if (error) {
        console.error("[ExpedicaoView] Erro ao carregar avatars dos operadores:", error);
      }
      if (cancelled || !data) return;
      setAvatarRows(data);
    })();
    return () => { cancelled = true; };
  }, []);

  // Resolve avatar por código de operador sem colisão de zeros à esquerda.
  const getAvatar = useMemo(() => buildAvatarResolver(avatarRows), [avatarRows]);

  const listaFiltrada = useMemo(() => {
    if (!data) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return data.lista;
    return data.lista.filter(
      (i) =>
        (i.cliente || "").toLowerCase().includes(q) ||
        (i.operador || "").toLowerCase().includes(q) ||
        (i.pedido || "").toLowerCase().includes(q)
    );
  }, [data, busca]);

  const maxQtdOperador = useMemo(
    () => Math.max(1, ...(data?.por_operador ?? []).map((o) => o.qtd)),
    [data]
  );

  const maxQtdEvolucao = useMemo(
    () => Math.max(1, ...(data?.evolucao ?? []).map((e) => e.qtd)),
    [data]
  );

  const cardsLocal = useMemo(() => {
    const list = data?.por_local ?? [];
    const map = new Map<string, typeof list[0]>();
    list.forEach(l => map.set(l.local.toUpperCase(), l));

    const defaults = [
      { local: "BALCÃO 1", label: "BALCÃO 1" },
      { local: "BALCÃO 2", label: "BALCÃO 2" },
      { local: "ENTREGA", label: "ENTREGA" }
    ];

    return defaults.map(d => {
      const match = map.get(d.local);
      return {
        local: d.label,
        qtd: match ? match.qtd : 0,
        media_seg: match ? match.media_seg : 0
      };
    });
  }, [data]);

  const maxQtdLocal = useMemo(
    () => Math.max(1, ...cardsLocal.map((l) => l.qtd)),
    [cardsLocal]
  );

  const chartData = useMemo(() => {
    return (data?.evolucao ?? []).map((ev) => {
      const parts = ev.dia.split("-");
      const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : ev.dia;
      const media_min = Math.round((ev.media_seg / 60) * 10) / 10;
      return {
        ...ev,
        label,
        media_min,
      };
    });
  }, [data]);

  const CfgIcon = cfg.icon;
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const TABS: { id: TabId; label: string }[] = [
    { id: "hoje", label: `${cfg.titulo} de hoje` },
    { id: "operadores", label: `Por ${cfg.operadorLabel.toLowerCase()}` },
    { id: "locais", label: "Por local" },
    { id: "evolucao", label: "Evolução" },
  ];

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="w-full flex flex-col min-h-0 flex-1 px-6 md:px-8 pt-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between shrink-0 px-1">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-foreground flex items-center gap-2.5">
              <span className="w-1.5 h-6 bg-primary rounded-full" />
              <CfgIcon className="w-6 h-6 text-primary" />
              {cfg.titulo}
            </h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">{cfg.sub}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="h-10 px-4 rounded-xl border border-border bg-card text-[10px] font-black uppercase tracking-tight flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="w-3.5 h-3.5 opacity-50" /> {hoje}
            </span>
            <button
              onClick={loadData}
              disabled={loading}
              className="w-10 h-10 border border-border rounded-xl bg-card hover:bg-secondary text-muted-foreground transition-all active:scale-95 shadow-sm flex items-center justify-center group disabled:opacity-50"
              title="Atualizar"
            >
              <RefreshCw className={cn("w-4 h-4 group-hover:text-primary transition-colors", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5 shrink-0">
          <KpiCard label="Tempo médio hoje" value={fmtTempo(data?.media_hoje_seg)} icon={<Timer className="w-5 h-5" />} accent="text-blue-500 bg-blue-500/10" hint={`${data?.total_hoje ?? 0} concluídos`} />
          <KpiCard label="Tempo médio do mês" value={fmtTempo(data?.media_mes_seg)} icon={<CalendarDays className="w-5 h-5" />} accent="text-violet-500 bg-violet-500/10" hint={`${data?.total_mes ?? 0} no mês`} />
          <KpiCard label="Concluídos hoje" value={String(data?.total_hoje ?? 0)} icon={<CfgIcon className="w-5 h-5" />} accent="text-emerald-500 bg-emerald-500/10" />
          <KpiCard label="Operadores ativos" value={String(data?.por_operador?.length ?? 0)} icon={<User className="w-5 h-5" />} accent="text-amber-500 bg-amber-500/10" hint="no mês" />
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex items-center gap-1 border-b border-border mt-5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative px-4 py-3 text-[11px] font-black uppercase tracking-wider transition-colors",
                activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {activeTab === tab.id && <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto py-4 pr-1">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-20">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-black uppercase tracking-widest text-primary">Carregando...</span>
            </div>
          ) : erro ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-20 text-center">
              <div className="w-16 h-16 rounded-3xl bg-secondary flex items-center justify-center">
                <Hourglass className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-black uppercase tracking-tight text-foreground">{erro}</p>
              <button onClick={loadData} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity">
                <RefreshCw className="w-4 h-4" /> Tentar novamente
              </button>
            </div>
          ) : activeTab === "hoje" ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-primary" /> {cfg.titulo} de hoje
                  <span className="text-muted-foreground font-bold">({listaFiltrada.length})</span>
                </h2>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar pedido, cliente, operador…"
                    className="w-full pl-9 pr-3 h-10 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[780px]">
                    <thead>
                      <tr className="border-b border-border text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        <th className="text-left py-3 px-5">Pedido / Cliente</th>
                        <th className="text-left py-3 px-3">{cfg.operadorLabel}</th>
                        <th className="text-right py-3 px-3">SKUs</th>
                        <th className="text-center py-3 px-3">Início</th>
                        <th className="text-center py-3 px-3">Fim</th>
                        <th className="text-right py-3 px-5">Tempo</th>
                      </tr>
                    </thead>
                    <tbody>
                       {listaFiltrada.map((i) => {
                        const { cod, nome } = parseOperador(i.operador);
                        return (
                          <tr key={`${i.empresa}-${i.pedido}`} className="border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors">
                            <td className="py-3 px-5">
                              <p className="font-bold text-foreground leading-tight whitespace-nowrap">{i.cliente}</p>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pedido {i.pedido} · {i.empresa}</p>
                            </td>
                            <td className="py-3 px-3 font-semibold text-foreground whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 overflow-hidden">
                                  {getAvatar(cod) ? (
                                    <img src={getAvatar(cod)} alt={nome} className="w-full h-full object-cover" />
                                  ) : (
                                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                                  )}
                                </div>
                                <span>{nome}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums font-semibold text-muted-foreground">{i.qtd_sku}</td>
                            <td className="py-3 px-3 text-center">
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground tabular-nums">
                                <PlayCircle className="w-3.5 h-3.5 text-emerald-500" /> {fmtHora(i.hora_inicio)}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground tabular-nums">
                                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" /> {fmtHora(i.hora_fim)}
                              </span>
                            </td>
                            <td className="py-3 px-5 text-right">
                              <span className="inline-block px-2 py-0.5 rounded-lg text-[11px] font-black tabular-nums bg-secondary text-foreground">
                                {fmtTempo(i.tempo_seg)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {listaFiltrada.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-16 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest">
                            Nenhuma {cfg.titulo.toLowerCase()} concluída hoje
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : activeTab === "operadores" ? (
            <section className="space-y-4">
              <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                <Award className="w-4 h-4 text-primary" /> Tempo médio por {cfg.operadorLabel.toLowerCase()}
                <span className="text-muted-foreground font-bold">· mês</span>
              </h2>
              <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="border-b border-border text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        <th className="text-left py-3 px-5">{cfg.operadorLabel}</th>
                        <th className="text-left py-3 px-3 w-1/3">Volume</th>
                        <th className="text-right py-3 px-3">Pedidos</th>
                        <th className="text-right py-3 px-5">Tempo médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.por_operador ?? []).map((op) => {
                        const { cod, nome } = parseOperador(op.operador);
                        return (
                          <tr key={op.operador} className="border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors">
                            <td className="py-3 px-5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 overflow-hidden">
                                  {getAvatar(cod) ? (
                                    <img src={getAvatar(cod)} alt={nome} className="w-full h-full object-cover" />
                                  ) : (
                                    <User className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-foreground whitespace-nowrap">{nome}</p>
                                  {cod && <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Cód. {cod}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-500" style={{ width: `${(op.qtd / maxQtdOperador) * 100}%` }} />
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums font-semibold text-muted-foreground">{op.qtd}</td>
                            <td className="py-3 px-5 text-right tabular-nums font-black text-foreground">{fmtTempo(op.media_seg)}</td>
                          </tr>
                        );
                      })}
                      {(data?.por_operador?.length ?? 0) === 0 && (
                        <tr>
                          <td colSpan={4} className="py-16 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest">
                            Sem registros no mês
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : activeTab === "locais" ? (
            <section className="space-y-4">
              <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                <Boxes className="w-4 h-4 text-primary" /> Tempo médio por local
                <span className="text-muted-foreground font-bold">· mês</span>
              </h2>

              {/* Cards por Local */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
                {cardsLocal.map((loc) => {
                  return (
                    <KpiCard
                      key={loc.local}
                      label={loc.local}
                      value={fmtTempo(loc.media_seg)}
                      hint={`${loc.qtd} ${loc.qtd === 1 ? "pedido" : "pedidos"} no mês`}
                      icon={getLocalIcon(loc.local)}
                      accent={getLocalAccent(loc.local)}
                    />
                  );
                })}
              </div>

              <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="border-b border-border text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        <th className="text-left py-3 px-5">Local</th>
                        <th className="text-left py-3 px-3 w-1/3">Volume</th>
                        <th className="text-right py-3 px-3">Pedidos</th>
                        <th className="text-right py-3 px-5">Tempo médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cardsLocal.map((loc) => {
                        const tempoSeg = loc.media_seg;
                        let colorTempo = "text-foreground font-black";
                        if (tempoSeg > 0) {
                          if (tempoSeg <= 15 * 60) colorTempo = "text-emerald-500 font-black";
                          else if (tempoSeg <= 30 * 60) colorTempo = "text-amber-500 font-black";
                          else colorTempo = "text-rose-500 font-black";
                        }
                        return (
                          <tr key={loc.local} className="border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors">
                            <td className="py-3 px-5 font-bold text-foreground">
                              {loc.local}
                            </td>
                            <td className="py-3 px-3">
                              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-500" style={{ width: `${(loc.qtd / maxQtdLocal) * 100}%` }} />
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums font-semibold text-muted-foreground">
                              {loc.qtd} {loc.qtd === 1 ? "pedido" : "pedidos"}
                            </td>
                            <td className={cn("py-3 px-5 text-right tabular-nums", colorTempo)}>
                              {fmtTempo(loc.media_seg)}
                            </td>
                          </tr>
                        );
                      })}
                      {cardsLocal.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-16 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest">
                            Sem registros no mês
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : (
            <section className="space-y-4">
              <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                <Timer className="w-4 h-4 text-primary" /> Evolução diária no mês
              </h2>

              {/* Gráfico de Evolução (Volume vs Tempo) */}
              {chartData.length > 0 && (
                <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                      <TrendingUp className="w-4.5 h-4.5 text-primary" /> Histórico de Performance
                    </h3>
                    <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                        <span className="text-muted-foreground">Volume (Pedidos)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#10b981]" />
                        <span className="text-muted-foreground">Tempo Médio (min)</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="evoQtd" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="evoTempo" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.3} />
                        <XAxis dataKey="label" tick={{ fontSize: 9, fontWeight: 700, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" tick={{ fontSize: 9, fontWeight: 700, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fontWeight: 700, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <Tooltip content={<EvoTooltip />} />
                        <Area yAxisId="left" type="monotone" name="Volume" dataKey="qtd" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#evoQtd)" />
                        <Area yAxisId="right" type="monotone" name="Tempo Médio" dataKey="media_min" stroke="#10b981" strokeWidth={2} fill="url(#evoTempo)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Tabela de Detalhes da Evolução */}
              <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="border-b border-border text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        <th className="text-left py-3 px-5">Dia</th>
                        <th className="text-left py-3 px-3 w-1/3">Volume de Pedidos</th>
                        <th className="text-right py-3 px-3">Total Concluído</th>
                        <th className="text-right py-3 px-5">Tempo Médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.evolucao ?? []).map((ev) => {
                        const parts = ev.dia.split("-");
                        const diaFormatado = parts.length === 3 ? `${parts[2]}/${parts[1]}` : ev.dia;
                        
                        const tempoSeg = ev.media_seg;
                        let colorTempo = "text-foreground font-black";
                        if (tempoSeg > 0) {
                          if (tempoSeg <= 15 * 60) colorTempo = "text-emerald-500 font-black";
                          else if (tempoSeg <= 30 * 60) colorTempo = "text-amber-500 font-black";
                          else colorTempo = "text-rose-500 font-black";
                        }

                        return (
                          <tr key={ev.dia} className="border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors">
                            <td className="py-3 px-5 font-bold text-foreground">
                              {diaFormatado}
                            </td>
                            <td className="py-3 px-3">
                              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-500" style={{ width: `${(ev.qtd / maxQtdEvolucao) * 100}%` }} />
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums font-semibold text-muted-foreground">
                              {ev.qtd} {ev.qtd === 1 ? "pedido" : "pedidos"}
                            </td>
                            <td className={cn("py-3 px-5 text-right tabular-nums", colorTempo)}>
                              {fmtTempo(ev.media_seg)}
                            </td>
                          </tr>
                        );
                      })}
                      {(data?.evolucao?.length ?? 0) === 0 && (
                        <tr>
                          <td colSpan={4} className="py-16 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest">
                            Sem registros de evolução no mês
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export const SeparacaoView = () => <ExpedicaoView tipo="separacao" />;
export const ConferenciaView = () => <ExpedicaoView tipo="conferencia" />;
