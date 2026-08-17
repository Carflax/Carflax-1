import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Send,
  Loader2,
  Database,
  MessageSquareText,
  Bell,
  Zap,
  Phone,
  MapPin,
  FileText,
  CheckCheck,
  Upload,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  chatClienteKnowledge,
  summarizeConversation,
  needsErpData,
  transcribeAudio,
  SUMMARY_THRESHOLD,
  type ClienteKnowledgeMessage,
} from "@/lib/gemini-service";
import { blobParaWavBase64 } from "@/lib/audio-wav";
import type { CarteiraCliente } from "@/lib/api";
import { apiMixCliente, apiHistoricoCliente, apiProdutosCliente } from "@/lib/api";

interface Props {
  cliente: CarteiraCliente;
  userName?: string;
  userAvatar?: string;
  initialPrompt?: string;
  onClose: () => void;
}


interface ProximaAcao {
  descricao: string;
  tipo: "ligação" | "visita" | "proposta" | "outro";
}

interface Lembrete {
  descricao: string;
  data_iso: string | null;
  prazo_texto: string;
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

export function ClienteKnowledgeChat({ cliente, userName, userAvatar, initialPrompt, onClose }: Props) {
  const [messages, setMessages] = useState<ClienteKnowledgeMessage[]>([]);
  const [dadosExtraidos, setDadosExtraidos] = useState<Record<string, unknown>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<"citel" | "ia" | null>(null);
  const [loadingTextIdx, setLoadingTextIdx] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showJson, setShowJson] = useState(false);
  const [proximaAcao, setProximaAcao] = useState<ProximaAcao | null>(null);
  const [lembrete, setLembrete] = useState<Lembrete | null>(null);
  const [lembreteConfirmado, setLembreteConfirmado] = useState(false);
  const [resumo, setResumo] = useState<string | null>(null);
  const [escutando, setEscutando] = useState(false);
  const [erroAudio, setErroAudio] = useState<string | null>(null);
  const dadosErpRef = useRef<Record<string, unknown>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Teto de duração: 1 min de WAV 16 kHz mono ≈ 1,9 MB, e o envio é inline no
  // corpo da request. 10 min já passa do que vale mandar de uma vez.
  const MAX_MINUTOS_AUDIO = 10;

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
    // 1) Supabase history — fast, controls the loading spinner
    try {
      const { data } = await supabase
        .from("cliente_conhecimento")
        .select("historico, dados_extraidos, dados_cadcli, resumo")
        .eq("cliente_id", cliente.cliente_id)
        .eq("empresa", cliente.empresa)
        .maybeSingle();

      if (data) {
        setMessages(data.historico || []);
        setDadosExtraidos(data.dados_extraidos || {});
        if (data.resumo) setResumo(data.resumo);
      }
    } catch {
      // No record yet
    }
    setInitialLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [cliente.cliente_id, cliente.empresa]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Uma oportunidade do Radar abre o chat já com uma pergunta útil, mas sem
  // disparar IA automaticamente: o vendedor continua no controle do envio.
  useEffect(() => {
    if (!initialLoading && messages.length === 0 && initialPrompt) {
      setInput(initialPrompt);
    }
  }, [initialLoading, initialPrompt, messages.length]);

  const LOADING_CITEL = [
    "Buscando dados na Citel...",
    "Consultando mix de marcas...",
    "Carregando histórico de compras...",
    "Verificando produtos recentes...",
  ];
  const LOADING_IA = [
    "Analisando com IA...",
    "Interpretando os dados...",
    "Montando a resposta...",
  ];
  const LOADING_AUDIO = [
    "Escutando o áudio...",
    "Entendendo o que foi dito...",
    "Separando as informações...",
  ];

