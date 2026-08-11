import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Send,
  Loader2,
  Database,
  MessageSquareText,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  chatClienteKnowledge,
  type ClienteKnowledgeMessage,
} from "@/lib/gemini-service";
import type { CarteiraCliente } from "@/lib/api";

interface Props {
  cliente: CarteiraCliente;
  userName?: string;
  userAvatar?: string;
  onClose: () => void;
}

interface StoredData {
  historico: ClienteKnowledgeMessage[];
  dados_extraidos: Record<string, unknown>;
  dados_cadcli: Record<string, unknown>;
}

function Avatar({ src, fallback, size = "sm" }: { src?: string; fallback: string; size?: "sm" | "md" }) {
  const s = size === "sm" ? "w-9 h-9" : "w-10 h-10";
  const text = size === "sm" ? "text-[10px]" : "text-xs";
  if (src) {
    return <img src={src} alt="" className={`${s} rounded-full object-cover ring-2 ring-primary/30 shadow-xs shrink-0`} />;
  }
  const initials = fallback.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={`${s} rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary flex items-center justify-center ${text} font-black ring-2 ring-primary/25 shadow-xs shrink-0`}>
      {initials || "V"}
    </div>
  );
}

export function ClienteKnowledgeChat({ cliente, userName, userAvatar, onClose }: Props) {
  const [messages, setMessages] = useState<ClienteKnowledgeMessage[]>([]);
  const [dadosExtraidos, setDadosExtraidos] = useState<Record<string, unknown>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showJson, setShowJson] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const dadosCadcli = useMemo<Record<string, unknown>>(
    () => ({
      codigo: cliente.cliente_id,
      nome: cliente.nome_cliente,
      empresa: cliente.empresa,
      vendedor_codigo: cliente.cod_vendedor,
      vendedor_nome: cliente.nome_vendedor,
      ultima_compra: cliente.ultima_compra,
      pedidos_mes: cliente.pedidos_mes,
      valor_mes: cliente.valor_mes,
      margem_mes: cliente.margem_mes,
      telefone: cliente.telefone_cliente,
      celular: cliente.celular,
      pessoa_fisica: cliente.pessoa_fisica,
      data_nascimento: cliente.data_nascimento,
      vendedor_ultima_venda: cliente.nome_vendedor_ultima_venda,
    }),
    [cliente],
  );

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("cliente_conhecimento")
        .select("historico, dados_extraidos, dados_cadcli")
        .eq("cliente_id", cliente.cliente_id)
        .eq("empresa", cliente.empresa)
        .single();

      if (data) {
        setMessages(data.historico || []);
        setDadosExtraidos(data.dados_extraidos || {});
      }
    } catch {
      // No record yet
    } finally {
      setInitialLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [cliente.cliente_id, cliente.empresa]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const saveToSupabase = useCallback(
    async (
      msgs: ClienteKnowledgeMessage[],
      extracted: Record<string, unknown>,
    ) => {
      const row: StoredData & { cliente_id: string; empresa: string; updated_at: string } = {
        cliente_id: cliente.cliente_id,
        empresa: cliente.empresa,
        historico: msgs,
        dados_extraidos: extracted,
        dados_cadcli: dadosCadcli,
        updated_at: new Date().toISOString(),
      };

      await supabase
        .from("cliente_conhecimento")
        .upsert(row, { onConflict: "cliente_id,empresa" });
    },
    [cliente.cliente_id, cliente.empresa, dadosCadcli],
  );

  function extractJson(text: string): Record<string, unknown> | null {
    if (!text) return null;
    const matchBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (matchBlock) {
      try {
        const parsed = JSON.parse(matchBlock[1].trim());
        if (typeof parsed === "object" && parsed !== null) return parsed;
      } catch {
        // continue
      }
    }
    const matchObj = text.match(/\{[\s\S]*?\}/);
    if (matchObj) {
      try {
        const parsed = JSON.parse(matchObj[0].trim());
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed;
      } catch {
        // continue
      }
    }
    return null;
  }

  function cleanResponse(text: string): string {
    if (!text) return "";
    const cleaned = text
      .replace(/```(?:json)?\s*[\s\S]*?```/gi, "")
      .replace(/\{[\s\S]*?\}/gi, (match) => {
        try {
          const parsed = JSON.parse(match.trim());
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            return "";
          }
        } catch {
          // not JSON, keep text
        }
        return match;
      });
    return cleaned.replace(/\n\s*\n/g, "\n").trim();
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ClienteKnowledgeMessage = {
      role: "user",
      text,
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      const response = await chatClienteKnowledge(
        newMessages,
        dadosCadcli,
        dadosExtraidos,
      );

      const extracted = extractJson(response);
      const updatedExtracted = extracted
        ? { ...dadosExtraidos, ...extracted }
        : dadosExtraidos;

      const modelMsg: ClienteKnowledgeMessage = {
        role: "model",
        text: cleanResponse(response),
        timestamp: new Date().toISOString(),
      };

      const finalMessages = [...newMessages, modelMsg];
      setMessages(finalMessages);
      setDadosExtraidos(updatedExtracted);
      if (extracted && Object.keys(extracted).length > 0) {
        setShowJson(true);
      }
      await saveToSupabase(finalMessages, updatedExtracted);
    } catch (err) {
      console.error("[KnowledgeChat] Erro:", err);
      const errorMsg: ClienteKnowledgeMessage = {
        role: "model",
        text: "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function formatTime(ts: string) {
    try {
      return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Overlay Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Main Container Wrapper */}
      <div className="relative flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-4 w-full max-w-7xl max-h-[90vh] z-10 transition-all duration-300">
        
        {/* Chat Modal (Fixed width max-w-2xl shrink-0 to NEVER shrink) */}
        <div
          className="bg-card border border-border/80 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] w-full max-w-2xl shrink-0 flex flex-col max-h-[90vh] animate-in zoom-in-95 fade-in duration-300 overflow-hidden"
          style={{ minHeight: "560px" }}
        >
          {/* Header */}
          <div className="flex items-center gap-4 px-6 py-4.5 border-b border-border/50 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
            <div className="w-11 h-11 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shadow-xs shrink-0">
              <MessageSquareText className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-black text-base text-foreground truncate leading-tight">
                {cliente.nome_cliente}
              </h2>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                {cliente.empresa} · Conhecimento do Cliente
              </p>
            </div>

            {/* Toggle Side Panel Button */}
            <button
              onClick={() => setShowJson((v) => !v)}
              title={showJson ? "Ocultar painel de dados" : "Ver dados salvos"}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                showJson
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/50"
              }`}
            >
              <Database className="w-4 h-4" />
              <span className="hidden sm:inline">Dados</span>
              {Object.keys(dadosExtraidos).length > 0 && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                  showJson ? "bg-white/20 text-white" : "bg-primary/20 text-primary"
                }`}>
                  {Object.keys(dadosExtraidos).length}
                </span>
              )}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-muted/60 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Messages Feed */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5 scrollbar-thin">
            {initialLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2 className="w-7 h-7 animate-spin text-primary/60" />
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Carregando histórico…</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-xs mb-4">
                  <MessageSquareText className="w-8 h-8 text-primary" />
                </div>
                <div className="space-y-1.5 max-w-md mx-auto flex flex-col items-center text-center px-4">
                  <h3 className="text-base font-black text-foreground leading-snug">
                    Conhecimento do Cliente
                  </h3>
                  <p className="text-xs font-bold text-primary truncate max-w-full">
                    {cliente.nome_cliente}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed pt-1 max-w-[400px]">
                    Registre informações estratégicas sobre este cliente: decisores de compras, preferências, hábitos e concorrentes.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  {m.role === "user" ? (
                    <Avatar src={userAvatar} fallback={userName || cliente.nome_vendedor || "V"} />
                  ) : (
                    <div className="w-9 h-9 rounded-2xl flex-shrink-0 flex items-center justify-center bg-primary/15 text-primary ring-2 ring-primary/25 shadow-xs">
                      <MessageSquareText className="w-4.5 h-4.5 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[78%] flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                    <div
                      className={`rounded-2xl px-4.5 py-3 text-[13px] leading-relaxed ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-xs shadow-xs"
                          : "bg-muted/70 border border-border/50 text-foreground rounded-tl-xs shadow-xs backdrop-blur-sm"
                      }`}
                    >
                      {m.role === "model" ? cleanResponse(m.text) : m.text}
                    </div>
                    <span className="text-[9px] font-medium text-muted-foreground/60 mt-1 px-1">
                      {formatTime(m.timestamp)}
                    </span>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-2xl flex-shrink-0 flex items-center justify-center bg-primary/15 text-primary ring-2 ring-primary/25 shadow-xs">
                  <MessageSquareText className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="bg-muted/70 rounded-2xl rounded-tl-xs px-4.5 py-3.5 border border-border/50 shadow-xs">
                  <div className="flex gap-1.5 items-center">
                    <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Form Input Area */}
          <div className="px-5 py-4 border-t border-border/50 bg-gradient-to-b from-transparent to-muted/30">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-3"
            >
              <Avatar src={userAvatar} fallback={userName || cliente.nome_vendedor || "Vendedor"} size="sm" />
              <div className="flex-1 relative flex items-center bg-card/80 border border-border/70 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 rounded-2xl transition-all shadow-xs">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Digite uma informação sobre o cliente..."
                  disabled={loading}
                  rows={1}
                  className="w-full bg-transparent pl-4 pr-12 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none disabled:opacity-50 transition-all resize-none leading-normal"
                  style={{ minHeight: "44px" }}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="absolute right-2 w-8.5 h-8.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-[0_4px_12px_rgba(37,99,235,0.3)] hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:scale-100 disabled:shadow-none shrink-0"
                  style={{ top: "50%", transform: "translateY(-50%)" }}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Side Panel: Extracted JSON Data */}
        {showJson && (
          <div className="w-full lg:w-[360px] shrink-0 bg-card border border-border/80 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-left-6 fade-in duration-300">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-gradient-to-r from-blue-600/10 via-indigo-600/5 to-transparent">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-xs uppercase tracking-wider text-foreground">
                    Dados Registrados
                  </h3>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                    Conhecimento do Cliente
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowJson(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                title="Fechar painel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
              {Object.keys(dadosExtraidos).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground space-y-2">
                  <Database className="w-8 h-8 opacity-30" />
                  <p className="text-xs font-bold uppercase tracking-wider">Nenhum dado extraído ainda</p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                    Conforme você conversa com o assistente, informações como compradores, preferências e concorrentes serão organizadas aqui.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {Object.entries(dadosExtraidos).map(([key, val]) => (
                      <div key={key} className="p-3.5 rounded-2xl bg-muted/40 border border-border/40 space-y-1.5 relative overflow-hidden group hover:border-primary/30 transition-all">
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary block">
                          {key.replace(/_/g, " ")}
                        </span>
                        {Array.isArray(val) ? (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {val.map((item, idx) => (
                              <span key={idx} className="px-2.5 py-1 rounded-xl bg-primary/15 text-foreground border border-primary/25 text-xs font-bold shadow-2xs">
                                {String(item)}
                              </span>
                            ))}
                          </div>
                        ) : typeof val === "object" && val !== null ? (
                          <pre className="text-[11px] font-mono text-foreground/90 whitespace-pre-wrap bg-background/50 rounded-xl p-2.5 border border-border/30">{JSON.stringify(val, null, 2)}</pre>
                        ) : (
                          <p className="text-xs font-bold text-foreground break-words">
                            {String(val)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-border/40">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                      Estrutura JSON Completa
                    </p>
                    <pre className="text-[11px] font-mono text-emerald-400 bg-slate-950/80 rounded-2xl p-4 overflow-x-auto whitespace-pre-wrap break-words border border-white/10 max-h-60 scrollbar-thin">
                      {JSON.stringify(dadosExtraidos, null, 2)}
                    </pre>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
