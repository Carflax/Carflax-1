import { useEffect, useState } from "react";
import { Bot, Loader2, Pause, Play } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/hooks/useNotification";
import { carregarConversaIsabela, mudarStatusIsabela, type IsabelaConversa } from "@/lib/isabela";

// Faixa no topo da conversa quando a Isabela participou dela: mostra se ela está
// atendendo, se transferiu (e por quê) ou se foi pausada, e deixa pausar/reativar.
// Responder pelo HUB já tira a Isabela da conversa sozinho (o backend vê a
// mensagem do vendedor), então "Pausar" serve para quem só quer ler antes.

const TEXTOS: Record<IsabelaConversa["status"], string> = {
  ativa: "Isabela está atendendo esta conversa",
  transferida: "Isabela passou esta conversa para atendimento",
  assumida: "Um vendedor assumiu esta conversa",
  pausada: "Isabela pausada nesta conversa",
};

export function IsabelaConversaStatus({ remoteJid }: { remoteJid: string }) {
  const { showNotification } = useNotification();
  const [conversa, setConversa] = useState<IsabelaConversa | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [nomeVendedor, setNomeVendedor] = useState<string | null>(null);
  const transferidaPara = conversa?.transferida_para ?? null;

  useEffect(() => {
    if (!transferidaPara) return;
    let ativo = true;
    supabase
      .from("usuarios")
      .select("name")
      .eq("id", transferidaPara)
      .maybeSingle()
      .then(({ data }) => { if (ativo) setNomeVendedor(data?.name ?? null); });
    return () => { ativo = false; };
  }, [transferidaPara]);

  useEffect(() => {
    let ativo = true;
    carregarConversaIsabela(remoteJid).then((c) => { if (ativo) setConversa(c); });

    const canal = supabase
      .channel(`isabela-${remoteJid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "isabela_conversas", filter: `remote_jid=eq.${remoteJid}` },
        (payload) => { if (ativo) setConversa((payload.new as IsabelaConversa) ?? null); },
      )
      .subscribe((status) => {
        // Canal caiu: relê para não mostrar status velho (ver whatsapp-realtime-tela).
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          carregarConversaIsabela(remoteJid).then((c) => { if (ativo) setConversa(c); });
        }
      });

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [remoteJid]);

  if (!conversa) return null;

  const alternar = async () => {
    const novo = conversa.status === "ativa" ? "pausada" : "ativa";
    setSalvando(true);
    try {
      await mudarStatusIsabela(remoteJid, novo);
      setConversa({ ...conversa, status: novo });
    } catch (e) {
      showNotification("error", "Não foi possível alterar a Isabela", (e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const atendendo = conversa.status === "ativa";

  return (
    <div
      className={`shrink-0 flex items-center gap-3 px-4 py-2 border-b text-[11px] ${
        atendendo ? "bg-violet-500/10 border-violet-500/20" : "bg-secondary/60 border-border"
      }`}
    >
      <Bot className={`w-4 h-4 shrink-0 ${atendendo ? "text-violet-500" : "text-muted-foreground"}`} />
      <div className="min-w-0 flex-1">
        <p className="font-bold truncate">
          {TEXTOS[conversa.status]}
          {conversa.status === "transferida" && transferidaPara && nomeVendedor ? ` (${nomeVendedor})` : ""}
          {conversa.status === "transferida" && conversa.motivo_transferencia ? `: ${conversa.motivo_transferencia}` : ""}
        </p>
        {conversa.ultimo_erro && atendendo && (
          <p className="text-destructive truncate" title={conversa.ultimo_erro}>Última tentativa falhou — responda o cliente.</p>
        )}
      </div>
      <button
        onClick={alternar}
        disabled={salvando}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-secondary font-bold whitespace-nowrap disabled:opacity-50"
        title={atendendo ? "A Isabela para de responder esta conversa" : "A Isabela volta a responder esta conversa"}
      >
        {salvando ? <Loader2 className="w-3 h-3 animate-spin" /> : atendendo ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
        {atendendo ? "Pausar" : "Reativar"}
      </button>
    </div>
  );
}
