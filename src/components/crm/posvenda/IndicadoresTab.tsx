import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { carregarPeriodo, carregarReclamacoesPublicas } from "./posvenda-service";
import {
  CLASSIFICACOES,
  DIFICULDADES,
  fmtDuracao,
  isoLocal,
  somarDias,
  type Classificacao,
  type PosVendaContato,
  type Segmento,
} from "./types";

const PERIODOS = [
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
];

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export function IndicadoresTab() {
  const [dias, setDias] = useState(30);
  const [segmento, setSegmento] = useState<Segmento | "todos">("todos");
  const [dados, setDados] = useState<PosVendaContato[]>([]);
  const [reclamacoes, setReclamacoes] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fim = isoLocal(new Date());
    const inicio = somarDias(fim, -dias);
    Promise.all([carregarPeriodo(inicio, fim), carregarReclamacoesPublicas(inicio, fim)])
      .then(([d, r]) => { setDados(d); setReclamacoes(r); })
      .catch((err) => console.error("[PosVenda] indicadores:", err))
      .finally(() => setLoading(false));
  }, [dias]);

  const k = useMemo(() => {
    const base = dados.filter((c) => segmento === "todos" || c.segmento === segmento);
    const aprovados = base.filter((c) => ["a_ligar", "retornar", "contatado", "nao_contatado"].includes(c.status));
    const contatados = base.filter((c) => c.status === "contatado");
    const comNota = contatados.filter((c) => c.nota !== null);
    const promotores = comNota.filter((c) => (c.nota ?? 0) >= 9).length;
    const detratores = comNota.filter((c) => (c.nota ?? 0) <= 6).length;
    const comDuracao = contatados.filter((c) => c.duracao_segundos);
    const porClassif = (cl: Classificacao) => contatados.filter((c) => c.classificacao === cl).length;
    const escalados = contatados.filter((c) => c.classificacao === "critico" || c.classificacao === "insatisfeito");
    const oportunidades = contatados.filter((c) => c.interesse_comercial);
    const hoje = isoLocal(new Date());
    const diasComVenda = new Set(base.map((c) => c.data_venda)).size;

    return {
      diasComVenda,
      novos: base.filter((c) => c.categoria === "primeira_compra").length,
      sugeridos: base.filter((c) => c.prioridade !== null).length,
      aprovados: aprovados.length,
      naFila: base.filter((c) => c.status === "a_ligar" || c.status === "retornar").length,
      pendentesAprovacao: base.filter((c) => c.status === "pendente").length,
      ligacoes: base.reduce((s, c) => s + c.tentativas, 0),
      contatados: contatados.length,
      semContato: base.filter((c) => c.status === "nao_contatado").length,
      pctContatados: pct(contatados.length, aprovados.length),
      notaMedia: comNota.length ? comNota.reduce((s, c) => s + (c.nota ?? 0), 0) / comNota.length : null,
      nps: comNota.length ? Math.round(((promotores - detratores) / comNota.length) * 100) : null,
      satisfeito: porClassif("satisfeito"),
      melhoria: porClassif("melhoria"),
      insatisfeito: porClassif("insatisfeito"),
      critico: porClassif("critico"),
      alertasEnviados: escalados.filter((c) => c.supervisor_notificado_em).length,
      escalados: escalados.length,
      tratativasAbertas: escalados.filter((c) => c.tratativa_status === "aberta").length,
      tratativasAtrasadas: escalados.filter((c) => c.tratativa_status === "aberta" && c.tratativa_prazo && c.tratativa_prazo < hoje).length,
      oportunidades: oportunidades.length,
      oportunidadesAvisadas: oportunidades.filter((c) => c.vendedor_notificado_em).length,
      oportunidadesRetornadas: oportunidades.filter((c) => c.vendedor_retorno_em).length,
      tempoMedio: comDuracao.length ? comDuracao.reduce((s, c) => s + (c.duracao_segundos ?? 0), 0) / comDuracao.length : null,
      dificuldades: DIFICULDADES.map((d) => ({ ...d, n: contatados.filter((c) => c.dificuldades.includes(d.id)).length })),
    };
  }, [dados, segmento]);

  const totalClassif = k.satisfeito + k.melhoria + k.insatisfeito + k.critico;
  const maxDif = Math.max(1, ...k.dificuldades.map((d) => d.n));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-secondary rounded-xl p-1 border border-border">
          {PERIODOS.map((p) => (
            <button key={p.dias} onClick={() => { if (p.dias !== dias) { setLoading(true); setDias(p.dias); } }} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold", dias === p.dias ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}>{p.label}</button>
          ))}
        </div>
        <div className="flex bg-secondary rounded-xl p-1 border border-border">
          {(["todos", "B2B", "B2C"] as const).map((s) => (
            <button key={s} onClick={() => setSegmento(s)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold", segmento === s ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}>{s === "todos" ? "Todos" : s}</button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">Pela data da venda · {k.diasComVenda} dia(s) com lista gerada</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Calculando…</div>
      ) : (
        <>
          <Grupo titulo="Lista e contato">
            <Tile label="Clientes novos identificados" valor={k.novos} sub={`${k.sugeridos} sugeridos no total`} />
            <Tile label="Liberados pelos gestores" valor={k.aprovados} sub={k.pendentesAprovacao ? `${k.pendentesAprovacao} aguardando aprovação` : "nenhum pendente"} alerta={k.pendentesAprovacao > 0} />
            <Tile label="Ligações realizadas" valor={k.ligacoes} sub={`${k.naFila} ainda na fila`} />
            <Tile label="Clientes contatados" valor={k.pctContatados === null ? "—" : `${k.pctContatados}%`} sub={`${k.contatados} de ${k.aprovados} · ${k.semContato} sem sucesso`} />
            <Tile label="Tempo médio por ligação" valor={fmtDuracao(k.tempoMedio)} sub="min:seg, ligações atendidas" />
          </Grupo>

          <Grupo titulo="Experiência do cliente">
            <Tile label="Nota média (0–10)" valor={k.notaMedia === null ? "—" : k.notaMedia.toFixed(1)} sub={k.nps === null ? "sem notas" : `NPS ${k.nps}`} />
            <Tile label="Pontos de melhoria" valor={k.melhoria} sub={CLASSIFICACOES.melhoria.emoji} />
            <Tile label="Insatisfeitos" valor={k.insatisfeito} sub={CLASSIFICACOES.insatisfeito.emoji} alerta={k.insatisfeito > 0} />
            <Tile label="Críticos" valor={k.critico} sub={CLASSIFICACOES.critico.emoji} alerta={k.critico > 0} />
            <Tile label="Reclamações públicas" valor={reclamacoes ?? "—"} sub="avaliações Google de 1–2 estrelas" />
          </Grupo>

          <Grupo titulo="Encaminhamentos">
            <Tile label="Alertas enviados a supervisores" valor={k.alertasEnviados} sub={k.escalados === k.alertasEnviados ? "todos os casos avisados" : `${k.escalados - k.alertasEnviados} caso(s) sem aviso`} alerta={k.escalados !== k.alertasEnviados} />
            <Tile label="Tratativas em aberto" valor={k.tratativasAbertas} sub={k.tratativasAtrasadas ? `${k.tratativasAtrasadas} com prazo vencido` : "nenhuma atrasada"} alerta={k.tratativasAtrasadas > 0} />
            <Tile label="Oportunidades para vendedores" valor={k.oportunidades} sub={`${k.oportunidadesAvisadas} avisadas · ${k.oportunidadesRetornadas} com retorno`} />
          </Grupo>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">Classificação das ligações</p>
              {totalClassif === 0 ? <p className="text-xs text-muted-foreground">Sem ligações registradas no período.</p> : (
                <>
                  <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-3">
                    {(["satisfeito", "melhoria", "insatisfeito", "critico"] as Classificacao[]).map((cl) => (
                      <div key={cl} style={{ width: `${(k[cl] / totalClassif) * 100}%` }} className={{ satisfeito: "bg-emerald-500", melhoria: "bg-amber-400", insatisfeito: "bg-orange-500", critico: "bg-rose-500" }[cl]} />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    {(["satisfeito", "melhoria", "insatisfeito", "critico"] as Classificacao[]).map((cl) => (
                      <p key={cl} className="flex justify-between"><span>{CLASSIFICACOES[cl].emoji} {CLASSIFICACOES[cl].label}</span><b className="tabular-nums">{k[cl]} · {pct(k[cl], totalClassif)}%</b></p>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">Onde estão as dificuldades</p>
              <div className="space-y-2">
                {k.dificuldades.map((d) => (
                  <div key={d.id} className="grid grid-cols-[120px_1fr_32px] items-center gap-2 text-xs">
                    <span className="font-semibold">{d.label}</span>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${(d.n / maxDif) * 100}%` }} /></div>
                    <b className="text-right tabular-nums">{d.n}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">{titulo}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">{children}</div>
    </div>
  );
}

function Tile({ label, valor, sub, alerta }: { label: string; valor: string | number; sub?: string; alerta?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-3.5">
      <p className="text-[10px] font-bold text-muted-foreground leading-tight">{label}</p>
      <p className="text-2xl font-black tabular-nums mt-1">{valor}</p>
      {sub && <p className={cn("text-[11px] mt-0.5", alerta ? "text-rose-500 font-semibold" : "text-muted-foreground")}>{sub}</p>}
    </div>
  );
}