  useEffect(() => {
    if (!loading && !escutando) { setLoadingTextIdx(0); return; }
    const interval = setInterval(() => {
      setLoadingTextIdx((prev) => prev + 1);
    }, 2200);
    return () => clearInterval(interval);
  }, [loading, loadingStep, escutando]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, escutando]);

  const saveToSupabase = useCallback(
    async (
      msgs: ClienteKnowledgeMessage[],
      extracted: Record<string, unknown>,
      savedResumo?: string | null,
    ) => {
      const row: Record<string, unknown> = {
        cliente_id: cliente.cliente_id,
        empresa: cliente.empresa,
        historico: msgs,
        dados_extraidos: extracted,
        dados_cadcli: dadosCadcli,
        updated_at: new Date().toISOString(),
      };
      if (savedResumo !== undefined) row.resumo = savedResumo;

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

  async function fetchErpData() {
    try {
      const [mixResult, histResult, prodResult] = await Promise.allSettled([
        apiMixCliente(cliente.cliente_id),
        apiHistoricoCliente(cliente.cliente_id),
        apiProdutosCliente(cliente.cliente_id),
      ]);

      const erp: Record<string, unknown> = {};
      if (mixResult.status === "fulfilled") {
        const marcas = mixResult.value.marcas || [];
        erp.mix_marcas = marcas.slice(0, 20).map((m) => ({
          marca: m.marca,
          valor_12m: m.valor_atual,
          pedidos: m.pedidos_atual,
          status: m.status,
          variacao: `${m.variacao_pct > 0 ? "+" : ""}${m.variacao_pct.toFixed(0)}%`,
        }));
      }
      if (histResult.status === "fulfilled") {
        erp.historico_anual = histResult.value.anos || [];
        erp.eventos_timeline = histResult.value.eventos || [];
      }
      if (prodResult.status === "fulfilled") {
        erp.produtos_comprados = (prodResult.value.produtos || []).map((p) => ({
          codigo: p.codigo,
          descricao: p.descricao,
          marca: p.marca,
          qtd: p.qtd_total,
          valor: p.valor_total,
          pedidos: p.pedidos,
        }));
      }
      dadosErpRef.current = erp;
    } catch {
      // ERP optional
    }
  }

  async function handleSend(textOverride?: string) {
    const text = (textOverride ?? input).trim();
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
      // --- ERP sob demanda: só busca se a pergunta precisa ---
      const erpNotCached = Object.keys(dadosErpRef.current).length === 0;
      if (erpNotCached && needsErpData(text)) {
        setLoadingStep("citel");
        await fetchErpData();
      }

      // --- Resumo automático: compacta conversas longas ---
      let currentResumo = resumo;
      const MAX_MSGS_TO_AI = 16;
      let messagesToSend = newMessages;

      if (newMessages.length > SUMMARY_THRESHOLD) {
        const toSummarize = newMessages.slice(0, newMessages.length - MAX_MSGS_TO_AI);
        const toKeep = newMessages.slice(newMessages.length - MAX_MSGS_TO_AI);
        try {
          const newResumo = currentResumo
            ? `${currentResumo}\n\n--- Atualização ---\n${(await summarizeConversation(toSummarize)).trim()}`
            : await summarizeConversation(toSummarize);
          currentResumo = newResumo;
          setResumo(newResumo);
        } catch {
          // summary is optional
        }
        messagesToSend = toKeep;
      }

      setLoadingStep("ia");
      setLoadingTextIdx(0);
      const response = await chatClienteKnowledge(
        messagesToSend,
        { ...dadosCadcli, ...dadosErpRef.current },
        dadosExtraidos,
        currentResumo || undefined,
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

      const cleanedExtracted = { ...updatedExtracted };
      if (extracted?.__proxima_acao) {
        setProximaAcao(extracted.__proxima_acao as ProximaAcao);
        delete cleanedExtracted.__proxima_acao;
      }
      if (extracted?.__lembrete) {
        const lembreteData = extracted.__lembrete as Lembrete;
        setLembrete(lembreteData);
        setLembreteConfirmado(false);
        delete cleanedExtracted.__lembrete;
        supabase.from("cliente_lembretes").insert({
          cliente_id: cliente.cliente_id,
          empresa: cliente.empresa,
          descricao: lembreteData.descricao,
          data_iso: lembreteData.data_iso,
          prazo_texto: lembreteData.prazo_texto,
          nome_cliente: cliente.nome_cliente,
          created_at: new Date().toISOString(),
        }).then(({ error }) => {
          if (error) console.error("[Lembrete] Erro ao salvar:", error);
        });
      }

      setDadosExtraidos(cleanedExtracted);

      // Save with trimmed history if summarized
      if (newMessages.length > SUMMARY_THRESHOLD) {
        const trimmedFinal = finalMessages.slice(finalMessages.length - MAX_MSGS_TO_AI);
        await saveToSupabase(trimmedFinal, cleanedExtracted, currentResumo);
      } else {
        await saveToSupabase(finalMessages, cleanedExtracted);
      }
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
    setLoadingStep(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  /**
   * Upload de áudio → transcrição → mensagem no chat, sem passar pelo campo de
   * digitação. O vendedor sobe o áudio da visita e a IA responde dizendo o que
   * entendeu e o que registrou; a transcrição entra como a mensagem dele, então
   * ele consegue conferir se a IA ouviu certo olhando o próprio balão.
   *
   * Função comum (não useCallback) de propósito: precisa enxergar o handleSend
   * do render atual, com as mensagens atuais.
   */
  async function enviarAudio(file: File) {
    if (loading || escutando) return;
    setEscutando(true);
    setErroAudio(null);
    try {
      // Normaliza qualquer formato que o navegador saiba decodificar (ogg do
      // WhatsApp, m4a do iPhone, mp3, webm) para WAV — o Gemini não aceita
      // webm nem m4a, e o áudio do vendedor pode vir de qualquer lugar.
      const { base64, duracaoSegundos } = await blobParaWavBase64(file);

      if (duracaoSegundos > MAX_MINUTOS_AUDIO * 60) {
        setErroAudio(
          `Áudio de ${Math.round(duracaoSegundos / 60)} min — o limite é ${MAX_MINUTOS_AUDIO} min. Divida em partes.`,
        );
        return;
      }

      const texto = (await transcribeAudio(base64, "audio/wav")).trim();

      if (!texto || texto.includes("[Sem áudio detectado]")) {
        setErroAudio("Não consegui entender o áudio. Confira se há fala no arquivo.");
        return;
      }

      setEscutando(false);
      await handleSend(texto);
    } catch {
      setErroAudio("Falha ao ler o áudio. Formatos aceitos: mp3, ogg, m4a, wav, opus.");
    } finally {
      setEscutando(false);
    }
  }

  function gerarOportunidade() {
    if (loading) return;
    void handleSend("Analise o histórico deste cliente e identifique a melhor oportunidade de recompra. Informe o motivo, produtos ou categorias prováveis, urgência e escreva uma mensagem curta e personalizada para WhatsApp.");
  }

  function legacyFormatModelText(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-foreground">$1</strong>')
      .replace(/^\s*(\d+)\.\s+/gm, '<br/><span class="text-primary font-black mr-1">$1.</span> ')
      .replace(/^\s*[-•]\s+/gm, '<br/><span class="text-primary mr-1">•</span> ')
      .replace(/\n/g, "<br/>")
      .replace(/^(<br\/>)+/, "");
  }

  function formatModelText(text: string): string {
    const sections = ["Motivo da Recompra", "Produtos ou Categorias Prováveis", "Urgência", "Mensagem para WhatsApp"];
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    let html = "";
    let open = false;

    for (const rawLine of lines) {
      const title = rawLine.replace(/^\*\*|\*\*:?$/g, "").replace(/:$/, "").trim();
      if (sections.includes(title)) {
        if (open) html += "</div></section>";
        const accent = title === "Urgência" ? "amber" : title === "Mensagem para WhatsApp" ? "emerald" : title === "Produtos ou Categorias Prováveis" ? "blue" : "violet";
        html += `<section class="rounded-xl border border-${accent}-500/25 bg-${accent}-500/5 p-3.5 mt-3"><p class="text-[9px] font-black uppercase tracking-widest text-${accent}-400 mb-2">${title}</p><div class="space-y-2 text-[12px] leading-relaxed text-foreground/90">`;
        open = true;
        continue;
      }
      const line = rawLine
        .replace(/\*\*(.+?)\*\*/g, '<strong class="font-black text-foreground">$1</strong>')
        .replace(/^(\d+)\.\s+/, '<span class="font-black text-primary mr-2">$1.</span>');
      html += `<p>${line}</p>`;
    }
    return html ? `${html}${open ? "</div></section>" : ""}` : legacyFormatModelText(text);
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
                  <button
                    onClick={gerarOportunidade}
                    disabled={loading}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                  >
                    <Zap className="h-4 w-4" /> Gerar oportunidade
                  </button>
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
                      {m.role === "model" ? (
                        <span dangerouslySetInnerHTML={{ __html: formatModelText(cleanResponse(m.text)) }} />
                      ) : m.text}
                    </div>
                    <span className="text-[9px] font-medium text-muted-foreground/60 mt-1 px-1">
                      {formatTime(m.timestamp)}
                    </span>
                  </div>
                </div>
              ))
            )}

            {/* Próxima Ação Card */}
            {proximaAcao && (
              <div className="animate-in slide-in-from-bottom-3 fade-in duration-300">
                <div className="flex gap-2 items-start p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 mt-1">
                  <div className="w-7 h-7 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    {proximaAcao.tipo === "ligação" ? <Phone className="w-3.5 h-3.5 text-amber-400" /> :
                     proximaAcao.tipo === "visita" ? <MapPin className="w-3.5 h-3.5 text-amber-400" /> :
                     proximaAcao.tipo === "proposta" ? <FileText className="w-3.5 h-3.5 text-amber-400" /> :
                     <Zap className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-0.5">Próxima Ação Sugerida</p>
                    <p className="text-xs font-bold text-foreground">{proximaAcao.descricao}</p>
                  </div>
                  <button
                    onClick={() => setProximaAcao(null)}
                    className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Lembrete Card */}
            {lembrete && (
              <div className="animate-in slide-in-from-bottom-3 fade-in duration-300">
                <div className="flex gap-2 items-start p-3 rounded-2xl bg-blue-500/10 border border-blue-500/25 mt-1">
                  <div className="w-7 h-7 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bell className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-0.5">
                      Lembrete {lembreteConfirmado ? "✓ Salvo" : "Criado"}
                    </p>
                    <p className="text-xs font-bold text-foreground">{lembrete.descricao}</p>
                    {(lembrete.data_iso || lembrete.prazo_texto) && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {lembrete.data_iso
                          ? new Date(lembrete.data_iso + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })
                          : lembrete.prazo_texto}
                      </p>
                    )}
                  </div>
                  {!lembreteConfirmado && (
                    <button
                      onClick={() => setLembreteConfirmado(true)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors text-[10px] font-black shrink-0"
                    >
                      <CheckCheck className="w-3 h-3" /> OK
                    </button>
                  )}
                  <button
                    onClick={() => setLembrete(null)}
                    className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
            {(loading || escutando) && (
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-2xl flex-shrink-0 flex items-center justify-center bg-primary/15 text-primary ring-2 ring-primary/25 shadow-xs">
                  <MessageSquareText className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="bg-muted/70 rounded-2xl rounded-tl-xs px-4.5 py-3.5 border border-border/50 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-xs font-bold text-muted-foreground transition-opacity duration-300">
                      {escutando
                        ? LOADING_AUDIO[loadingTextIdx % LOADING_AUDIO.length]
                        : loadingStep === "citel"
                        ? LOADING_CITEL[loadingTextIdx % LOADING_CITEL.length]
                        : LOADING_IA[loadingTextIdx % LOADING_IA.length]}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Form Input Area */}
          <div className="px-5 py-4 border-t border-border/50 bg-gradient-to-b from-transparent to-muted/30">
            {erroAudio && (
              <div className="flex items-center justify-between gap-2 mb-2.5 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25">
                <p className="text-[11px] font-bold text-rose-400">{erroAudio}</p>
                <button
                  type="button"
                  onClick={() => setErroAudio(null)}
                  className="text-rose-400/70 hover:text-rose-400 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-3"
            >
              <Avatar src={userAvatar} fallback={userName || cliente.nome_vendedor || "Vendedor"} size="sm" />

              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,.ogg,.opus,.m4a"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Zera o value para reenviar o MESMO arquivo disparar o onChange
                  // de novo (útil quando a primeira transcrição falhou).
                  e.target.value = "";
                  if (file) void enviarAudio(file);
                }}
              />

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
                  placeholder={
                    escutando
                      ? "Escutando o áudio…"
                      : "Digite ou envie um áudio… (Shift+Enter para nova linha)"
                  }
                  disabled={loading || escutando}
                  rows={1}
                  className="w-full bg-transparent pl-4 pr-[5.25rem] py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none disabled:opacity-50 transition-all resize-none leading-normal"
                  style={{ minHeight: "44px" }}
                />

                <div
                  className="absolute right-2 flex items-center gap-1.5"
                  style={{ top: "50%", transform: "translateY(-50%)" }}
                >
                  <button
                    type="button"
                    onClick={() => audioInputRef.current?.click()}
                    disabled={loading || escutando}
                    title="Enviar áudio para a IA analisar"
                    className="w-8.5 h-8.5 rounded-xl border border-border/70 bg-card hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all active:scale-95 disabled:opacity-30 shrink-0"
                  >
                    {escutando ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="submit"
                    disabled={!input.trim() || loading || escutando}
                    className="w-8.5 h-8.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-[0_4px_12px_rgba(37,99,235,0.3)] hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:scale-100 disabled:shadow-none shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
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
                          typeof val[0] === "object" && val[0] !== null ? (
                            <div className="space-y-1.5 pt-0.5">
                              {val.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-background/50 border border-border/30 text-xs">
                                  <span className="text-primary font-black">{idx + 1}.</span>
                                  <span className="font-bold text-foreground">
                                    {String((item as Record<string, unknown>).produto || (item as Record<string, unknown>).marca || (item as Record<string, unknown>).descricao || JSON.stringify(item))}
                                  </span>
                                  {(item as Record<string, unknown>).valor != null && (
                                    <span className="ml-auto text-emerald-400 font-bold shrink-0">
                                      R$ {Number((item as Record<string, unknown>).valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                    </span>
                                  )}
                                  {(item as Record<string, unknown>).status != null && (
                                    <span className={`ml-auto text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                                      String((item as Record<string, unknown>).status) === "crescendo" ? "bg-emerald-500/15 text-emerald-400" :
                                      String((item as Record<string, unknown>).status) === "caindo" ? "bg-rose-500/15 text-rose-400" :
                                      "bg-muted text-muted-foreground"
                                    }`}>
                                      {String((item as Record<string, unknown>).status)}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {val.map((item, idx) => (
                                <span key={idx} className="px-2.5 py-1 rounded-xl bg-primary/15 text-foreground border border-primary/25 text-xs font-bold shadow-2xs">
                                  {String(item)}
                                </span>
                              ))}
                            </div>
                          )
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
