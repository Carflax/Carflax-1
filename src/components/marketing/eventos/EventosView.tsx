import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, PartyPopper, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { FornecedoresTab } from "./FornecedoresTab";
import { ConvidadosTab } from "./ConvidadosTab";
import {
  type Evento, type EventoFornecedor, type EventoConvidado,
  fetchEventos, fetchFornecedores, fetchConvidados,
  formatDate, formatHora, diasAte, mensagemErro,
} from "./types";

type Aba = "fornecedores" | "convidados";

const ABAS: { k: Aba; label: string }[] = [
  { k: "fornecedores", label: "Fornecedores" },
  { k: "convidados", label: "Convidados / RSVP" },
];

// Mesma paleta dos badges de status da tela de Campanhas.
const STATUS_COLOR: Record<Evento["status"], string> = {
  planejamento: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  confirmado: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  realizado: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]",
  cancelado: "bg-secondary/40 text-muted-foreground border-border opacity-50",
};

export function EventosView() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [selecionado, setSelecionado] = useState<Evento | null>(null);
  const [aba, setAba] = useState<Aba>("fornecedores");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [fornecedores, setFornecedores] = useState<EventoFornecedor[]>([]);
  const [convidados, setConvidados] = useState<EventoConvidado[]>([]);

  const carregarEventos = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setEventos(await fetchEventos());
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarDetalhe = useCallback(async (eventoId: string) => {
    setErro(null);
    try {
      const [f, c] = await Promise.all([
        fetchFornecedores(eventoId),
        fetchConvidados(eventoId),
      ]);
      setFornecedores(f); setConvidados(c);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }, []);

  useEffect(() => { carregarEventos(); }, [carregarEventos]);

  useEffect(() => {
    if (selecionado) carregarDetalhe(selecionado.id);
  }, [selecionado, carregarDetalhe]);

  const recarregar = useCallback(() => {
    if (selecionado) carregarDetalhe(selecionado.id);
  }, [selecionado, carregarDetalhe]);

  if (loading) {
    return (
      <div className="flex-1 p-8 bg-background h-full">
        <div className="animate-pulse space-y-4 max-w-5xl">
          <div className="h-8 w-64 bg-secondary rounded-lg" />
          <div className="h-32 w-full bg-secondary/50 rounded-xl" />
          <div className="h-64 w-full bg-secondary/30 rounded-xl" />
        </div>
      </div>
    );
  }

  if (erro && !selecionado) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-background h-full">
        <div className="text-center max-w-md">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-4" />
          <h2 className="text-lg font-black text-foreground uppercase tracking-tight mb-2">Não foi possível carregar</h2>
          <p className="text-xs font-bold text-muted-foreground mb-4">{erro}</p>
          <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">
            Se a mensagem fala em tabela inexistente, as migrations de eventos ainda não foram aplicadas no banco.
          </p>
        </div>
      </div>
    );
  }

  // ── Lista de eventos ──────────────────────────────────────────────────────
  // Mesma linguagem visual da tela de Campanhas: header em caixa e grid de
  // cards 4/5 — um card por evento.
  if (!selecionado) {
    return (
      <div className="h-full flex flex-col pt-4 px-3 sm:px-6 pb-2 overflow-hidden bg-background">
        <style>{`
          @keyframes border-trace {
            0%, 100% { clip-path: inset(0 0 98% 0); }
            25%  { clip-path: inset(0 0 0 98%); }
            50%  { clip-path: inset(98% 0 0 0); }
            75%  { clip-path: inset(0 98% 0 0); }
          }
          .animate-border-trace { animation: border-trace 4s linear infinite; }
        `}</style>

        {/* Header */}
        <div className="flex items-center justify-between mb-6 shrink-0 bg-secondary/20 p-4 rounded-3xl border border-border/40">
          <div>
            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Eventos</h2>
            <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em] mt-1 opacity-70">
              Fornecedores, Convidados e Execução
            </p>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto scrollbar-hide pr-1">
          {eventos.length === 0 ? (
            <div className="bg-card border border-border rounded-[32px] py-16 text-center">
              <PartyPopper className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Nenhum evento cadastrado</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 pb-6">
              {eventos.map(ev => {
                const dias = diasAte(ev.data_evento);
                // Borda animada só no evento que ainda vai acontecer e não foi
                // cancelado — é o que merece atenção no meio da grade.
                const emDestaque = dias >= 0 && ev.status !== "cancelado";
                return (
                  <div
                    key={ev.id}
                    onClick={() => setSelecionado(ev)}
                    className={cn(
                      "aspect-[4/5] rounded-[32px] p-6 flex flex-col transition-all duration-500 cursor-pointer group relative overflow-hidden backdrop-blur-md hover:scale-[1.02]",
                      emDestaque
                        ? "border border-blue-500/30 bg-card/60 shadow-2xl shadow-blue-600/10 hover:shadow-blue-500/20"
                        : "border border-border/40 bg-card/40 shadow-lg hover:shadow-2xl hover:border-blue-500/30"
                    )}
                  >
                    {emDestaque && (
                      <div className="absolute inset-0 z-0 pointer-events-none">
                        <div className="absolute inset-0 border-2 border-blue-500 rounded-[32px] animate-border-trace opacity-40 shadow-[0_0_15px_rgba(59,130,246,0.2)]" />
                        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/5 via-blue-600/5 to-transparent" />
                      </div>
                    )}

                    {/* Contador no topo, como o "Ver Ranking" das campanhas */}
                    <div className="relative z-10 flex justify-end mb-2">
                      {dias >= 0 && (
                        <span className="text-[8px] font-black text-blue-500 uppercase tracking-[0.15em] opacity-80">
                          {dias === 0 ? "É hoje!" : `Faltam ${dias} dias`}
                        </span>
                      )}
                    </div>

                    {/* Bloco visual */}
                    <div className="flex-1 bg-secondary/30 rounded-[24px] p-4 flex flex-col items-center justify-center border border-border/20 mb-4 transition-all group-hover:bg-blue-500/5 group-hover:rotate-1 relative overflow-hidden group-hover:border-blue-500/20 z-10">
                      <div className="w-16 h-16 rounded-[24px] bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center shadow-2xl shadow-blue-600/40 group-hover:scale-110 transition-all duration-700 group-hover:rotate-6 mb-2">
                        <PartyPopper className="w-8 h-8 text-white" />
                      </div>
                      <span className="text-2xl font-black text-foreground tracking-tighter leading-none">
                        {formatDate(ev.data_evento).slice(0, 5)}
                      </span>
                      {ev.hora_inicio && (
                        <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-1">
                          {formatHora(ev.hora_inicio)} às {formatHora(ev.hora_fim)}
                        </span>
                      )}
                    </div>

                    {/* Identificação */}
                    <div className="space-y-2 relative z-10">
                      <h3 className="text-[11px] font-black text-foreground truncate uppercase tracking-tight group-hover:text-blue-500 transition-colors">
                        {ev.nome}
                      </h3>
                      {ev.local && (
                        <p className="text-[9px] font-bold text-muted-foreground tracking-widest leading-none border-l-2 border-blue-500/30 pl-2 truncate">
                          {ev.local}
                        </p>
                      )}
                      <div className="pt-1">
                        <span className={cn("inline-flex px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all", STATUS_COLOR[ev.status])}>
                          {ev.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Detalhe do evento ─────────────────────────────────────────────────────
  return (
    <div className="flex-1 p-6 lg:p-8 bg-background h-full overflow-y-auto">
      {/* Top Header: Voltar + Nome do Evento + Abas */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-border/40">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setSelecionado(null)}
            className="flex items-center gap-1 text-[10px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" /> Todos os eventos
          </button>
          <span className="text-border shrink-0">|</span>
          <h1 className="text-sm sm:text-base font-black text-foreground uppercase tracking-tight truncate">
            {selecionado.nome}
          </h1>
        </div>

        {/* Abas */}
        <div className="flex items-center gap-2">
          {ABAS.map(a => (
            <button
              key={a.k}
              onClick={() => setAba(a.k)}
              className={cn(
                "px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full border transition-all",
                aba === a.k
                  ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground bg-secondary/30"
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {erro && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 rounded-xl px-4 py-3 mb-4">
          <span className="text-xs font-bold text-rose-700 dark:text-rose-300">{erro}</span>
        </div>
      )}

      {aba === "fornecedores" && <FornecedoresTab evento={selecionado} fornecedores={fornecedores} onChange={recarregar} />}
      {aba === "convidados" && <ConvidadosTab evento={selecionado} convidados={convidados} onChange={recarregar} />}
    </div>
  );
}
