import { useState } from "react";
import { Check, CheckCircle2, ChevronRight, LoaderCircle, LockKeyhole, X } from "lucide-react";
import type { GestorLiberacao } from "@/lib/api";
import { HistoricoCobranca } from "./HistoricoCobranca";

const dataHora = (iso: string, hora: string) => {
  const data = new Date(iso);
  const dia = Number.isNaN(data.getTime()) ? "Data indisponível" : data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  return hora ? `${dia} ${hora}` : dia;
};

function ResumoLiberacao({ liberacao: l }: { liberacao: GestorLiberacao }) {
  return (
    <div className="grid min-w-0 gap-4 text-sm sm:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <h2 className="break-words text-base font-bold">Liberação {l.numero}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Data: {dataHora(l.data, l.hora)}</p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground sm:block sm:space-y-1 sm:text-right">
        <p>Empresa: <span className="text-foreground">{l.empresa || "—"}</span></p>
        <p className="break-words">Solicitante: <span className="text-foreground">{l.solicitante || "—"}</span></p>
      </div>
      <div className="min-w-0 sm:col-span-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Assunto</p>
        <p className="mt-1 break-words font-medium leading-relaxed">{l.titulo}</p>
      </div>
    </div>
  );
}

export function LiberacoesTela({ pendentes, selecionada, onSelecionar, onResponder, somenteLeitura }: {
  pendentes: GestorLiberacao[] | null;
  selecionada: GestorLiberacao | null;
  onSelecionar: (liberacao: GestorLiberacao) => void;
  onResponder: (liberacao: GestorLiberacao, acao: "liberar" | "negar", justificativa?: string) => Promise<void>;
  somenteLeitura: boolean;
}) {
  const [negando, setNegando] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState<"liberar" | "negar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const responder = async (liberacao: GestorLiberacao, acao: "liberar" | "negar") => {
    if (acao === "negar" && !justificativa.trim()) {
      setErro("Informe o motivo da negação.");
      return;
    }
    setErro(null);
    setEnviando(acao);
    try {
      await onResponder(liberacao, acao, justificativa.trim());
    } catch (e) {
      setErro(e instanceof Error ? e.message.replace(/^API \d+: .*: /, "") : "Não foi possível enviar a resposta.");
    } finally {
      setEnviando(null);
    }
  };

  if (selecionada) {
    const l = pendentes?.find((item) => item.numero === selecionada.numero && item.empresa === selecionada.empresa) ?? selecionada;
    const aindaPendente = pendentes?.some((item) => item.numero === l.numero && item.empresa === l.empresa);
    return (
      <article className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <ResumoLiberacao liberacao={l} />
        {aindaPendente === false && (
          <p role="status" className="mt-4 rounded-xl bg-muted p-3 text-sm text-muted-foreground">Esta liberação não está mais na fila de pendentes.</p>
        )}
        {erro && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{erro}</p>}
        {!somenteLeitura && negando && (
          <label className="mt-5 block text-sm font-medium">
            Motivo da negação
            <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} autoFocus rows={3} maxLength={1000} placeholder="Descreva o motivo para o solicitante" className="mt-2 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
        )}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" disabled={somenteLeitura || enviando !== null} onClick={() => negando ? responder(l, "negar") : setNegando(true)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400">
            {enviando === "negar" ? <LoaderCircle className="animate-spin" size={18} /> : <X size={18} />} {negando ? "Confirmar" : "Negar"}
          </button>
          <button type="button" disabled={somenteLeitura || enviando !== null} onClick={() => responder(l, "liberar")} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 font-semibold text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-400">
            {enviando === "liberar" ? <LoaderCircle className="animate-spin" size={18} /> : <Check size={18} />} Liberar
          </button>
        </div>
        {somenteLeitura && <p id="liberacao-somente-leitura" className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <LockKeyhole size={14} className="mt-0.5 shrink-0" />
          A integração com a Citel ainda não foi configurada neste servidor.
        </p>}
        <section aria-label="Conteúdo da liberação" className="mt-6 overflow-hidden rounded-xl border border-border bg-background/50">
          {l.justificativa && (
            <div className="border-b border-border p-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Justificativa</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{l.justificativa}</p>
            </div>
          )}
          <div className="space-y-1 p-4 text-sm leading-relaxed [overflow-wrap:anywhere]">
            {l.linhas.length ? l.linhas.map((linha, i) => (
              /^\s*[-_=]{3,}\s*$/.test(linha)
                ? <hr key={i} className="my-3 border-border" />
                : <p key={i} className="whitespace-pre-wrap">{linha || "\u00a0"}</p>
            )) : <p className="text-muted-foreground">Nenhum conteúdo adicional informado.</p>}
          </div>
        </section>
        {l.historico_cobranca && <HistoricoCobranca key={`${l.empresa}:${l.numero}`} numero={l.numero} />}
      </article>
    );
  }
  if (pendentes === null) {
    return <p role="status" className="py-10 text-center text-sm text-muted-foreground">Não foi possível carregar as liberações.</p>;
  }
  if (!pendentes.length) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center">
        <CheckCircle2 className="mx-auto text-emerald-500" size={32} />
        <p className="mt-2 text-[15px] font-semibold">Nenhuma liberação pendente</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Os pedidos que travarem aparecem aqui na hora.</p>
      </div>
    );
  }
  return (
    <section aria-label="Liberações pendentes" className="space-y-3">
      <p className="mb-4 text-sm text-muted-foreground">{pendentes.length} {pendentes.length === 1 ? "liberação pendente" : "liberações pendentes"}</p>
      {pendentes.map((l) => (
        <article key={`${l.empresa}:${l.numero}`} className="relative rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500 sm:p-5">
          <ResumoLiberacao liberacao={l} />
          <button type="button" onClick={() => onSelecionar(l)} aria-label={`Ver liberação ${l.numero}`} className="mt-4 flex min-h-11 w-full items-center justify-end gap-1 border-t border-border pt-3 text-sm font-semibold text-blue-600 after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none dark:text-blue-400">
            Ver liberação <ChevronRight size={18} />
          </button>
        </article>
      ))}
    </section>
  );
}
