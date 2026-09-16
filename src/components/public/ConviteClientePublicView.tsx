import { useState, useEffect } from "react";
import {
  Calendar,
  MapPin,
  Gift,
  Trophy,
  CheckCircle2,
  Share2,
  Utensils,
  Beer,
  Phone,
  User,
  X,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Check,
  MessageCircle
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface EventoRef {
  id: string;
  nome: string;
  subtitulo?: string | null;
  data_evento: string;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  local?: string | null;
}

const PROFISSOES_COMUNS = [
  "Eletricista",
  "Encanador",
  "Funcionário",
  "Outro"
];

const LOCAL_PADRAO = "Galpão da Carflax — Av. Américo Bruno, 125, Pte. São João — Jundiaí - SP";
const LOCAL_MAPS_URL = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Av. Américo Bruno, 125, Ponte São João, Jundiaí - SP");
const WHATSAPP_GRUPO_URL = "https://chat.whatsapp.com/HXkQff0Rr0W2v1milT7lMF";

const CAPACIDADE_MAXIMA = 50;

export function ConviteClientePublicView() {
  const [evento, setEvento] = useState<EventoRef | null>(null);

  // Etapas: 1 (Capa) -> 2 (Identificação & Termos) -> 3 (Voucher VIP)
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1);

  // Form states
  const [nome, setNome] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [profissao, setProfissao] = useState("Eletricista");
  const [profissaoOutro, setProfissaoOutro] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [vendedoresLista, setVendedoresLista] = useState<string[]>([]);

  // Termos de Imagem
  const [termoAceito, setTermoAceito] = useState(false);
  const [modalTermosAberto, setModalTermosAberto] = useState(false);

  // Status de envio e grupo
  const [submitting, setSubmitting] = useState(false);
  const [entrouNoGrupo, setEntrouNoGrupo] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Vagas restantes
  const [vagasOcupadas, setVagasOcupadas] = useState<number>(0);
  const vagasRestantes = Math.max(0, CAPACIDADE_MAXIMA - vagasOcupadas);

  // Dados do voucher gerado
  const [voucherData, setVoucherData] = useState<{
    numeroSorteio: number | null;
    voucherNumero: string | null;
    nomeCompleto: string;
    telefone: string;
    profissao: string;
  } | null>(null);

  // Parse de query params na URL (ex: ?vendedor=Nome ou ?v=Nome)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vendedorUrl = params.get("vendedor") || params.get("v") || params.get("ref");
    if (vendedorUrl) {
      setVendedor(vendedorUrl.trim());
    }
  }, []);

  // Contagem de vagas confirmadas
  const carregarVagas = async (eventoId?: string) => {
    try {
      const id = eventoId || evento?.id;
      if (!id) return;

      const { count, error } = await supabase
        .from("evento_convidados")
        .select("id", { count: "exact", head: true })
        .eq("evento_id", id)
        .eq("status", "confirmado");

      if (!error && count !== null) {
        setVagasOcupadas(count);
      }
    } catch (err) {
      console.warn("Erro ao contar vagas:", err);
    }
  };

  // Carrega evento do Supabase
  useEffect(() => {
    async function loadEvento() {
      try {
        const { data } = await supabase
          .from("eventos")
          .select("id, nome, subtitulo, data_evento, hora_inicio, hora_fim, local")
          .ilike("nome", "%Instalador%")
          .order("data_evento", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          setEvento(data as EventoRef);
          carregarVagas(data.id);
        }
      } catch (err) {
        console.error("Falha ao carregar evento:", err);
      }
    }
    loadEvento();
  }, []);

  // Escuta atualizações de vagas em tempo real (Supabase Channel + Polling de segurança)
  useEffect(() => {
    const eventoId = evento?.id;
    if (!eventoId) return;

    carregarVagas(eventoId);

    const channel = supabase
      .channel(`vagas_realtime_${eventoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "evento_convidados",
          filter: `evento_id=eq.${eventoId}`
        },
        () => {
          carregarVagas(eventoId);
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      carregarVagas(eventoId);
    }, 8000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [evento?.id]);

  // Busca lista de vendedores ativos para facilitar
  useEffect(() => {
    async function loadVendedores() {
      try {
        const { data } = await supabase
          .from("usuarios")
          .select("name")
          .not("name", "is", null)
          .order("name");

        if (data && data.length > 0) {
          const names = Array.from(new Set(data.map((u) => u.name.trim()))).filter(Boolean);
          setVendedoresLista(names);
        }
      } catch (err) {
        console.warn("Não foi possível listar vendedores:", err);
      }
    }
    loadVendedores();
  }, []);

  // Meta tags dinâmicas para compartilhamento no WhatsApp / Redes Sociais
  useEffect(() => {
    document.title = "Festival dos Instaladores — 3ª Edição | Convite Oficial";

    const setMeta = (prop: string, content: string) => {
      let el = document.querySelector(`meta[property="${prop}"]`) || document.querySelector(`meta[name="${prop}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(prop.startsWith("og:") ? "property" : "name", prop);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const imgUrl = `${window.location.origin}/convite-capa.jpg`;

    setMeta("og:title", "Festival dos Instaladores — 3ª Edição | Convite VIP");
    setMeta(
      "og:description",
      "3ª Edição! Dia 15 de Outubro às 17h30. 3 horas de buffet com janta, espetinhos, cerveja gelada, brindes e sorteio de prêmios. Confirme sua presença!"
    );
    setMeta("og:image", imgUrl);
    setMeta("og:image:secure_url", imgUrl);
    setMeta("twitter:title", "Festival dos Instaladores — 3ª Edição | Convite VIP");
    setMeta(
      "twitter:description",
      "3ª Edição! Dia 15 de Outubro às 17h30. 3 horas de buffet com janta, espetinhos, cerveja gelada, brindes e sorteio de prêmios."
    );
    setMeta("twitter:image", imgUrl);
  }, []);

  const formatPhone = (val: string) => {
    let digits = val.replace(/\D/g, "");
    if (digits.length > 11) digits = digits.slice(0, 11);
    if (digits.length > 6) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    } else if (digits.length > 2) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    }
    return digits;
  };

  // Submissão da Inscrição na Etapa 2
  const handleSubmitFinal = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const nomeTrim = nome.trim();
    const sobrenomeTrim = sobrenome.trim();
    if (!nomeTrim || !sobrenomeTrim) {
      setErrorMsg("Por favor, preencha seu nome e sobrenome.");
      return;
    }

    const telLimpo = whatsapp.replace(/\D/g, "");
    if (telLimpo.length < 10) {
      setErrorMsg("Por favor, informe seu WhatsApp com DDD.");
      return;
    }

    if (!termoAceito) {
      setModalTermosAberto(true);
      setErrorMsg("Por favor, aceite os termos de uso de imagem para concluir sua inscrição.");
      return;
    }

    const profissaoFinal =
      profissao === "Outro"
        ? profissaoOutro.trim() || "Outro"
        : profissao;

    setSubmitting(true);

    try {
      let eventoId = evento?.id;
      if (!eventoId) {
        const { data: evt } = await supabase
          .from("eventos")
          .select("id")
          .order("data_evento", { ascending: false })
          .limit(1)
          .maybeSingle();
        eventoId = evt?.id;
      }

      if (!eventoId) {
        throw new Error("Evento não encontrado no sistema. Por favor, contate a Carflax.");
      }

      const nomeCompleto = `${nome.trim()} ${sobrenome.trim()}`;
      const termoTexto = `Termo de Imagem Aceito em: ${new Date().toLocaleString("pt-BR")}`;
      const obsFinal = [
        `Profissão: ${profissaoFinal}`,
        termoTexto,
        vendedor.trim() ? `Vendedor: ${vendedor.trim()}` : "",
        "Inscrição via Convite Cliente/Instalador 3ª Edição"
      ]
        .filter(Boolean)
        .join(" | ");

      // Verifica se já existe inscrição com este telefone
      const { data: existente } = await supabase
        .from("evento_convidados")
        .select("id, numero_sorteio, voucher_numero")
        .eq("evento_id", eventoId)
        .eq("telefone", formatPhone(whatsapp))
        .maybeSingle();

      let finalNumeroSorteio: number | null = existente?.numero_sorteio || null;
      let finalVoucherNumero: string | null = existente?.voucher_numero || null;

      if (!finalNumeroSorteio) {
        let maxTentativas = 5;
        let sucessoSorteio = false;

        for (let i = 0; i < maxTentativas; i++) {
          const { data: maxRow } = await supabase
            .from("evento_convidados")
            .select("numero_sorteio")
            .eq("evento_id", eventoId)
            .not("numero_sorteio", "is", null)
            .order("numero_sorteio", { ascending: false })
            .limit(1)
            .maybeSingle();

          const proximo = (maxRow?.numero_sorteio || 0) + 1;
          const ano = new Date().getFullYear();
          const voucherGerado = `EI${ano}-${String(proximo).padStart(3, "0")}`;

          if (existente?.id) {
            const { error: updErr } = await supabase
              .from("evento_convidados")
              .update({
                nome: nomeCompleto,
                vendedor_nome: vendedor.trim() || null,
                status: "confirmado",
                numero_sorteio: proximo,
                voucher_numero: voucherGerado,
                observacoes: obsFinal,
                updated_at: new Date().toISOString()
              })
              .eq("id", existente.id);

            if (!updErr) {
              finalNumeroSorteio = proximo;
              finalVoucherNumero = voucherGerado;
              sucessoSorteio = true;
              break;
            }
            if (updErr.code !== "23505") throw updErr;
          } else {
            const { error: insErr } = await supabase
              .from("evento_convidados")
              .insert([
                {
                  evento_id: eventoId,
                  nome: nomeCompleto,
                  telefone: formatPhone(whatsapp),
                  carteira: "B2B",
                  vendedor_nome: vendedor.trim() || null,
                  status: "confirmado",
                  numero_sorteio: proximo,
                  voucher_numero: voucherGerado,
                  observacoes: obsFinal,
                  updated_at: new Date().toISOString()
                }
              ]);

            if (!insErr) {
              finalNumeroSorteio = proximo;
              finalVoucherNumero = voucherGerado;
              sucessoSorteio = true;
              break;
            }
            if (insErr.code !== "23505") throw insErr;
          }
        }

        if (!sucessoSorteio) {
          throw new Error("Não foi possível gerar seu número da sorte no momento. Tente novamente.");
        }
      } else {
        await supabase
          .from("evento_convidados")
          .update({
            nome: nomeCompleto,
            vendedor_nome: vendedor.trim() || null,
            status: "confirmado",
            observacoes: obsFinal,
            updated_at: new Date().toISOString()
          })
          .eq("id", existente!.id);
      }

      setVoucherData({
        numeroSorteio: finalNumeroSorteio,
        voucherNumero: finalVoucherNumero,
        nomeCompleto,
        telefone: formatPhone(whatsapp),
        profissao: profissaoFinal
      });

      setEtapa(3);
      window.scrollTo({ top: 0, behavior: "smooth" });
      carregarVagas(eventoId);

      // Abre automaticamente o grupo do WhatsApp para o cliente ingressar
      try {
        window.open(WHATSAPP_GRUPO_URL, "_blank");
      } catch (e) {
        console.warn("Popup bloqueado pelo navegador:", e);
      }
    } catch (err) {
      console.error("Erro ao salvar inscrição:", err);
      const msg = err instanceof Error ? err.message : "Erro ao confirmar presença. Tente novamente.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const dataEventoFormatada = "15 de Outubro de 2026";
  const horarioEvento = "17h30 às 20h30";

  const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    "Festival dos Instaladores — 3ª Edição"
  )}&dates=20261015T203000Z/20261015T233000Z&details=${encodeURIComponent(
    `Voucher: ${voucherData?.voucherNumero || "Confirmado"} | Número da Sorte: #${voucherData?.numeroSorteio}\nBuffet com janta, espetinhos, cerveja gelada, brindes e sorteios!\nLocal: ${LOCAL_PADRAO}`
  )}&location=${encodeURIComponent(LOCAL_PADRAO)}`;

  const shareWhatsAppUrl = voucherData
    ? `https://wa.me/?text=${encodeURIComponent(
        `🎉 Minha presença está confirmada na 3ª Edição do Festival dos Instaladores!\n` +
          `👤 Nome: ${voucherData.nomeCompleto}\n` +
          `🎫 Voucher: ${voucherData.voucherNumero}\n` +
          `⭐ Número da Sorte: #${voucherData.numeroSorteio}\n` +
          `📅 Data: Quinta-feira, 15 de Outubro\n` +
          `⏰ Horário: 17h30 às 20h30 (Buffet de 3h com Janta, Espetinhos e Cerveja)\n` +
          `📍 Local: ${LOCAL_PADRAO}\n` +
          `🔗 Confirmar também: ${window.location.origin}/convite-cliente`
      )}`
    : "#";

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#03091E] text-slate-100 font-sans selection:bg-[#00E676] selection:text-slate-950 antialiased flex flex-col relative overflow-x-hidden">
      {/* Luzes de Fundo Modernas (Azul Royal + Verde Elétrico) */}
      <div className="fixed -top-32 left-1/2 -translate-x-1/2 w-[550px] h-[350px] bg-gradient-to-b from-[#0052FF]/25 via-[#00D060]/10 to-transparent blur-[120px] pointer-events-none rounded-full" />
      <div className="fixed -bottom-32 -left-32 w-80 h-80 bg-[#0047D4]/20 blur-[120px] pointer-events-none rounded-full" />



      {/* ── Conteúdo Principal ── */}
      <main className={`flex-1 w-full mx-auto flex flex-col relative z-10 ${etapa === 2 ? "max-w-xl px-2.5 py-2 sm:px-4 sm:py-6" : "max-w-md px-4 pt-3 pb-6"}`}>
        {/* ══════════════════════════════════════════
            ETAPA 1: CAPA DO CONVITE OFICIAL
        ══════════════════════════════════════════ */}
        {etapa === 1 && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Flyer / Imagem Oficial enviada com moldura refinada */}
            <div className="rounded-2xl overflow-hidden border border-[#1A3875] shadow-2xl shadow-[#0047D4]/15 bg-[#051336]">
              <img
                src="/convite-capa.jpg"
                alt="Convite Festival dos Instaladores Carflax"
                className="w-full h-auto object-cover block"
              />
            </div>

            {/* Vagas Restantes em Destaque */}
            <div className="bg-gradient-to-r from-[#07173D] via-[#0B2252] to-[#07173D] border border-[#00E676]/35 rounded-2xl py-3.5 px-5 flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/10 text-center">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E676] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00E676]" />
              </span>
              <span className="text-sm font-bold text-slate-100 flex items-center gap-1.5 flex-wrap justify-center">
                <span>Restam apenas</span>
                <span className="text-base sm:text-lg font-black font-mono text-[#00E676] bg-[#00E676]/15 px-2.5 py-0.5 rounded-lg border border-[#00E676]/40 shadow-xs">
                  {vagasRestantes} vagas
                </span>
              </span>
            </div>

            {/* Card Clean: O que está liberado para você */}
            <div className="bg-[#07173D]/90 backdrop-blur-md border border-[#152E63] rounded-2xl p-4 sm:p-5 space-y-3 shadow-xl">
              <div className="text-center pb-2.5 border-b border-[#122756]">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#00E676] bg-[#00E676]/10 border border-[#00E676]/20 px-3 py-1 rounded-full inline-block mb-1.5 shadow-xs">
                  Entrada VIP Gratuita
                </span>
                <h2 className="text-lg font-black text-white tracking-tight">
                  O que está liberado para você:
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                <div className="flex items-center gap-2.5 bg-[#0A1F4F]/80 p-3 rounded-xl border border-[#183670]/60 text-slate-100 hover:border-[#00E676]/30 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-[#00E676]/10 text-[#00E676] flex items-center justify-center shrink-0">
                    <Utensils className="w-4 h-4" />
                  </div>
                  <span className="leading-tight">3h Buffet & Janta</span>
                </div>

                <div className="flex items-center gap-2.5 bg-[#0A1F4F]/80 p-3 rounded-xl border border-[#183670]/60 text-slate-100 hover:border-[#00E676]/30 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-amber-400/10 text-amber-400 flex items-center justify-center shrink-0">
                    <Beer className="w-4 h-4" />
                  </div>
                  <span className="leading-tight">Espetinhos & Cerveja</span>
                </div>

                <div className="flex items-center gap-2.5 bg-[#0A1F4F]/80 p-3 rounded-xl border border-[#183670]/60 text-slate-100 hover:border-[#00E676]/30 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-[#0085FF]/10 text-[#0085FF] flex items-center justify-center shrink-0">
                    <Gift className="w-4 h-4" />
                  </div>
                  <span className="leading-tight">Kit de Brindes</span>
                </div>

                <div className="flex items-center gap-2.5 bg-[#0A1F4F]/80 p-3 rounded-xl border border-[#183670]/60 text-slate-100 hover:border-[#00E676]/30 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-[#00E676]/10 text-[#00E676] flex items-center justify-center shrink-0">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <span className="leading-tight">Sorteio de Prêmios</span>
                </div>
              </div>
            </div>

            {/* Botão de Avanço: Verde Elétrico Moderno */}
            <div className="pt-1">
              <button
                onClick={() => {
                  setEtapa(2);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="w-full py-4.5 px-6 rounded-2xl bg-gradient-to-r from-[#00D060] via-[#00E676] to-[#00D060] hover:from-[#00C050] hover:to-[#00D060] text-[#021A0F] font-black text-base tracking-tight shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all transform active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Quero Confirmar Minha Presença</span>
                <ChevronRight className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            ETAPA 2: IDENTIFICAÇÃO DO CLIENTE
        ══════════════════════════════════════════ */}
        {etapa === 2 && (
          <div className="flex-1 flex flex-col justify-between animate-in fade-in duration-300 w-full min-h-[calc(100dvh-1.5rem)] sm:min-h-0">
            <div className="bg-[#07173D]/95 backdrop-blur-md border border-[#152E63] rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="pb-3 border-b border-[#122756]">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#00E676] block mb-0.5">
                    Etapa 2 de 2
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Seus Dados para o Voucher
                  </h2>
                </div>

                {errorMsg && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleSubmitFinal} id="form-etapa2" className="space-y-4">
                  {/* Nome e Sobrenome */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block mb-1">
                        Nome <span className="text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          required
                          value={nome}
                          onChange={(e) => setNome(e.target.value)}
                          placeholder="Ex: Carlos"
                          className="w-full pl-9 pr-2.5 py-3 rounded-xl bg-[#040F2B] border border-[#152E63] text-white placeholder-slate-500 text-sm font-medium focus:outline-none focus:border-[#00E676] focus:ring-1 focus:ring-[#00E676] transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block mb-1">
                        Sobrenome <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={sobrenome}
                        onChange={(e) => setSobrenome(e.target.value)}
                        placeholder="Ex: Silva"
                        className="w-full px-3 py-3 rounded-xl bg-[#040F2B] border border-[#152E63] text-white placeholder-slate-500 text-sm font-medium focus:outline-none focus:border-[#00E676] focus:ring-1 focus:ring-[#00E676] transition-all"
                      />
                    </div>
                  </div>

                  {/* WhatsApp */}
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block mb-1">
                      WhatsApp com DDD <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="tel"
                        required
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(formatPhone(e.target.value))}
                        placeholder="(11) 99999-9999"
                        className="w-full pl-9 pr-3 py-3 rounded-xl bg-[#040F2B] border border-[#152E63] text-white placeholder-slate-500 text-sm font-medium focus:outline-none focus:border-[#00E676] focus:ring-1 focus:ring-[#00E676] transition-all"
                      />
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Para receber seu comprovante VIP e número da sorte.
                    </span>
                  </div>

                  {/* Profissão / Segmento */}
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block mb-1">
                      Sua Profissão / Atuação <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={profissao}
                      onChange={(e) => setProfissao(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl bg-[#040F2B] border border-[#152E63] text-white text-sm font-medium focus:outline-none focus:border-[#00E676] focus:ring-1 focus:ring-[#00E676] transition-all cursor-pointer"
                    >
                      {PROFISSOES_COMUNS.map((prof) => (
                        <option key={prof} value={prof}>
                          {prof}
                        </option>
                      ))}
                    </select>

                    {profissao === "Outro" && (
                      <div className="mt-2.5">
                        <input
                          type="text"
                          required
                          value={profissaoOutro}
                          onChange={(e) => setProfissaoOutro(e.target.value)}
                          placeholder="Digite sua profissão (ex: Construtor, Gesseiro...)"
                          className="w-full px-3 py-3 rounded-xl bg-[#040F2B] border border-[#152E63] text-white placeholder-slate-500 text-sm font-medium focus:outline-none focus:border-[#00E676] transition-all"
                        />
                      </div>
                    )}
                  </div>

                  {/* Vendedor Carflax que atende */}
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block mb-1">
                      Vendedor Carflax que te atende{" "}
                      <span className="text-slate-500 text-[10px] font-normal">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      list="vendedores-lista"
                      value={vendedor}
                      onChange={(e) => setVendedor(e.target.value)}
                      placeholder="Ex: João, Tatiane, Danilo..."
                      className="w-full px-3 py-3 rounded-xl bg-[#040F2B] border border-[#152E63] text-white placeholder-slate-500 text-sm font-medium focus:outline-none focus:border-[#00E676] focus:ring-1 focus:ring-[#00E676] transition-all"
                    />
                    <datalist id="vendedores-lista">
                      {vendedoresLista.map((v, i) => (
                        <option key={i} value={v} />
                      ))}
                    </datalist>
                  </div>

                  {/* Checkbox Termos de Imagem (Abre Modal) */}
                  <div className="pt-2 border-t border-[#122756]">
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#040F2B] border border-[#152E63] hover:border-[#1E438D] transition-colors">
                      <div className="pt-0.5">
                        <input
                          type="checkbox"
                          id="termo-imagem-checkbox"
                          checked={termoAceito}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setModalTermosAberto(true);
                            } else {
                              setTermoAceito(false);
                            }
                          }}
                          className="w-4.5 h-4.5 rounded border-[#152E63] text-[#00E676] focus:ring-[#00E676] cursor-pointer accent-[#00E676]"
                        />
                      </div>

                      <label
                        htmlFor="termo-imagem-checkbox"
                        className="text-xs text-slate-300 leading-snug cursor-pointer select-none"
                      >
                        <span>Li e concordo com a </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setModalTermosAberto(true);
                          }}
                          className="text-[#00E676] hover:underline font-bold inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          Cessão de Direitos de Imagem
                          <ExternalLink className="w-3 h-3 inline ml-0.5" />
                        </button>
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          Permite fotos e vídeos durante a cobertura oficial do buffet e do evento.
                        </span>
                      </label>
                    </div>
                  </div>
                </form>
              </div>

              {/* Botões de Ação na Base preenchendo a tela */}
              <div className="pt-4 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setEtapa(1);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="h-13 w-24 sm:w-28 px-3 rounded-xl bg-[#0A1F4F] hover:bg-[#0F2866] text-slate-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-1 transition-colors cursor-pointer border border-[#183670] shrink-0 active:scale-98"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Voltar</span>
                </button>

                <button
                  type="submit"
                  form="form-etapa2"
                  disabled={submitting}
                  className="flex-1 h-13 px-4 rounded-xl bg-gradient-to-r from-[#00D060] via-[#00E676] to-[#00D060] hover:from-[#00C050] hover:to-[#00D060] text-[#021A0F] font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/25 transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#021A0F]" />
                      <span className="whitespace-nowrap">Concluindo...</span>
                    </>
                  ) : (
                    <span>Concluir Inscrição</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            ETAPA 3: VOUCHER VIP DIGITAL & NÚMERO DA SORTE
        ══════════════════════════════════════════ */}
        {etapa === 3 && voucherData && (
          <div className="space-y-4 animate-in zoom-in-95 duration-300">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 text-[#00E676] mb-1">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-black text-white">
                Presença Confirmada!
              </h1>
              <p className="text-xs text-slate-300">
                Seu lugar na <strong className="text-[#00E676]">3ª Edição do Festival dos Instaladores</strong> está garantido.
              </p>
            </div>

            {/* Box Obrigatório: Entrar no Grupo do WhatsApp */}
            <div className="relative bg-gradient-to-b from-[#0B2518] via-[#04190F] to-[#04120B] border-2 border-[#00E676] rounded-2xl p-4 sm:p-5 text-center space-y-3 shadow-2xl shadow-emerald-500/25">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00E676] text-[#021A0F] text-xs font-black uppercase tracking-wider shadow-sm animate-pulse">
                <MessageCircle className="w-4 h-4 fill-current" />
                <span>Passo Obrigatório</span>
              </div>

              <div>
                <h2 className="text-lg font-black text-white tracking-tight">
                  Entre no Grupo Oficial do WhatsApp
                </h2>
                <p className="text-xs text-emerald-200/90 mt-1 leading-relaxed">
                  Para validar seu voucher, receber a programação do buffet e participar dos sorteios ao vivo, é <strong>obrigatório</strong> entrar no grupo oficial.
                </p>
              </div>

              <a
                href={WHATSAPP_GRUPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setEntrouNoGrupo(true)}
                className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#00D060] via-[#00E676] to-[#00D060] hover:from-[#00C050] hover:to-[#00D060] text-[#021A0F] font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30 transition-all transform active:scale-98 cursor-pointer"
              >
                <MessageCircle className="w-5 h-5 fill-current" />
                <span>{entrouNoGrupo ? "Abrir Grupo Novamente" : "Entrar no Grupo Oficial Agora"}</span>
                <ExternalLink className="w-4 h-4 ml-0.5" />
              </a>

              {entrouNoGrupo ? (
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#00E676]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Acesso ao grupo realizado com sucesso!</span>
                </div>
              ) : (
                <span className="text-[11px] text-amber-300 block font-semibold">
                  ⚠️ Toque no botão verde acima para ingressar no grupo.
                </span>
              )}
            </div>

            {/* Card do Ingresso VIP */}
            <div className="relative bg-[#07173D] border-2 border-[#00E676]/40 rounded-3xl p-5 shadow-2xl shadow-[#0047D4]/20 overflow-hidden">
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#00E676]/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 space-y-4">
                {/* Header Ticket */}
                <div className="flex items-center justify-between border-b border-[#122756] pb-3">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#00E676] block">
                      Voucher VIP Oficial · 3ª Edição
                    </span>
                    <h2 className="text-base font-black text-white">
                      Festival dos Instaladores
                    </h2>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#0085FF] bg-[#0085FF]/10 px-2.5 py-1 rounded-lg border border-[#0085FF]/20">
                    {voucherData.voucherNumero || "VIP-OK"}
                  </span>
                </div>

                {/* Número da Sorte em Destaque */}
                <div className="bg-gradient-to-r from-[#00E676]/10 via-[#0066FF]/15 to-[#00E676]/10 border-2 border-[#00E676]/50 rounded-2xl p-4 text-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#00E676] block mb-1">
                    Seu Número da Sorte para os Sorteios
                  </span>
                  <div className="text-4xl font-black text-white font-mono tracking-wider drop-shadow-md">
                    #{String(voucherData.numeroSorteio ?? "001").padStart(3, "0")}
                  </div>
                  <span className="text-[10px] text-slate-300 block mt-1">
                    Guarde este número para concorrer aos prêmios durante o evento!
                  </span>
                </div>

                {/* Titular e Acompanhantes */}
                <div className="bg-[#040F2B] rounded-xl p-3 border border-[#152E63] space-y-2 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Convidado
                    </span>
                    <strong className="text-white text-sm block">
                      {voucherData.nomeCompleto}
                    </strong>
                    <span className="text-[11px] text-[#00E676]">
                      {voucherData.profissao}
                    </span>
                  </div>
                </div>

                {/* Quando e Onde */}
                <div className="space-y-1.5 text-xs text-slate-300 pt-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#00E676] shrink-0" />
                    <span>
                      <strong className="text-white">{dataEventoFormatada} (Quinta-feira)</strong> · {horarioEvento}
                    </span>
                  </div>

                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-[#0085FF] shrink-0 mt-0.5" />
                    <span>{LOCAL_PADRAO}</span>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="pt-3 border-t border-[#122756] space-y-2">
                  <a
                    href={shareWhatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#00D060] to-[#00E676] hover:from-[#00C050] hover:to-[#00D060] text-[#021A0F] font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-98 text-center shadow-md shadow-emerald-500/20"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Salvar / Enviar no WhatsApp</span>
                  </a>

                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={googleCalendarUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2.5 px-3 rounded-xl bg-[#0066FF] hover:bg-[#0055DD] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all text-center shadow-md shadow-blue-500/20"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Google Agenda</span>
                    </a>

                    <a
                      href={LOCAL_MAPS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2.5 px-3 rounded-xl bg-[#0A1F4F] hover:bg-[#0F2866] text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all text-center border border-[#183670]"
                    >
                      <MapPin className="w-3.5 h-3.5 text-[#00E676]" />
                      <span>Como Chegar</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center pt-2">
              <button
                onClick={() => {
                  setEtapa(1);
                  setNome("");
                  setSobrenome("");
                  setWhatsapp("");
                  setTermoAceito(false);
                }}
                className="text-xs text-slate-400 hover:text-white underline underline-offset-4 cursor-pointer transition-colors"
              >
                Fazer outra inscrição
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── Modal de Termos de Imagem ── */}
      {modalTermosAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#07173D] border border-[#1A3875] rounded-3xl max-w-sm w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-[#122756] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#00E676]" />
                <h3 className="text-sm font-bold text-white">
                  Termo de Uso de Imagem
                </h3>
              </div>
              <button
                onClick={() => setModalTermosAberto(false)}
                className="w-7 h-7 rounded-full bg-[#0A1F4F] text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                Ao participar da <strong>3ª Edição do Festival dos Instaladores</strong> em 15/10/2026, você autoriza:
              </p>

              <div className="bg-[#040F2B] p-3 rounded-xl border border-[#152E63] space-y-2 text-[11px]">
                <p>
                  <strong>1. Captação e Imagem:</strong> Gravação e fotos de sua presença durante a cobertura oficial do evento.
                </p>
                <p>
                  <strong>2. Divulgação:</strong> Uso exclusivo para cobertura institucional, redes sociais da Carflax e das marcas parceiras patrocinadoras.
                </p>
                <p>
                  <strong>3. Salvaguarda:</strong> É proibido qualquer uso depreciativo ou que fira a honra do participante, conforme a LGPD (Lei 13.709/2018).
                </p>
              </div>
            </div>

            <div className="p-3 border-t border-[#122756] bg-[#051130] flex gap-2">
              <button
                type="button"
                onClick={() => setModalTermosAberto(false)}
                className="w-1/3 py-2.5 rounded-xl bg-[#0A1F4F] hover:bg-[#0F2866] text-slate-300 font-semibold text-xs cursor-pointer border border-[#183670]"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => {
                  setTermoAceito(true);
                  setModalTermosAberto(false);
                }}
                className="w-2/3 py-2.5 rounded-xl bg-gradient-to-r from-[#00D060] to-[#00E676] hover:from-[#00C050] hover:to-[#00D060] text-[#021A0F] font-black text-xs flex items-center justify-center gap-1 cursor-pointer shadow-md shadow-emerald-500/20"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Aceitar Termos</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
