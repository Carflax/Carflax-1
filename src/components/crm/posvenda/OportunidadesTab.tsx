import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, Loader2, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { atualizarContato, carregarOportunidades } from "./posvenda-service";
import {
  fmtData,
  fmtDataHora,
  fmtMoeda,
  inputCls,
  type HubUser,
  type PosVendaContato,
} from "./types";

interface Props {
  usuarios: HubUser[];
  /** Vendedor: vê só as oportunidades dele. */
  somenteDoUsuario?: string;
  destaqueId?: string | null;
}

export function OportunidadesTab({ usuarios, somenteDoUsuario, destaqueId }: Props) {
  const [itens, setItens] = useState<PosVendaContato[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"pendente" | "feito">("pendente");

  useEffect(() => {
    carregarOportunidades(somenteDoUsuario)
      .then(setItens)
      .catch((err) => console.error("[PosVenda] oportunidades:", err))
      .finally(() => setLoading(false));
  }, [somenteDoUsuario]);

  const pendentes = itens.filter((c) => !c.vendedor_retorno_em);
  const lista = filtro === "pendente" ? pendentes : itens.filter((c) => c.vendedor_retorno_em);
  const nome = (id?: string | null) => usuarios.find((u) => u.id === id)?.name;

  const salvar = async (c: PosVendaContato, patch: Partial<PosVendaContato>) => {
    try {
      const salvo = await atualizarContato(c.id, patch);
      setItens((prev) => prev.map((x) => (x.id === c.id ? salvo : x)));
    } catch (err) {
      console.error("[PosVenda] salvar retorno:", err);
      alert("Erro ao salvar o retorno.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-secondary rounded-xl p-1 border border-border">
          {([["pendente", `Aguardando retorno (${pendentes.length})`], ["feito", "Retorno feito"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFiltro(v)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold", filtro === v ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}>{l}</button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Clientes que, na ligação de pós-venda, disseram por conta própria que querem comprar de novo.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">
          {filtro === "pendente" ? "Nenhuma oportunidade aguardando retorno." : "Nenhum retorno registrado ainda."}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {lista.map((c) => (
            <CardOportunidade key={c.id} c={c} destaque={c.id === destaqueId} nome={nome} mostrarVendedor={!somenteDoUsuario} onSalvar={(p) => salvar(c, p)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardOportunidade({
  c, destaque, nome, mostrarVendedor, onSalvar,
}: {
  c: PosVendaContato;
  destaque: boolean;
  nome: (id?: string | null) => string | undefined;
  mostrarVendedor: boolean;
  onSalvar: (patch: Partial<PosVendaContato>) => void;
}) {
  const [obs, setObs] = useState(c.vendedor_retorno_obs || "");
  const ref = useRef<HTMLDivElement>(null);
  // Veio de uma notificação: rola até o card uma vez.
  useEffect(() => {
    if (destaque) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [destaque]);
  const telefones = [c.celular, c.telefone].filter(Boolean) as string[];

  return (
    <div
      ref={ref}
      className={cn("bg-card border rounded-2xl p-4 flex flex-col gap-3", destaque ? "border-primary ring-2 ring-primary/20" : "border-border")}
    >
      <div>
        <h4 className="text-sm font-black truncate">{c.cliente_nome}</h4>
        <p className="text-[11px] text-muted-foreground">
          Compra {fmtData(c.data_venda)} · {fmtMoeda(c.valor_total)} · ligação em {fmtDataHora(c.contatado_em)}
          {mostrarVendedor && ` · vendedor ${nome(c.vendedor_user_id) || c.nome_vendedor || "não definido"}`}
        </p>
      </div>
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs">
        <p className="font-black text-sky-700 dark:text-sky-300 mb-0.5">🔵 Necessidade mencionada</p>
        <p>{c.interesse_produto || "Não detalhada na ligação."}</p>
        {c.observacoes && <p className="text-muted-foreground mt-1">Obs.: {c.observacoes}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {telefones.map((t) => (
          <button key={t} onClick={() => navigator.clipboard?.writeText(t.replace(/\D/g, ""))} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary border border-border text-xs font-bold" title="Copiar número">
            <Phone className="w-3 h-3" /> {t} <Copy className="w-3 h-3 text-muted-foreground" />
          </button>
        ))}
      </div>
      {c.vendedor_retorno_em ? (
        <div className="text-xs">
          <p className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Retorno feito em {fmtDataHora(c.vendedor_retorno_em)}</p>
          {c.vendedor_retorno_obs && <p className="text-muted-foreground mt-0.5">{c.vendedor_retorno_obs}</p>}
        </div>
      ) : (
        <div className="flex gap-2">
          <input placeholder="Como foi o retorno? (opcional)" className={inputCls} value={obs} onChange={(e) => setObs(e.target.value)} />
          <button
            onClick={() => onSalvar({ vendedor_retorno_em: new Date().toISOString(), vendedor_retorno_obs: obs.trim() || null })}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Retorno feito
          </button>
        </div>
      )}
    </div>
  );
}
