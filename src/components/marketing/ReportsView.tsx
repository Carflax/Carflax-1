import { useState, useEffect, useMemo, useCallback } from "react";
import {
  TrendingUp,
  Users,
  DollarSign,
  Calendar,
  ChevronDown,
  Download,
  Timer,
  ShoppingBag,
  Percent,
  Award,
  Target,
  MapPin,
  Megaphone,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  BarChart3,
  X,
  Send,
  Check,
  Phone,
  Building2,
} from "lucide-react";
import { marketingService, type ReportsAnalytics, type EvolutionData, type EvolutionClient, type VerbasData } from "@/lib/marketing-service";
import { apiAdsSpend, apiAdsSendReport, type AdsSpendResponse } from "@/lib/api";
import { CustosFixosSection } from "./CustosFixosSection";
import { cn } from "@/lib/utils";
import { MiniCalendar } from "@/components/ui/MiniCalendar";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const EMPTY_ANALYTICS: ReportsAnalytics = {
  totals: {
    leads: 0, quotesCount: 0, quotesValue: 0, salesCount: 0, salesValue: 0,
    avgTicket: 0, convByCount: 0, convByValue: 0, convByQuote: 0, avgResponseMinutes: null,
  },
  previous: { leads: 0, salesCount: 0, salesValue: 0 },
  bySeller: [],
  byOrigin: [],
  byCampaign: [],
  byTemperature: [],
  dailySeries: [],
};

type TabId = "overview" | "sellers" | "sources" | "trend" | "evolution" | "verbas" | "gastos";
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Visão Geral" },
  { id: "sellers", label: "Atendentes" },
  { id: "sources", label: "Origem & Campanha" },
  { id: "trend", label: "Tendência" },
  { id: "evolution", label: "Evolução" },
  { id: "verbas", label: "Verbas" },
  { id: "gastos", label: "Gastos" },
];

const TEMP_STYLE: Record<string, string> = {
  Quente: "bg-rose-500",
  Morno: "bg-amber-500",
  Frio: "bg-blue-500",
};

/** Delta percentual vs período anterior. Retorna null quando não há base. */
function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);

const formatResponseTime = (minutes: number | null): string => {
  if (minutes === null) return "—";
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
};

const slaColor = (minutes: number | null) =>
  minutes === null ? "text-muted-foreground"
    : minutes < 3 ? "text-emerald-500"
    : minutes < 5 ? "text-amber-500"
    : "text-rose-500";

