import { useState, useEffect } from "react";
import {
  Building2,
  Calendar,
  MessageCircle,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Users,
  Gift,
  Wrench,
  Zap,
  Award,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  MapPin,
  Phone,
  AtSign,
  Coffee,
  Package,
  Sparkles,
  Trophy,
  Factory,
  TrendingUp,
  Share2,
  Handshake,
  Megaphone,
  UserCheck,
  Star
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
  publico_meta_min?: number | null;
  publico_meta_max?: number | null;
}

export function ConviteFornecedorPublicView() {
  const [evento, setEvento] = useState<EventoRef | null>(null);

  // Multi-step form state (1 to 6)
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Step 1: Cadastro do fornecedor
  const [empresa, setEmpresa] = useState("");
  const [marca, setMarca] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [cargo, setCargo] = useState("");
  const [telefone, setTelefone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [segmento, setSegmento] = useState<"hidraulico" | "eletrico">("hidraulico");

  // Step 2: Estrutura da exposição
  const [estruturaOpcoes, setEstruturaOpcoes] = useState<string[]>([]);
  const [obsEstrutura, setObsEstrutura] = useState("");

  // Step 3: Informações sobre a montagem
  const [horarioChegada, setHorarioChegada] = useState("14:00");
  const [energiaEletrica, setEnergiaEletrica] = useState("");
  const [apoioCarflax, setApoioCarflax] = useState("");

  // Step 4: Representantes da marca
  const [qtdRepresentantes, setQtdRepresentantes] = useState("1");
  const [nomeRepresentantes, setNomeRepresentantes] = useState("");
  const [cargoRepresentantes, setCargoRepresentantes] = useState("");
  const [telefoneRepresentantes, setTelefoneRepresentantes] = useState("");

  // Step 5: Brindes para o Kit do Instalador
  const [brindesOpcoes, setBrindesOpcoes] = useState<string[]>([]);
  const [brindesQtd, setBrindesQtd] = useState("");

  // Step 6: Sorteio de Prêmios
  const [premioDescricao, setPremioDescricao] = useState("");




  // Setup Scroll Reveal Observer.
  // O estado visível vem da classe `is-visible` (definida em index.css); não use
  // utilitárias do Tailwind aqui — classe que só existe em string JS não é gerada
  // pelo scanner do v4 e o elemento fica invisível para sempre.
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".reveal-scroll"));

    // Sem IntersectionObserver, mostra tudo de uma vez em vez de esconder a página.
    if (typeof IntersectionObserver === "undefined") {
      elements.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target); // revela uma vez só
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [submitted]);

  // Load event details from Supabase
  useEffect(() => {
    async function loadEvento() {
      try {
        const { data, error } = await supabase
          .from("eventos")
          .select("id, nome, subtitulo, data_evento, hora_inicio, hora_fim, local, publico_meta_min, publico_meta_max")
          .ilike("nome", "%Encontro do Instalador%")
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Erro ao buscar evento:", error);
        } else if (data) {
          setEvento(data as EventoRef);
        }
      } catch (err) {
        console.error("Falha na requisição:", err);
      }
    }
    loadEvento();
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

  const toggleOption = (list: string[], setList: (val: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter((i) => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  const validateStep = (currentStep: number): boolean => {
    setErrorMsg(null);
    if (currentStep === 1) {
      if (!empresa.trim() || !marca.trim()) {
        setErrorMsg("Por favor, preencha o nome da empresa e da marca.");
        return false;
      }
      if (!responsavel.trim() || (!whatsapp.trim() && !telefone.trim())) {
        setErrorMsg("Por favor, preencha o nome do responsável e pelo menos um telefone/WhatsApp.");
        return false;
      }
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep((prev) => Math.min(prev + 1, 6));
    }
  };

  const prevStep = () => {
    setErrorMsg(null);
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmitFinal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(1)) return;

    setSubmitting(true);
    setErrorMsg(null);

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
        throw new Error("Evento não encontrado no sistema. Entre em contato com a equipe Carflax.");
      }

      const { data: existing } = await supabase
        .from("evento_fornecedores")
        .select("id")
        .eq("evento_id", eventoId)
        .ilike("marca", (marca || empresa).trim())
        .maybeSingle();

      const obsPartes = [
        empresa ? `Empresa: ${empresa}` : "",
        cargo ? `Cargo: ${cargo}` : "",
        email ? `E-mail: ${email}` : "",
        estruturaOpcoes.length ? `Estrutura: ${estruturaOpcoes.join(", ")}` : "",
        obsEstrutura ? `Obs Estrutura: ${obsEstrutura}` : "",
        horarioChegada ? `Montagem: ${horarioChegada}` : "",
        energiaEletrica ? `Energia: ${energiaEletrica}` : "",
        apoioCarflax ? `Apoio: ${apoioCarflax}` : "",
        nomeRepresentantes ? `Representantes (${qtdRepresentantes}): ${nomeRepresentantes} (${cargoRepresentantes} - ${telefoneRepresentantes})` : "",
        brindesOpcoes.length ? `Brindes Kit (${brindesQtd}): ${brindesOpcoes.join(", ")}` : "",
        `Cadastrado via Formulário 6 Etapas (${new Date().toLocaleDateString("pt-BR")})`,
      ]
        .filter(Boolean)
        .join(" | ");

      const payload = {
        evento_id: eventoId,
        marca: (marca || empresa).trim(),
        segmento,
        contato_nome: responsavel.trim(),
        contato_telefone: (whatsapp || telefone).trim(),
        promotor_nome: nomeRepresentantes.trim() || null,
        premio_descricao: premioDescricao.trim() || null,
        premio_valor: null,
        observacoes: obsPartes,
        status: "follow_up",
        updated_at: new Date().toISOString(),
      };


      if (existing?.id) {
        const { error: updateErr } = await supabase
          .from("evento_fornecedores")
          .update(payload)
          .eq("id", existing.id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from("evento_fornecedores")
          .insert([payload]);
        if (insertErr) throw insertErr;
      }

      setSubmitted(true);
    } catch (err) {
      console.error("Erro ao registrar fornecedor:", err);
      const msg = err instanceof Error ? err.message : "Erro ao enviar cadastro. Tente novamente.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToForm = () => {
    document.getElementById("cadastro-form")?.scrollIntoView({ behavior: "smooth" });
  };

  // Contatos oficiais da Carflax, usados no rodapé e nos CTAs de WhatsApp.
  const WHATSAPP_NUM = "5511959080179";
  const waLink = (msg: string) => `https://wa.me/${WHATSAPP_NUM}?text=${encodeURIComponent(msg)}`;

  // Os dados do evento vêm do Supabase quando disponíveis; os fallbacks abaixo são
  // os valores do Encontro 2026, para a página nunca aparecer vazia se a query falhar.
  const dataEventoLabel = (() => {
    if (!evento?.data_evento) return "22 de outubro de 2026";
    const d = new Date(`${evento.data_evento}T12:00:00`);
    if (isNaN(d.getTime())) return "22 de outubro de 2026";
    return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  })();

  const horarioLabel = "17h30 às 20h30";

  const localLabel = evento?.local || "Galpão da Carflax";

  const publicoLabel = (() => {
    const min = evento?.publico_meta_min;
    const max = evento?.publico_meta_max;
    if (min && max) return `${min} a ${max}`;
    if (max) return `até ${max}`;
    return "40 a 50";
  })();

  const anoEvento = (() => {
    if (!evento?.data_evento) return 2026;
    const d = new Date(`${evento.data_evento}T12:00:00`);
    return isNaN(d.getTime()) ? 2026 : d.getFullYear();
  })();

  return (
    <div className="min-h-screen bg-[#F7FAFC] text-slate-800 font-sans selection:bg-[#0085FF] selection:text-white scroll-smooth">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="https://carflax-connect-2026.lovable.app/__l5e/assets-v1/35f1828f-bca7-49bc-8504-221ee40aa6ee/carflax-logo.png"
              alt="Carflax Logo"
              className="h-10 sm:h-12 w-auto object-contain transition-transform hover:scale-105"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/carflax-assinatura.svg";
              }}
            />
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#experiencia" className="hover:text-[#004B97] transition-colors relative group">
              <span>Experiência</span>
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-[#0085FF] transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#beneficios" className="hover:text-[#004B97] transition-colors relative group">
              <span>Benefícios</span>
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-[#0085FF] transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#o-que-levar" className="hover:text-[#004B97] transition-colors relative group">
              <span>O que levar</span>
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-[#0085FF] transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#investimento" className="hover:text-[#004B97] transition-colors relative group">
              <span>Investimento</span>
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-[#0085FF] transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#cronograma" className="hover:text-[#004B97] transition-colors relative group">
              <span>Cronograma</span>
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-[#0085FF] transition-all duration-300 group-hover:w-full" />
            </a>
          </nav>

          <button
            onClick={scrollToForm}
            className="px-6 py-2.5 rounded-full bg-[#0085FF] hover:bg-[#0070F3] text-white font-bold text-sm tracking-tight shadow-md shadow-[#0085FF]/20 hover:shadow-lg hover:shadow-[#0085FF]/40 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
          >
            Quero Participar
          </button>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section id="evento" className="relative overflow-hidden pt-12 pb-20 md:pt-16 md:pb-24 bg-gradient-to-r from-white via-white to-[#F0F7FF]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            {/* Esquerda: Textos e CTAs */}
            <div className="lg:col-span-5 space-y-5 text-center lg:text-left reveal-scroll">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#EBF5FF] border border-[#0085FF]/20 text-[#0085FF] text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-[#F3C649]" />
                <span>Edição 2026</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-black text-[#004B97] tracking-tight leading-tight">
                Encontro do Instalador Carflax
              </h1>

              <p className="text-[#0085FF] font-bold text-base sm:text-lg leading-snug">
                Conectando marcas, instaladores e oportunidades de negócio.
              </p>

              <p className="text-slate-500 text-xs sm:text-sm leading-relaxed max-w-xl mx-auto lg:mx-0">
                O Encontro do Instalador Carflax reúne profissionais dos segmentos hidráulico e elétrico em uma experiência completa de relacionamento entre clientes, fornecedores e parceiros, promovendo demonstrações técnicas, networking, geração de negócios e fortalecimento de marcas.
              </p>

              {/* Botão de Ação + Data */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <button
                  onClick={scrollToForm}
                  className="px-8 py-3.5 rounded-full bg-[#0085FF] hover:bg-[#0070F3] text-white font-bold text-sm tracking-tight shadow-lg shadow-[#0085FF]/30 hover:shadow-xl hover:shadow-[#0085FF]/50 transition-all transform hover:-translate-y-1 active:translate-y-0"
                >
                  Quero Participar
                </button>

                <div className="flex items-center gap-2 text-slate-600 text-xs sm:text-sm font-medium">
                  <Calendar className="w-4 h-4 text-[#F3C649]" />
                  <span>{dataEventoLabel} · das {horarioLabel}</span>
                </div>
              </div>
            </div>

            {/* Direita: Imagem Ampliada do Evento */}
            <div className="lg:col-span-7 relative reveal-scroll">
              <div className="relative mx-auto w-full">
                <div className="relative z-10 rounded-[32px] overflow-hidden shadow-2xl border-4 border-white bg-slate-900 group">
                  <img
                    src="/festival-instaladores.jpg"
                    alt="Festival dos Instaladores Carflax"
                    className="w-full h-auto aspect-video sm:aspect-[16/9] object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/30 via-transparent to-transparent pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section: Uma Experiência Completa ── */}
      <section id="experiencia" className="py-16 sm:py-24 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14 space-y-3 reveal-scroll">
            <span className="px-4 py-1.5 rounded-full bg-[#FFF9EB] border border-[#F3C649]/40 text-[#D99B00] text-xs font-bold uppercase tracking-wider inline-block">
              Uma experiência completa
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#004B97] tracking-tight">
              Uma experiência completa para o instalador
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: "Buffet do Instalador", icon: Coffee },
              { title: "Kit do Instalador", icon: Package },
              { title: "Demonstrações técnicas", icon: Zap },
              { title: "Novidades dos fabricantes", icon: Sparkles },
              { title: "Sorteios", icon: Trophy },
              { title: "Networking", icon: Users },
              { title: "Atendimento especializado", icon: UserCheck },
              { title: "Contato direto com fabricantes", icon: Factory },
            ].map((item, idx) => {
              const IconComp = item.icon;
              return (
                <div
                  key={idx}
                  style={{ transitionDelay: `${idx * 80}ms` }}
                  className="reveal-scroll bg-white border border-[#E5EFFF] rounded-2xl p-6 shadow-xs hover:shadow-xl hover:border-[#0085FF]/50 hover:-translate-y-1 flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#EBF5FF] text-[#0085FF] group-hover:bg-[#0085FF] group-hover:text-white flex items-center justify-center shrink-0 transition-colors duration-300">
                    <IconComp className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 leading-snug group-hover:text-[#004B97] transition-colors">
                    {item.title}
                  </h3>
                </div>
              );
            })}
          </div>

          {/* Aviso do Kit do Instalador */}
          <div className="reveal-scroll mt-10 rounded-2xl bg-[#FFF9EB] border border-[#F3C649]/40 p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            <div className="w-14 h-14 rounded-2xl bg-[#F3C649]/20 text-[#D99B00] flex items-center justify-center shrink-0">
              <Gift className="w-7 h-7" />
            </div>
            <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
              Todos os participantes receberão um <strong className="text-[#004B97]">Kit do Instalador</strong> composto por
              brindes úteis fornecidos pelas marcas participantes e concorrerão a sorteios exclusivos durante o evento.
            </p>
          </div>
        </div>
      </section>

      {/* ── Section: Público estimado ── */}
      <section className="py-12 bg-[#F7FAFC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="reveal-scroll rounded-3xl bg-gradient-to-r from-[#004B97] via-[#0060C8] to-[#0085FF] p-8 sm:p-10 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
            <div className="space-y-2">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-blue-200 block">
                Público estimado
              </span>
              <p className="text-blue-50 text-sm sm:text-base leading-relaxed max-w-xl">
                Instaladores hidráulicos, eletricistas e clientes estratégicos da Carflax.
              </p>
            </div>
            <div className="shrink-0 rounded-2xl bg-white/15 border border-white/25 px-6 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-white">
                <Users className="w-5 h-5 text-[#F3C649]" />
                <span className="text-2xl sm:text-3xl font-black tracking-tight">{publicoLabel}</span>
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-100">
                participantes em {anoEvento}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section: Data, horário e local ── */}
      <section className="py-16 sm:py-20 bg-[#F7FAFC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12 reveal-scroll">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#004B97] tracking-tight">
              Data, horário e local
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { label: "Data", value: dataEventoLabel, icon: Calendar },
              { label: "Horário", value: horarioLabel, icon: Clock },
              { label: "Local", value: localLabel, icon: MapPin },
            ].map((item, idx) => {
              const IconComp = item.icon;
              return (
                <div
                  key={idx}
                  style={{ transitionDelay: `${idx * 100}ms` }}
                  className="reveal-scroll bg-white border border-[#E5EFFF] rounded-2xl p-8 shadow-xs hover:shadow-xl hover:border-[#0085FF]/50 transition-shadow flex flex-col items-center text-center gap-3"
                >
                  <div className="w-14 h-14 rounded-2xl bg-[#EBF5FF] text-[#0085FF] flex items-center justify-center">
                    <IconComp className="w-7 h-7" />
                  </div>
                  <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#F3C649]">
                    {item.label}
                  </span>
                  <p className="text-base font-bold text-slate-900">{item.value}</p>
                </div>
              );
            })}
          </div>

          <p className="reveal-scroll text-center text-xs sm:text-sm text-slate-500 mt-8 max-w-2xl mx-auto leading-relaxed">
            Espaço amplo para estandes, demonstrações técnicas e relacionamento entre fornecedores e clientes.
          </p>
        </div>
      </section>

      {/* ── Section: Benefícios para o expositor ── */}
      <section id="beneficios" className="py-16 sm:py-24 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14 space-y-3 reveal-scroll">
            <span className="px-4 py-1.5 rounded-full bg-[#FFF9EB] border border-[#F3C649]/40 text-[#D99B00] text-xs font-bold uppercase tracking-wider inline-block">
              Benefícios para o expositor
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#004B97] tracking-tight">
              O que sua marca ganha ao expor
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: "Exposição da marca", icon: Megaphone },
              { title: "Contato direto com instaladores", icon: Users },
              { title: "Demonstrações técnicas", icon: Wrench },
              { title: "Geração de novos negócios", icon: TrendingUp },
              { title: "Divulgação nas redes sociais", icon: Share2 },
              { title: "Networking", icon: Handshake },
              { title: "Relacionamento com clientes", icon: Building2 },
              { title: "Participação em sorteios", icon: Award },
              { title: "Fortalecimento da marca", icon: Star },
            ].map((item, idx) => {
              const IconComp = item.icon;
              return (
                <div
                  key={idx}
                  style={{ transitionDelay: `${idx * 70}ms` }}
                  className="reveal-scroll bg-[#F7FAFC] border border-[#E5EFFF] rounded-xl px-5 py-4 flex items-center gap-3 hover:bg-white hover:border-[#0085FF]/50 hover:shadow-md transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-white border border-[#E5EFFF] text-[#0085FF] group-hover:bg-[#0085FF] group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                    <IconComp className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold text-slate-800 leading-snug group-hover:text-[#004B97] transition-colors">
                    {item.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Section: O que sua marca precisa levar ── */}
      <section id="o-que-levar" className="py-16 sm:py-24 bg-[#F7FAFC] border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14 space-y-3 reveal-scroll">
            <span className="px-4 py-1.5 rounded-full bg-[#EBF5FF] border border-[#0085FF]/30 text-[#0085FF] text-xs font-bold uppercase tracking-wider inline-block">
              Checklist do Expositor
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#004B97] tracking-tight">
              O que sua marca precisa levar
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto">
              Tudo o que você precisa preparar para garantir uma participação de alto impacto no evento.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="reveal-scroll bg-white border border-[#E5EFFF] rounded-2xl p-6 shadow-xs hover:shadow-xl hover:border-[#0085FF]/50 transition-all space-y-3">
              <div className="w-12 h-12 rounded-xl bg-[#EBF5FF] text-[#0085FF] flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">1. Estrutura de Exposição</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Banner roll-up, totem, mesa personalizada ou estande próprio para montagem na véspera (21/10 a partir das 14h).
              </p>
            </div>

            <div className="reveal-scroll bg-white border border-[#E5EFFF] rounded-2xl p-6 shadow-xs hover:shadow-xl hover:border-[#0085FF]/50 transition-all space-y-3">
              <div className="w-12 h-12 rounded-xl bg-[#FFF9EB] text-[#D99B00] flex items-center justify-center">
                <Gift className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">2. Brindes para o Kit</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Itens úteis para o dia a dia do instalador (bonés, camisetas, trenas, ferramentas, chaveiros ou mochilas).
              </p>
            </div>

            <div className="reveal-scroll bg-white border border-[#E5EFFF] rounded-2xl p-6 shadow-xs hover:shadow-xl hover:border-[#0085FF]/50 transition-all space-y-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Trophy className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">3. Prêmio para Sorteio</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                1 item de destaque (furadeira, ducha premium, kit ferramentas ou vale-compras) para o sorteio oficial dos instaladores.
              </p>
            </div>

            <div className="reveal-scroll bg-white border border-[#E5EFFF] rounded-2xl p-6 shadow-xs hover:shadow-xl hover:border-[#0085FF]/50 transition-all space-y-3">
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">4. Equipe de Atendimento</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                1 a 2 representantes/promotores da marca para recepção, atendimento e demonstrações técnicas aos clientes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section: Investimento & Cotas de Participação ── */}
      <section id="investimento" className="py-16 sm:py-20 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="reveal-scroll rounded-3xl bg-gradient-to-r from-slate-900 via-[#004B97] to-[#0060C8] p-8 sm:p-12 shadow-2xl relative overflow-hidden text-white">
            <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-96 h-96 bg-[#0085FF]/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8 space-y-4 text-center lg:text-left">
                <span className="px-3.5 py-1 rounded-full bg-[#F3C649] text-slate-950 text-[11px] font-black uppercase tracking-wider inline-block">
                  Investimento Transparente
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                  Cota de Participação & Patrocínio
                </h2>
                <p className="text-blue-100 text-sm sm:text-base leading-relaxed max-w-2xl">
                  Garanta a presença da sua marca no maior encontro de instaladores e eletricistas da região com investimento acessível e alto retorno em relacionamento e novos negócios.
                </p>
                <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-4 text-xs text-blue-200 font-medium">
                  <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-[#F3C649]" /> Espaço para Exposição</div>
                  <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-[#F3C649]" /> Inserção no Kit do Instalador</div>
                  <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-[#F3C649]" /> Divulgação nas Redes Carflax</div>
                </div>
              </div>

              <div className="lg:col-span-4 flex flex-col items-center lg:items-end text-center lg:text-right">
                <div className="bg-white/10 border border-white/20 rounded-2xl p-6 backdrop-blur-md w-full max-w-xs space-y-3">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-blue-200 block">
                    Cota a partir de
                  </span>
                  <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                    R$ 1.000<span className="text-lg font-bold text-blue-200">,00</span>
                  </div>
                  <span className="text-[10px] text-blue-200 block">
                    Cotas customizáveis sob medida com a equipe de Marketing
                  </span>
                  <button
                    onClick={scrollToForm}
                    className="w-full py-3 rounded-xl bg-[#F3C649] hover:bg-[#e2b73c] text-slate-950 font-extrabold text-xs uppercase tracking-wider shadow-lg transition-all"
                  >
                    Garantir Minha Cota →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section: Cronograma / A jornada do evento ── */}
      <section id="cronograma" className="py-16 sm:py-24 bg-[#F7FAFC]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-4 space-y-3 reveal-scroll">
            <span className="px-4 py-1.5 rounded-full bg-[#FFF9EB] border border-[#F3C649]/40 text-[#D99B00] text-xs font-bold uppercase tracking-wider inline-block">
              Cronograma
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#004B97] tracking-tight">
              A jornada do evento
            </h2>
          </div>
          <p className="reveal-scroll text-center text-xs sm:text-sm text-slate-500 mb-14 max-w-2xl mx-auto">
            A montagem dos estandes ocorre na véspera, 21/10, a partir das 14h.
          </p>

          <div className="relative">
            {/* Trilho vertical: centralizado no desktop, à esquerda no mobile */}
            <div className="absolute top-0 bottom-0 left-4 md:left-1/2 md:-translate-x-1/2 w-0.5 bg-[#E5EFFF]" />

            <div className="space-y-6">
              {[
                { hora: "14h00", titulo: "Montagem dos estandes", desc: "Na véspera do evento, no galpão da Carflax." },
                { hora: "17h00", titulo: "Recepção dos fornecedores", desc: "Acolhimento e posicionamento das marcas expositoras." },
                { hora: "17h30", titulo: "Credenciamento", desc: "Chegada e recepção dos instaladores." },
                { hora: "18h00", titulo: "Buffet", desc: "Abertura oficial com o Buffet do Instalador." },
                { hora: "18h30", titulo: "Demonstrações técnicas", desc: "Apresentação prática dos produtos nos estandes." },
                { hora: "19h15", titulo: "Networking", desc: "Relacionamento entre marcas e profissionais." },
                { hora: "20h00", titulo: "Sorteios", desc: "Entrega dos prêmios oferecidos pelas marcas." },
                { hora: "20h30", titulo: "Encerramento", desc: "Agradecimentos e despedida." },
              ].map((item, idx) => {
                const isRight = idx % 2 === 1;
                return (
                  <div
                    key={idx}
                    className={`reveal-scroll relative pl-12 md:pl-0 md:flex md:items-center ${
                      isRight ? "md:flex-row" : "md:flex-row-reverse"
                    }`}
                  >
                    {/* Marcador no trilho */}
                    <div className="absolute left-4 md:left-1/2 top-6 md:top-1/2 -translate-x-1/2 md:-translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[#F3C649] ring-4 ring-[#F7FAFC] z-10" />

                    {/* Card */}
                    <div className="md:w-1/2 md:px-8">
                      <div className="bg-white border border-[#E5EFFF] rounded-2xl p-5 shadow-xs hover:shadow-lg hover:border-[#0085FF]/50 transition-all">
                        <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#F3C649] block mb-1">
                          {item.hora}
                        </span>
                        <h3 className="text-base font-bold text-slate-900 mb-1">{item.titulo}</h3>
                        <p className="text-slate-500 text-xs leading-relaxed">{item.desc}</p>
                      </div>
                    </div>

                    {/* Coluna vazia do lado oposto, para o card ocupar metade */}
                    <div className="hidden md:block md:w-1/2" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section: Formulário por Etapas (Exato das imagens de referência) ── */}
      <section id="cadastro-form" className="py-20 bg-[#F7FAFC] border-t border-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="reveal-scroll bg-white rounded-[32px] border border-[#E5EFFF] p-6 sm:p-12 shadow-xl relative">
            
            {/* Stepper Indicator (1 -> 2 -> 3 -> 4 -> 5 -> 6) */}
            <div className="flex items-center justify-center gap-2 sm:gap-4 mb-10">
              {[1, 2, 3, 4, 5, 6].map((num, i) => (
                <div key={num} className="flex items-center gap-2 sm:gap-4">
                  <button
                    onClick={() => {
                      if (num < step) setStep(num);
                    }}
                    className={`w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center transition-all ${
                      step > num
                        ? "bg-[#F3C649] text-white shadow-xs"
                        : step === num
                        ? "bg-[#0085FF] text-white shadow-md shadow-[#0085FF]/30 ring-4 ring-[#0085FF]/10"
                        : "bg-[#F1F5F9] text-slate-400"
                    }`}
                  >
                    {step > num ? <Check className="w-4 h-4" /> : num}
                  </button>
                  {i < 5 && (
                    <span className="text-slate-300 text-xs font-bold">→</span>
                  )}
                </div>
              ))}
            </div>

            {submitted ? (
              <div className="py-12 text-center space-y-6 animate-fadeIn">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-slate-900">Cadastro de Fornecedor Recebido!</h3>
                  <p className="text-slate-600 text-sm max-w-md mx-auto leading-relaxed">
                    Obrigado por preencher a adesão da marca <strong className="text-[#004B97]">{marca || empresa}</strong>. Os dados foram sincronizados diretamente com o Carflax HUB.
                  </p>
                </div>

                <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <a
                    href={waLink("Olá, acabei de preencher as 6 etapas do cadastro no Encontro do Instalador.")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Falar no WhatsApp</span>
                  </a>

                  <button
                    onClick={() => {
                      setSubmitted(false);
                      setStep(1);
                      setEmpresa("");
                      setMarca("");
                      setResponsavel("");
                      setCargo("");
                      setTelefone("");
                      setWhatsapp("");
                      setEmail("");
                    }}
                    className="w-full sm:w-auto px-6 py-3.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider transition-colors"
                  >
                    Novo Cadastro
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitFinal}>
                {errorMsg && (
                  <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold text-center">
                    {errorMsg}
                  </div>
                )}

                {/* ── ETAPA 1: Cadastro do fornecedor ── */}
                {step === 1 && (
                  <div className="space-y-8 animate-fadeIn">
                    <div className="text-center space-y-1">
                      <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#F3C649] block">
                        ETAPA 1 DE 6
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-black text-[#004B97] tracking-tight">
                        Cadastro do fornecedor
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400">
                        Dados da empresa e do responsável pelo contato.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-5 items-end">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Empresa <span className="text-[#F3C649]">*</span></label>
                        <input type="text" required value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Marca <span className="text-[#F3C649]">*</span></label>
                        <input type="text" required value={marca} onChange={(e) => setMarca(e.target.value)} className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Responsável <span className="text-[#F3C649]">*</span></label>
                        <input type="text" required value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Cargo <span className="text-[#F3C649]">*</span></label>
                        <input type="text" value={cargo} onChange={(e) => setCargo(e.target.value)} className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Telefone <span className="text-[#F3C649]">*</span></label>
                        <input type="text" value={telefone} onChange={(e) => setTelefone(formatPhone(e.target.value))} placeholder="(00) 0000-0000" className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">WhatsApp <span className="text-[#F3C649]">*</span></label>
                        <input type="text" required value={whatsapp} onChange={(e) => setWhatsapp(formatPhone(e.target.value))} placeholder="(00) 00000-0000" className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">E-mail <span className="text-[#F3C649]">*</span></label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Segmento <span className="text-[#F3C649]">*</span></label>
                        <select value={segmento} onChange={(e) => setSegmento(e.target.value as "hidraulico" | "eletrico")} className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs">
                          <option value="hidraulico">Hidráulico</option>
                          <option value="eletrico">Elétrico</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── ETAPA 2: Estrutura da exposição ── */}
                {step === 2 && (
                  <div className="space-y-8 animate-fadeIn">
                    <div className="text-center space-y-1">
                      <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#F3C649] block">
                        ETAPA 2 DE 6
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-black text-[#004B97] tracking-tight">
                        Estrutura da exposição
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400">
                        O que sua marca pretende levar para exposição?
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        "Banner", "Inflável", "Mesa personalizada", "Stand próprio",
                        "Totem", "TV", "Painel", "Outros"
                      ].map((item) => {
                        const selected = estruturaOpcoes.includes(item);
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => toggleOption(estruturaOpcoes, setEstruturaOpcoes, item)}
                            className={`px-4 py-3.5 rounded-2xl border text-xs font-medium transition-all flex items-center gap-2.5 ${
                              selected
                                ? "border-[#0085FF] bg-[#EBF5FF] text-[#004B97] font-bold shadow-xs"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              selected ? "border-[#0085FF] bg-[#0085FF] text-white" : "border-slate-300"
                            }`}>
                              {selected && <Check className="w-3 h-3" />}
                            </div>
                            <span>{item}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Observações <span className="text-[#F3C649]">*</span>
                      </label>
                      <textarea
                        rows={4}
                        value={obsEstrutura}
                        onChange={(e) => setObsEstrutura(e.target.value)}
                        placeholder="Dimensões, necessidades específicas, etc."
                        className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all resize-none shadow-xs"
                      />
                    </div>
                  </div>
                )}

                {/* ── ETAPA 3: Informações sobre a montagem ── */}
                {step === 3 && (
                  <div className="space-y-8 animate-fadeIn">
                    <div className="text-center space-y-1">
                      <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#F3C649] block">
                        ETAPA 3 DE 6
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-black text-[#004B97] tracking-tight">
                        Informações sobre a montagem
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400">
                        A montagem ocorrerá na véspera do evento (21/10), a partir das 14h, diretamente no galpão da Carflax.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-end">
                      <div className="flex flex-col justify-end h-full">
                        <label className="text-xs font-bold text-slate-700 mb-1.5 min-h-[2.5rem] flex items-end">
                          <span>Horário previsto de chegada <span className="text-[#F3C649]">*</span></span>
                        </label>
                        <div className="relative">
                          <input
                            type="time"
                            value={horarioChegada}
                            onChange={(e) => setHorarioChegada(e.target.value)}
                            className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col justify-end h-full">
                        <label className="text-xs font-bold text-slate-700 mb-1.5 min-h-[2.5rem] flex items-end">
                          <span>Necessidade de energia elétrica <span className="text-[#F3C649]">*</span></span>
                        </label>
                        <input
                          type="text"
                          value={energiaEletrica}
                          onChange={(e) => setEnergiaEletrica(e.target.value)}
                          placeholder="Sim / Não — qual voltagem"
                          className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs"
                        />
                      </div>

                      <div className="flex flex-col justify-end h-full">
                        <label className="text-xs font-bold text-slate-700 mb-1.5 min-h-[2.5rem] flex items-end">
                          <span>Necessidade de apoio da equipe Carflax <span className="text-[#F3C649]">*</span></span>
                        </label>
                        <input
                          type="text"
                          value={apoioCarflax}
                          onChange={(e) => setApoioCarflax(e.target.value)}
                          placeholder="Sim / Não — qual apoio"
                          className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs"
                        />
                      </div>
                    </div>

                  </div>
                )}

                {/* ── ETAPA 4: Representantes da marca ── */}
                {step === 4 && (
                  <div className="space-y-8 animate-fadeIn">
                    <div className="text-center space-y-1">
                      <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#F3C649] block">
                        ETAPA 4 DE 6
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-black text-[#004B97] tracking-tight">
                        Representantes da marca
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400">
                        Quem estará presente representando a sua marca no evento.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                      <div>
                        <label className="text-xs font-bold text-slate-700 mb-1.5 min-h-[2.5rem] flex items-end"><span>Quantidade de representantes <span className="text-[#F3C649]">*</span></span></label>
                        <input type="number" min="1" max="10" value={qtdRepresentantes} onChange={(e) => setQtdRepresentantes(e.target.value)} className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 mb-1.5 min-h-[2.5rem] flex items-end"><span>Nome dos representantes <span className="text-[#F3C649]">*</span></span></label>
                        <input type="text" value={nomeRepresentantes} onChange={(e) => setNomeRepresentantes(e.target.value)} placeholder="Ex: Carlos e Ana" className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 mb-1.5 min-h-[2.5rem] flex items-end"><span>Cargo <span className="text-[#F3C649]">*</span></span></label>
                        <input type="text" value={cargoRepresentantes} onChange={(e) => setCargoRepresentantes(e.target.value)} placeholder="Ex: Promotor / Técnico" className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 mb-1.5 min-h-[2.5rem] flex items-end"><span>Telefone <span className="text-[#F3C649]">*</span></span></label>
                        <input type="text" value={telefoneRepresentantes} onChange={(e) => setTelefoneRepresentantes(formatPhone(e.target.value))} placeholder="(00) 00000-0000" className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs" />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── ETAPA 5: Brindes para o Kit do Instalador ── */}
                {step === 5 && (
                  <div className="space-y-8 animate-fadeIn">
                    <div className="text-center space-y-1">
                      <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#F3C649] block">
                        ETAPA 5 DE 6
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-black text-[#004B97] tracking-tight">
                        Brindes para o Kit do Instalador
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400">
                        Os brindes serão utilizados para compor o Kit do Instalador entregue aos participantes. Priorize itens úteis para o dia a dia do profissional.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        "Bonés", "Camisetas", "Trenas", "Ferramentas",
                        "Mochilas", "Canecas", "Blocos", "Chaveiros", "Outros"
                      ].map((item) => {
                        const selected = brindesOpcoes.includes(item);
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => toggleOption(brindesOpcoes, setBrindesOpcoes, item)}
                            className={`px-4 py-3.5 rounded-2xl border text-xs font-medium transition-all flex items-center gap-2.5 ${
                              selected
                                ? "border-[#0085FF] bg-[#EBF5FF] text-[#004B97] font-bold shadow-xs"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              selected ? "border-[#0085FF] bg-[#0085FF] text-white" : "border-slate-300"
                            }`}>
                              {selected && <Check className="w-3 h-3" />}
                            </div>
                            <span>{item}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="max-w-xs">
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Quantidade <span className="text-[#F3C649]">*</span>
                      </label>
                      <input
                        type="text"
                        value={brindesQtd}
                        onChange={(e) => setBrindesQtd(e.target.value)}
                        placeholder="Ex.: 50"
                        className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20 transition-all shadow-xs"
                      />
                    </div>
                  </div>
                )}

                {/* ── ETAPA 6: Qual será o principal prêmio da sua marca? ── */}
                {step === 6 && (
                  <div className="space-y-8 animate-fadeIn">
                    <div className="text-center space-y-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#F3C649] block">
                        ETAPA 6 DE 6
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-black text-[#004B97] tracking-tight">
                        Qual será o principal prêmio da sua marca?
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
                        Cada fornecedor deverá disponibilizar um item de maior valor para sorteio durante o evento. O valor mínimo sugerido é de R$ 200,00. Exemplos: furadeira, parafusadeira, ducha premium, kit de ferramentas, escada, vale compras ou outro.
                      </p>
                    </div>

                    <div className="max-w-2xl mx-auto space-y-2">
                      <label className="block text-xs font-bold text-slate-700">
                        Prêmio principal <span className="text-[#F3C649]">*</span>
                      </label>
                      <textarea
                        rows={4}
                        required
                        value={premioDescricao}
                        onChange={(e) => setPremioDescricao(e.target.value)}
                        placeholder="Descreva o prêmio que sua marca disponibilizará"
                        className={`w-full px-4 py-3 rounded-2xl bg-white border text-slate-800 text-xs font-medium placeholder:text-slate-400 focus:outline-none transition-all resize-none shadow-xs ${
                          errorMsg && !premioDescricao.trim()
                            ? "border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                            : "border-slate-200 focus:border-[#0085FF] focus:ring-2 focus:ring-[#0085FF]/20"
                        }`}
                      />
                      {errorMsg && !premioDescricao.trim() && (
                        <span className="text-rose-500 text-xs font-semibold block mt-1">
                          Campo obrigatório
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Controles de Navegação do Formulário Footer (Voltar / Próxima etapa / Enviar cadastro) */}
                <div className="pt-8 mt-8 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    {step > 1 ? (
                      <button
                        type="button"
                        onClick={prevStep}
                        className="px-6 py-2.5 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition-all flex items-center gap-2"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Voltar</span>
                      </button>
                    ) : (
                      <div />
                    )}
                  </div>

                  <span className="text-[11px] text-slate-400 font-medium">
                    Todos os campos são de preenchimento obrigatório.
                  </span>

                  <div>
                    {step < 6 ? (
                      <button
                        type="button"
                        onClick={nextStep}
                        className="px-8 py-3 rounded-full bg-[#0085FF] hover:bg-[#0070F3] text-white font-bold text-xs tracking-tight shadow-md shadow-[#0085FF]/20 transition-all flex items-center gap-2"
                      >
                        <span>Próxima etapa</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={submitting}
                        className="px-8 py-3 rounded-full bg-[#0085FF] hover:bg-[#0070F3] text-white font-bold text-xs tracking-tight shadow-md shadow-[#0085FF]/20 transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Enviando...</span>
                          </>
                        ) : (
                          <span>Enviar cadastro</span>
                        )}
                      </button>
                    )}
                  </div>
                </div>

              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── Call to Action Banner Final ── */}
      <section className="py-16 bg-white border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="reveal-scroll bg-gradient-to-r from-[#004B97] via-[#0060C8] to-[#0085FF] rounded-3xl p-10 sm:p-14 text-center text-white shadow-xl space-y-6">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              Sua marca no lugar certo, com as pessoas certas.
            </h2>
            <p className="text-blue-100 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
              Participe do Encontro do Instalador Carflax {anoEvento} e fortaleça seu relacionamento com os
              profissionais que influenciam diariamente a escolha de materiais hidráulicos e elétricos.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={scrollToForm}
                className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-white text-[#004B97] hover:bg-blue-50 font-bold text-sm shadow-md transition-all"
              >
                Confirmar Participação
              </button>
              <a
                href={waLink("Olá, gostaria de informações sobre o Encontro do Instalador Carflax 2026.")}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-6 py-3.5 rounded-full bg-blue-700/60 hover:bg-blue-700 border border-blue-400/40 text-white font-bold text-sm transition-all"
              >
                Falar com a Equipe de Marketing
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="pt-14 pb-10 bg-white border-t border-slate-200 text-slate-500 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 text-center md:text-left">
            {/* Marca */}
            <div className="flex flex-col items-center md:items-start gap-3">
              <img
                src="https://carflax-connect-2026.lovable.app/__l5e/assets-v1/35f1828f-bca7-49bc-8504-221ee40aa6ee/carflax-logo.png"
                alt="Carflax"
                className="h-9 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/carflax-assinatura.svg";
                }}
              />
              <p className="leading-relaxed max-w-xs">
                Encontro do Instalador Carflax {anoEvento} — conectando marcas, instaladores e oportunidades de negócio.
              </p>
            </div>

            {/* Contato */}
            <div className="space-y-3">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#004B97] block">
                Contato
              </span>
              <ul className="space-y-2.5">
                <li>
                  <a href="tel:+551145219777" className="flex items-center justify-center md:justify-start gap-2 hover:text-[#004B97] transition-colors">
                    <Phone className="w-3.5 h-3.5 text-[#0085FF] shrink-0" />
                    <span className="font-semibold">(11) 4521-9777</span>
                  </a>
                </li>
                <li>
                  <a
                    href={waLink("Olá, gostaria de informações sobre o Encontro do Instalador Carflax 2026.")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center md:justify-start gap-2 hover:text-emerald-600 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="font-semibold">WhatsApp (11) 95908-0179</span>
                  </a>
                </li>
                <li>
                  <a
                    href="https://instagram.com/carflax.jundiai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center md:justify-start gap-2 hover:text-[#004B97] transition-colors"
                  >
                    <AtSign className="w-3.5 h-3.5 text-[#0085FF] shrink-0" />
                    <span className="font-semibold">@carflax.jundiai</span>
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                </li>
              </ul>
            </div>

            {/* Endereço */}
            <div className="space-y-3">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#004B97] block">
                Endereço
              </span>
              <div className="flex items-start justify-center md:justify-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#0085FF] shrink-0 mt-0.5" />
                <p className="leading-relaxed font-semibold max-w-xs">
                  Galpão da Carflax — Av. Américo Bruno, 125, Pte. São João — Jundiaí
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-center">
            <p className="text-slate-600">
              Esperamos sua marca no Encontro do Instalador Carflax {anoEvento}. Vamos construir essa experiência juntos!
            </p>
            <div className="flex items-center gap-5 font-semibold shrink-0">
              <a href="/politica-privacidade" className="hover:text-[#004B97] transition-colors">Termos &amp; Privacidade</a>
              <span className="text-[10px]">© {anoEvento} Carflax · Encontro do Instalador</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
