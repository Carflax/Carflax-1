import { useState, useEffect, useMemo } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Kanban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface UserProfile {
  id?: string;
  name?: string;
  role?: string;
  is_admin?: boolean;
  is_leader?: boolean;
}

interface OcorrenciaRow {
  id: string;
  status: string;
  prioridade: string;
  departamento: string;
  created_at: string;
  resolved_at: string | null;
  responsavel_nome: string | null;
}

export function RelatoriosScrumView({ }: { userProfile?: UserProfile }) {
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("scrum_ocorrencias")
        .select("id, status, prioridade, departamento, created_at, resolved_at, responsavel_nome")
        .order("created_at", { ascending: false });
      if (error) console.error("[RelatoriosScrum] Erro:", error);
      if (!cancelled && data) setOcorrencias(data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    const total = ocorrencias.length;
    const resolvidos = ocorrencias.filter((o) => o.status === "resolvido").length;
    const abertos = ocorrencias.filter((o) => o.status === "aberto").length;
    const analise = ocorrencias.filter((o) => o.status === "analise").length;
    const andamento = ocorrencias.filter((o) => o.status === "andamento").length;
    const urgentes = ocorrencias.filter((o) => o.prioridade === "urgente" && o.status !== "resolvido").length;

    const temposResolucao = ocorrencias
      .filter((o) => o.resolved_at && o.created_at)
      .map((o) => {
        const inicio = new Date(o.created_at).getTime();
        const fim = new Date(o.resolved_at!).getTime();
        return Math.max(0, (fim - inicio) / (1000 * 60 * 60 * 24));
      });
    const tempoMedio = temposResolucao.length > 0
      ? temposResolucao.reduce((a, b) => a + b, 0) / temposResolucao.length
      : 0;

    const porDepto = new Map<string, number>();
    ocorrencias.forEach((o) => {
      const d = o.departamento || "Sem depto";
      porDepto.set(d, (porDepto.get(d) || 0) + 1);
    });

    const porResponsavel = new Map<string, { total: number; resolvidos: number }>();
    ocorrencias.forEach((o) => {
      const r = o.responsavel_nome || "Não atribuído";
      const cur = porResponsavel.get(r) || { total: 0, resolvidos: 0 };
      cur.total++;
      if (o.status === "resolvido") cur.resolvidos++;
      porResponsavel.set(r, cur);
    });

    return { total, resolvidos, abertos, analise, andamento, urgentes, tempoMedio, porDepto, porResponsavel };
  }, [ocorrencias]);

  const taxaResolucao = stats.total > 0 ? ((stats.resolvidos / stats.total) * 100).toFixed(1) : "0";

  return (
    <div className="h-full bg-background flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-0">
        <h2 className="text-xl font-black text-foreground tracking-tight uppercase leading-none">
          Relatórios do Scrum
        </h2>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
          Indicadores de ocorrências e produtividade
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {[
                { label: "Total Ocorrências", value: String(stats.total), icon: Kanban, color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
                { label: "Resolvidas", value: String(stats.resolvidos), icon: CheckCircle2, color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
                { label: "Abertas", value: String(stats.abertos), icon: BarChart3, color: "text-slate-500 bg-slate-500/10 border-slate-500/20" },
                { label: "Em Andamento", value: String(stats.analise + stats.andamento), icon: Clock, color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
                { label: "Urgentes Abertas", value: String(stats.urgentes), icon: AlertTriangle, color: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
                { label: "Taxa Resolução", value: `${taxaResolucao}%`, icon: TrendingUp, color: "text-violet-500 bg-violet-500/10 border-violet-500/20" },
              ].map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <div key={kpi.label} className="bg-card/40 backdrop-blur-md border border-border/60 rounded-2xl p-5 relative overflow-hidden hover:border-border/100 hover:bg-card/60 transition-all duration-300 shadow-sm">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">{kpi.label}</span>
                        <h3 className="text-2xl font-black text-foreground tabular-nums tracking-tight">{kpi.value}</h3>
                      </div>
                      <div className={cn("p-2.5 rounded-xl bg-secondary/50 border border-border/40", kpi.color)}>
                        <Icon className="w-5 h-5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tempo médio */}
            <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
              <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">
                Tempo Médio de Resolução
              </h3>
              <p className="text-3xl font-black text-foreground tabular-nums">
                {stats.tempoMedio.toFixed(1).replace(".", ",")} <span className="text-sm font-bold text-muted-foreground">dias</span>
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Por departamento */}
              <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-border/60">
                  <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    Ocorrências por Departamento
                  </h3>
                </div>
                <div className="divide-y divide-border/60">
                  {[...stats.porDepto.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([depto, count]) => (
                      <div key={depto} className="flex items-center justify-between px-5 py-3">
                        <span className="text-xs font-bold text-foreground">{depto}</span>
                        <span className="text-xs font-black text-foreground tabular-nums bg-secondary/50 px-2.5 py-1 rounded-lg">{count}</span>
                      </div>
                    ))}
                  {stats.porDepto.size === 0 && (
                    <div className="px-5 py-8 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      Nenhuma ocorrência registrada
                    </div>
                  )}
                </div>
              </div>

              {/* Por responsável */}
              <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-border/60">
                  <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    Desempenho por Responsável
                  </h3>
                </div>
                <div className="divide-y divide-border/60">
                  {[...stats.porResponsavel.entries()]
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([nome, { total, resolvidos }]) => {
                      const pct = total > 0 ? ((resolvidos / total) * 100).toFixed(0) : "0";
                      return (
                        <div key={nome} className="flex items-center justify-between px-5 py-3">
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-foreground block truncate">{nome}</span>
                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                              {resolvidos}/{total} resolvidas
                            </span>
                          </div>
                          <span className={cn(
                            "text-[10px] font-black px-2 py-0.5 rounded-md border tabular-nums",
                            Number(pct) >= 70
                              ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
                              : Number(pct) >= 40
                              ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
                              : "text-rose-500 bg-rose-500/10 border-rose-500/20"
                          )}>
                            {pct}%
                          </span>
                        </div>
                      );
                    })}
                  {stats.porResponsavel.size === 0 && (
                    <div className="px-5 py-8 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      Nenhuma ocorrência registrada
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