export function ReportsView() {
  const [loading, setLoading] = useState(true);
  // Filtro inicia no mês atual: do dia 1 até hoje.
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const [hourlyData, setHourlyData] = useState<number[]>(new Array(24).fill(0));
  const [analytics, setAnalytics] = useState<ReportsAnalytics>(EMPTY_ANALYTICS);
  const [evolution, setEvolution] = useState<EvolutionData | null>(null);
  const [evoSearch, setEvoSearch] = useState("");
  const [evoSort, setEvoSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "total_vendas", dir: "desc" });
  const [chartClient, setChartClient] = useState<EvolutionClient | null>(null);
  const [verbas, setVerbas] = useState<VerbasData | null>(null);
  const [verbasLoading, setVerbasLoading] = useState(false);
  const [adsData, setAdsData] = useState<AdsSpendResponse | null>(null);
  const [adsLoading, setAdsLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportPhone, setReportPhone] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  const peakHour = useMemo(() => {
    let maxVal = -1, maxH = -1;
    hourlyData.forEach((val, h) => { if (val > maxVal) { maxVal = val; maxH = h; } });
    return { hour: maxH, count: maxVal };
  }, [hourlyData]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setVerbas(null);
      setAdsData(null);
      try {
        const [reports, hourlyLeads, evoData] = await Promise.all([
          marketingService.getReportsAnalytics(startDate, endDate || undefined),
          marketingService.getHourlyLeads(startDate, endDate || undefined, {}),
          marketingService.getEvolutionData(),
        ]);
        setAnalytics(reports);
        setHourlyData(hourlyLeads);
        setEvolution(evoData);
      } catch (err) {
        console.error("Erro ao carregar relatórios:", err);
        setAnalytics(EMPTY_ANALYTICS);
      } finally {
        setLoading(false);
      }
    }
    if (!startDate || !endDate) return;
    loadData();
  }, [startDate, endDate]);

  useEffect(() => {
    if (activeTab !== "verbas" || !startDate || !endDate) return;
    setVerbas(null);
    setVerbasLoading(true);
    marketingService.getVerbasData(startDate, endDate)
      .then(setVerbas)
      .catch((err) => console.error("Erro ao carregar verbas:", err))
      .finally(() => setVerbasLoading(false));
  }, [activeTab, startDate, endDate]);

  // Recarrega os gastos do período. Extraído do efeito para que a edição de um
  // custo fixo possa refazer a consulta sem trocar de aba — o total de
  // investimento muda na hora.
  const recarregarGastos = useCallback(
    (comLoading = true) => {
      if (!startDate || !endDate) return;
      if (comLoading) {
        setAdsData(null);
        setAdsLoading(true);
      }
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      apiAdsSpend(fmt(startDate), fmt(endDate))
        .then(setAdsData)
        .catch((err) => console.error("Erro ao carregar gastos:", err))
        .finally(() => setAdsLoading(false));
    },
    [startDate, endDate],
  );

  useEffect(() => {
    if (activeTab !== "gastos") return;
    recarregarGastos();
  }, [activeTab, recarregarGastos]);

  const { totals, previous, bySeller, byOrigin, byCampaign, byTemperature, dailySeries } = analytics;
  const maxOriginLeads = Math.max(...byOrigin.map((o) => o.leads), 1);
  const maxCampaignLeads = Math.max(...byCampaign.map((c) => c.leads), 1);
  const totalTempLeads = byTemperature.reduce((s, t) => s + t.leads, 0);
  const hasData = totals.leads > 0 || totals.salesCount > 0 || totals.quotesCount > 0;

  // Funil: Leads -> Orçamentos -> Vendas, com % de queda entre etapas.
  const funnel = [
    { label: "Leads", value: totals.leads, color: "bg-blue-500", pctOfTop: 100 },
    { label: "Orçamentos", value: totals.quotesCount, color: "bg-indigo-500", pctOfTop: totals.leads > 0 ? (totals.quotesCount / totals.leads) * 100 : 0 },
    { label: "Vendas", value: totals.salesCount, color: "bg-emerald-500", pctOfTop: totals.leads > 0 ? (totals.salesCount / totals.leads) * 100 : 0 },
  ];

  const dateLabel =
    endDate !== null
      ? `${startDate?.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })} até ${endDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`
      : startDate
      ? `${startDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}...`
      : "Selecione o período...";

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      <div className="max-w-6xl w-full mx-auto flex flex-col min-h-0 flex-1 px-8 pt-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between shrink-0 px-1">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-foreground flex items-center gap-2.5">
              <span className="w-1.5 h-6 bg-primary rounded-full" />
              Desempenho de Marketing
            </h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">
              Conversão, orçamentos, tempo de atendimento e origem dos leads
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
              onClick={async () => {
                if (exporting || !startDate || !endDate) return;
                setExporting(true);
                try {
                  const result = await marketingService.exportLeadsXlsx(startDate, endDate);
                  if (!result) alert("Nenhum lead encontrado no período selecionado.");
                } catch (err) {
                  console.error("Erro ao exportar:", err);
                  alert("Erro ao gerar relatório. Tente novamente.");
                } finally {
                  setExporting(false);
                }
              }}
              disabled={exporting}
              className={cn(
                "w-10 h-10 border rounded-xl transition-all active:scale-95 shadow-sm flex items-center justify-center group",
                exporting ? "bg-blue-600/10 border-blue-600/20 cursor-wait" : "bg-card border-border hover:bg-secondary text-muted-foreground"
              )}
              title="Exportar Planilha de Leads"
            >
              {exporting ? (
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4 group-hover:text-blue-600 transition-colors" />
              )}
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
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto py-4 pr-1">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-black uppercase tracking-widest text-primary">Gerando Relatórios...</span>
            </div>
          ) : !hasData ? (
            <div className="h-full flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-16 h-16 rounded-3xl bg-secondary flex items-center justify-center">
                <Target className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-black uppercase tracking-tight">Sem dados no período</p>
              <p className="text-xs text-muted-foreground max-w-xs">Selecione outro intervalo de datas para visualizar as métricas.</p>
            </div>
          ) : activeTab === "overview" ? (
            <div className="space-y-5">
              {/* KPI Row — com comparativo vs período anterior */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <KpiCard label="Leads" value={totals.leads.toLocaleString("pt-BR")} delta={pctDelta(totals.leads, previous.leads)} icon={<Users className="w-5 h-5" />} accent="text-blue-500 bg-blue-500/10" />
                <KpiCard label="Orçamentos" value={totals.quotesCount.toLocaleString("pt-BR")} hint={formatCurrency(totals.quotesValue)} icon={<ShoppingBag className="w-5 h-5" />} accent="text-indigo-500 bg-indigo-500/10" />
                <KpiCard label="Vendas" value={totals.salesCount.toLocaleString("pt-BR")} hint={formatCurrency(totals.salesValue)} delta={pctDelta(totals.salesValue, previous.salesValue)} icon={<DollarSign className="w-5 h-5" />} accent="text-emerald-500 bg-emerald-500/10" />
                <KpiCard label="Ticket Médio" value={formatCurrency(totals.avgTicket)} icon={<TrendingUp className="w-5 h-5" />} accent="text-rose-500 bg-rose-500/10" />
                <KpiCard label="1ª Resposta" value={formatResponseTime(totals.avgResponseMinutes)} valueClass={slaColor(totals.avgResponseMinutes)} icon={<Timer className="w-5 h-5" />} accent="text-amber-500 bg-amber-500/10" />
              </div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider -mt-3 px-1">
                Variação comparada ao período anterior de mesma duração
              </p>

              {/* Conversão */}
              <section className="space-y-2.5">
                <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                  <Percent className="w-4 h-4 text-primary" /> Taxas de Conversão
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <ConversionCard title="Por Quantidade" formula="Orçamentos ÷ Leads" percent={totals.leads > 0 ? (totals.quotesCount / totals.leads) * 100 : 0} detail={`${totals.quotesCount} de ${totals.leads} leads viraram orçamento`} color="blue" />
                  <ConversionCard title="Por Orçamento" formula="Vendas ÷ Orçamentos enviados" percent={totals.convByQuote} detail={`${totals.salesCount} de ${totals.quotesCount} orçamentos`} color="indigo" />
                  <ConversionCard title="Por Valor" formula="R$ vendido ÷ R$ orçado" percent={totals.convByValue} detail={`${formatCurrency(totals.salesValue)} de ${formatCurrency(totals.quotesValue)}`} color="emerald" />
                </div>
              </section>

              {/* Funil */}
              <section className="space-y-2.5">
                <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                  <Filter className="w-4 h-4 text-primary" /> Funil de Conversão
                </h2>
                <div className="bg-card border border-border rounded-3xl p-4 shadow-sm space-y-2">
                  {funnel.map((stage, i) => (
                    <div key={stage.label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-foreground">{stage.label}</span>
                        <span className="text-muted-foreground tabular-nums">
                          <span className="font-black text-foreground">{stage.value.toLocaleString("pt-BR")}</span>
                          {i > 0 && <span> · {stage.pctOfTop.toFixed(1)}% dos leads</span>}
                        </span>
                      </div>
                      <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all duration-700", stage.color)} style={{ width: `${Math.max(stage.pctOfTop, stage.value > 0 ? 3 : 0)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : activeTab === "sellers" ? (
            <section className="space-y-4">
              <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                <Award className="w-4 h-4 text-primary" /> Desempenho por Atendente
              </h2>
              <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="border-b border-border text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        <th className="text-left py-3 px-5">Atendente</th>
                        <th className="text-right py-3 px-3">Leads</th>
                        <th className="text-right py-3 px-3">Orçam.</th>
                        <th className="text-right py-3 px-3">Vendas</th>
                        <th className="text-right py-3 px-3">Faturamento</th>
                        <th className="text-right py-3 px-3">Conversão</th>
                        <th className="text-right py-3 px-5">1ª Resp.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bySeller.map((s) => (
                        <tr key={s.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors">
                          <td className="py-3 px-5">
                            <div className="flex items-center gap-2.5">
                              <SellerAvatar name={s.name} avatar={s.avatar} />
                              <span className="font-bold text-foreground whitespace-nowrap">{s.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums font-semibold">{s.leads}</td>
                          <td className="py-3 px-3 text-right tabular-nums">
                            <span className="font-semibold">{s.quotesCount}</span>
                            {s.quotesValue > 0 && <span className="block text-[10px] text-muted-foreground">{formatCurrency(s.quotesValue)}</span>}
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums font-semibold text-emerald-500">{s.salesCount}</td>
                          <td className="py-3 px-3 text-right tabular-nums font-bold">{formatCurrency(s.salesValue)}</td>
                          <td className="py-3 px-3 text-right">
                            <span className={cn(
                              "inline-block px-2 py-0.5 rounded-lg text-[11px] font-black tabular-nums",
                              s.convRate >= 20 ? "bg-emerald-500/10 text-emerald-500"
                                : s.convRate >= 8 ? "bg-amber-500/10 text-amber-500"
                                : "bg-secondary text-muted-foreground"
                            )}>
                              {s.convRate.toFixed(1)}%
                            </span>
                          </td>
                          <td className={cn("py-3 px-5 text-right tabular-nums font-bold", slaColor(s.avgResponseMinutes))}>
                            {formatResponseTime(s.avgResponseMinutes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : activeTab === "sources" ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Origem */}
                <section className="bg-card border border-border rounded-3xl p-6 shadow-sm">
                  <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2 mb-5">
                    <MapPin className="w-4 h-4 text-primary" /> Leads por Origem
                  </h2>
                  <div className="space-y-3">
                    {byOrigin.map((o) => {
                      const pct = totals.leads > 0 ? (o.leads / totals.leads) * 100 : 0;
                      return (
                        <div key={o.origin}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-bold text-foreground">{o.origin}</span>
                            <span className="text-muted-foreground tabular-nums">
                              <span className="font-black text-foreground">{o.leads}</span> · {pct.toFixed(0)}%
                              {o.salesCount > 0 && <span className="text-emerald-500 font-bold"> · {o.salesCount} venda{o.salesCount > 1 ? "s" : ""}</span>}
                            </span>
                          </div>
                          <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-500" style={{ width: `${(o.leads / maxOriginLeads) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Temperatura */}
                <section className="bg-card border border-border rounded-3xl p-6 shadow-sm">
                  <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2 mb-5">
                    <Flame className="w-4 h-4 text-primary" /> Qualidade dos Leads
                  </h2>
                  <div className="space-y-3">
                    {byTemperature.map((t) => {
                      const pct = totalTempLeads > 0 ? (t.leads / totalTempLeads) * 100 : 0;
                      return (
                        <div key={t.temperature}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-bold text-foreground">{t.temperature}</span>
                            <span className="text-muted-foreground tabular-nums">
                              <span className="font-black text-foreground">{t.leads}</span> · {pct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full transition-all duration-500", TEMP_STYLE[t.temperature] || "bg-blue-500")} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>

              {/* Campanha */}
              <section className="bg-card border border-border rounded-3xl p-6 shadow-sm">
                <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2 mb-5">
                  <Megaphone className="w-4 h-4 text-primary" /> Desempenho por Campanha
                </h2>
                <div className="space-y-3">
                  {byCampaign.map((c) => {
                    const conv = c.leads > 0 ? (c.salesCount / c.leads) * 100 : 0;
                    return (
                      <div key={c.campaign}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold text-foreground truncate max-w-[60%]">{c.campaign}</span>
                          <span className="text-muted-foreground tabular-nums">
                            <span className="font-black text-foreground">{c.leads}</span> leads
                            {c.salesCount > 0 && <span className="text-emerald-500 font-bold"> · {c.salesCount} venda{c.salesCount > 1 ? "s" : ""} ({conv.toFixed(0)}%)</span>}
                            {c.salesValue > 0 && <span className="text-foreground font-bold"> · {formatCurrency(c.salesValue)}</span>}
                          </span>
                        </div>
                        <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all duration-500" style={{ width: `${(c.leads / maxCampaignLeads) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : activeTab === "trend" ? (
            <div className="space-y-6">
              {/* Tendência diária: leads x vendas */}
              <section className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" /> Tendência no Período
                    </h2>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
                      Volume diário de novos leads e conversões em vendas
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" /> Leads</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" /> Vendas</span>
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dailySeries.map((d) => {
                        const dateObj = new Date(d.date + "T00:00:00");
                        return {
                          ...d,
                          label: dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
                          fullDate: dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
                        };
                      })}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      barGap={3}
                    >
                      <defs>
                        <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                          <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.8} />
                        </linearGradient>
                        <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                          <stop offset="100%" stopColor="#059669" stopOpacity={0.8} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke="#64748b"
                        fontSize={10}
                        fontWeight={700}
                        tickLine={false}
                        axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                        interval={dailySeries.length > 20 ? Math.ceil(dailySeries.length / 10) : 0}
                      />
                      <YAxis
                        stroke="#64748b"
                        fontSize={10}
                        fontWeight={700}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.03)" }}
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const data = payload[0].payload;
                          const conv = data.leads > 0 ? ((data.sales / data.leads) * 100).toFixed(0) : "0";
                          return (
                            <div className="bg-slate-950/95 border border-white/10 rounded-2xl p-3.5 shadow-2xl backdrop-blur-md min-w-[170px]">
                              <p className="text-[11px] font-black text-white uppercase tracking-wider mb-2 border-b border-white/10 pb-1.5">
                                {data.fullDate}
                              </p>
                              <div className="space-y-1.5 text-xs font-bold">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="flex items-center gap-1.5 text-blue-400">
                                    <span className="w-2 h-2 rounded-full bg-blue-500" /> Leads:
                                  </span>
                                  <span className="font-black text-white tabular-nums">{data.leads}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <span className="flex items-center gap-1.5 text-emerald-400">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Vendas:
                                  </span>
                                  <span className="font-black text-white tabular-nums">{data.sales}</span>
                                </div>
                                {data.leads > 0 && (
                                  <div className="pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px] text-muted-foreground">
                                    <span>Conversão:</span>
                                    <span className="text-emerald-400 font-black">{conv}%</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="leads" name="Leads" fill="url(#leadGrad)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="sales" name="Vendas" fill="url(#salesGrad)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Fluxo por horário */}
              <section className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" /> Fluxo de Leads por Horário
                    </h2>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
                      Distribuição do volume de contato ao longo do dia
                    </p>
                  </div>
                  {peakHour.hour !== -1 && peakHour.count > 0 && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-[10px] font-black uppercase tracking-wider">
                      <span>🔥 Pico: {peakHour.hour}h ({peakHour.count} leads)</span>
                    </div>
                  )}
                </div>

                {(() => {
                  const isRange = startDate && endDate && endDate.getTime() - startDate.getTime() > 86400000;
                  const day = (startDate || new Date()).getDay();
                  const isSaturday = !isRange && day === 6;
                  const isSunday = !isRange && day === 0;
                  const startH = isSaturday ? 8 : isSunday ? 0 : 7;
                  const endH = isSaturday ? 12 : isSunday ? 23 : 18;
                  const filtered = hourlyData
                    .map((val, h) => ({
                      hour: h,
                      label: `${h}h`,
                      leads: val,
                      isPeak: h === peakHour.hour,
                    }))
                    .filter((d) => d.hour >= startH && d.hour <= endH);

                  return (
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={filtered}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="hourlyGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.8} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                          <XAxis
                            dataKey="label"
                            stroke="#64748b"
                            fontSize={10}
                            fontWeight={700}
                            tickLine={false}
                            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                          />
                          <YAxis
                            stroke="#64748b"
                            fontSize={10}
                            fontWeight={700}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip
                            cursor={{ fill: "rgba(255,255,255,0.03)" }}
                            content={({ active, payload }) => {
                              if (!active || !payload || !payload.length) return null;
                              const data = payload[0].payload;
                              return (
                                <div className="bg-slate-950/95 border border-white/10 rounded-2xl p-3 shadow-2xl backdrop-blur-md">
                                  <p className="text-[11px] font-black text-white uppercase tracking-wider mb-1">
                                    Horário: {data.hour}:00 às {data.hour}:59
                                  </p>
                                  <p className="text-xs font-bold text-indigo-400">
                                    <span className="font-black text-white">{data.leads}</span> {data.leads === 1 ? "lead recebido" : "leads recebidos"}
                                  </p>
                                  {data.isPeak && data.leads > 0 && (
                                    <span className="mt-1 inline-block text-[9px] font-black uppercase text-pink-400 tracking-wider">
                                      ⭐ Horário de maior pico
                                    </span>
                                  )}
                                </div>
                              );
                            }}
                          />
                          <Bar
                            dataKey="leads"
                            name="Leads"
                            fill="url(#hourlyGrad)"
                            radius={[6, 6, 0, 0]}
                            maxBarSize={36}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}

                <div className="mt-4 pt-3 border-t border-border/40 text-[9px] font-black text-muted-foreground uppercase tracking-widest text-center">
                  {peakHour.hour !== -1 && peakHour.count > 0
                    ? `Pico de atendimento às ${peakHour.hour}h com ${peakHour.count} ${peakHour.count === 1 ? "lead" : "leads"} no período`
                    : "Nenhum lead registrado no período."}
                </div>
              </section>
            </div>
          ) : activeTab === "evolution" ? (
            (() => {
              if (!evolution) return null;
              const { clients, totalValue, totalClients } = evolution;
              const avgTicket = totalClients > 0 ? totalValue / totalClients : 0;
              const recorrentes = clients.filter((c) => c.vendas.length > 1).length;

              const q = evoSearch.trim().toLowerCase();
              let filtered = clients;
              if (q) {
                filtered = filtered.filter((c) =>
                  c.push_name.toLowerCase().includes(q) ||
                  (c.origem || "").toLowerCase().includes(q) ||
                  (c.campanha || "").toLowerCase().includes(q) ||
                  (c.vendedor_nome || "").toLowerCase().includes(q)
                );
              }
              const sorted = [...filtered].sort((a, b) => {
                const { key, dir } = evoSort;
                let va: string | number = "";
                let vb: string | number = "";
                if (key === "total_vendas") { va = a.total_vendas; vb = b.total_vendas; }
                else if (key === "qtd") { va = a.vendas.length; vb = b.vendas.length; }
                else if (key === "push_name") { va = a.push_name.toLowerCase(); vb = b.push_name.toLowerCase(); }
                else if (key === "data_venda") {
                  va = a.vendas.length > 0 ? a.vendas[a.vendas.length - 1].created_at : "";
                  vb = b.vendas.length > 0 ? b.vendas[b.vendas.length - 1].created_at : "";
                }
                if (va < vb) return dir === "asc" ? -1 : 1;
                if (va > vb) return dir === "asc" ? 1 : -1;
                return 0;
              });

              const toggleSort = (key: string) => {
                setEvoSort((prev) =>
                  prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
                );
              };
              const sortIcon = (key: string) =>
                evoSort.key === key ? (evoSort.dir === "asc" ? " ↑" : " ↓") : "";

              const maxTotal = Math.max(...clients.map((c) => c.total_vendas), 1);

              return (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <KpiCard label="Clientes Convertidos" value={totalClients.toLocaleString("pt-BR")} hint="Todo o histórico" icon={<Award className="w-5 h-5" />} accent="text-emerald-500 bg-emerald-500/10" />
                    <KpiCard label="Recorrentes" value={recorrentes.toLocaleString("pt-BR")} hint={totalClients > 0 ? `${((recorrentes / totalClients) * 100).toFixed(0)}% recompram` : "—"} icon={<TrendingUp className="w-5 h-5" />} accent="text-violet-500 bg-violet-500/10" />
                    <KpiCard label="Faturamento Total" value={formatCurrency(totalValue)} icon={<DollarSign className="w-5 h-5" />} accent="text-blue-500 bg-blue-500/10" />
                    <KpiCard label="Ticket Médio" value={formatCurrency(avgTicket)} icon={<Target className="w-5 h-5" />} accent="text-rose-500 bg-rose-500/10" />
                  </div>

                  <section className="bg-card border border-border rounded-3xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                      <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                        <Award className="w-4 h-4 text-primary" /> Ranking por Faturamento
                      </h2>
                      <input
                        type="text"
                        value={evoSearch}
                        onChange={(e) => setEvoSearch(e.target.value)}
                        placeholder="Pesquisar cliente, origem..."
                        className="h-8 w-56 px-3 rounded-lg border border-border bg-background text-xs font-medium placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                      />
                    </div>

                    {sorted.length === 0 ? (
                      <div className="py-12 text-center">
                        <p className="text-sm font-black uppercase tracking-tight text-muted-foreground">Nenhum cliente convertido encontrado</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground w-8">#</th>
                              {[
                                { key: "push_name", label: "Cliente" },
                                { key: "qtd", label: "Compras" },
                                { key: "total_vendas", label: "Total Faturado" },
                                { key: "data_venda", label: "Última Compra" },
                              ].map((col) => (
                                <th
                                  key={col.key}
                                  onClick={() => toggleSort(col.key)}
                                  className="text-left py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap"
                                >
                                  {col.label}{sortIcon(col.key)}
                                </th>
                              ))}
                              <th className="w-10" />
                            </tr>
                          </thead>
                          <tbody>
                            {sorted.map((c, idx) => {
                              const lastSale = c.vendas.length > 0 ? c.vendas[c.vendas.length - 1] : null;
                              const barPct = (c.total_vendas / maxTotal) * 100;
                              return (
                                <tr key={c.remote_jid} className="border-b border-border/40 hover:bg-secondary/30 transition-colors">
                                  <td className="py-2.5 px-2">
                                    <span className={cn(
                                      "text-[11px] font-black tabular-nums",
                                      idx === 0 ? "text-amber-500" : idx === 1 ? "text-slate-400" : idx === 2 ? "text-amber-700" : "text-muted-foreground"
                                    )}>
                                      {idx + 1}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-2">
                                    <div className="font-bold text-foreground truncate max-w-[180px]">{c.push_name}</div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      {c.vendedor_nome && <span className="text-[10px] text-muted-foreground">Atend: {c.vendedor_nome}</span>}
                                      {c.origem && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded-full text-[9px] font-black bg-violet-500/10 text-violet-500">
                                          {c.origem}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-2 tabular-nums">
                                    <span className={cn("font-black", c.vendas.length > 1 ? "text-violet-500" : "text-foreground")}>
                                      {c.vendas.length}x
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-2 tabular-nums min-w-[180px]">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-emerald-500 shrink-0">{formatCurrency(c.total_vendas)}</span>
                                      <div className="flex-1 bg-secondary h-1.5 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all" style={{ width: `${barPct}%` }} />
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-2 text-foreground whitespace-nowrap">
                                    {lastSale ? new Date(lastSale.created_at).toLocaleDateString("pt-BR") : "—"}
                                  </td>
                                  <td className="py-2.5 px-2">
                                    <button
                                      onClick={() => setChartClient(c)}
                                      className="p-1.5 rounded-lg hover:bg-blue-500/10 text-muted-foreground hover:text-blue-500 transition-colors"
                                      title="Ver evolução de compras"
                                    >
                                      <BarChart3 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div className="mt-3 pt-3 border-t border-border/40 text-[9px] font-black text-muted-foreground uppercase tracking-widest text-center">
                          {sorted.length} {sorted.length === 1 ? "cliente convertido" : "clientes convertidos"} {q ? "encontrados" : "no histórico"}
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              );
            })()
          ) : activeTab === "verbas" ? (
            verbasLoading ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-black uppercase tracking-widest text-primary">Carregando Verbas...</span>
              </div>
            ) : !verbas || verbas.fornecedores.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3">
                <div className="w-16 h-16 rounded-3xl bg-secondary flex items-center justify-center">
                  <Percent className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="text-sm font-black uppercase tracking-tight">Sem dados de verbas</p>
                <p className="text-xs text-muted-foreground max-w-xs">Nenhuma compra encontrada no período selecionado.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {verbas.fornecedores.map((forn) => (
                  <div key={forn.fornecedor} className="space-y-5">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <KpiCard label="Total Comprado" value={formatCurrency(forn.totalComprado)} icon={<ShoppingBag className="w-5 h-5" />} accent="text-blue-500 bg-blue-500/10" />
                      <KpiCard label="Base (sem tubos)" value={formatCurrency(forn.totalSemTubo)} icon={<Filter className="w-5 h-5" />} accent="text-violet-500 bg-violet-500/10" />
                      <KpiCard label="Total Verbas" value={formatCurrency(forn.valorVerba)} hint={`${forn.percentualVerba}% sobre base`} icon={<Percent className="w-5 h-5" />} accent="text-emerald-500 bg-emerald-500/10" />
                      <KpiCard label="Saldo Disponível" value={formatCurrency(forn.valorRestante)} hint="Não expirado" icon={<DollarSign className="w-5 h-5" />} accent="text-amber-500 bg-amber-500/10" />
                    </div>

                    {forn.trimestres.map((tri) => {
                      const gruposSemTubo = tri.grupos.filter((g) => !g.isTubo);
                      const gruposTubo = tri.grupos.filter((g) => g.isTubo);
                      const maxGrupo = Math.max(...tri.grupos.map((g) => g.total), 1);

                      return (
                        <section key={tri.trimestre} className={cn("bg-card border rounded-3xl p-6 shadow-sm", tri.expirado ? "border-rose-500/30 opacity-60" : tri.expiraEm <= 2 ? "border-amber-500/50" : "border-border")}>
                          <div className="flex items-center justify-between mb-5">
                            <div>
                              <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                                <ShoppingBag className="w-4 h-4 text-primary" /> {forn.fornecedor} — {tri.label}
                              </h2>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
                                {forn.percentualVerba}% sobre compras (exceto tubos) · {tri.trimestre}
                              </p>
                            </div>
                            <div className="text-right flex items-center gap-3">
                              <span className={cn(
                                "inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase",
                                tri.expirado ? "bg-rose-500/10 text-rose-500" : tri.expiraEm <= 2 ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"
                              )}>
                                {tri.expirado ? "Expirado" : `Expira em ${tri.expiraEm} ${tri.expiraEm === 1 ? "mês" : "meses"}`}
                              </span>
                              <div>
                                <p className={cn("text-lg font-black tabular-nums", tri.expirado ? "text-rose-500 line-through" : "text-emerald-500")}>{formatCurrency(tri.valorVerba)}</p>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase">Verba</p>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3 mb-5">
                            <div className="bg-secondary/50 rounded-xl p-3 text-center">
                              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Total Comprado</p>
                              <p className="text-sm font-black text-foreground tabular-nums mt-0.5">{formatCurrency(tri.totalComprado)}</p>
                            </div>
                            <div className="bg-secondary/50 rounded-xl p-3 text-center">
                              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Tubos (excluído)</p>
                              <p className="text-sm font-black text-rose-500 tabular-nums mt-0.5">{formatCurrency(tri.totalComprado - tri.totalSemTubo)}</p>
                            </div>
                            <div className="bg-secondary/50 rounded-xl p-3 text-center">
                              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Base de Cálculo</p>
                              <p className="text-sm font-black text-emerald-500 tabular-nums mt-0.5">{formatCurrency(tri.totalSemTubo)}</p>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-border">
                                  <th className="text-left py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Grupo</th>
                                  <th className="text-right py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Total Comprado</th>
                                  <th className="text-center py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground w-24">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tri.grupos.map((g, idx) => {
                                  const barPct = (g.total / maxGrupo) * 100;
                                  return (
                                    <tr key={idx} className={cn("border-b border-border/40 transition-colors", g.isTubo ? "opacity-50" : "hover:bg-secondary/30")}>
                                      <td className="py-2 px-2">
                                        <span className={cn("font-bold", g.isTubo ? "text-muted-foreground line-through" : "text-foreground")}>{g.grupo}</span>
                                      </td>
                                      <td className="py-2 px-2 text-right min-w-[180px]">
                                        <div className="flex items-center justify-end gap-2">
                                          <div className="flex-1 max-w-[120px] bg-secondary h-1.5 rounded-full overflow-hidden">
                                            <div className={cn("h-full rounded-full transition-all", g.isTubo ? "bg-rose-400" : "bg-gradient-to-r from-emerald-600 to-emerald-400")} style={{ width: `${barPct}%` }} />
                                          </div>
                                          <span className={cn("font-bold tabular-nums shrink-0", g.isTubo ? "text-rose-500" : "text-emerald-500")}>{formatCurrency(g.total)}</span>
                                        </div>
                                      </td>
                                      <td className="py-2 px-2 text-center">
                                        <span className={cn(
                                          "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase",
                                          g.isTubo ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"
                                        )}>
                                          {g.isTubo ? "Excluído" : "Conta"}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                              <span>{gruposSemTubo.length} grupos válidos · {gruposTubo.length} excluídos</span>
                              <span>{forn.percentualVerba}% × {formatCurrency(tri.totalSemTubo)} = {formatCurrency(tri.valorVerba)}</span>
                            </div>
                          </div>
                        </section>
                      );
                    })}
                  </div>
                ))}
              </div>
            )
          ) : activeTab === "gastos" ? (
            adsLoading ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-black uppercase tracking-widest text-primary">Carregando Gastos...</span>
              </div>
            ) : !adsData ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3">
                <div className="w-16 h-16 rounded-3xl bg-secondary flex items-center justify-center">
                  <DollarSign className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="text-sm font-black uppercase tracking-tight">Sem dados de gastos</p>
                <p className="text-xs text-muted-foreground max-w-xs">Nenhum dado de anúncios encontrado no período.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between mb-1">
                  <div />
                  <button
                    onClick={() => { setShowReportModal(true); setReportSent(false); }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-xs font-black uppercase tracking-wider text-muted-foreground hover:text-foreground transition-all"
                  >
                    <Send className="w-3.5 h-3.5" /> Enviar Relatório
                  </button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard label="Investido Total" value={formatCurrency(adsData.totalInvestido ?? adsData.totalSpend)} icon={<DollarSign className="w-5 h-5" />} accent="text-rose-500 bg-rose-500/10" />
                  <KpiCard label="Google Ads" value={formatCurrency(adsData.google.total)} icon={<TrendingUp className="w-5 h-5" />} accent="text-blue-500 bg-blue-500/10" />
                  <KpiCard label="Meta Ads" value={formatCurrency(adsData.meta.total)} icon={<Megaphone className="w-5 h-5" />} accent="text-indigo-500 bg-indigo-500/10" />
                  <KpiCard label="Custos Fixos" value={formatCurrency(adsData.custosFixos?.total ?? 0)} icon={<Building2 className="w-5 h-5" />} accent="text-amber-500 bg-amber-500/10" />
                </div>

                <CustosFixosSection custos={adsData.custosFixos} onChange={recarregarGastos} />

                {adsData.daily && adsData.daily.length > 1 && (
                  <section className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                      <div>
                        <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-primary" /> Gastos Diários
                        </h2>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
                          Investimento diário em Google Ads e Meta Ads
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-wider">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" /> Google</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50" /> Meta</span>
                      </div>
                    </div>

                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={adsData.daily.map((d) => {
                            const dateObj = new Date(d.date + "T00:00:00");
                            return {
                              ...d,
                              label: dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
                              fullDate: dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
                            };
                          })}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                          barGap={3}
                        >
                          <defs>
                            <linearGradient id="googleAdGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                              <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.8} />
                            </linearGradient>
                            <linearGradient id="metaAdGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                              <stop offset="100%" stopColor="#4338ca" stopOpacity={0.8} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                          <XAxis
                            dataKey="label"
                            stroke="#64748b"
                            fontSize={10}
                            fontWeight={700}
                            tickLine={false}
                            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                            interval={adsData.daily.length > 20 ? Math.ceil(adsData.daily.length / 10) : 0}
                          />
                          <YAxis
                            stroke="#64748b"
                            fontSize={10}
                            fontWeight={700}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                          />
                          <Tooltip
                            cursor={{ fill: "rgba(255,255,255,0.03)" }}
                            content={({ active, payload }) => {
                              if (!active || !payload || !payload.length) return null;
                              const data = payload[0].payload;
                              return (
                                <div className="bg-slate-950/95 border border-white/10 rounded-2xl p-3.5 shadow-2xl backdrop-blur-md min-w-[190px]">
                                  <p className="text-[11px] font-black text-white uppercase tracking-wider mb-2 border-b border-white/10 pb-1.5">
                                    {data.fullDate}
                                  </p>
                                  <div className="space-y-1.5 text-xs font-bold">
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="flex items-center gap-1.5 text-blue-400">
                                        <span className="w-2 h-2 rounded-full bg-blue-500" /> Google:
                                      </span>
                                      <span className="font-black text-white tabular-nums">{formatCurrency(data.google)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="flex items-center gap-1.5 text-indigo-400">
                                        <span className="w-2 h-2 rounded-full bg-indigo-500" /> Meta:
                                      </span>
                                      <span className="font-black text-white tabular-nums">{formatCurrency(data.meta)}</span>
                                    </div>
                                    <div className="pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px] text-muted-foreground">
                                      <span>Total:</span>
                                      <span className="text-rose-400 font-black">{formatCurrency(data.total)}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="google" name="Google" fill="url(#googleAdGrad)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                          <Bar dataKey="meta" name="Meta" fill="url(#metaAdGrad)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                )}

                {adsData.google.error && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-xs font-bold text-amber-600">
                    Google Ads: {adsData.google.error}
                  </div>
                )}
                {adsData.meta.error && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-xs font-bold text-amber-600">
                    Meta Ads: {adsData.meta.error}
                  </div>
                )}

                {[
                  { title: "Google Ads", platform: adsData.google, colorBase: "blue" as const },
                  { title: "Meta Ads", platform: adsData.meta, colorBase: "indigo" as const },
                ].map(({ title, platform, colorBase }) => {
                  if (platform.campaigns.length === 0 && !platform.error) return null;
                  const maxSpend = Math.max(...platform.campaigns.map((c) => c.spend), 1);
                  const iconColor = colorBase === "blue" ? "text-blue-500" : "text-indigo-500";
                  const barFrom = colorBase === "blue" ? "from-blue-600" : "from-indigo-600";
                  const barTo = colorBase === "blue" ? "to-blue-400" : "to-indigo-400";
                  const textColor = colorBase === "blue" ? "text-blue-500" : "text-indigo-500";
                  return (
                    <section key={title} className="bg-card border border-border rounded-3xl p-6 shadow-sm">
                      <div className="flex items-center justify-between mb-5">
                        <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                          {colorBase === "blue" ? <TrendingUp className={cn("w-4 h-4", iconColor)} /> : <Megaphone className={cn("w-4 h-4", iconColor)} />}
                          {title}
                        </h2>
                        <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                          <span>{platform.totalClicks.toLocaleString("pt-BR")} cliques</span>
                          <span>{platform.totalImpressions.toLocaleString("pt-BR")} impressões</span>
                          <span>{platform.totalConversions} conv.</span>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Campanha</th>
                              <th className="text-right py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Gasto</th>
                              <th className="text-right py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Cliques</th>
                              <th className="text-right py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Impressões</th>
                              <th className="text-right py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">CPC</th>
                              <th className="text-right py-2.5 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Conv.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {platform.campaigns
                              .sort((a, b) => b.spend - a.spend)
                              .map((c, idx) => {
                                const barPct = (c.spend / maxSpend) * 100;
                                return (
                                  <tr key={idx} className="border-b border-border/40 hover:bg-secondary/30 transition-colors">
                                    <td className="py-2 px-2 font-bold text-foreground max-w-[220px] truncate">{c.campaign}</td>
                                    <td className="py-2 px-2 text-right min-w-[180px]">
                                      <div className="flex items-center justify-end gap-2">
                                        <div className="flex-1 max-w-[120px] bg-secondary h-1.5 rounded-full overflow-hidden">
                                          <div className={cn("h-full rounded-full bg-gradient-to-r", barFrom, barTo)} style={{ width: `${barPct}%` }} />
                                        </div>
                                        <span className={cn("font-bold tabular-nums shrink-0", textColor)}>{formatCurrency(c.spend)}</span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-2 text-right font-bold tabular-nums text-foreground">{c.clicks.toLocaleString("pt-BR")}</td>
                                    <td className="py-2 px-2 text-right font-bold tabular-nums text-muted-foreground">{c.impressions.toLocaleString("pt-BR")}</td>
                                    <td className="py-2 px-2 text-right font-bold tabular-nums text-foreground">{formatCurrency(c.cpc)}</td>
                                    <td className="py-2 px-2 text-right font-bold tabular-nums text-emerald-500">{c.conversions}</td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                        <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                          <span>{platform.campaigns.length} campanhas</span>
                          <span>Total: {formatCurrency(platform.total)}</span>
                        </div>
                      </div>
                    </section>
                  );
                })}

                {showReportModal && adsData && (() => {
                  const fmt = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  const fmtN = (v: number) => v.toLocaleString("pt-BR");
                  const totalClicks = (adsData.google.totalClicks || 0) + (adsData.meta.totalClicks || 0);
                  const totalImpressions = (adsData.google.totalImpressions || 0) + (adsData.meta.totalImpressions || 0);
                  const allCampaigns = [...adsData.google.campaigns, ...adsData.meta.campaigns].sort((a, b) => b.spend - a.spend);
                  const topCampaign = allCampaigns.length > 0 ? allCampaigns[0].campaign : null;
                  const todayStr = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
                  const responseTimeStr = formatResponseTime(totals.avgResponseMinutes);
                  const responseColor = totals.avgResponseMinutes !== null && totals.avgResponseMinutes <= 5 ? "#34d399" : totals.avgResponseMinutes !== null && totals.avgResponseMinutes <= 15 ? "#fbbf24" : "#f87171";

                  const generateReportImage = (): string => {
                    const W = 800, H = 920;
                    const canvas = document.createElement("canvas");
                    canvas.width = W;
                    canvas.height = H;
                    const ctx = canvas.getContext("2d")!;

                    const grad = ctx.createLinearGradient(0, 0, 0, H);
                    grad.addColorStop(0, "#0f172a");
                    grad.addColorStop(1, "#1e293b");
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.roundRect(0, 0, W, H, 24);
                    ctx.fill();

                    const accentGrad = ctx.createLinearGradient(0, 0, W, 0);
                    accentGrad.addColorStop(0, "#6366f1");
                    accentGrad.addColorStop(1, "#3b82f6");
                    ctx.fillStyle = accentGrad;
                    ctx.beginPath();
                    ctx.roundRect(0, 0, W, 6, [24, 24, 0, 0]);
                    ctx.fill();

                    let y = 50;
                    ctx.fillStyle = "#ffffff";
                    ctx.font = "bold 22px system-ui, sans-serif";
                    ctx.fillText("📊  RELATÓRIO DIÁRIO DE TRÁFEGO", 40, y);
                    y += 28;
                    ctx.fillStyle = "#94a3b8";
                    ctx.font = "14px system-ui, sans-serif";
                    ctx.fillText(`📅 ${todayStr}  •  CARFLAX`, 40, y);

                    y += 40;
                    ctx.fillStyle = "rgba(255,255,255,0.08)";
                    ctx.fillRect(40, y, W - 80, 1);

                    y += 30;
                    ctx.fillStyle = "#34d399";
                    ctx.font = "bold 16px system-ui, sans-serif";
                    ctx.fillText("👥  ATENDIMENTO", 40, y);

                    y += 35;
                    const boxW = (W - 100) / 2;

                    const drawMetricBox = (x: number, yy: number, label: string, value: string, color: string) => {
                      ctx.fillStyle = "rgba(255,255,255,0.04)";
                      ctx.beginPath();
                      ctx.roundRect(x, yy, boxW, 70, 12);
                      ctx.fill();
                      ctx.strokeStyle = "rgba(255,255,255,0.08)";
                      ctx.lineWidth = 1;
                      ctx.beginPath();
                      ctx.roundRect(x, yy, boxW, 70, 12);
                      ctx.stroke();
                      ctx.fillStyle = "#94a3b8";
                      ctx.font = "12px system-ui, sans-serif";
                      ctx.fillText(label, x + 16, yy + 25);
                      ctx.fillStyle = color;
                      ctx.font = "bold 22px system-ui, sans-serif";
                      ctx.fillText(value, x + 16, yy + 55);
                    };

                    drawMetricBox(40, y, "LEADS RECEBIDOS", fmtN(totals.leads), "#60a5fa");
                    drawMetricBox(40 + boxW + 20, y, "TEMPO MÉDIO RESPOSTA", responseTimeStr, responseColor);
                    y += 90;

                    if (totals.quotesCount > 0 || totals.salesCount > 0) {
                      drawMetricBox(40, y, "ORÇAMENTOS", fmtN(totals.quotesCount), "#a78bfa");
                      drawMetricBox(40 + boxW + 20, y, "VENDAS", fmtN(totals.salesCount), "#34d399");
                      y += 90;
                    }

                    y += 10;
                    ctx.fillStyle = "rgba(255,255,255,0.08)";
                    ctx.fillRect(40, y, W - 80, 1);
                    y += 25;

                    ctx.fillStyle = "#f87171";
                    ctx.font = "bold 16px system-ui, sans-serif";
                    ctx.fillText("💰  INVESTIMENTO EM TRÁFEGO", 40, y);
                    y += 8;

                    ctx.fillStyle = "#ffffff";
                    ctx.font = "bold 32px system-ui, sans-serif";
                    y += 38;
                    ctx.fillText(fmt(adsData.totalSpend), 40, y);

                    y += 35;
                    const platW = (W - 100) / 2;

                    if (adsData.google.total > 0) {
                      ctx.fillStyle = "rgba(59,130,246,0.1)";
                      ctx.beginPath();
                      ctx.roundRect(40, y, platW, 100, 12);
                      ctx.fill();
                      ctx.strokeStyle = "rgba(59,130,246,0.3)";
                      ctx.lineWidth = 1;
                      ctx.beginPath();
                      ctx.roundRect(40, y, platW, 100, 12);
                      ctx.stroke();
                      ctx.fillStyle = "#60a5fa";
                      ctx.font = "bold 13px system-ui, sans-serif";
                      ctx.fillText("🔵 GOOGLE ADS", 56, y + 24);
                      ctx.fillStyle = "#ffffff";
                      ctx.font = "bold 20px system-ui, sans-serif";
                      ctx.fillText(fmt(adsData.google.total), 56, y + 52);
                      ctx.fillStyle = "#94a3b8";
                      ctx.font = "12px system-ui, sans-serif";
                      ctx.fillText(`${fmtN(adsData.google.totalClicks)} cliques  •  ${fmtN(adsData.google.totalImpressions)} alcance`, 56, y + 76);
                      if (adsData.google.totalClicks > 0) {
                        ctx.fillText(`CPC: ${fmt(adsData.google.total / adsData.google.totalClicks)}`, 56, y + 92);
                      }
                    }

                    if (adsData.meta.total > 0) {
                      const mx = 40 + platW + 20;
                      ctx.fillStyle = "rgba(99,102,241,0.1)";
                      ctx.beginPath();
                      ctx.roundRect(mx, y, platW, 100, 12);
                      ctx.fill();
                      ctx.strokeStyle = "rgba(99,102,241,0.3)";
                      ctx.lineWidth = 1;
                      ctx.beginPath();
                      ctx.roundRect(mx, y, platW, 100, 12);
                      ctx.stroke();
                      ctx.fillStyle = "#a78bfa";
                      ctx.font = "bold 13px system-ui, sans-serif";
                      ctx.fillText("🟣 META ADS", mx + 16, y + 24);
                      ctx.fillStyle = "#ffffff";
                      ctx.font = "bold 20px system-ui, sans-serif";
                      ctx.fillText(fmt(adsData.meta.total), mx + 16, y + 52);
                      ctx.fillStyle = "#94a3b8";
                      ctx.font = "12px system-ui, sans-serif";
                      ctx.fillText(`${fmtN(adsData.meta.totalClicks)} cliques  •  ${fmtN(adsData.meta.totalImpressions)} alcance`, mx + 16, y + 76);
                      if (adsData.meta.totalClicks > 0) {
                        ctx.fillText(`CPC: ${fmt(adsData.meta.total / adsData.meta.totalClicks)}`, mx + 16, y + 92);
                      }
                    }

                    y += 120;
                    ctx.fillStyle = "rgba(255,255,255,0.08)";
                    ctx.fillRect(40, y, W - 80, 1);
                    y += 25;

                    ctx.fillStyle = "#fbbf24";
                    ctx.font = "bold 16px system-ui, sans-serif";
                    ctx.fillText("📈  RESULTADO", 40, y);
                    y += 30;

                    const results: [string, string, string][] = [];
                    if (totals.leads > 0) results.push(["Custo por Lead", fmt(adsData.totalSpend / totals.leads), "#fbbf24"]);
                    results.push(["Total de Cliques", fmtN(totalClicks), "#ffffff"]);
                    results.push(["Alcance Total", fmtN(totalImpressions), "#ffffff"]);
                    if (totalClicks > 0) results.push(["CPC Médio", fmt(adsData.totalSpend / totalClicks), "#ffffff"]);

                    for (const [label, value, color] of results) {
                      ctx.fillStyle = "#94a3b8";
                      ctx.font = "13px system-ui, sans-serif";
                      ctx.fillText(`•  ${label}`, 56, y);
                      ctx.fillStyle = color;
                      ctx.font = "bold 13px system-ui, sans-serif";
                      ctx.fillText(value, 300, y);
                      y += 24;
                    }

                    if (topCampaign) {
                      y += 5;
                      ctx.fillStyle = "#94a3b8";
                      ctx.font = "13px system-ui, sans-serif";
                      ctx.fillText("🏆  Campanha destaque:", 56, y);
                      y += 20;
                      ctx.fillStyle = "#fbbf24";
                      ctx.font = "bold 13px system-ui, sans-serif";
                      const campText = topCampaign.length > 60 ? topCampaign.slice(0, 57) + "..." : topCampaign;
                      ctx.fillText(campText, 56, y);
                    }

                    y = H - 30;
                    ctx.fillStyle = "#475569";
                    ctx.font = "11px system-ui, sans-serif";
                    ctx.fillText("Gerado automaticamente pelo Carflax HUB", 40, y);

                    return canvas.toDataURL("image/png");
                  };

                  const handleSend = async () => {
                    const cleaned = reportPhone.replace(/\D/g, "");
                    if (cleaned.length < 10) return;
                    setReportSending(true);
                    try {
                      const base64 = generateReportImage();
                      await apiAdsSendReport({
                        phone: cleaned,
                        image: base64,
                        caption: `📊 Relatório de Tráfego — ${todayStr}`,
                      });
                      setReportSent(true);
                    } catch (err) {
                      console.error("Erro ao enviar relatório:", err);
                    } finally {
                      setReportSending(false);
                    }
                  };

                  return (
                    <>
                      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setShowReportModal(false)} />
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-lg pointer-events-auto max-h-[90vh] overflow-y-auto">
                          <div className="flex items-center justify-between p-6 pb-4">
                            <div>
                              <h3 className="text-sm font-black uppercase tracking-tight text-foreground flex items-center gap-2">
                                <Send className="w-4 h-4 text-primary" /> Enviar Relatório
                              </h3>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
                                Imagem via WhatsApp para o diretor
                              </p>
                            </div>
                            <button onClick={() => setShowReportModal(false)} className="p-1.5 rounded-xl hover:bg-secondary transition-colors">
                              <X className="w-4 h-4 text-muted-foreground" />
                            </button>
                          </div>

                          <div className="px-6 pb-4">
                            <div className="rounded-2xl overflow-hidden border border-white/10 shadow-xl">
                              <img src={generateReportImage()} alt="Preview do relatório" className="w-full" />
                            </div>
                          </div>

                          <div className="px-6 pb-6">
                            {reportSent ? (
                              <div className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-black uppercase tracking-wider">
                                <Check className="w-4 h-4" /> Relatório enviado com sucesso!
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                  <input
                                    type="tel"
                                    placeholder="(00) 00000-0000"
                                    value={reportPhone}
                                    onChange={(e) => setReportPhone(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-secondary border border-border text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                  />
                                </div>
                                <button
                                  onClick={handleSend}
                                  disabled={reportSending || reportPhone.replace(/\D/g, "").length < 10}
                                  className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                                >
                                  {reportSending ? (
                                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Send className="w-3.5 h-3.5" />
                                  )}
                                  Enviar
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )
          ) : null}

          {/* Modal de gráfico de evolução do cliente */}
          {chartClient && (
            <>
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setChartClient(null)} />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <div className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-2xl pointer-events-auto">
                  <div className="flex items-center justify-between p-6 pb-0">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-tight text-foreground">{chartClient.push_name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {chartClient.origem && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-violet-500/10 text-violet-500">
                            <MapPin className="w-2.5 h-2.5" /> {chartClient.origem}
                          </span>
                        )}
                        {chartClient.vendedor_nome && <span className="text-[10px] text-muted-foreground">Atend: {chartClient.vendedor_nome}</span>}
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] font-bold text-emerald-500">{chartClient.vendas.length} {chartClient.vendas.length === 1 ? "compra" : "compras"} · {formatCurrency(chartClient.total_vendas)}</span>
                      </div>
                    </div>
                    <button onClick={() => setChartClient(null)} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-6">
                    {chartClient.vendas.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Sem compras registradas.</p>
                    ) : (() => {
                      const vendas = chartClient.vendas;
                      const maxVal = Math.max(...vendas.map((v) => v.valor), 1);
                      const minVal = Math.min(...vendas.map((v) => v.valor));
                      const padding = (maxVal - minVal) * 0.15 || maxVal * 0.1;
                      const chartMax = maxVal + padding;
                      const chartMin = Math.max(minVal - padding, 0);
                      const range = chartMax - chartMin || 1;

                      const chartW = 500;
                      const chartH = 200;
                      const padX = 30;
                      const padY = 20;
                      const innerW = chartW - padX * 2;
                      const innerH = chartH - padY * 2;

                      const points = vendas.map((v, i) => {
                        const x = padX + (vendas.length === 1 ? innerW / 2 : (i / (vendas.length - 1)) * innerW);
                        const y = padY + innerH - ((v.valor - chartMin) / range) * innerH;
                        return { x, y, ...v };
                      });

                      const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                      const areaPath = `${linePath} L ${points[points.length - 1].x} ${padY + innerH} L ${points[0].x} ${padY + innerH} Z`;

                      let acumulado = 0;

                      return (
                        <div>
                          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-52">
                            <defs>
                              <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0.02" />
                              </linearGradient>
                            </defs>
                            <path d={areaPath} fill="url(#lineGrad)" />
                            <path d={linePath} fill="none" stroke="rgb(16 185 129)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                            {points.map((p, i) => (
                              <circle key={i} cx={p.x} cy={p.y} r="5" fill="white" stroke="rgb(16 185 129)" strokeWidth="2.5" className="drop-shadow-sm" />
                            ))}
                          </svg>

                          <div className="flex justify-between px-6 -mt-1">
                            {points.map((p, i) => (
                              <div key={i} className="text-center min-w-0 flex-1">
                                <span className="text-[10px] font-black text-emerald-500 tabular-nums block">{formatCurrency(p.valor)}</span>
                                <span className="text-[8px] font-bold text-muted-foreground block mt-0.5">
                                  {new Date(p.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="mt-4 pt-3 border-t border-border/40 space-y-2">
                            {vendas.map((v, i) => {
                              acumulado += v.valor;
                              return (
                                <div key={i} className="flex items-center justify-between text-[10px]">
                                  <span className="text-muted-foreground">
                                    {i + 1}a compra · {new Date(v.created_at).toLocaleDateString("pt-BR")}
                                  </span>
                                  <div className="flex items-center gap-3">
                                    <span className="font-bold text-foreground tabular-nums">{formatCurrency(v.valor)}</span>
                                    <span className="font-black text-emerald-500 tabular-nums">{formatCurrency(acumulado)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {vendas.length >= 2 && (() => {
                            const first = new Date(vendas[0].created_at);
                            const last = new Date(vendas[vendas.length - 1].created_at);
                            const diffDays = Math.round((last.getTime() - first.getTime()) / 86400000);
                            const avgDays = Math.round(diffDays / (vendas.length - 1));
                            return (
                              <div className="mt-3 pt-3 border-t border-border/40 text-center text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                                Frequência média: {avgDays} dias entre compras
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

function SellerAvatar({ name, avatar }: { name: string; avatar?: string | null }) {
  const [broken, setBroken] = useState(false);
  const showImg = avatar && !broken;
  return (
    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-secondary flex items-center justify-center border border-border">
      {showImg ? (
        <img src={avatar} alt={name} className="w-full h-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span className="text-[10px] font-black text-muted-foreground">{initials(name)}</span>
      )}
    </div>
  );
}

function KpiCard({ label, value, hint, icon, accent, valueClass, delta }: {
  label: string; value: string; hint?: string; icon: React.ReactNode; accent: string; valueClass?: string; delta?: number | null;
}) {
  const showDelta = delta !== undefined && delta !== null;
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between mb-2">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", accent)}>{icon}</div>
        {showDelta && (
          <span className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-black uppercase flex items-center gap-0.5",
            positive ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
          )}>
            {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(delta as number).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn("text-lg font-black tracking-tight mt-0.5", valueClass)}>{value}</p>
      {hint && <p className="text-[11px] font-bold text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function ConversionCard({ title, formula, percent, detail, color }: {
  title: string; formula: string; percent: number; detail: string; color: "blue" | "indigo" | "emerald";
}) {
  const bar = color === "blue" ? "from-blue-600 to-indigo-500" : color === "indigo" ? "from-indigo-600 to-violet-500" : "from-emerald-600 to-teal-500";
  const text = color === "blue" ? "text-blue-500" : color === "indigo" ? "text-indigo-500" : "text-emerald-500";
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-xs font-black uppercase tracking-tight text-foreground">{title}</p>
        <p className={cn("text-xl font-black tabular-nums", text)}>{percent.toFixed(1)}%</p>
      </div>
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{formula}</p>
      <div className="w-full bg-secondary h-2 rounded-full overflow-hidden my-2">
        <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", bar)} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <p className="text-[11px] font-semibold text-muted-foreground">{detail}</p>
    </div>
  );
}
