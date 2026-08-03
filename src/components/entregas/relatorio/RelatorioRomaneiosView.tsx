import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Truck,
  Calendar,
  ChevronDown,
  MapPin,
  Building2,
  CalendarDays,
  Package,
  Gauge,
  User,
  TrendingUp,
  Trophy,
  Weight,
  DollarSign,
  Fuel,
  Wallet,
  Coins,
  Settings,
  Plus,
  Save,
  X,
  RefreshCw,
  Car,
  Route,
} from "lucide-react";
import {
  apiRelatorioRomaneios,
  type RelatorioRomaneios,
  apiFrotaCadastro,
  apiDescobrirVeiculos,
  apiSalvarVeiculo,
  apiSalvarVinculoMotorista,
  apiSalvarPrecoCombustivel,
  apiSalvarPedagio,
  apiSyncFrota,
  apiFrotaPosicoes,
  type FrotaCadastro,
  type FrotaVeiculo,
  type VeiculoDescoberto,
  type FrotaPosicao,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { MiniCalendar } from "@/components/ui/MiniCalendar";
import { supabase } from "@/lib/supabase";

function DriverAvatar({ name, avatar, size = "md" }: { name: string; avatar?: string | null; size?: "md" | "lg" }) {
  const [broken, setBroken] = useState(false);
  const showImg = avatar && avatar.trim() !== "" && !broken;
  const sizeClasses = size === "lg" ? "w-12 h-12" : "w-8 h-8";
  const iconSize = size === "lg" ? "w-6 h-6" : "w-4 h-4";

  return (
    <div className={cn(sizeClasses, "rounded-full bg-secondary flex items-center justify-center shrink-0 border border-border overflow-hidden")}>
      {showImg ? (
        <img src={avatar} alt={name} className="w-full h-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <User className={cn(iconSize, "text-muted-foreground")} />
      )}
    </div>
  );
}

const EMPTY: RelatorioRomaneios = {
  periodo: { inicio: "", fim: "" },
  totais: { entregas: 0, dias: 0, mediaPorDia: 0, maxPorDia: 0, cidades: 0, valor: 0, peso: 0 },
  porCidade: [],
  bairrosPorCidade: {},
  serieDiaria: [],
  porDiaSemana: [0, 0, 0, 0, 0, 0, 0],
  motoristas: { mediaPorDia: 0, maxPorDia: 0, totalMotoristas: 0, recorde: null, lista: [] },
  frota: {
    temCadastro: false,
    precoCombustivel: 0,
    porVeiculo: [],
    totais: { km: 0, combustivel: 0, custoDiario: 0, pedagio: 0, custoTotal: 0, custoPorKm: 0, custoPorEntrega: 0 },
  },
};

type TabId = "overview" | "localidades" | "motoristas" | "frota" | "tendencia";
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Visão Geral" },
  { id: "localidades", label: "Localidades" },
  { id: "motoristas", label: "Motoristas" },
  { id: "frota", label: "Frota & Custos" },
  { id: "tendencia", label: "Tendência" },
];

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);
const fmtCurrency2 = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
const fmtNum = (v: number, dec = 0) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v || 0);
const cidadeKey = (c: { cidade: string; uf: string }) => `${c.cidade}||${c.uf}`;

