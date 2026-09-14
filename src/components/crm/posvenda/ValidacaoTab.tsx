import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, Loader2, RefreshCw, UserMinus, UserPlus, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  aprovarLista,
  atualizarContato,
  carregarAprovacoes,
  carregarContatosDoDia,
  sincronizarDia,
} from "./posvenda-service";
import {
  CATEGORIAS,
  diaVendaPadrao,
  fmtDataHora,
  fmtMoeda,
  gestorDoSegmento,
  isGestorGeral,
  isoLocal,
  PRIORIDADES,
  type HubUser,
  type PosVendaConfig,
  type PosVendaContato,
  type PosVendaUserProfile,
  type Segmento,
} from "./types";

interface Props {
  config: PosVendaConfig;
  usuarios: HubUser[];
  userProfile?: PosVendaUserProfile | null;
}

export function ValidacaoTab({ config, usuarios, userProfile }: Props) {
  const [dataVenda, setDataVenda] = useState(diaVendaPadrao());
  const [contatos, setContatos] = useState<PosVendaContato[]>([]);
  const [aprovacoes, setAprovacoes] = useState<{ segmento: Segmento; aprovado_por: string | null; aprovado_em: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aprovando, setAprovando] = useState<Segmento | null>(null);

  const recarregarLocal = useCallback(async () => {
    const [c, a] = await Promise.all([carregarContatosDoDia(dataVenda), carregarAprovacoes(dataVenda)]);
    setContatos(c);
    setAprovacoes(a);
  }, [dataVenda]);

  const sincronizar = useCallback(async () => {
    setSincronizando(true);
    setErro(null);
    try {
      await sincronizarDia(dataVenda, config, usuarios);
      await recarregarLocal();
    } catch (err) {
      console.error("[PosVenda] sincronizar dia:", err);
      setErro("Não foi possível buscar as vendas do ERP. A lista abaixo pode estar incompleta.");
      await recarregarLocal().catch(() => {});
    } finally {
      setSincronizando(false);
      setLoading(false);
    }
  }, [dataVenda, config, usuarios, recarregarLocal]);

  useEffect(() => {
    if (!usuarios.length) return;
    setLoading(true);
    sincronizar();
  }, [dataVenda, usuarios.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const podeAprovar = (seg: Segmento) =>
    isGestorGeral(userProfile) || gestorDoSegmento(config, userProfile?.id).includes(seg);

  const alterar = async (c: PosVendaContato, patch: Partial<PosVendaContato>) => {
    setContatos((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
    try {
      await atualizarContato(c.id, patch);
    } catch (err) {
      console.error("[PosVenda] alterar contato:", err);
      recarregarLocal();
    }
  };

  const aprovar = async (seg: Segmento) => {
    setAprovando(seg);
    try {
      await aprovarLista(dataVenda, seg, userProfile?.id);
      await recarregarLocal();
    } catch (err) {
      console.error("[PosVenda] aprovar lista:", err);
      alert("Erro ao aprovar a lista.");
    } finally {
      setAprovando(null);
    }
  };

  const hoje = isoLocal(new Date());

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-bold text-muted-foreground">Vendas de</span>
          <input
            type="date"
            max={hoje}
            value={dataVenda}
            onChange={(e) => e.target.value && setDataVenda(e.target.value)}
            className="bg-transparent text-sm font-bold focus:outline-none"
          />
        </label>
        <button
          onClick={sincronizar}
          disabled={sincronizando}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:bg-secondary text-xs font-bold disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", sincronizando && "animate-spin")} />
          Atualizar do ERP
        </button>
        <p className="text-xs text-muted-foreground">
          Sugeridos: primeira compra e até {config.pouco_historico_pedidos} pedidos nos últimos 12 meses. Fora da lista: {config.recorrencia_pedidos}+ pedidos em {config.recorrencia_dias} dias.
        </p>
      </div>

      {erro && <div className="text-xs font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{erro}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Buscando vendas do dia…
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {(["B2B", "B2C"] as Segmento[]).map((seg) => (
            <ColunaSegmento
              key={seg}
              segmento={seg}
              contatos={contatos.filter((c) => c.segmento === seg)}
              aprovacao={aprovacoes.find((a) => a.segmento === seg)}
              gestor={usuarios.find((u) => u.id === (seg === "B2B" ? config.gestor_b2b : config.gestor_b2c))}
              usuarios={usuarios}
              podeAprovar={podeAprovar(seg)}
              aprovando={aprovando === seg}
              onAprovar={() => aprovar(seg)}
              onAlterar={alterar}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ColunaSegmento({
  segmento, contatos, aprovacao, gestor, usuarios, podeAprovar, aprovando, onAprovar, onAlterar,
}: {
  segmento: Segmento;
  contatos: PosVendaContato[];
  aprovacao?: { aprovado_por: string | null; aprovado_em: string };
  gestor?: HubUser;
  usuarios: HubUser[];
  podeAprovar: boolean;
  aprovando: boolean;
  onAprovar: () => void;
  onAlterar: (c: PosVendaContato, patch: Partial<PosVendaContato>) => void;
}) {
  const [verFora, setVerFora] = useState(false);
  const aprovada = !!aprovacao;

  const naLista = useMemo(
    () => contatos.filter((c) => c.status !== "fora" && c.status !== "excluido")
      .sort((a, b) => (a.prioridade ?? 9) - (b.prioridade ?? 9) || b.valor_total - a.valor_total),
    [contatos],
  );
  const excluidos = contatos.filter((c) => c.status === "excluido");
  const fora = contatos.filter((c) => c.status === "fora");
  const pendentes = naLista.filter((c) => c.status === "pendente").length;
  const aprovador = usuarios.find((u) => u.id === aprovacao?.aprovado_por);

  // Depois de aprovada, incluir alguém manda direto para a fila de ligação.
  const statusAoIncluir = aprovada ? "a_ligar" : "pendente";

  return (
    <div className="bg-card border border-border rounded-2xl flex flex-col min-h-0">
      <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black uppercase tracking-tight">Carteira {segmento}</h3>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-secondary border border-border text-muted-foreground">
              {naLista.length} na lista
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {aprovada
              ? `Aprovada por ${aprovador?.name?.split(" ")[0] || "—"} em ${fmtDataHora(aprovacao!.aprovado_em)}`
              : `Aguardando aprovação${gestor ? ` de ${gestor.name.split(" ")[0]}` : " (gestor não definido nas configurações)"}`}
          </p>
        </div>
        {(!aprovada || pendentes > 0) && (
          <button
            onClick={onAprovar}
            disabled={!podeAprovar || aprovando || (aprovada && pendentes === 0)}
            title={podeAprovar ? undefined : `Só o gestor ${segmento} aprova esta lista`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {aprovando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : podeAprovar ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {aprovada ? `Liberar ${pendentes} incluído(s)` : "Aprovar lista"}
          </button>
        )}
        {aprovada && pendentes === 0 && (
          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Liberada para ligação
          </span>
        )}
      </div>

      <div className="divide-y divide-border/60">
        {naLista.length === 0 && (
          <p className="p-6 text-center text-xs text-muted-foreground">Nenhum cliente sugerido para este dia.</p>
        )}
        {naLista.map((c) => (
          <LinhaCliente
            key={c.id}
            c={c}
            acao={
              c.status === "pendente" ? (
                <BotaoAcao onClick={() => onAlterar(c, { status: "excluido" })} icon={UserMinus} label="Excluir" tone="rose" />
              ) : (
                <span className="text-[10px] font-bold text-muted-foreground uppercase">{statusLegivel(c.status)}</span>
              )
            }
          />
        ))}
      </div>

      {(excluidos.length > 0 || fora.length > 0) && (
        <div className="border-t border-border">
          <button
            onClick={() => setVerFora((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-bold text-muted-foreground hover:bg-secondary/50"
          >
            <span>Fora da lista: {excluidos.length} excluído(s) · {fora.length} recorrente(s)/ativo(s)</span>
            <ChevronDown className={cn("w-4 h-4 transition-transform", verFora && "rotate-180")} />
          </button>
          {verFora && (
            <div className="divide-y divide-border/60 bg-secondary/20">
              {[...excluidos, ...fora].map((c) => (
                <LinhaCliente
                  key={c.id}
                  c={c}
                  apagado
                  acao={
                    <BotaoAcao
                      onClick={() => onAlterar(c, { status: statusAoIncluir, prioridade: c.prioridade ?? 3 })}
                      icon={UserPlus}
                      label={c.status === "excluido" ? "Voltar" : "Indicar"}
                      tone="primary"
                    />
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function statusLegivel(s: PosVendaContato["status"]) {
  return { a_ligar: "Na fila", retornar: "Retornar", contatado: "Contatado", nao_contatado: "Sem contato" }[s as string] || s;
}

function LinhaCliente({ c, acao, apagado }: { c: PosVendaContato; acao: React.ReactNode; apagado?: boolean }) {
  const cat = CATEGORIAS[c.categoria];
  return (
    <div className={cn("px-4 py-2.5 flex items-center gap-3", apagado && "opacity-70")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold truncate" title={c.cliente_nome}>{c.cliente_nome}</span>
          <span className={cn("shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded border", cat.cor)}>{cat.label}</span>
          {c.prioridade === 3 && (
            <span className="shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded border border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400">Indicado</span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">
          {c.nome_vendedor?.split(" ")[0] || "Sem vendedor"} · {fmtMoeda(c.valor_total)} · {c.pedidos_365d} pedido(s) em 12m
          {c.motivo_fora && c.status === "fora" ? ` · ${c.motivo_fora}` : ""}
          {!c.celular && !c.telefone ? " · sem telefone" : ""}
        </p>
      </div>
      {c.prioridade && c.status !== "fora" && (
        <span className="hidden sm:block text-[10px] text-muted-foreground font-semibold shrink-0">{PRIORIDADES[c.prioridade].split(" · ")[0]}</span>
      )}
      <div className="shrink-0">{acao}</div>
    </div>
  );
}

function BotaoAcao({ onClick, icon: Icon, label, tone }: { onClick: () => void; icon: typeof UserPlus; label: string; tone: "rose" | "primary" }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-black uppercase transition-colors",
        tone === "rose"
          ? "border-rose-500/20 text-rose-500 hover:bg-rose-500/10"
          : "border-primary/20 text-primary hover:bg-primary/10",
      )}
    >
      <Icon className="w-3 h-3" /> {label}
    </button>
  );
}
