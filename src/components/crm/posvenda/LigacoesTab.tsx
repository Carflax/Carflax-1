import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Loader2, Pencil, Phone, PhoneOff, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { carregarFila, carregarPeriodo } from "./posvenda-service";
import { RegistroLigacaoModal } from "./RegistroLigacaoModal";
import {
  CATEGORIAS,
  CLASSIFICACOES,
  fmtData,
  fmtDataHora,
  fmtMoeda,
  INTERESSE_BADGE,
  isoLocal,
  PRIORIDADES,
  RESULTADOS,
  somarDias,
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

type Visao = "fila" | "registrados";

export function LigacoesTab({ config, usuarios, userProfile }: Props) {
  const [visao, setVisao] = useState<Visao>("fila");
  const [fila, setFila] = useState<PosVendaContato[]>([]);
  const [registrados, setRegistrados] = useState<PosVendaContato[]>([]);
  const [loading, setLoading] = useState(true);
  const [segmento, setSegmento] = useState<Segmento | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<PosVendaContato | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const hoje = isoLocal(new Date());
      const [f, p] = await Promise.all([carregarFila(), carregarPeriodo(somarDias(hoje, -30), hoje)]);
      setFila(f);
      setRegistrados(p.filter((c) => c.status === "contatado" || c.status === "nao_contatado"));
    } catch (err) {
      console.error("[PosVenda] carregar fila:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrar = useCallback(
    (lista: PosVendaContato[]) => {
      const q = busca.trim().toLowerCase();
      return lista.filter(
        (c) => (segmento === "todos" || c.segmento === segmento) && (!q || c.cliente_nome.toLowerCase().includes(q) || c.cod_cliente.includes(q)),
      );
    },
    [busca, segmento],
  );

  // Retorno agendado para mais tarde fica no fim; o resto por prioridade e antiguidade.
  const filaOrdenada = useMemo(() => {
    const agora = Date.now();
    return filtrar(fila)
      .map((c) => ({ c, adiado: !!c.retornar_em && new Date(c.retornar_em).getTime() > agora }))
      .sort((a, b) =>
        Number(a.adiado) - Number(b.adiado) ||
        (a.c.prioridade ?? 9) - (b.c.prioridade ?? 9) ||
        a.c.data_venda.localeCompare(b.c.data_venda),
      );
  }, [fila, filtrar]);

  const lista = visao === "fila" ? filaOrdenada : filtrar(registrados).map((c) => ({ c, adiado: false }));
  const nome = (id?: string | null) => usuarios.find((u) => u.id === id)?.name.split(" ")[0];

  const aoSalvar = (salvo: PosVendaContato) => {
    setAberto(null);
    setFila((prev) => (["a_ligar", "retornar"].includes(salvo.status) ? prev.map((x) => (x.id === salvo.id ? salvo : x)) : prev.filter((x) => x.id !== salvo.id)));
    setRegistrados((prev) => {
      if (!["contatado", "nao_contatado"].includes(salvo.status)) return prev;
      const sem = prev.filter((x) => x.id !== salvo.id);
      return [salvo, ...sem];
    });
  };

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-secondary rounded-xl p-1 border border-border">
          {([["fila", `Fila (${fila.length})`], ["registrados", "Registrados · 30 dias"]] as [Visao, string][]).map(([v, l]) => (
            <button key={v} onClick={() => setVisao(v)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold", visao === v ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}>{l}</button>
          ))}
        </div>
        <div className="flex bg-secondary rounded-xl p-1 border border-border">
          {(["todos", "B2B", "B2C"] as const).map((s) => (
            <button key={s} onClick={() => setSegmento(s)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold", segmento === s ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}>{s === "todos" ? "Todos" : s}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 flex-1 min-w-[180px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente" className="bg-transparent text-xs focus:outline-none w-full" />
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">
          {visao === "fila" ? "Nenhum cliente na fila. As listas entram aqui depois de aprovadas pelos gestores." : "Nenhuma ligação registrada nos últimos 30 dias."}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl divide-y divide-border/60">
          {lista.map(({ c, adiado }) => {
            const telefone = c.celular || c.telefone;
            const classif = c.classificacao ? CLASSIFICACOES[c.classificacao] : null;
            return (
              <div key={c.id} className={cn("px-4 py-3 flex flex-wrap sm:flex-nowrap items-center gap-3", adiado && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold truncate">{c.cliente_nome}</span>
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground">{c.segmento}</span>
                    {visao === "fila" && c.prioridade && (
                      <span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded border", c.prioridade === 3 ? "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400" : CATEGORIAS[c.categoria].cor)}>
                        {PRIORIDADES[c.prioridade]}
                      </span>
                    )}
                    {classif && <span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded border", classif.cor)}>{classif.emoji} {classif.label}</span>}
                    {c.interesse_comercial && <span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded border", INTERESSE_BADGE.cor)}>{INTERESSE_BADGE.emoji} Interesse</span>}
                    {c.status === "nao_contatado" && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground">Sem contato</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    Compra {fmtData(c.data_venda)} · {fmtMoeda(c.valor_total)} · {c.nome_vendedor?.split(" ")[0] || "—"}
                    {telefone ? ` · ${telefone}` : " · sem telefone"}
                    {visao === "registrados" && c.contatado_em && ` · ligou ${nome(c.ligado_por) || ""} ${fmtDataHora(c.contatado_em)}`}
                    {visao === "registrados" && c.nota !== null && ` · nota ${c.nota}`}
                  </p>
                  {c.tentativas > 0 && c.ultimo_resultado && c.status !== "contatado" && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {c.tentativas}ª tentativa: {RESULTADOS[c.ultimo_resultado].toLowerCase()} em {fmtDataHora(c.ultima_tentativa_em)}
                      {c.retornar_em && c.status === "retornar" && ` · retornar ${fmtDataHora(c.retornar_em)}`}
                    </p>
                  )}
                </div>
                {visao === "fila" ? (
                  <button onClick={() => setAberto(c)} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black">
                    <Phone className="w-3.5 h-3.5" /> Registrar ligação
                  </button>
                ) : c.status === "contatado" ? (
                  <button onClick={() => setAberto(c)} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs font-bold hover:bg-secondary">
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </button>
                ) : (
                  <PhoneOff className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {aberto && (
        <RegistroLigacaoModal
          contato={aberto}
          config={config}
          usuarios={usuarios}
          userProfile={userProfile}
          onClose={() => setAberto(null)}
          onSaved={aoSalvar}
        />
      )}
    </div>
  );
}
