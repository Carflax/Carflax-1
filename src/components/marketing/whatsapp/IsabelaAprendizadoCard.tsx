import { useCallback, useEffect, useState } from "react";
import { Check, GraduationCap, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useNotification } from "@/hooks/useNotification";
import { formatBrDate, formatBrTime } from "@/lib/utils";
import {
  analisarConversasIsabela,
  aprovarAprendizado,
  carregarAprendizados,
  descartarAprendizado,
  type IsabelaAprendizado,
} from "@/lib/isabela";

// Aprendizado com as conversas dos vendedores: o backend analisa conversas que
// viraram venda (e as que pararam no orçamento) e gera um guia. O guia só entra
// no atendimento da Isabela depois de revisado e aprovado aqui.

const INTERVALO_STATUS_MS = 5000;

const quando = (iso: string) => `${formatBrDate(iso)} ${formatBrTime(iso)}`;

export function IsabelaAprendizadoCard({ autor }: { autor: string | null }) {
  const { showNotification } = useNotification();
  const [aprovado, setAprovado] = useState<IsabelaAprendizado | null>(null);
  const [ultimo, setUltimo] = useState<IsabelaAprendizado | null>(null);
  const [texto, setTexto] = useState("");
  const [acao, setAcao] = useState<"analisar" | "aprovar" | "descartar" | null>(null);
  const [verAprovado, setVerAprovado] = useState(false);

  const recarregar = useCallback(async () => {
    const r = await carregarAprendizados();
    setAprovado(r.aprovado);
    setUltimo(r.pendente);
    setTexto(r.pendente?.conteudo ?? "");
    return r.pendente;
  }, []);

  useEffect(() => {
    recarregar().catch(() => null);
  }, [recarregar]);

  // Enquanto a análise roda no servidor (1–3 min), confere o status.
  const processando = ultimo?.status === "processando";
  useEffect(() => {
    if (!processando) return;
    const timer = setInterval(() => {
      recarregar()
        .then((p) => {
          if (p?.status === "rascunho") showNotification("success", "Guia pronto", "Revise o texto e aprove para o Carlinhos usar.");
          if (p?.status === "erro") showNotification("error", "A análise falhou", p.erro || "Tente de novo.");
        })
        .catch(() => null);
    }, INTERVALO_STATUS_MS);
    return () => clearInterval(timer);
  }, [processando, recarregar, showNotification]);

  const analisar = async () => {
    setAcao("analisar");
    try {
      await analisarConversasIsabela(autor);
      await recarregar();
    } catch (e) {
      showNotification("error", "Não foi possível iniciar a análise", (e as Error).message);
    } finally {
      setAcao(null);
    }
  };

  const aprovar = async () => {
    if (!ultimo) return;
    setAcao("aprovar");
    try {
      await aprovarAprendizado(ultimo.id, texto, autor);
      await recarregar();
      showNotification("success", "Guia aprovado", "O Carlinhos já passa a atender com ele.");
    } catch (e) {
      showNotification("error", "Erro ao aprovar", (e as Error).message);
    } finally {
      setAcao(null);
    }
  };

  const descartar = async () => {
    if (!ultimo) return;
    setAcao("descartar");
    try {
      await descartarAprendizado(ultimo.id);
      await recarregar();
    } catch (e) {
      showNotification("error", "Erro ao descartar", (e as Error).message);
    } finally {
      setAcao(null);
    }
  };

  const rotulo = "block text-[10px] font-black uppercase tracking-widest text-muted-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <GraduationCap className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold">Aprendizado com os vendedores</p>
            <p className="text-[11px] text-muted-foreground">
              Analisa as conversas que viraram venda e as que pararam no orçamento e monta um guia de como a equipe atende. Só vale depois que você aprovar.
            </p>
          </div>
        </div>
        <button
          onClick={analisar}
          disabled={acao !== null || processando}
          className="h-9 px-3 rounded-lg border border-border bg-background hover:bg-secondary text-xs font-bold flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40"
        >
          {acao === "analisar" || processando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {processando ? "Analisando…" : "Analisar conversas"}
        </button>
      </div>

      {/* Guia em uso */}
      <div className="rounded-xl bg-secondary/40 px-3 py-2.5 text-xs">
        {aprovado ? (
          <div className="flex items-center justify-between gap-3">
            <span>
              <b>Em uso:</b> aprovado em {quando(aprovado.aprovado_em || aprovado.updated_at)}
              {aprovado.aprovado_por ? ` por ${aprovado.aprovado_por}` : ""} · {aprovado.conversas_venda} vendas analisadas
            </span>
            <button onClick={() => setVerAprovado((v) => !v)} className="font-bold text-violet-600 dark:text-violet-400 whitespace-nowrap">
              {verAprovado ? "Esconder" : "Ver guia"}
            </button>
          </div>
        ) : (
          <span className="text-muted-foreground">Nenhum guia aprovado: o Carlinhos atende só com o comportamento padrão.</span>
        )}
        {verAprovado && aprovado?.conteudo && (
          <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed max-h-72 overflow-y-auto">{aprovado.conteudo}</p>
        )}
      </div>

      {processando && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Lendo as conversas e montando o guia. Leva de 1 a 3 minutos; pode sair desta tela.
        </p>
      )}

      {ultimo?.status === "erro" && <p className="text-xs text-destructive">A última análise falhou: {ultimo.erro}</p>}

      {ultimo?.status === "rascunho" && (
        <div className="space-y-2">
          <span className={rotulo}>
            Novo guia para revisar · {ultimo.conversas_venda} vendas e {ultimo.conversas_sem_venda} orçamentos sem venda · {quando(ultimo.created_at)}
          </span>
          <p className="text-[11px] text-muted-foreground">
            Leia antes de aprovar e apague o que não for jeito da Carflax. Regras como não dar desconto continuam valendo mesmo se aparecerem aqui.
          </p>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={14}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs leading-relaxed outline-none focus:border-violet-500 resize-y"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={descartar}
              disabled={acao !== null}
              className="h-9 px-3 rounded-lg border border-border hover:bg-secondary text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
            >
              {acao === "descartar" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Descartar
            </button>
            <button
              onClick={aprovar}
              disabled={acao !== null || !texto.trim()}
              className="h-9 px-4 rounded-lg bg-violet-600 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
            >
              {acao === "aprovar" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Aprovar e usar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