const tempoRelativo = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (Number.isNaN(diffMin)) return "—";
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffMin < 1440) return `há ${Math.floor(diffMin / 60)}h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export function RelatorioRomaneiosView() {
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [data, setData] = useState<RelatorioRomaneios>(EMPTY);
  const [cidadeSel, setCidadeSel] = useState<string | null>(null);
  const [userAvatars, setUserAvatars] = useState<Record<string, string>>({});
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [posicoes, setPosicoes] = useState<FrotaPosicao[]>([]);
  const [posicoesLoading, setPosicoesLoading] = useState(false);
  const [posicoesErro, setPosicoesErro] = useState(false);

  const carregarPosicoes = useCallback(async () => {
    setPosicoesLoading(true);
    setPosicoesErro(false);
    try {
      const r = await apiFrotaPosicoes();
      setPosicoes(r.posicoes);
    } catch {
      setPosicoesErro(true);
    } finally {
      setPosicoesLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: users } = await supabase.from("usuarios").select("operator_code, name, avatar");
        if (users) {
          const map: Record<string, string> = {};
          users.forEach((u) => {
            if (u.avatar) {
              if (u.operator_code) map[u.operator_code.trim()] = u.avatar;
              if (u.name) map[u.name.trim().toLowerCase()] = u.avatar;
            }
          });
          setUserAvatars(map);
        }
      } catch (e) {
        console.error("Erro ao carregar avatares de usuários:", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (!startDate || !endDate) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const toISO = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const resp = await apiRelatorioRomaneios(toISO(startDate), toISO(endDate));
        if (!cancelled) setData(resp);
      } catch (err) {
        console.error("Erro ao carregar relatório de romaneios:", err);
        if (!cancelled) setData(EMPTY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [startDate, endDate, refreshTick]);

  const reloadReport = useCallback(() => setRefreshTick((t) => t + 1), []);

  // Carrega as posições em tempo real ao abrir a aba Frota (uma vez por abertura).
  useEffect(() => {
    if (activeTab === "frota" && posicoes.length === 0 && !posicoesLoading && !posicoesErro) {
      carregarPosicoes();
    }
  }, [activeTab, posicoes.length, posicoesLoading, posicoesErro, carregarPosicoes]);

  const { totais, porCidade, serieDiaria, porDiaSemana, motoristas, frota } = data;
  const hasData = totais.entregas > 0;
  const topCidade = useMemo(() => porCidade.slice(0, 10), [porCidade]);
  useEffect(() => {
    if (topCidade.length === 0) { setCidadeSel(null); return; }
    setCidadeSel((prev) =>
      prev && topCidade.some((c) => cidadeKey(c) === prev) ? prev : cidadeKey(topCidade[0])
    );
  }, [topCidade]);

  const cidadeSelInfo = useMemo(
    () => topCidade.find((c) => cidadeKey(c) === cidadeSel) || null,
    [topCidade, cidadeSel]
  );
  const bairrosSel = useMemo(
    () => (cidadeSel && data.bairrosPorCidade ? data.bairrosPorCidade[cidadeSel] : []) || [],
    [cidadeSel, data.bairrosPorCidade]
  );

  const maxCidade = useMemo(() => Math.max(...topCidade.map((c) => c.entregas), 1), [topCidade]);
  const maxBairro = useMemo(() => Math.max(...bairrosSel.map((b) => b.entregas), 1), [bairrosSel]);
  const maxDow = useMemo(() => Math.max(...porDiaSemana, 1), [porDiaSemana]);

  const dateLabel =
    endDate !== null
      ? `${startDate?.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })} até ${endDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`
      : startDate
      ? `${startDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}...`
      : "Selecione o período...";

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      <div className="max-w-6xl w-full mx-auto flex flex-col min-h-0 flex-1 px-2 md:px-8 pt-2">
        {/* Header */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between shrink-0 px-1">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-foreground flex items-center gap-2.5">
              <span className="w-1.5 h-6 bg-primary rounded-full" />
              Relatório de Entregas
            </h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">
              Onde entregamos, volume por dia e capacidade dos motoristas
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-start md:justify-end">
            <div className="relative">
              <button
                onClick={() => setIsDateModalOpen(!isDateModalOpen)}
                className={cn(
                  "h-10 px-4 rounded-xl border text-[10px] font-black uppercase tracking-tight flex items-center gap-2 transition-all outline-none",
                  startDate && endDate
                    ? "bg-blue-600/10 dark:bg-blue-500/20 border-blue-600/20 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "bg-card border-border text-muted-foreground hover:border-slate-300 dark:hover:border-slate-700 shadow-sm",
                  isDateModalOpen && "ring-4 ring-blue-500/5 border-blue-500/50"
                )}
              >
                <Calendar className="w-3.5 h-3.5 opacity-40 shrink-0" />
                <span className="truncate max-w-[200px]">{dateLabel}</span>
                <ChevronDown className={cn("w-3 h-3 transition-transform duration-300 opacity-40 shrink-0", isDateModalOpen && "rotate-180")} />
              </button>
              {isDateModalOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsDateModalOpen(false)} />
                  <div className="absolute top-full right-0 mt-2 z-50">
                    <MiniCalendar
                      mode="range"
                      onSelectRange={(start, end) => {
                        setStartDate(start);
                        setEndDate(end);
                        if (start && end) setIsDateModalOpen(false);
                      }}
                      initialStartDate={startDate}
                      initialEndDate={endDate}
                    />
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => setIsConfigOpen(true)}
              title="Configurar frota e custos"
              className="h-10 px-3 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:border-slate-300 dark:hover:border-slate-700 shadow-sm flex items-center gap-2 transition-all"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden md:inline text-[10px] font-black uppercase tracking-tight">Frota</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex items-center gap-1 border-b border-border mt-4">
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
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-black uppercase tracking-widest text-primary">Gerando Relatório...</span>
            </div>
          ) : !hasData ? (
            <div className="h-full flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-16 h-16 rounded-3xl bg-secondary flex items-center justify-center">
                <Truck className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-black uppercase tracking-tight">Sem entregas no período</p>
              <p className="text-xs text-muted-foreground max-w-xs">Selecione outro intervalo de datas para visualizar as métricas.</p>
            </div>
          ) : activeTab === "overview" ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <KpiCard label="Entregas" value={fmtNum(totais.entregas)} hint={`${totais.dias} dias`} icon={<Package className="w-5 h-5" />} accent="text-blue-500 bg-blue-500/10" />
                <KpiCard label="Média / dia" value={fmtNum(totais.mediaPorDia, 1)} hint="entregas por dia" icon={<Gauge className="w-5 h-5" />} accent="text-indigo-500 bg-indigo-500/10" />
                <KpiCard label="Pico / dia" value={fmtNum(totais.maxPorDia)} hint="máximo num dia" icon={<TrendingUp className="w-5 h-5" />} accent="text-rose-500 bg-rose-500/10" />
                <KpiCard label="Cidades" value={fmtNum(totais.cidades)} hint="atendidas" icon={<MapPin className="w-5 h-5" />} accent="text-amber-500 bg-amber-500/10" />
                <KpiCard label="Valor Entregue" value={fmtCurrency(totais.valor)} hint={`${fmtNum(totais.peso)} kg`} icon={<DollarSign className="w-5 h-5" />} accent="text-emerald-500 bg-emerald-500/10" />
              </div>

              {/* Dia da semana */}
              <section className="bg-card border border-border rounded-3xl p-6 shadow-sm">
                <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2 mb-5">
                  <CalendarDays className="w-4 h-4 text-primary" /> Entregas por Dia da Semana
                </h2>
                <div className="h-48 flex items-end gap-3">
                  {porDiaSemana.map((val, i) => (
                    <div key={i} className="flex-1 h-full flex flex-col justify-end items-center gap-2 group/bar">
                      <div className="flex-1 w-full flex flex-col justify-end relative">
                        <span className="text-center text-[10px] font-black tabular-nums text-muted-foreground mb-1">{val > 0 ? val : ""}</span>
                        <div
                          className={cn(
                            "w-full rounded-t-lg transition-all duration-500 min-h-[2px]",
                            val === maxDow && val > 0 ? "bg-gradient-to-t from-emerald-600 to-emerald-400" : "bg-gradient-to-t from-blue-600 to-indigo-500"
                          )}
                          style={{ height: `${(val / maxDow) * 100}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-wider opacity-60">{WEEKDAYS[i]}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : activeTab === "localidades" ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Cidades (clicáveis) */}
              <section className="bg-card border border-border rounded-3xl p-6 shadow-sm">
                <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-primary" /> Entregas por Cidade
                </h2>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-4">
                  Clique numa cidade para ver os bairros
                </p>
                <div className="space-y-1.5">
                  {topCidade.map((c) => {
                    const pct = totais.entregas > 0 ? (c.entregas / totais.entregas) * 100 : 0;
                    const key = cidadeKey(c);
                    const ativo = key === cidadeSel;
                    return (
                      <button
                        key={key}
                        onClick={() => setCidadeSel(key)}
                        className={cn(
                          "w-full text-left rounded-xl px-3 py-2 transition-all cursor-pointer border",
                          ativo ? "bg-blue-500/10 border-blue-500/30" : "border-transparent hover:bg-secondary/60"
                        )}
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className={cn("font-bold truncate max-w-[55%]", ativo ? "text-blue-600 dark:text-blue-400" : "text-foreground")}>
                            {c.cidade}<span className="text-muted-foreground font-medium"> / {c.uf}</span>
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            <span className="font-black text-foreground">{c.entregas}</span> · {pct.toFixed(0)}%
                            <span className="text-emerald-500 font-bold"> · {fmtCurrency(c.valor)}</span>
                          </span>
                        </div>
                        <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-500" style={{ width: `${(c.entregas / maxCidade) * 100}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Bairros da cidade selecionada */}
              <section className="bg-card border border-border rounded-3xl p-6 shadow-sm">
                <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2 mb-5">
                  <Building2 className="w-4 h-4 text-primary" />
                  {cidadeSelInfo ? `Bairros · ${cidadeSelInfo.cidade}` : "Bairros"}
                </h2>
                {bairrosSel.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">
                    {cidadeSelInfo ? "Sem bairros identificados nesta cidade." : "Selecione uma cidade ao lado."}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {bairrosSel.map((b) => {
                      const totalCidade = cidadeSelInfo?.entregas || 0;
                      const pct = totalCidade > 0 ? (b.entregas / totalCidade) * 100 : 0;
                      return (
                        <div key={b.bairro}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-bold text-foreground truncate max-w-[65%]">{b.bairro}</span>
                            <span className="text-muted-foreground tabular-nums">
                              <span className="font-black text-foreground">{b.entregas}</span> · {pct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all duration-500" style={{ width: `${(b.entregas / maxBairro) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          ) : activeTab === "motoristas" ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard label="Capacidade Máx." value={fmtNum(motoristas.maxPorDia)} hint="entregas/motorista num dia" icon={<Trophy className="w-5 h-5" />} accent="text-amber-500 bg-amber-500/10" />
                <KpiCard label="Média / Motorista" value={fmtNum(motoristas.mediaPorDia, 1)} hint="entregas por dia" icon={<Gauge className="w-5 h-5" />} accent="text-indigo-500 bg-indigo-500/10" />
                <KpiCard label="Motoristas" value={fmtNum(motoristas.totalMotoristas)} hint="ativos no período" icon={<User className="w-5 h-5" />} accent="text-blue-500 bg-blue-500/10" />
                <KpiCard label="Peso Total" value={`${fmtNum(totais.peso)} kg`} hint="carga entregue" icon={<Weight className="w-5 h-5" />} accent="text-emerald-500 bg-emerald-500/10" />
              </div>

              {motoristas.recorde && (
                <div className="bg-gradient-to-r from-amber-500/10 to-amber-500/5 border border-amber-500/20 rounded-3xl p-5 flex items-center gap-4">
                  <div className="relative shrink-0">
                    <DriverAvatar
                      name={motoristas.recorde.nome}
                      avatar={motoristas.recorde.avatar || userAvatars[motoristas.recorde.cod] || userAvatars[motoristas.recorde.nome.toLowerCase()]}
                      size="lg"
                    />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-slate-950 shadow">
                      <Trophy className="w-3 h-3 fill-current" />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">Recorde de entregas num dia</p>
                    <p className="text-sm font-black text-foreground mt-0.5">
                      {motoristas.recorde.nome} — {motoristas.recorde.entregas} entregas
                    </p>
                    <p className="text-[11px] font-bold text-muted-foreground">
                      em {new Date(motoristas.recorde.data + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                    </p>
                  </div>
                </div>
              )}

              <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="border-b border-border text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        <th className="text-left py-3 px-5">Motorista</th>
                        <th className="text-right py-3 px-3">Entregas</th>
                        <th className="text-right py-3 px-3">Dias</th>
                        <th className="text-right py-3 px-3">Média/Dia</th>
                        <th className="text-right py-3 px-3">Máx/Dia</th>
                        <th className="text-right py-3 px-3">Km</th>
                        <th className="text-right py-3 px-5">Custo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {motoristas.lista.map((m) => {
                        const avatarUrl = m.avatar || userAvatars[m.cod] || userAvatars[m.nome.toLowerCase()];
                        return (
                          <tr key={m.cod} className="border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors">
                            <td className="py-3 px-5">
                              <div className="flex items-center gap-2.5">
                                <DriverAvatar name={m.nome} avatar={avatarUrl} />
                                <span className="font-bold text-foreground whitespace-nowrap">{m.nome}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums font-bold">{m.entregas}</td>
                            <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">{m.dias}</td>
                            <td className="py-3 px-3 text-right tabular-nums font-semibold">{fmtNum(m.mediaDia, 1)}</td>
                            <td className="py-3 px-3 text-right">
                              <span className="inline-block px-2 py-0.5 rounded-lg text-[11px] font-black tabular-nums bg-amber-500/10 text-amber-500">
                                {m.maxDia}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">
                              {m.km ? `${fmtNum(m.km)} km` : "—"}
                            </td>
                            <td className="py-3 px-5 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                              {m.custoTotal ? fmtCurrency(m.custoTotal) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] font-bold text-muted-foreground px-5 py-3 border-t border-border/40">
                  Fonte: rotas atribuídas no app de entregas (motorista + data). Km e custo vêm do veículo vinculado ao motorista (configure na engrenagem "Frota"). Capacidade máxima = maior nº de entregas num único dia.
                </p>
              </section>
            </div>
          ) : activeTab === "frota" ? (
            <div className="space-y-5">
              <PosicoesFrotaPanel
                posicoes={posicoes}
                loading={posicoesLoading}
                erro={posicoesErro}
                onReload={carregarPosicoes}
              />
              {!frota.temCadastro ? (
              <div className="bg-card border border-border rounded-3xl p-8 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-16 h-16 rounded-3xl bg-secondary flex items-center justify-center">
                  <Car className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="text-sm font-black uppercase tracking-tight">Custos: nenhum veículo cadastrado</p>
                <p className="text-xs text-muted-foreground max-w-md">
                  As posições acima vêm direto do rastreador. Para ver <b>custos</b> (combustível, custo diário, pedágio), cadastre os veículos com km/l e custo diário e sincronize o km — clique em "Configurar Frota", depois "Descobrir da API".
                </p>
                <button
                  onClick={() => setIsConfigOpen(true)}
                  className="mt-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-[11px] font-black uppercase tracking-tight flex items-center gap-2 hover:opacity-90 transition"
                >
                  <Settings className="w-4 h-4" /> Configurar Frota
                </button>
              </div>
              ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard label="Km Rodado" value={`${fmtNum(frota.totais.km)} km`} hint="odômetro do rastreador" icon={<Route className="w-5 h-5" />} accent="text-blue-500 bg-blue-500/10" />
                  <KpiCard label="Combustível" value={fmtCurrency(frota.totais.combustivel)} hint={`${fmtCurrency2(frota.precoCombustivel)}/L`} icon={<Fuel className="w-5 h-5" />} accent="text-orange-500 bg-orange-500/10" />
                  <KpiCard label="Custo Diário" value={fmtCurrency(frota.totais.custoDiario)} hint="veículos × dias ativos" icon={<Coins className="w-5 h-5" />} accent="text-indigo-500 bg-indigo-500/10" />
                  <KpiCard label="Pedágios" value={fmtCurrency(frota.totais.pedagio)} hint="lançamento manual" icon={<Wallet className="w-5 h-5" />} accent="text-violet-500 bg-violet-500/10" />
                  <KpiCard label="Custo Total" value={fmtCurrency(frota.totais.custoTotal)} hint="combustível + diário + pedágio" icon={<DollarSign className="w-5 h-5" />} accent="text-emerald-500 bg-emerald-500/10" />
                  <KpiCard label="Custo / Km" value={fmtCurrency2(frota.totais.custoPorKm)} hint="por quilômetro rodado" icon={<Gauge className="w-5 h-5" />} accent="text-rose-500 bg-rose-500/10" />
                  <KpiCard label="Custo / Entrega" value={fmtCurrency2(frota.totais.custoPorEntrega)} hint="por NF entregue" icon={<Package className="w-5 h-5" />} accent="text-amber-500 bg-amber-500/10" />
                </div>

                <section className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                      <thead>
                        <tr className="border-b border-border text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                          <th className="text-left py-3 px-5">Veículo</th>
                          <th className="text-right py-3 px-3">Km</th>
                          <th className="text-right py-3 px-3">Dias</th>
                          <th className="text-right py-3 px-3">Combustível</th>
                          <th className="text-right py-3 px-3">Custo Diário</th>
                          <th className="text-right py-3 px-3">Pedágio</th>
                          <th className="text-right py-3 px-5">Custo Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {frota.porVeiculo.map((v) => (
                          <tr key={v.veiculoId} className="border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors">
                            <td className="py-3 px-5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                                  <Truck className="w-4 h-4 text-muted-foreground" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-foreground whitespace-nowrap">{v.placa}</p>
                                  {v.modelo && <p className="text-[10px] text-muted-foreground truncate">{v.modelo}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums font-bold">{fmtNum(v.km)}</td>
                            <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">{v.dias}</td>
                            <td className="py-3 px-3 text-right tabular-nums">{fmtCurrency(v.combustivel)}</td>
                            <td className="py-3 px-3 text-right tabular-nums">{fmtCurrency(v.custoDiario)}</td>
                            <td className="py-3 px-3 text-right tabular-nums">{v.pedagio ? fmtCurrency(v.pedagio) : "—"}</td>
                            <td className="py-3 px-5 text-right tabular-nums font-black text-emerald-600 dark:text-emerald-400">{fmtCurrency(v.custoTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground px-5 py-3 border-t border-border/40">
                    Km real do odômetro (Link Monitoramento). Combustível = km ÷ (km/l do veículo) × preço do litro. Custo diário = valor cadastrado × dias com movimento. Pedágio é lançado manualmente na engrenagem "Frota".
                  </p>
                </section>
              </div>
              )}
            </div>
          ) : (
            <section className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> Entregas por Dia
                </h2>
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                  Média {fmtNum(totais.mediaPorDia, 1)} · Pico {fmtNum(totais.maxPorDia)}
                </span>
              </div>
              {(() => {
                const maxVal = Math.max(...serieDiaria.map((d) => d.entregas), 1);
                const showLabelEvery = Math.max(1, Math.ceil(serieDiaria.length / 15));
                return (
                  <div className="h-64 flex items-end gap-1">
                    {serieDiaria.map((d, i) => (
                      <div key={d.data} className="flex-1 h-full flex flex-col justify-end items-center gap-2 group/bar min-w-0">
                        <div className="flex-1 w-full flex items-end justify-center relative">
                          <div className="w-3/4 bg-gradient-to-t from-blue-600 to-indigo-400 rounded-t transition-all min-h-[2px]" style={{ height: `${(d.entregas / maxVal) * 100}%` }} />
                          <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-slate-950 border border-white/10 px-2 py-1 rounded-lg text-[9px] font-black text-white opacity-0 group-hover/bar:opacity-100 transition-all z-20 whitespace-nowrap">
                            {new Date(d.data + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · {d.entregas} entregas
                          </div>
                        </div>
                        <span className="text-[7px] font-black uppercase tracking-tighter opacity-50 truncate w-full text-center">
                          {i % showLabelEvery === 0 ? new Date(d.data + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </section>
          )}
        </div>
      </div>

      {isConfigOpen && (
        <FrotaConfigModal
          motoristas={motoristas.lista.map((m) => ({ cod: m.cod, nome: m.nome }))}
          onClose={() => setIsConfigOpen(false)}
          onChanged={reloadReport}
        />
      )}
    </div>
  );
}

function KpiCard({ label, value, hint, icon, accent }: {
  label: string; value: string; hint?: string; icon: React.ReactNode; accent: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-2", accent)}>{icon}</div>
      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-lg font-black tracking-tight mt-0.5">{value}</p>
      {hint && <p className="text-[11px] font-bold text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function PosicoesFrotaPanel({
  posicoes,
  loading,
  erro,
  onReload,
}: {
  posicoes: FrotaPosicao[];
  loading: boolean;
  erro: boolean;
  onReload: () => void;
}) {
  return (
    <section className="bg-card border border-border rounded-3xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" /> Onde estão agora
          {!loading && !erro && posicoes.length > 0 && (
            <span className="ml-1 flex items-center gap-1 text-[9px] font-black text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> AO VIVO
            </span>
          )}
        </h2>
        <button
          onClick={onReload}
          disabled={loading}
          className="h-8 px-3 rounded-lg border border-border bg-background text-[10px] font-black uppercase tracking-tight flex items-center gap-1.5 hover:bg-secondary transition disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Atualizar
        </button>
      </div>

      {loading && posicoes.length === 0 ? (
        <div className="py-8 flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Buscando posições…
        </div>
      ) : erro ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Não foi possível obter as posições. Verifique as credenciais da Link Monitoramento no servidor.
        </p>
      ) : posicoes.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma posição retornada.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {posicoes.map((p) => {
            const emMovimento = p.ignicao === 1 || p.velocidade > 0;
            return (
              <a
                key={p.placa}
                href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-2xl border border-border p-4 hover:border-blue-500/40 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                      emMovimento ? "bg-emerald-500/10 text-emerald-500" : "bg-secondary text-muted-foreground"
                    )}>
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-black text-sm text-foreground">{p.placa}</p>
                      <p className="text-[10px] font-bold text-muted-foreground">{tempoRelativo(p.dataHora)}</p>
                    </div>
                  </div>
                  <span className={cn(
                    "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider",
                    emMovimento ? "bg-emerald-500/10 text-emerald-500" : "bg-secondary text-muted-foreground"
                  )}>
                    {emMovimento ? `${p.velocidade} km/h` : "Parado"}
                  </span>
                </div>
                <p className="text-xs text-foreground line-clamp-2 min-h-[2rem]">{p.logradouro || "Endereço indisponível"}</p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                  <span className="text-[10px] font-bold text-muted-foreground tabular-nums">Odôm.: {fmtNum(p.odometroKm)} km</span>
                  <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                    Ver no mapa <MapPin className="w-3 h-3" />
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const inputCls =
  "h-9 px-3 rounded-lg border border-border bg-background text-sm outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 w-full";
const labelCls = "text-[9px] font-black uppercase tracking-widest text-muted-foreground";

function FrotaConfigModal({
  motoristas,
  onClose,
  onChanged,
}: {
  motoristas: { cod: string; nome: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [veiculos, setVeiculos] = useState<FrotaVeiculo[]>([]);
  const [vinculos, setVinculos] = useState<{ driver_cod: string; veiculo_id: string }[]>([]);
  const [preco, setPreco] = useState("0");
  const [novo, setNovo] = useState({ placa: "", modelo: "", km_por_litro: "", custo_diario: "" });
  const [descobertos, setDescobertos] = useState<VeiculoDescoberto[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ped, setPed] = useState({ veiculo_id: "", data: hojeISO(), valor: "" });

  const carregar = useCallback(async () => {
    try {
      const c: FrotaCadastro = await apiFrotaCadastro();
      setVeiculos(c.veiculos);
      setVinculos(c.vinculos);
      setPreco(String(c.precoCombustivel ?? 0));
    } catch {
      setMsg({ tipo: "erro", texto: "Falha ao carregar o cadastro da frota." });
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const flash = (tipo: "ok" | "erro", texto: string) => {
    setMsg({ tipo, texto });
    setTimeout(() => setMsg(null), 3500);
  };

  const patchVeiculo = (id: string, campo: keyof FrotaVeiculo, valor: string | boolean) =>
    setVeiculos((prev) => prev.map((v) => (v.id === id ? { ...v, [campo]: valor } : v)));

  const salvarVeiculo = async (v: FrotaVeiculo) => {
    setBusy(`veic-${v.id}`);
    try {
      await apiSalvarVeiculo({
        id: v.id,
        placa: v.placa,
        modelo: v.modelo,
        km_por_litro: Number(v.km_por_litro) || 0,
        custo_diario: Number(v.custo_diario) || 0,
        ativo: v.ativo,
      });
      flash("ok", `Veículo ${v.placa} salvo.`);
      onChanged();
    } catch {
      flash("erro", "Erro ao salvar veículo.");
    } finally {
      setBusy(null);
    }
  };

  const adicionarVeiculo = async () => {
    if (!novo.placa.trim()) return flash("erro", "Informe a placa.");
    setBusy("novo");
    try {
      await apiSalvarVeiculo({
        placa: novo.placa,
        modelo: novo.modelo,
        km_por_litro: Number(novo.km_por_litro) || 0,
        custo_diario: Number(novo.custo_diario) || 0,
        ativo: true,
      });
      setNovo({ placa: "", modelo: "", km_por_litro: "", custo_diario: "" });
      await carregar();
      flash("ok", "Veículo adicionado.");
      onChanged();
    } catch {
      flash("erro", "Erro ao adicionar veículo (placa duplicada?).");
    } finally {
      setBusy(null);
    }
  };

  const salvarPreco = async () => {
    setBusy("preco");
    try {
      await apiSalvarPrecoCombustivel(Number(preco) || 0);
      flash("ok", "Preço do combustível salvo.");
      onChanged();
    } catch {
      flash("erro", "Erro ao salvar preço.");
    } finally {
      setBusy(null);
    }
  };

  const definirVinculo = async (cod: string, veiculoId: string) => {
    setBusy(`vinc-${cod}`);
    try {
      await apiSalvarVinculoMotorista(cod, veiculoId || null);
      setVinculos((prev) => {
        const outros = prev.filter((x) => x.driver_cod !== cod);
        return veiculoId ? [...outros, { driver_cod: cod, veiculo_id: veiculoId }] : outros;
      });
      onChanged();
    } catch {
      flash("erro", "Erro ao salvar vínculo.");
    } finally {
      setBusy(null);
    }
  };

  const salvarPedagio = async () => {
    if (!ped.veiculo_id || !ped.data) return flash("erro", "Escolha veículo e data.");
    setBusy("pedagio");
    try {
      await apiSalvarPedagio(ped.veiculo_id, ped.data, Number(ped.valor) || 0);
      flash("ok", "Pedágio lançado.");
      setPed((p) => ({ ...p, valor: "" }));
      onChanged();
    } catch {
      flash("erro", "Erro ao lançar pedágio.");
    } finally {
      setBusy(null);
    }
  };

  const descobrir = async () => {
    setBusy("descobrir");
    try {
      const r = await apiDescobrirVeiculos();
      setDescobertos(r.veiculos);
      if (r.veiculos.length === 0) flash("ok", "Nenhum veículo retornado pela API.");
    } catch {
      flash("erro", "Falha ao consultar a API (verifique credenciais no .env).");
    } finally {
      setBusy(null);
    }
  };

  const sincronizar = async () => {
    setBusy("sync");
    try {
      const r = await apiSyncFrota();
      flash("ok", `Sincronizado: ${r.diasGravados} dia(s) de km gravados.`);
      onChanged();
    } catch {
      flash("erro", "Falha ao sincronizar km (verifique credenciais no .env).");
    } finally {
      setBusy(null);
    }
  };

  const placaJaExiste = (placa: string) => veiculos.some((v) => v.placa.toUpperCase() === placa.toUpperCase());

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-3xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" /> Frota &amp; Custos
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={sincronizar}
              disabled={busy === "sync"}
              className="h-9 px-3 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-tight flex items-center gap-1.5 hover:opacity-90 transition disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", busy === "sync" && "animate-spin")} /> Sincronizar
            </button>
            <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-secondary flex items-center justify-center transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {msg && (
          <div className={cn(
            "px-6 py-2 text-[11px] font-bold shrink-0",
            msg.tipo === "ok" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
          )}>
            {msg.texto}
          </div>
        )}

        <div className="overflow-y-auto p-6 space-y-7">
          {/* Preço do combustível */}
          <section>
            <p className={cn(labelCls, "mb-2")}>Preço do combustível (R$/litro)</p>
            <div className="flex items-center gap-2 max-w-xs">
              <input
                type="number" step="0.01" min="0" value={preco}
                onChange={(e) => setPreco(e.target.value)}
                className={inputCls}
              />
              <button
                onClick={salvarPreco} disabled={busy === "preco"}
                className="h-9 px-4 rounded-lg bg-secondary text-foreground text-[10px] font-black uppercase tracking-tight flex items-center gap-1.5 hover:bg-secondary/70 transition disabled:opacity-50 shrink-0"
              >
                <Save className="w-3.5 h-3.5" /> Salvar
              </button>
            </div>
          </section>

          {/* Veículos */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className={labelCls}>Veículos ({veiculos.length})</p>
              <button
                onClick={descobrir} disabled={busy === "descobrir"}
                className="text-[10px] font-black uppercase tracking-tight text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3 h-3", busy === "descobrir" && "animate-spin")} /> Descobrir da API
              </button>
            </div>

            {descobertos.length > 0 && (
              <div className="mb-3 p-3 rounded-xl bg-secondary/50 border border-border space-y-1.5">
                <p className="text-[10px] font-bold text-muted-foreground">Veículos na API (clique para preencher o cadastro):</p>
                <div className="flex flex-wrap gap-1.5">
                  {descobertos.map((d) => (
                    <button
                      key={d.placa}
                      onClick={() => setNovo((n) => ({ ...n, placa: d.placa }))}
                      disabled={placaJaExiste(d.placa)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[11px] font-bold border transition",
                        placaJaExiste(d.placa)
                          ? "border-border text-muted-foreground opacity-50 cursor-not-allowed"
                          : "border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                      )}
                    >
                      {d.placa}{placaJaExiste(d.placa) ? " ✓" : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {veiculos.map((v) => (
                <div key={v.id} className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-end p-2 rounded-xl border border-border">
                  <div>
                    <p className={labelCls}>Placa</p>
                    <input value={v.placa} onChange={(e) => patchVeiculo(v.id, "placa", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <p className={labelCls}>Modelo</p>
                    <input value={v.modelo || ""} onChange={(e) => patchVeiculo(v.id, "modelo", e.target.value)} className={inputCls} />
                  </div>
                  <div className="w-24">
                    <p className={labelCls}>Km/L</p>
                    <input type="number" step="0.1" min="0" value={v.km_por_litro} onChange={(e) => patchVeiculo(v.id, "km_por_litro", e.target.value)} className={inputCls} />
                  </div>
                  <div className="w-28">
                    <p className={labelCls}>Custo/dia</p>
                    <input type="number" step="0.01" min="0" value={v.custo_diario} onChange={(e) => patchVeiculo(v.id, "custo_diario", e.target.value)} className={inputCls} />
                  </div>
                  <button
                    onClick={() => salvarVeiculo(v)} disabled={busy === `veic-${v.id}`}
                    className="h-9 px-3 rounded-lg bg-secondary text-foreground text-[10px] font-black uppercase flex items-center gap-1 hover:bg-secondary/70 transition disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Novo veículo */}
            <div className="mt-3 grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-end p-2 rounded-xl border border-dashed border-border">
              <div>
                <p className={labelCls}>Nova placa</p>
                <input value={novo.placa} onChange={(e) => setNovo((n) => ({ ...n, placa: e.target.value }))} className={inputCls} placeholder="ABC1D23" />
              </div>
              <div>
                <p className={labelCls}>Modelo</p>
                <input value={novo.modelo} onChange={(e) => setNovo((n) => ({ ...n, modelo: e.target.value }))} className={inputCls} />
              </div>
              <div className="w-24">
                <p className={labelCls}>Km/L</p>
                <input type="number" step="0.1" min="0" value={novo.km_por_litro} onChange={(e) => setNovo((n) => ({ ...n, km_por_litro: e.target.value }))} className={inputCls} />
              </div>
              <div className="w-28">
                <p className={labelCls}>Custo/dia</p>
                <input type="number" step="0.01" min="0" value={novo.custo_diario} onChange={(e) => setNovo((n) => ({ ...n, custo_diario: e.target.value }))} className={inputCls} />
              </div>
              <button
                onClick={adicionarVeiculo} disabled={busy === "novo"}
                className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase flex items-center gap-1 hover:opacity-90 transition disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </section>

          {/* Vínculo motorista → veículo */}
          {motoristas.length > 0 && (
            <section>
              <p className={cn(labelCls, "mb-3")}>Veículo fixo por motorista</p>
              <div className="space-y-2">
                {motoristas.map((m) => {
                  const atual = vinculos.find((x) => x.driver_cod === m.cod)?.veiculo_id || "";
                  return (
                    <div key={m.cod} className="flex items-center gap-3">
                      <span className="text-sm font-bold text-foreground flex-1 truncate">{m.nome}</span>
                      <select
                        value={atual}
                        onChange={(e) => definirVinculo(m.cod, e.target.value)}
                        disabled={busy === `vinc-${m.cod}`}
                        className={cn(inputCls, "max-w-[200px]")}
                      >
                        <option value="">— sem veículo —</option>
                        {veiculos.map((v) => (
                          <option key={v.id} value={v.id}>{v.placa}{v.modelo ? ` (${v.modelo})` : ""}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Pedágio manual */}
          <section>
            <p className={cn(labelCls, "mb-3")}>Lançar pedágio (por veículo/dia)</p>
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
              <div>
                <p className={labelCls}>Veículo</p>
                <select value={ped.veiculo_id} onChange={(e) => setPed((p) => ({ ...p, veiculo_id: e.target.value }))} className={inputCls}>
                  <option value="">Selecione</option>
                  {veiculos.map((v) => (
                    <option key={v.id} value={v.id}>{v.placa}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className={labelCls}>Data</p>
                <input type="date" value={ped.data} onChange={(e) => setPed((p) => ({ ...p, data: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <p className={labelCls}>Valor (R$)</p>
                <input type="number" step="0.01" min="0" value={ped.valor} onChange={(e) => setPed((p) => ({ ...p, valor: e.target.value }))} className={inputCls} />
              </div>
              <button
                onClick={salvarPedagio} disabled={busy === "pedagio"}
                className="h-9 px-4 rounded-lg bg-secondary text-foreground text-[10px] font-black uppercase flex items-center gap-1.5 hover:bg-secondary/70 transition disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" /> Lançar
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              O pedágio é somado ao custo do dia e não é apagado pela sincronização de km.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
