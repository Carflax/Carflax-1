import { useEffect, useState } from "react";
import { Archive, Check, X, Clock, MessageSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  decidirAprovacao,
  listarAprovacoesPendentes,
  type ArchiveApprovalRequest,
  type ArchiveApprovalUser,
} from "@/lib/archive-approval";

/**
 * Painel do supervisor: fila de conversas que o atendente pediu para arquivar
 * enquanto o cliente ainda esperava resposta. Aprovar arquiva de fato (carimbando
 * quem aprovou); recusar devolve a conversa para o atendente responder.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  aprovador: ArchiveApprovalUser;
  /** Chamado após cada decisão, para a lista de conversas refletir o arquivamento. */
  onDecidido?: (pedido: ArchiveApprovalRequest, aprovado: boolean) => void;
  /** Abre a conversa do pedido na tela do WhatsApp. */
  onAbrirConversa?: (remoteJid: string) => void;
}

function formatarEspera(pedido: ArchiveApprovalRequest): string {
  const base = pedido.ultima_mensagem_em ? new Date(pedido.ultima_mensagem_em).getTime() : null;
  const minutos = base
    ? Math.max(0, Math.round((Date.now() - base) / 60000))
    : pedido.minutos_espera || 0;

  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h ${minutos % 60}min`;
  return `${Math.floor(horas / 24)}d ${horas % 24}h`;
}

export function ArchiveApprovalModal({
  open,
  onClose,
  aprovador,
  onDecidido,
  onAbrirConversa,
}: Props) {
  const [pedidos, setPedidos] = useState<ArchiveApprovalRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [processando, setProcessando] = useState<string | null>(null);
  const [recusando, setRecusando] = useState<string | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelado = false;

    setLoading(true);
    listarAprovacoesPendentes()
      .then((lista) => {
        if (!cancelado) setPedidos(lista);
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    // Enquanto o painel está aberto, novos pedidos entram sozinhos na fila.
    const canal = supabase
      .channel("archive-approval-modal")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "marketing_arquivamento_aprovacoes" },
        () => {
          listarAprovacoesPendentes().then((lista) => {
            if (!cancelado) setPedidos(lista);
          });
        },
      )
      .subscribe();

    return () => {
      cancelado = true;
      supabase.removeChannel(canal);
    };
  }, [open]);

  if (!open) return null;

  const decidir = async (pedido: ArchiveApprovalRequest, aprovado: boolean, obs?: string) => {
    setProcessando(pedido.id);
    setErro(null);
    try {
      const ok = await decidirAprovacao(pedido, aprovado, aprovador, obs);
      setPedidos((prev) => prev.filter((p) => p.id !== pedido.id));
      if (!ok) {
        setErro("Este pedido já havia sido decidido por outro aprovador.");
        return;
      }
      onDecidido?.(pedido, aprovado);
    } catch (err) {
      console.error("[ArchiveApproval] Erro ao decidir:", err);
      setErro("Não foi possível registrar a decisão. Tente novamente.");
    } finally {
      setProcessando(null);
      setRecusando(null);
      setMotivoRecusa("");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-border/50 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-black text-base tracking-tighter uppercase leading-none flex items-center gap-2">
              <Archive className="w-4 h-4 text-amber-500" />
              Arquivamentos aguardando aprovação
            </h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              {pedidos.length === 0
                ? "Nenhum pedido pendente"
                : `${pedidos.length} conversa(s) com o cliente esperando resposta`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-xl transition-all text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {erro && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-[11px] font-bold text-rose-500">
            {erro}
          </div>
        )}

        <div className="p-6 space-y-3 overflow-y-auto">
          {loading && (
            <p className="text-xs font-bold text-muted-foreground text-center py-8">
              Carregando fila...
            </p>
          )}

          {!loading && pedidos.length === 0 && (
            <div className="text-center py-10 space-y-2">
              <Check className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="text-xs font-bold text-muted-foreground">
                Nenhuma conversa foi arquivada com o cliente esperando.
              </p>
            </div>
          )}

          {pedidos.map((pedido) => {
            const cliente = pedido.cliente_nome || pedido.remote_jid.split("@")[0];
            const ocupado = processando === pedido.id;

            return (
              <div
                key={pedido.id}
                className="border border-border/80 rounded-2xl p-4 space-y-3 bg-secondary/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-black tracking-tight truncate">{cliente}</p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <User className="w-3 h-3" />
                      {pedido.solicitante_nome || "Atendente"}
                      <span className="opacity-40">•</span>
                      <span>{pedido.motivo}</span>
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1",
                      "bg-rose-500/10 text-rose-500 border border-rose-500/20",
                    )}
                  >
                    <Clock className="w-3 h-3" />
                    {formatarEspera(pedido)}
                  </span>
                </div>

                {pedido.ultima_mensagem && (
                  <p className="text-[11px] font-semibold text-muted-foreground bg-background/60 border border-border/50 rounded-xl px-3 py-2 line-clamp-3 flex gap-2">
                    <MessageSquare className="w-3 h-3 shrink-0 mt-0.5" />
                    <span className="min-w-0">{pedido.ultima_mensagem}</span>
                  </p>
                )}

                {pedido.mensagens_nao_lidas > 0 && (
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                    {pedido.mensagens_nao_lidas} mensagem(ns) não lida(s)
                  </p>
                )}

                {recusando === pedido.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={motivoRecusa}
                      onChange={(e) => setMotivoRecusa(e.target.value)}
                      rows={2}
                      autoFocus
                      placeholder="O que o atendente deve fazer? Ex: responder o orçamento hoje ainda."
                      className="w-full bg-background border border-border/80 rounded-xl px-3 py-2 text-[11px] font-semibold text-foreground outline-none focus:border-rose-500/50 resize-none"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setRecusando(null);
                          setMotivoRecusa("");
                        }}
                        className="px-3 py-2 text-[10px] font-bold uppercase text-muted-foreground hover:bg-secondary rounded-xl transition-all"
                      >
                        Voltar
                      </button>
                      <button
                        disabled={ocupado}
                        onClick={() => decidir(pedido, false, motivoRecusa.trim() || undefined)}
                        className="px-4 py-2 text-[10px] font-black uppercase bg-rose-500 hover:bg-rose-600 text-white rounded-xl transition-all disabled:opacity-55"
                      >
                        Confirmar recusa
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      onClick={() => {
                        onAbrirConversa?.(pedido.remote_jid);
                        onClose();
                      }}
                      className="px-3 py-2 text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-all"
                    >
                      Abrir conversa
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={ocupado}
                        onClick={() => setRecusando(pedido.id)}
                        className="px-4 py-2 text-[10px] font-black uppercase border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all disabled:opacity-55"
                      >
                        Recusar
                      </button>
                      <button
                        disabled={ocupado}
                        onClick={() => decidir(pedido, true)}
                        className="px-4 py-2 text-[10px] font-black uppercase bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-all disabled:opacity-55"
                      >
                        {ocupado ? "Aprovando..." : "Aprovar"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
