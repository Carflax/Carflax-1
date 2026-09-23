import { useEffect, useState } from "react";
import { Clock3, LoaderCircle } from "lucide-react";
import { apiGestorHistoricoCobranca, type GestorHistoricoCobranca } from "@/lib/api";

const data = (valor: string | null) => {
  if (!valor || valor.startsWith("0000")) return "—";
  const partes = valor.slice(0, 10).split("-");
  return partes.length === 3 ? partes.reverse().join("/") : "—";
};

export function HistoricoCobranca({ numero }: { numero: string }) {
  const [historico, setHistorico] = useState<GestorHistoricoCobranca | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativo = true;
    apiGestorHistoricoCobranca(numero).then(r => { if (ativo) setHistorico(r); })
      .catch(() => { if (ativo) setErro(true); });
    return () => { ativo = false; };
  }, [numero, tentativa]);

  return (
    <section aria-label="Histórico de cobranças" className="mt-6 border-t border-border pt-5">
      <h3 className="flex items-center gap-2 text-base font-semibold"><Clock3 size={18} className="text-blue-500" />Histórico de cobranças</h3>
      <p className="mt-1 text-xs text-muted-foreground">Registros do cliente no ERP · Mais recentes primeiro</p>
      {erro ? <div role="alert" className="mt-3 rounded-xl bg-muted p-4 text-sm">
        <p>Não foi possível consultar o histórico. Isso não significa que o cliente não tenha registros.</p>
        <button type="button" className="mt-2 min-h-11 font-semibold text-blue-600" onClick={() => { setErro(false); setHistorico(null); setTentativa(v => v + 1); }}>Tentar novamente</button>
      </div> : !historico ? <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle size={16} className="animate-spin" />Carregando histórico…</p>
        : !historico.registros.length ? <p className="mt-3 rounded-xl bg-muted p-4 text-sm text-muted-foreground">Nenhum histórico de cobrança registrado para este cliente.</p>
          : <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
            {historico.registros.map(r => <article key={r.id} className="min-w-0 rounded-2xl border border-border bg-muted/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{data(r.data)}</p>
                <span className="rounded-full bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{r.baixado === "S" ? "Baixado" : "Em aberto"}</span>
              </div>
              <p className="mt-2 break-words text-xs text-muted-foreground">{r.responsavel?.trim() || `Operador ${r.operador}`} · Empresa {r.empresa}</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{r.observacao?.trim() || "Sem observação registrada."}</p>
              {(r.agendamento || r.retorno) && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                {r.agendamento && <span>Agendamento: {data(r.agendamento)}</span>}
                {r.retorno && <span>Retorno: {data(r.retorno)}</span>}
              </div>}
            </article>)}
          </div>}
      {historico?.temMais && <p className="mt-3 text-xs text-muted-foreground">Exibindo os 50 registros mais recentes. O histórico completo está disponível no ERP.</p>}
    </section>
  );
}
