import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { atualizarContato, carregarTratativas } from "./posvenda-service";
import {
  CLASSIFICACOES,
  DIFICULDADES,
  fmtData,
  fmtDataHora,
  fmtMoeda,
  inputCls,
  isoLocal,
  labelCls,
  type HubUser,
  type PosVendaContato,
  type PosVendaUserProfile,
} from "./types";

const RESPOSTA: Record<string, string> = { sim: "Sim", parcial: "Em parte", talvez: "Talvez", nao: "Não" };

interface Props {
  usuarios: HubUser[];
  userProfile?: PosVendaUserProfile | null;
  destaqueId?: string | null;
}

export function TratativasTab({ usuarios, userProfile, destaqueId }: Props) {
  const [itens, setItens] = useState<PosVendaContato[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"aberta" | "resolvida">("aberta");

  useEffect(() => {
    carregarTratativas()
      .then(setItens)
      .catch((err) => console.error("[PosVenda] tratativas:", err))
      .finally(() => setLoading(false));
  }, []);

  const hoje = isoLocal(new Date());
  const lista = useMemo(
    () => itens
      .filter((c) => c.tratativa_status === filtro)
      // Crítico primeiro, depois o prazo mais apertado.
      .sort((a, b) =>
        Number(b.classificacao === "critico") - Number(a.classificacao === "critico") ||
        (a.tratativa_prazo || "").localeCompare(b.tratativa_prazo || ""),
      ),
    [itens, filtro],
  );
  const abertas = itens.filter((c) => c.tratativa_status === "aberta");
  const atrasadas = abertas.filter((c) => c.tratativa_prazo && c.tratativa_prazo < hoje).length;

  const salvar = async (c: PosVendaContato, patch: Partial<PosVendaContato>) => {
    try {
      const salvo = await atualizarContato(c.id, patch);
      setItens((prev) => prev.map((x) => (x.id === c.id ? salvo : x)));
    } catch (err) {
      console.error("[PosVenda] salvar tratativa:", err);
      alert("Erro ao salvar a tratativa.");
    }
  };

  const nome = (id?: string | null) => usuarios.find((u) => u.id === id)?.name;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-secondary rounded-xl p-1 border border-border">
          {([["aberta", `Abertas (${abertas.length})`], ["resolvida", "Resolvidas"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFiltro(v)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold", filtro === v ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}>{l}</button>
          ))}
        </div>
        {atrasadas > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-bold text-rose-500">
            <AlertTriangle className="w-3.5 h-3.5" /> {atrasadas} com prazo vencido
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">
          {filtro === "aberta" ? "Nenhum caso de cliente insatisfeito em aberto." : "Nenhuma tratativa resolvida ainda."}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {lista.map((c) => (
            <CardTratativa
              key={c.id}
              c={c}
              destaque={c.id === destaqueId}
              atrasada={c.tratativa_status === "aberta" && !!c.tratativa_prazo && c.tratativa_prazo < hoje}
              usuarios={usuarios}
              nome={nome}
              onSalvar={(patch) => salvar(c, patch)}
              userId={userProfile?.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CardTratativa({
  c, destaque, atrasada, usuarios, nome, onSalvar, userId,
}: {
  c: PosVendaContato;
  destaque: boolean;
  atrasada: boolean;
  usuarios: HubUser[];
  nome: (id?: string | null) => string | undefined;
  onSalvar: (patch: Partial<PosVendaContato>) => void;
  userId?: string;
}) {
  const [resolucao, setResolucao] = useState(c.tratativa_resolucao || "");
  const ref = useRef<HTMLDivElement>(null);
  // Veio de uma notificação: rola até o card uma vez.
  useEffect(() => {
    if (destaque) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [destaque]);
  const classif = c.classificacao ? CLASSIFICACOES[c.classificacao] : null;
  const difs = c.dificuldades.map((d) => DIFICULDADES.find((x) => x.id === d)?.label || d);

  return (
    <div
      ref={ref}
      className={cn("bg-card border rounded-2xl p-4 flex flex-col gap-3", destaque ? "border-primary ring-2 ring-primary/20" : "border-border")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {classif && <span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded border", classif.cor)}>{classif.emoji} {classif.label}</span>}
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground">{c.segmento}</span>
          </div>
          <h4 className="text-sm font-black mt-1 truncate">{c.cliente_nome}</h4>
          <p className="text-[11px] text-muted-foreground">
            {c.celular || c.telefone || "sem telefone"} · compra {fmtData(c.data_venda)} · {fmtMoeda(c.valor_total)} · vendedor {c.nome_vendedor?.split(" ")[0] || "—"}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={labelCls}>Prazo</p>
          <p className={cn("text-sm font-black", atrasada ? "text-rose-500" : "text-foreground")}>{fmtData(c.tratativa_prazo)}</p>
        </div>
      </div>

      <div className="rounded-xl bg-secondary/50 border border-border p-3 text-xs space-y-1">
        <p><b>Nota:</b> {c.nota ?? "—"} · <b>Como esperado:</b> {c.experiencia_esperada ? RESPOSTA[c.experiencia_esperada] : "—"} · <b>Voltaria:</b> {c.voltaria_comprar ? RESPOSTA[c.voltaria_comprar] : "—"}</p>
        {difs.length > 0 && <p><b>Dificuldades:</b> {difs.join(", ")}{c.dificuldade_detalhe ? ` — ${c.dificuldade_detalhe}` : ""}</p>}
        {c.melhoria && <p><b>Melhoria:</b> {c.melhoria}</p>}
        {c.observacoes && <p><b>Obs.:</b> {c.observacoes}</p>}
        <p className="text-muted-foreground">Ligação de {nome(c.ligado_por)?.split(" ")[0] || "—"} em {fmtDataHora(c.contatado_em)}{c.supervisor_notificado_em ? ` · supervisor avisado ${fmtDataHora(c.supervisor_notificado_em)}` : " · supervisor não foi avisado"}</p>
      </div>

      {c.tratativa_status === "aberta" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className={labelCls}>Responsável</p>
              <select className={inputCls} value={c.tratativa_responsavel || ""} onChange={(e) => onSalvar({ tratativa_responsavel: e.target.value || null })}>
                <option value="">Definir…</option>
                {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <p className={labelCls}>Prazo</p>
              <input type="date" className={inputCls} value={c.tratativa_prazo || ""} onChange={(e) => onSalvar({ tratativa_prazo: e.target.value || null })} />
            </div>
          </div>
          <textarea rows={2} placeholder="O que foi feito com o cliente?" className={cn(inputCls, "resize-none")} value={resolucao} onChange={(e) => setResolucao(e.target.value)} onBlur={() => resolucao !== (c.tratativa_resolucao || "") && onSalvar({ tratativa_resolucao: resolucao })} />
          <button
            disabled={!resolucao.trim()}
            onClick={() => onSalvar({ tratativa_status: "resolvida", tratativa_resolucao: resolucao.trim(), tratativa_resolvida_em: new Date().toISOString(), tratativa_responsavel: c.tratativa_responsavel || userId || null })}
            className="self-end flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black disabled:opacity-40"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Marcar como resolvida
          </button>
        </>
      ) : (
        <div className="text-xs space-y-1">
          <p><b>Resolução:</b> {c.tratativa_resolucao}</p>
          <p className="text-muted-foreground">Por {nome(c.tratativa_responsavel) || "—"} em {fmtDataHora(c.tratativa_resolvida_em)}</p>
          <button onClick={() => onSalvar({ tratativa_status: "aberta", tratativa_resolvida_em: null })} className="text-[11px] font-semibold text-primary">Reabrir</button>
        </div>
      )}
    </div>
  );
}
