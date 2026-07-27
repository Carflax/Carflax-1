import { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import { apiRelatorioRomaneios, type RelatorioRomaneios } from "@/lib/api";
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
};

type TabId = "overview" | "localidades" | "motoristas" | "tendencia";
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Visão Geral" },
  { id: "localidades", label: "Localidades" },
  { id: "motoristas", label: "Motoristas" },
  { id: "tendencia", label: "Tendência" },
];

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);
const fmtNum = (v: number, dec = 0) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v || 0);
const cidadeKey = (c: { cidade: string; uf: string }) => `${c.cidade}||${c.uf}`;

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
  }, [startDate, endDate]);

  const { totais, porCidade, serieDiaria, porDiaSemana, motoristas } = data;
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
                        <th className="text-right py-3 px-5">Máx/Dia</th>
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
                            <td className="py-3 px-5 text-right">
                              <span className="inline-block px-2 py-0.5 rounded-lg text-[11px] font-black tabular-nums bg-amber-500/10 text-amber-500">
                                {m.maxDia}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] font-bold text-muted-foreground px-5 py-3 border-t border-border/40">
                  Fonte: rotas atribuídas no app de entregas (motorista + data). Capacidade máxima observada = maior nº de entregas que um motorista fez num único dia.
                </p>
              </section>
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
