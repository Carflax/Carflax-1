import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, CalendarClock, Check, CheckCircle2, ChevronDown, Copy, FileText, Lightbulb, Loader2, MessageCircle, PackageCheck, PackageX, Phone, RefreshCw, Sparkles, Target, X,
} from "lucide-react";
import { apiProspeccaoContexto, type ProspeccaoContexto } from "@/lib/api";
import { gerarAbordagem, nomeProduto, promptIA, type Abordagem } from "./abordagem";
import { cn } from "@/lib/utils";
import { fmtBRLCompact } from "../clientes/frv-utils";
import {
  CAMPOS,
  carregarAgenda,
  carregarHistorico,
  garantirDia,
  hojeIso,
  PILARES,
  salvarProspeccao,
  type ProspeccaoDia,
} from "./prospeccao-dia";

interface Props {
  codVendedor: string;
  nomeVendedor: string;
  userId?: string;
  /** Abre o chat de IA da carteira para o cliente, com a pergunta já escrita. */
  onPedirIA?: (clienteId: string, prompt: string) => void;
}

type ContextoEstado = { ctx: ProspeccaoContexto; abordagem: Abordagem } | "carregando" | "erro";

const fmtData = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const HOJE_LABEL = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });

export function ProspeccaoDiaTab({ codVendedor, nomeVendedor, userId, onPedirIA }: Props) {
  const [dia, setDia] = useState<ProspeccaoDia[]>([]);
  const [agenda, setAgenda] = useState<ProspeccaoDia[]>([]);
  const [historico, setHistorico] = useState<ProspeccaoDia[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<ProspeccaoDia | null>(null);
  const [verHistorico, setVerHistorico] = useState(false);
  const [contextos, setContextos] = useState<Record<string, ContextoEstado>>({});

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [d, a, h] = await Promise.all([garantirDia(codVendedor), carregarAgenda(codVendedor), carregarHistorico(codVendedor)]);
      setDia(d);
      setAgenda(a);
      setHistorico(h);
    } catch (err) {
      console.error("[Prospecção do dia] carregar:", err);
      setErro("Não foi possível montar a prospecção do dia. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [codVendedor]);

  useEffect(() => { carregar(); }, [carregar]);

  // O que cada cliente compra: carrega em paralelo depois que os 3 aparecem.
  useEffect(() => {
    let cancelado = false;
    for (const p of dia) {
      apiProspeccaoContexto(p.cliente_id)
        .then((ctx) => {
          if (!cancelado) setContextos((prev) => ({ ...prev, [p.id]: { ctx, abordagem: gerarAbordagem(p, ctx, nomeVendedor) } }));
        })
        .catch((err) => {
          console.error("[Prospecção do dia] contexto:", err);
          if (!cancelado) setContextos((prev) => ({ ...prev, [p.id]: "erro" }));
        });
    }
    return () => { cancelado = true; };
    // Recarrega só quando mudam os clientes do dia, não a cada edição dos campos.
  }, [dia.map((d) => d.id).join(","), nomeVendedor]); // eslint-disable-line react-hooks/exhaustive-deps

  const trabalhados = dia.filter((d) => d.concluido_em).length;
  const hoje = hojeIso();

  const aderencia = useMemo(() => {
    const dias = new Set(historico.map((h) => h.data)).size;
    const feitos = historico.filter((h) => h.concluido_em).length;
    return { dias, total: historico.length, feitos, pct: historico.length ? Math.round((feitos / historico.length) * 100) : null };
  }, [historico]);

  const atualizar = (salvo: ProspeccaoDia) => {
    const troca = (lista: ProspeccaoDia[]) => lista.map((x) => (x.id === salvo.id ? salvo : x));
    setDia(troca);
    setHistorico(troca);
    setAgenda((prev) => prev.map((x) => (x.id === salvo.id ? salvo : x)).filter((x) => !x.proximo_contato_feito && x.proximo_contato));
  };

  const marcarContatoFeito = async (p: ProspeccaoDia) => {
    try {
      atualizar(await salvarProspeccao(p.id, { proximo_contato_feito: true }));
    } catch (err) {
      console.error("[Prospecção do dia] próximo contato:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
        <Loader2 className="w-4 h-4 animate-spin" /> Escolhendo os clientes do dia…
      </div>
    );
  }

  if (erro) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertTriangle className="w-6 h-6 text-rose-500" />
        <p className="text-sm font-bold">{erro}</p>
        <button onClick={() => { setLoading(true); carregar(); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest">
          <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumo do dia */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5 mr-auto">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Target className="w-5 h-5" /></div>
          <div>
            <p className="text-sm font-black text-foreground tracking-tight">Prospecção do dia</p>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{HOJE_LABEL} · 3 clientes, 3 motivos diferentes</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 h-10 rounded-xl border border-border bg-card">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Hoje</span>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className={cn("w-2.5 h-2.5 rounded-full", i < trabalhados ? "bg-emerald-500" : "bg-secondary border border-border")} />
            ))}
          </div>
          <span className="text-xs font-black tabular-nums">{trabalhados}/{dia.length || 3}</span>
        </div>
        {aderencia.pct !== null && (
          <div className="flex items-center gap-2 px-3 h-10 rounded-xl border border-border bg-card" title={`${aderencia.feitos} de ${aderencia.total} clientes trabalhados em ${aderencia.dias} dia(s)`}>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Últimas 4 semanas</span>
            <span className={cn("text-xs font-black tabular-nums", aderencia.pct >= 80 ? "text-emerald-500" : aderencia.pct >= 50 ? "text-amber-500" : "text-rose-500")}>{aderencia.pct}%</span>
          </div>
        )}
      </div>

      {/* Os 3 do dia */}
      {dia.length === 0 ? (
        <div className="py-16 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest bg-card border border-border rounded-2xl">
          Nenhum cliente disponível na carteira de {nomeVendedor}.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {dia.map((p) => {
            const c = contextos[p.id] ?? "carregando";
            const pronto = typeof c === "object" ? c : null;
            return (
              <CardDia
                key={p.id}
                p={p}
                contexto={c}
                onAbrir={() => setAberto(p)}
                onPedirIA={onPedirIA && pronto ? () => onPedirIA(p.cliente_id, promptIA(p, pronto.abordagem)) : undefined}
              />
            );
          })}
        </div>
      )}

      {/* Próximos contatos combinados */}
      <div className="bg-card border border-border/80 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
          <CalendarClock className="w-4 h-4 text-primary" />
          <p className="text-[11px] font-black uppercase tracking-widest text-foreground">Próximos contatos combinados</p>
          <span className="text-[10px] font-bold text-muted-foreground">{agenda.length}</span>
        </div>
        {agenda.length === 0 ? (
          <p className="px-5 py-6 text-xs text-muted-foreground">Nenhum retorno pendente. Os próximos passos registrados nas prospecções aparecem aqui.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {agenda.map((a) => {
              const atrasado = (a.proximo_contato || "") < hoje;
              const ehHoje = a.proximo_contato === hoje;
              return (
                <div key={a.id} className="px-5 py-3 flex flex-wrap sm:flex-nowrap items-center gap-3">
                  <span className={cn(
                    "shrink-0 w-24 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border text-center",
                    atrasado ? "text-rose-500 bg-rose-500/10 border-rose-500/20" : ehHoje ? "text-amber-600 bg-amber-500/10 border-amber-500/20" : "text-muted-foreground bg-secondary border-border",
                  )}>
                    {atrasado ? "Atrasado" : ehHoje ? "Hoje" : fmtData(a.proximo_contato)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black truncate">{a.nome_cliente}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{a.proximo_passo || a.acao || "Retomar contato"}{atrasado && ` · combinado para ${fmtData(a.proximo_contato)}`}</p>
                  </div>
                  <button onClick={() => marcarContatoFeito(a)} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/10">
                    <Check className="w-3.5 h-3.5" /> Feito
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Histórico */}
      {historico.length > 0 && (
        <div className="bg-card border border-border/80 rounded-2xl overflow-hidden">
          <button onClick={() => setVerHistorico((v) => !v)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30">
            <span className="text-[11px] font-black uppercase tracking-widest text-foreground">Histórico · últimas 4 semanas</span>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", verHistorico && "rotate-180")} />
          </button>
          {verHistorico && (
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 text-[10px] uppercase font-black tracking-widest text-muted-foreground">
                    <th className="text-left px-5 py-2.5">Dia</th>
                    <th className="text-left px-5 py-2.5">Cliente</th>
                    <th className="text-left px-5 py-2.5">Motivo</th>
                    <th className="text-left px-5 py-2.5">Ação registrada</th>
                    <th className="text-center px-5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {historico.map((h) => (
                    <tr key={h.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => setAberto(h)}>
                      <td className="px-5 py-2.5 tabular-nums whitespace-nowrap">{fmtData(h.data)}</td>
                      <td className="px-5 py-2.5 font-bold">{h.nome_cliente}</td>
                      <td className="px-5 py-2.5"><span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded border whitespace-nowrap", PILARES[h.pilar].cor)}>{PILARES[h.pilar].label}</span></td>
                      <td className="px-5 py-2.5 text-muted-foreground max-w-[320px] truncate">{h.acao || "—"}</td>
                      <td className="px-5 py-2.5 text-center">
                        {h.concluido_em
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                          : <span className="text-[10px] font-black uppercase text-rose-500">Não trabalhado</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {aberto && (
        <RegistroModal
          p={aberto}
          userId={userId}
          rascunho={(() => { const c = contextos[aberto.id]; return c && typeof c === "object" ? c.abordagem.rascunho : undefined; })()}
          onClose={() => setAberto(null)}
          onSaved={(s) => { atualizar(s); setAberto(null); }}
        />
      )}
    </div>
  );
}

function CardDia({ p, contexto, onAbrir, onPedirIA }: { p: ProspeccaoDia; contexto: ContextoEstado; onAbrir: () => void; onPedirIA?: () => void }) {
  const pilar = PILARES[p.pilar];
  const m = p.metricas;
  const feito = !!p.concluido_em;

  return (
    <div className={cn("bg-card border rounded-2xl p-5 flex flex-col gap-4 shadow-sm", feito ? "border-emerald-500/40" : "border-border/80")}>
      <div className="flex items-start justify-between gap-2">
        <span className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md border", pilar.cor)} title={pilar.descricao}>
          {p.ordem}. {pilar.label}
        </span>
        {feito && <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Trabalhado</span>}
      </div>

      <div>
        <p className="font-black text-foreground leading-snug">{p.nome_cliente}</p>
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Cód. {p.cliente_id}</p>
      </div>

      <p className="text-xs text-foreground/85 leading-relaxed">{p.motivo}</p>

      <div className="grid grid-cols-2 gap-2">
        <Metrica label="12 meses" valor={fmtBRLCompact(m.valor_12m)} />
        <Metrica label="Pedidos 12m" valor={String(m.pedidos_12m)} />
        <Metrica label="Última compra" valor={m.ultima_compra ? fmtData(m.ultima_compra) : "—"} />
        <Metrica label="Marcas 12m" valor={String(m.marcas_12m)} />
      </div>

      <ContextoCliente contexto={contexto} onPedirIA={onPedirIA} />

      {p.telefone && (
        <button
          onClick={() => navigator.clipboard?.writeText(p.telefone!.replace(/\D/g, ""))}
          className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs font-bold hover:border-primary/40"
          title="Copiar número"
        >
          <Phone className="w-3.5 h-3.5" /> {p.telefone} <Copy className="w-3 h-3 text-muted-foreground" />
        </button>
      )}

      {feito ? (
        <div className="mt-auto rounded-xl bg-muted/40 border border-border p-3 text-xs space-y-1">
          <p><b>Ação:</b> {p.acao || "—"}</p>
          <p><b>Próximo passo:</b> {p.proximo_passo || "—"}{p.proximo_contato ? ` (${fmtData(p.proximo_contato)})` : ""}</p>
          <button onClick={onAbrir} className="text-[11px] font-bold text-primary">Ver / editar</button>
        </div>
      ) : (
        <button onClick={onAbrir} className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-[11px] font-black uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all">
          Registrar trabalho
        </button>
      )}
    </div>
  );
}

function ContextoCliente({ contexto, onPedirIA }: { contexto: ContextoEstado; onPedirIA?: () => void }) {
  const [copiado, setCopiado] = useState(false);

  if (contexto === "carregando") {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando o que o cliente compra…
      </div>
    );
  }
  if (contexto === "erro") {
    return <p className="text-[11px] text-rose-500">Não foi possível carregar as compras do cliente.</p>;
  }

  const { ctx, abordagem } = contexto;
  const agora = ctx.comprando_agora.slice(0, 3);
  // Sem compra no trimestre (reativação): mostra a última compra ou os mais comprados.
  const referencia = agora.length
    ? agora
    : ctx.ultima_compra?.itens.length ? ctx.ultima_compra.itens.slice(0, 3) : ctx.mais_comprados_12m.slice(0, 3);
  const tituloReferencia = agora.length
    ? "Comprando agora · últimos 3 meses"
    : ctx.ultima_compra ? `Última compra · ${fmtData(ctx.ultima_compra.data)}` : "Mais comprados · 12 meses";
  const parou = ctx.parou_de_comprar.slice(0, 3);

  const copiarAbertura = () => {
    navigator.clipboard?.writeText(abordagem.abertura);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  };

  return (
    <div className="space-y-3">
      {abordagem.leitura.length > 0 && (
        <ul className="space-y-1">
          {abordagem.leitura.map((l) => (
            <li key={l} className="flex gap-1.5 text-[11px] text-foreground/85 leading-snug">
              <FileText className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" /> {l}
            </li>
          ))}
        </ul>
      )}

      {referencia.length > 0 && (
        <ListaProdutos
          titulo={tituloReferencia}
          icone={PackageCheck}
          tom="emerald"
          itens={referencia.map((i) => ({ nome: nomeProduto(i), marca: i.marca, valor: fmtBRLCompact(agora.length ? i.valor_3m : i.valor_12m) }))}
        />
      )}

      {parou.length > 0 && (
        <ListaProdutos
          titulo="Parou de comprar · nada nos últimos 3 meses"
          icone={PackageX}
          tom="rose"
          itens={parou.map((i) => ({ nome: nomeProduto(i), marca: i.marca, valor: `últ. ${fmtData(i.ultima_compra)}` }))}
        />
      )}

      {referencia.length === 0 && parou.length === 0 && (
        <p className="text-[11px] text-muted-foreground">Sem compras nos últimos 12 meses.</p>
      )}

      <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2">
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
          <Lightbulb className="w-3.5 h-3.5" /> Como abordar
        </p>
        <ul className="space-y-1.5">
          {abordagem.sugestoes.map((s) => (
            <li key={s} className="text-[11px] leading-snug text-foreground/90 flex gap-1.5"><span className="text-primary">•</span>{s}</li>
          ))}
        </ul>
        <div className="rounded-lg bg-card border border-border p-2.5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
              <MessageCircle className="w-3 h-3" /> Para abrir a conversa
            </span>
            <button onClick={copiarAbertura} className="text-[10px] font-bold text-primary inline-flex items-center gap-1">
              {copiado ? <><Check className="w-3 h-3" /> Copiado</> : <><Copy className="w-3 h-3" /> Copiar</>}
            </button>
          </div>
          <p className="text-[11px] italic leading-snug text-foreground/85">“{abordagem.abertura}”</p>
        </div>
        {onPedirIA && (
          <button
            onClick={onPedirIA}
            className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-violet-500/30 text-violet-600 dark:text-violet-400 text-[10px] font-black uppercase tracking-widest hover:bg-violet-500/10"
          >
            <Sparkles className="w-3.5 h-3.5" /> Montar roteiro com a IA
          </button>
        )}
      </div>
    </div>
  );
}

function ListaProdutos({ titulo, icone: Icone, tom, itens }: {
  titulo: string;
  icone: typeof PackageCheck;
  tom: "emerald" | "rose";
  itens: { nome: string; marca: string; valor: string }[];
}) {
  return (
    <div>
      <p className={cn(
        "flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest mb-1",
        tom === "emerald" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
      )}>
        <Icone className="w-3.5 h-3.5" /> {titulo}
      </p>
      <ul className="divide-y divide-border/50 rounded-lg border border-border/60 bg-muted/20">
        {itens.map((i) => (
          <li key={i.nome + i.valor} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
            <div className="min-w-0">
              <p className="text-[11px] font-bold truncate" title={i.nome}>{i.nome}</p>
              {i.marca && i.marca.toUpperCase() !== "VENDA CASADA" && (
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider truncate">{i.marca}</p>
              )}
            </div>
            <span className="text-[10px] font-black tabular-nums shrink-0 text-muted-foreground">{i.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metrica({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg bg-muted/40 border border-border/60 px-2.5 py-1.5">
      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-xs font-black tabular-nums">{valor}</p>
    </div>
  );
}

type FormCampos = Pick<ProspeccaoDia, "oportunidade" | "risco" | "potencial" | "necessidade" | "acao" | "proximo_passo" | "proximo_contato">;

function RegistroModal({ p, userId, rascunho, onClose, onSaved }: {
  p: ProspeccaoDia;
  userId?: string;
  /** Sugestões do contexto do ERP, mostradas como placeholder. */
  rascunho?: Abordagem["rascunho"];
  onClose: () => void;
  onSaved: (s: ProspeccaoDia) => void;
}) {
  const [form, setForm] = useState<FormCampos>({
    oportunidade: p.oportunidade,
    risco: p.risco,
    potencial: p.potencial,
    necessidade: p.necessidade,
    acao: p.acao,
    proximo_passo: p.proximo_passo,
    proximo_contato: p.proximo_contato,
  });
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof FormCampos, v: string) => setForm((f) => ({ ...f, [k]: v || null }));

  // Ação e próximo passo são o mínimo para o trabalho contar como feito.
  const valido = !!form.acao?.trim() && !!form.proximo_passo?.trim();

  const salvar = async () => {
    setSalvando(true);
    try {
      const limpo = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v])) as FormCampos;
      const salvo = await salvarProspeccao(p.id, {
        ...limpo,
        // Mudou a data do próximo contato: volta a ser pendente na agenda.
        proximo_contato_feito: limpo.proximo_contato === p.proximo_contato ? p.proximo_contato_feito : false,
        concluido_em: p.concluido_em || new Date().toISOString(),
        concluido_por: p.concluido_por || userId || null,
      });
      onSaved(salvo);
    } catch (err) {
      console.error("[Prospecção do dia] salvar:", err);
      alert("Não foi possível salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  const campoCls = "w-full bg-secondary/60 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none";

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[92vh] bg-card border border-border rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-border flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border", PILARES[p.pilar].cor)}>{PILARES[p.pilar].label}</span>
            <h3 className="text-lg font-black tracking-tight mt-1.5 truncate">{p.nome_cliente}</h3>
            <p className="text-xs text-muted-foreground">{p.motivo}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-full shrink-0"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {CAMPOS.map((c, i) => (
            <label key={c.key} className="block space-y-1">
              <span className="text-[11px] font-black uppercase tracking-widest text-foreground">
                <span className="text-primary mr-1">{i + 1}.</span>{c.label}{c.key === "acao" && <span className="text-rose-500"> *</span>}
              </span>
              <span className="block text-[11px] text-muted-foreground">{c.dica}</span>
              <textarea rows={2} className={campoCls} placeholder={c.key === "acao" ? undefined : rascunho?.[c.key]} value={form[c.key] || ""} onChange={(e) => set(c.key, e.target.value)} />
            </label>
          ))}
          <div className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-widest text-foreground">
              <span className="text-primary mr-1">6.</span>Próximo passo<span className="text-rose-500"> *</span>
            </span>
            <span className="block text-[11px] text-muted-foreground">Quando e qual será o próximo movimento com este cliente.</span>
            <div className="grid sm:grid-cols-[1fr_170px] gap-2">
              <input className={campoCls} placeholder="Ex.: enviar orçamento de disjuntores" value={form.proximo_passo || ""} onChange={(e) => set("proximo_passo", e.target.value)} />
              <input type="date" min={hojeIso()} className={campoCls} value={form.proximo_contato || ""} onChange={(e) => set("proximo_contato", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 bg-secondary font-bold text-xs rounded-2xl border border-border">Cancelar</button>
          <button
            onClick={salvar}
            disabled={!valido || salvando}
            title={valido ? undefined : "Preencha a ação e o próximo passo"}
            className="flex-1 py-2.5 bg-primary text-primary-foreground font-black text-xs rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar trabalho
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
