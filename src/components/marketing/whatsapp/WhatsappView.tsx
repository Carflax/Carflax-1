import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  startTransition,
  Fragment,
  type ReactElement,
} from "react";
import {
  Search,
  Paperclip,
  Send,
  CheckCheck,
  User,
  Check,
  Megaphone,
  Flame,
  Archive,
  ChevronDown,
  DollarSign,
  X,
  Bell,
  UserRound,
  RefreshCw,
  Pin,
  PinOff,
  Play,
  Pause,
  Mic,
  FileText,
  Sparkles,
  ShoppingBag,
  Camera,
  Video,
  Smile,
  Printer,
  ShieldAlert,
  CornerUpLeft,
  Eye,
  Plus,
} from "lucide-react";
import { evolutionApi } from "@/lib/evolution-v2";
import { supabase } from "@/lib/supabase";
import { marketingService } from "@/lib/marketing-service";
import { cn, formatBrTime, formatBrDate } from "@/lib/utils";
import { apiDashboardProdutos, apiGetLinkPreview, apiCrmOrcamentos, apiClientePorTelefone, apiBuscarClientesErp, apiSincronizarLeadErp } from "@/lib/api";
import type { ClienteErp, ClienteErpBusca } from "@/lib/api";
import { parseOrcamentoPdf } from "@/lib/pdf-orcamento";
import { transcribeAudio, classifyByRules } from "@/lib/gemini-service";
import { Package } from "lucide-react";
import { useNotification } from "@/hooks/useNotification";
import { ArchiveApprovalModal } from "./ArchiveApprovalModal";
import { GravadorAudio } from "./GravadorAudio";
import {
  cancelarPedidoPendente,
  podeAprovarArquivamento,
  solicitarAprovacaoArquivamento,
  verificarDebitoAberto,
  type DebtSnapshot,
} from "@/lib/archive-approval";

interface NormalizedProduct {
  cod: string;
  descricao: string;
  marca: string;
  preco: number;
  debito: number;
  credito: number;
  disponivel: number;
  quantidade?: number;
  foto_url?: string;
}

const BRAND_COLORS = [
  ["from-blue-500 to-blue-700", "bg-blue-600"],
  ["from-emerald-500 to-emerald-700", "bg-emerald-600"],
  ["from-violet-500 to-violet-700", "bg-violet-600"],
  ["from-orange-500 to-orange-700", "bg-orange-600"],
  ["from-rose-500 to-rose-700", "bg-rose-600"],
  ["from-cyan-500 to-cyan-700", "bg-cyan-600"],
  ["from-amber-500 to-amber-700", "bg-amber-600"],
  ["from-indigo-500 to-indigo-700", "bg-indigo-600"],
  ["from-teal-500 to-teal-700", "bg-teal-600"],
  ["from-fuchsia-500 to-fuchsia-700", "bg-fuchsia-600"],
];

function getBrandStyle(brand: string) {
  let hash = 0;
  for (let i = 0; i < brand.length; i++)
    hash = brand.charCodeAt(i) + ((hash << 5) - hash);
  return BRAND_COLORS[Math.abs(hash) % BRAND_COLORS.length];
}

function getBrandInitials(brand: string): string {
  return (
    brand
      .trim()
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??"
  );
}

interface LinkPreview {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null; // base64 (sem prefixo) ou data URL completo
}

interface Message {
  id: string;
  text: string;
  time: string;
  rawTimestamp?: string;
  sender: "me" | "contact";
  status: "sent" | "delivered" | "read";
  tipo?: string;
  mediaUrl?: string;
  reacao?: string;
  fileName?: string;
  transcription?: string;
  isTranscribing?: boolean;
  quotedText?: string;
  quotedSender?: "me" | "contact";
  editado?: boolean;
  linkPreview?: LinkPreview | null;
  vendedorId?: string;
}

// Quente/Morno/Frio = temperatura de leads abertos (classificada).
// Perdido/Convertido = desfecho terminal, gravado ao finalizar/arquivar o chat.
type Temperature = "Quente" | "Morno" | "Frio" | "Perdido" | "Convertido";

interface LeadMetadata {
  source?: string;
  campaign?: string;
  status?: string;
  temperature?: Temperature;
  budgetId?: string;
  saleValue?: string;
  /** Valor da venda veio dos pedidos do ERP, não foi digitado pelo vendedor. */
  saleFromErp?: boolean;
  quoteValue?: string;
  /** Valor do orçamento veio do ERP (documento gerado na Citel). */
  quoteFromErp?: boolean;
  /** Número do orçamento no ERP que originou o valor. */
  quoteDocument?: string;
  city?: string;
  followUpDate?: string;
  /** Preenchido pelo agendador quando a conversa volta — liga o selo na lista. */
  followUpAtendidoEm?: string;
  numeroDocumento?: string;
  tipoDocumento?: number;
  cep?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  codigoAtividade?: string;
  codigoVendedor?: string;
  emailNfe?: string;
  formaPagamento?: string;
  observacao?: string;
}

const GoogleIcon = () => (
  <svg
    className="w-3.5 h-3.5"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.87-2.6-3.03-4.53-5.84-4.53z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      fill="#EA4335"
    />
  </svg>
);

const InstagramIcon = () => (
  <svg
    className="w-3.5 h-3.5 text-white"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

const FacebookIcon = () => (
  <svg
    className="w-3.5 h-3.5 text-white"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const TikTokIcon = () => (
  <svg
    className="w-3.5 h-3.5 text-white"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.02 1.59 4.23.99 1.25 2.37 2.15 3.91 2.51v3.83c-1.63-.03-3.23-.52-4.61-1.41-.43-.27-.82-.6-1.18-.96v7.7c.04 1.77-.47 3.52-1.47 4.96-1.6 2.31-4.29 3.73-7.12 3.74-2.22 0-4.38-.85-6.02-2.39-1.97-1.85-2.95-4.57-2.66-7.25C.7 11.23 2.91 8.5 5.86 7.73c1.23-.33 2.52-.3 3.73.08V11.7c-.89-.37-1.88-.41-2.8-.13-1.15.35-2.09 1.22-2.5 2.34-.63 1.72-.05 3.76 1.39 4.88.94.73 2.13.97 3.29.7 1.22-.29 2.22-1.22 2.55-2.42.04-1.97.02-17.02.02-17.02l.01-.03z" />
  </svg>
);

const detectOrigin = (text: string): string | null => {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.includes("google")) return "Google";
  if (lower.includes("instagram") || lower.includes("insta"))
    return "Instagram";
  if (lower.includes("facebook") || lower.includes("face")) return "Facebook";
  if (lower.includes("tiktok") || lower.includes("tik tok")) return "TikTok";
  if (
    lower.includes("site") ||
    lower.includes("website") ||
    lower.includes("pelo site")
  )
    return "Site";
  if (
    lower.includes("indicação") ||
    lower.includes("indicacao") ||
    lower.includes("indicado")
  )
    return "Indicação";
  return null;
};

interface CliqueAnuncio {
  codigo: string;
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_medium?: string | null;
  utm_term?: string | null;
  campaign_id?: string | null;
  adgroup_id?: string | null;
  keyword?: string | null;
  network?: string | null;
  device?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  confianca?: string | null;
  created_at?: string | null;
}

const CONFIANCA_LABEL: Record<string, string> = {
  codigo: "Exata — código veio na mensagem",
  janela: "Provável — único clique no período",
  janela_mesma_campanha: "Provável — vários cliques, mesma campanha",
};

const REDE_LABEL: Record<string, string> = {
  g: "Pesquisa Google",
  s: "Parceiro de pesquisa",
  d: "Rede de Display",
  u: "Google Shopping",
  ytv: "YouTube",
};

/**
 * Etiqueta da campanha no cabeçalho. Clicar abre o detalhe do clique que trouxe
 * o cliente — o nome curto sozinho não diz palavra-chave, dispositivo nem quando
 * o clique aconteceu, que é o que ajuda o vendedor a entender quem está do outro
 * lado antes de responder.
 */
function CampanhaBadge({ chat }: { chat: Chat }) {
  const [aberto, setAberto] = useState(false);
  const [clique, setClique] = useState<CliqueAnuncio | null>(null);
  const [buscado, setBuscado] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  // Derivado em vez de estado: setar "carregando" dentro do efeito dispara um
  // render extra à toa (e o eslint reclama, com razão).
  const carregando = aberto && !buscado;

  // `abreviarCampanha` continua decidindo SE mostra (ela descarta "Geral",
  // "Manual" e vazio); o texto exibido é o nome completo da campanha.
  const temCampanha = !!abreviarCampanha(chat.leadInfo?.campaign);
  const rotulo = nomeCampanhaCompleto(chat.leadInfo?.campaign);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  // Busca só quando abre, e uma vez por conversa.
  useEffect(() => {
    if (!aberto || buscado || !chat.id) return;
    let cancelado = false;
    supabase
      .from("ads_cliques")
      .select("codigo,utm_source,utm_campaign,utm_medium,utm_term,campaign_id,adgroup_id,keyword,network,device,gclid,fbclid,confianca,created_at")
      .eq("remote_jid", chat.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelado) {
          setClique((data as CliqueAnuncio) || null);
          setBuscado(true);
        }
      });
    return () => { cancelado = true; };
  }, [aberto, buscado, chat.id]);

  if (!temCampanha) return null;

  const linhas: [string, string][] = [];
  const campanhaCompleta = clique?.utm_campaign || chat.leadInfo?.campaign;
  if (campanhaCompleta) linhas.push(["Campanha", campanhaCompleta]);
  if (chat.leadInfo?.source) linhas.push(["Origem", chat.leadInfo.source]);
  if (clique?.keyword) linhas.push(["Palavra-chave", clique.keyword]);
  if (clique?.utm_term) linhas.push(["Termo", clique.utm_term]);
  if (clique?.network) linhas.push(["Rede", REDE_LABEL[clique.network] || clique.network]);
  if (clique?.device) linhas.push(["Dispositivo", clique.device]);
  if (clique?.campaign_id) linhas.push(["ID da campanha", clique.campaign_id]);
  if (clique?.created_at) {
    linhas.push([
      "Clique em",
      new Date(clique.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    ]);
  }
  if (clique?.confianca) {
    linhas.push(["Atribuição", CONFIANCA_LABEL[clique.confianca] || clique.confianca]);
  }

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-[9px] font-black tracking-wide leading-none hover:bg-primary/20 transition-colors max-w-[340px] truncate"
        title={`${rotulo} — clique para ver os detalhes`}
      >
        {rotulo}
      </button>

      {aberto && (
        <div className="absolute left-0 top-full mt-2 z-50 w-[300px] bg-card border border-border rounded-xl shadow-2xl p-3 space-y-2 animate-in fade-in zoom-in-95 duration-150">
          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
            De onde veio este cliente
          </p>

          {carregando && <p className="text-[10px] text-muted-foreground">Carregando…</p>}

          {linhas.map(([rotulo, valor]) => (
            <div key={rotulo} className="flex gap-2 items-start">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight w-[92px] shrink-0 pt-0.5">
                {rotulo}
              </span>
              <span className="text-[10px] font-bold text-foreground break-words flex-1">{valor}</span>
            </div>
          ))}

          {!carregando && !clique && (
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Sem o registro do clique. A campanha veio do próprio anúncio (Meta) ou o
              clique foi anterior à ponte de atribuição.
            </p>
          )}

          {clique?.gclid && (
            <div className="pt-1.5 border-t border-border/60">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">Google Click ID</span>
              <p className="text-[9px] font-mono text-muted-foreground/80 break-all select-all mt-0.5">
                {clique.gclid}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const getOriginBadge = (origin?: string) => {
  if (!origin) return null;
  const o = origin.toLowerCase();

  if (o.includes("google")) {
    return (
      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white border border-border/80 flex items-center justify-center shadow-[0_2px_4px_rgba(0,0,0,0.1)] z-10 animate-in fade-in zoom-in duration-200">
        <GoogleIcon />
      </div>
    );
  }
  if (o.includes("instagram")) {
    return (
      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] flex items-center justify-center shadow-[0_2px_4px_rgba(0,0,0,0.1)] z-10 animate-in fade-in zoom-in duration-200">
        <InstagramIcon />
      </div>
    );
  }
  if (o.includes("facebook")) {
    return (
      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#1877F2] flex items-center justify-center shadow-[0_2px_4px_rgba(0,0,0,0.1)] z-10 animate-in fade-in zoom-in duration-200">
        <FacebookIcon />
      </div>
    );
  }
  if (o.includes("tiktok")) {
    return (
      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-black flex items-center justify-center shadow-[0_2px_4px_rgba(0,0,0,0.1)] z-10 animate-in fade-in zoom-in duration-200">
        <TikTokIcon />
      </div>
    );
  }
  if (o.includes("site")) {
    return (
      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-[0_2px_4px_rgba(0,0,0,0.1)] z-10 animate-in fade-in zoom-in duration-200">
        <svg
          className="w-3 h-3 text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
      </div>
    );
  }
  if (o.includes("indicação") || o.includes("indicacao")) {
    return (
      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-[0_2px_4px_rgba(0,0,0,0.1)] z-10 animate-in fade-in zoom-in duration-200">
        <svg
          className="w-3 h-3 text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </div>
    );
  }
  return null;
};

/**
 * Número do cliente a partir do remoteJid ("5511987654321@s.whatsapp.net").
 * Devolve "" para grupo (@g.us) e para JID sem número reconhecível.
 */
function telefoneDoJid(jid?: string): string {
  if (!jid || jid.includes("@g.us")) return "";
  const digitos = jid.split("@")[0].replace(/\D/g, "");
  if (!digitos) return "";
  // Brasil: 55 + DDD + 8 ou 9 dígitos.
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    const ddd = digitos.slice(2, 4);
    const numero = digitos.slice(4);
    const meio = numero.length === 9 ? numero.slice(0, 5) : numero.slice(0, 4);
    const fim = numero.length === 9 ? numero.slice(5) : numero.slice(4);
    return `(${ddd}) ${meio}-${fim}`;
  }
  return `+${digitos}`;
}

/**
 * Primeiro e último nome. O pushName do WhatsApp costuma vir com sobrenome
 * composto, empresa ou emoji ("Danilo Oliveira Marketing"), o que estoura o
 * cabeçalho. Partícula ("da", "de", "dos") não conta como sobrenome.
 */
function nomeESobrenome(bruto?: string): string {
  const PARTICULAS = ["da", "de", "do", "das", "dos", "e", "di", "du"];
  const partes = String(bruto || "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return "";

  const cap = (p: string) =>
    PARTICULAS.includes(p.toLowerCase())
      ? p.toLowerCase()
      : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();

  // Os DOIS PRIMEIROS termos, não o primeiro e o último: o pushName costuma
  // terminar com empresa ou apelido ("Danilo Oliveira Marketing" -> "Danilo
  // Oliveira", e não "Danilo Marketing"). Partícula é pulada, para não parar
  // em "Maria da".
  const uteis = partes.filter((t) => !PARTICULAS.includes(t.toLowerCase()));
  if (uteis.length === 0) return cap(partes[0]);
  return uteis.slice(0, 2).map(cap).join(" ");
}

/**
 * Nome da campanha como veio do anúncio. Quando a URL trouxe só o
 * {campaignid} (número puro), prefixa com # para não parecer um valor solto.
 */
function nomeCampanhaCompleto(campanha?: string): string {
  const bruto = String(campanha || "").trim();
  if (/^\d+$/.test(bruto)) return `#${bruto}`;
  return bruto;
}

/**
 * Etiqueta curta da campanha, para caber ao lado do nome.
 * "[CARFLAX] [PESQUISA] [VINHEDO] 06-2026" -> "VINHEDO"
 * Termos genéricos não distinguem uma campanha da outra e são descartados.
 */
const CAMPANHA_GENERICA = ["CARFLAX", "PESQUISA", "PERFORMANCE", "PMAX", "ADS", "DISPLAY", "GERAL", "MANUAL"];
function abreviarCampanha(campanha?: string): string {
  const bruto = String(campanha || "").trim();
  if (!bruto || CAMPANHA_GENERICA.includes(bruto.toUpperCase())) return "";

  // Só dígitos: veio o {campaignid} do Google, sem nome legível.
  if (/^\d+$/.test(bruto)) return `#${bruto.slice(-4)}`;

  const tokens = bruto
    .replace(/[[\]]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t && !CAMPANHA_GENERICA.includes(t.toUpperCase()) && !/^\d{2}-\d{4}$/.test(t));

  const escolhido = tokens.find((t) => /[A-Za-zÀ-ÿ]/.test(t)) || tokens[0] || "";
  return escolhido.toUpperCase().slice(0, 12);
}

interface Chat {
  id: string;
  name: string;
  lastMessage: string;
  lastMessageSender?: "me" | "contact";
  lastMessageType?: string;
  lastMessageStatus?: "sent" | "delivered" | "read";
  time: string;
  unreadCount: number;
  avatar?: string;
  online?: boolean;
  arquivado?: boolean;
  fixado?: boolean;
  leadInfo?: LeadMetadata;
  vendedor_id?: string;
}

interface EvoChatResponse {
  id?: string;
  remoteJid?: string;
  name?: string;
  pushName?: string;
  lastMessage?: string | { message?: { conversation?: string } };
  updatedAt?: string;
  unreadCount?: number;
}

interface EvoContextInfo {
  quotedMessage?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
  };
  participant?: string;
  stanzaId?: string;
  // Metadados do anúncio Click-to-WhatsApp (Meta): presente na 1ª mensagem quando
  // o lead clicou num anúncio do Instagram/Facebook. Não depende do cliente digitar.
  externalAdReply?: {
    title?: string;
    body?: string;
    sourceType?: string;
    sourceId?: string;
    sourceUrl?: string;
    mediaType?: string;
  };
}

interface EvoMessageResponse {
  key?: { id?: string; fromMe?: boolean; remoteJid?: string };
  id?: string;
  pushName?: string;
  message?: {
    base64?: string;
    conversation?: string;
    extendedTextMessage?: {
      text?: string;
      contextInfo?: EvoContextInfo;
      // Campos de preview de link (Open Graph) que o WhatsApp/Baileys já envia no payload
      matchedText?: string;
      canonicalUrl?: string;
      title?: string;
      description?: string;
      jpegThumbnail?: string; // miniatura em base64 (sem prefixo data:)
    };
    imageMessage?: {
      caption?: string;
      mimetype?: string;
      contextInfo?: EvoContextInfo;
    };
    videoMessage?: {
      caption?: string;
      mimetype?: string;
      contextInfo?: EvoContextInfo;
    };
    audioMessage?: {
      ptt?: boolean;
      mimetype?: string;
      contextInfo?: EvoContextInfo;
    };
    documentMessage?: {
      fileName?: string;
      caption?: string;
      mimetype?: string;
      contextInfo?: EvoContextInfo;
    };
    stickerMessage?: { mimetype?: string };
    reactionMessage?: { key?: { id?: string }; text?: string };
  };
  messageTimestamp?: number;
  status?: string;
  contextInfo?: EvoContextInfo;
}

const ARCHIVE_REASONS = [
  { text: "Cliente Curioso", icon: "🧐" },
  { text: "Não vendemos o material", icon: "📦" },
  { text: "Falta de Estoque", icon: "⚠️" },
  { text: "Preço Alto", icon: "💵" },
  { text: "Prazo Longo", icon: "⏳" },
  { text: "Condição de pagamento", icon: "💳" },
  { text: "Convertido", icon: "🎉" },
  { text: "Outros", icon: "💬" },
];

// O modal de arquivamento agrupa por DESFECHO, e não numa lista corrida: vender
// e perder são resultados opostos, e agendar retorno nem arquiva a conversa.
// Tudo junto sob o título "motivo da perda" era o que confundia — o atendente
// tinha que achar "Convertido" no meio dos motivos de perda.
/** Altura máxima do compositor antes de virar rolagem (~6 linhas). */
const ALTURA_MAX_COMPOSER = 132;

const ARCHIVE_REASON_GANHO = "Convertido";
const ARCHIVE_REASONS_PERDA = ARCHIVE_REASONS.filter(
  (r) => r.text !== ARCHIVE_REASON_GANHO,
);

// Catálogo do seletor de emoji do compositor. Lista curada em vez de biblioteca
// externa: cobre o uso real do atendimento sem somar dependência nem peso ao bundle.
const EMOJI_CATEGORIAS: { nome: string; emojis: string[] }[] = [
  {
    nome: "Frequentes",
    emojis: ["👍", "🙏", "😊", "😀", "❤️", "🎉", "✅", "👏", "🤝", "💪", "🔥", "⭐"],
  },
  {
    nome: "Rostos",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🙂", "😉", "😊", "😍", "😘",
      "🤗", "🤔", "😐", "😴", "😥", "😢", "😭", "😤", "😡", "😱", "🤯", "🥳",
    ],
  },
  {
    nome: "Gestos",
    emojis: ["👍", "👎", "👌", "✌️", "🤞", "👋", "🙌", "👏", "🙏", "💪", "🤝", "☝️"],
  },
  {
    nome: "Trabalho",
    emojis: ["📦", "🚚", "🧾", "💰", "💵", "💳", "📅", "⏰", "📞", "📱", "📍", "✍️"],
  },
  {
    nome: "Obra",
    emojis: ["🔧", "🔩", "🚿", "🚰", "💧", "⚡", "🔌", "💡", "🏗️", "🧰", "🪛", "🧯"],
  },
  {
    nome: "Símbolos",
    emojis: ["✅", "❌", "⚠️", "❗", "❓", "⭐", "🔥", "🎯", "📈", "🎉", "🆗", "➡️"],
  },
];

const getTempColor = (temp?: string) => {
  switch (temp) {
    case "Quente":
      return "text-rose-500 bg-rose-500/10 border-rose-500/20";
    case "Morno":
      return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    case "Frio":
      return "text-blue-500 bg-blue-500/10 border-blue-500/20";
    case "Convertido":
      return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
    case "Perdido":
      return "text-slate-400 bg-slate-500/10 border-slate-500/20";
    default:
      return "text-muted-foreground bg-secondary/50 border-border";
  }
};

/**
 * Só a cor do texto, para o ícone solto da lista de conversas. Existe para a
 * lista não ter a sua própria escala: antes ela só conhecia Quente e Morno e
 * pintava todo o resto de azul, então lead Convertido aparecia igual a Frio.
 */
const getTempIconColor = (temp?: string) => {
  switch (temp) {
    case "Quente":
      return "text-rose-500";
    case "Morno":
      return "text-amber-500";
    case "Convertido":
      return "text-emerald-500";
    case "Perdido":
      return "text-slate-400";
    default:
      return "text-blue-500";
  }
};

const avatarCache = new Map<string, string>();

const AVATAR_COLORS = [
  "bg-pink-500 text-white",
  "bg-purple-500 text-white",
  "bg-indigo-500 text-white",
  "bg-blue-500 text-white",
  "bg-cyan-500 text-white",
  "bg-teal-500 text-white",
  "bg-emerald-500 text-white",
  "bg-green-500 text-white",
  "bg-amber-500 text-white",
  "bg-orange-500 text-white",
  "bg-rose-500 text-white",
];

function getAvatarColor(name: string): string {
  if (!name) return "bg-slate-500 text-white";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function getContactInitial(name: string): string {
  if (!name) return "?";
  const cleanName = name.trim();
  // Encontra a primeira letra ou número do nome
  const match = cleanName.match(/[a-zA-Z0-9\u00C0-\u00FF]/);
  if (match) {
    return match[0].toUpperCase();
  }
  return cleanName.charAt(0).toUpperCase() || "?";
}

interface ContactAvatarProps {
  avatar?: string;
  name: string;
  size?: "sm" | "md" | "lg" | "custom";
  customSizeClass?: string;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

function ContactAvatar({
  avatar,
  name,
  size = "md",
  customSizeClass = "",
  onClick,
  className,
}: ContactAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [prevAvatar, setPrevAvatar] = useState(avatar);

  if (avatar !== prevAvatar) {
    setPrevAvatar(avatar);
    setImgFailed(false);
  }
  const initials = getContactInitial(name);
  const colorClass = getAvatarColor(name);

  let sizeClasses = "";
  let textClasses = "";

  if (size === "sm") {
    // Chat Header size (w-10 h-10)
    sizeClasses = "w-10 h-10 border border-border";
    textClasses = "text-[15px] font-bold font-inter";
  } else if (size === "md") {
    // Audio player size (w-[42px] h-[42px])
    sizeClasses = "w-[42px] h-[42px]";
    textClasses = "text-[16px] font-bold font-inter";
  } else if (size === "lg") {
    // Sidebar list size (w-12 h-12)
    sizeClasses = "w-12 h-12 border border-border/50";
    textClasses = "text-[18px] font-bold font-inter";
  } else if (size === "custom") {
    sizeClasses = customSizeClass;
    textClasses = "text-base font-bold font-inter";
  }

  const hasPhoto = avatar && avatar.trim() !== "" && !imgFailed;

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-full flex items-center justify-center overflow-hidden relative shrink-0 select-none",
        sizeClasses,
        !hasPhoto ? colorClass : "bg-secondary",
        onClick ? "cursor-pointer" : "",
        className,
      )}
    >
      {hasPhoto ? (
        <img
          src={avatar}
          alt={name}
          className={cn(
            "w-full h-full object-cover",
            onClick ? "hover:scale-110 transition-transform" : "",
          )}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span
          className={cn("text-white uppercase tracking-tight", textClasses)}
        >
          {initials}
        </span>
      )}
    </div>
  );
}

function inferMsgType(text?: string): string | undefined {
  if (!text) return undefined;
  if (text.includes("🎵") || text === "Áudio") return "audio";
  if (text.includes("📷") || text === "Foto") return "image";
  if (text.includes("📹") || text === "Vídeo") return "video";
  if (text.includes("📎") || text === "Documento") return "document";
  if (text.includes("🖼️") || text === "Figurinha") return "sticker";
  return "text";
}

// Detecta URLs (http/https ou "www.") no texto e as renderiza como links azuis
// clicáveis, preservando o restante do texto. O <p> pai mantém o whitespace.
const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

function Linkify({ text }: { text: string }): ReactElement {
  const parts = text.split(URL_REGEX);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        const isUrl = /^(https?:\/\/|www\.)/i.test(part);
        if (isUrl) {
          const href = part.startsWith("http") ? part : `https://${part}`;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sky-400 underline underline-offset-2 break-all hover:text-sky-300"
            >
              {part}
            </a>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

// Cache de previews buscados no backend (por URL), com dedupe de requisições concorrentes.
const linkPreviewCache = new Map<string, LinkPreview | null>();
const linkPreviewInflight = new Map<string, Promise<LinkPreview | null>>();

function firstUrlInText(text?: string): string | null {
  if (!text) return null;
  const m = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
  if (!m) return null;
  return m[1].startsWith("http") ? m[1] : `https://${m[1]}`;
}

async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  if (linkPreviewCache.has(url)) return linkPreviewCache.get(url) ?? null;
  let promise = linkPreviewInflight.get(url);
  if (!promise) {
    promise = apiGetLinkPreview(url)
      .then((res) => {
        // Só consideramos preview "válido" quando tem imagem ou descrição — título
        // sozinho normalmente é página genérica/anti-bot e não vale o card.
        const preview: LinkPreview | null =
          res && (res.image || res.description)
            ? {
                url: res.url || url,
                title: res.title,
                description: res.description,
                image: res.image,
              }
            : null;
        linkPreviewCache.set(url, preview);
        return preview;
      })
      .catch(() => {
        linkPreviewCache.set(url, null);
        return null;
      })
      .finally(() => {
        linkPreviewInflight.delete(url);
      });
    linkPreviewInflight.set(url, promise);
  }
  return promise;
}

function LinkPreviewCard({
  preview,
}: {
  preview: LinkPreview;
}): ReactElement | null {
  if (!preview || !(preview.title || preview.description || preview.image))
    return null;
  const href = preview.url?.startsWith("http")
    ? preview.url
    : `https://${preview.url}`;
  let host = preview.url || "";
  try {
    host = new URL(href).hostname.replace(/^www\./, "");
  } catch {
    /* mantém url crua */
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="block mb-1.5 overflow-hidden rounded-lg bg-black/20 hover:bg-black/30 transition-colors"
    >
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          className="w-full max-h-52 object-cover"
        />
      )}
      <div className="px-2.5 py-2">
        {preview.title && (
          <p className="text-xs font-bold line-clamp-2 leading-snug">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="text-[11px] opacity-70 line-clamp-2 leading-snug mt-0.5">
            {preview.description}
          </p>
        )}
        {host && (
          <p className="text-[10px] text-sky-400 truncate mt-1">{host}</p>
        )}
      </div>
    </a>
  );
}

// Renderiza o card de preview do link. Usa o preview que veio no payload; se não
// houver e a mensagem for recebida, busca os dados Open Graph via backend.
function MessageLinkPreview({
  msg,
  enabled,
  onResolved,
}: {
  msg: Message;
  enabled: boolean;
  onResolved?: (preview: LinkPreview) => void;
}): ReactElement | null {
  const [preview, setPreview] = useState<LinkPreview | null>(
    msg.linkPreview ?? null,
  );

  useEffect(() => {
    if (msg.linkPreview) {
      setPreview(msg.linkPreview);
      return;
    }
    if (!enabled) return;
    const url = firstUrlInText(msg.text);
    if (!url) return;
    let cancelled = false;
    fetchLinkPreview(url).then((p) => {
      if (cancelled || !p) return;
      setPreview(p);
      onResolved?.(p);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg.id, msg.linkPreview, enabled]);

  if (!preview) return null;
  return <LinkPreviewCard preview={preview} />;
}

function getFileExt(filename?: string): string {
  if (!filename) return "DOC";
  return (filename.split(".").pop()?.toUpperCase() || "DOC").slice(0, 4);
}

function getFileIconColor(filename?: string): string {
  const ext = filename?.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "bg-red-500";
    case "doc":
    case "docx":
      return "bg-blue-500";
    case "xls":
    case "xlsx":
      return "bg-emerald-600";
    case "ppt":
    case "pptx":
      return "bg-orange-500";
    case "zip":
    case "rar":
    case "7z":
      return "bg-yellow-600";
    case "mp4":
    case "mov":
    case "avi":
      return "bg-purple-500";
    default:
      return "bg-slate-500";
  }
}

function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) =>
    a.fixado === b.fixado ? 0 : a.fixado ? -1 : 1,
  );
}

// Aplica `patch` na conversa e a leva para o topo na hora. Antes a reordenação só
// acontecia quando o eco da mensagem enviada voltava pelo WebSocket da Evolution —
// era o ~1s de atraso até a conversa antiga subir. `sortChats` mantém os fixados acima.
function bumpChatToTop(
  chats: Chat[],
  id: string,
  patch: Partial<Chat>,
): Chat[] {
  const idx = chats.findIndex((c) => c.id === id);
  if (idx === -1) return chats;
  const updated = { ...chats[idx], ...patch };
  return sortChats([
    updated,
    ...chats.slice(0, idx),
    ...chats.slice(idx + 1),
  ]);
}

function formatAudioTime(seconds: number) {
  if (isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Follow-up formatado como "dd/mm às HH:mm".
 *
 * Aceita tanto o valor do `datetime-local` ("2026-08-28T14:30") quanto o ISO
 * com fuso que vem do banco — a tela lê dos dois lugares.
 */
function formatFollowUpDate(valor?: string) {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor;
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dia} às ${hora}`;
}

/** ISO (banco) → valor aceito pelo input datetime-local, no fuso local. */
function paraInputDateTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function getFormattedMessageDate(timestampStr?: string) {
  if (!timestampStr) return "";
  const date = new Date(timestampStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const msgDate = new Date(date);
  msgDate.setHours(0, 0, 0, 0);

  if (msgDate.getTime() === today.getTime()) {
    return "Hoje";
  } else if (msgDate.getTime() === yesterday.getTime()) {
    return "Ontem";
  } else {
    return formatBrDate(date);
  }
}

function CustomAudioPlayer({
  src,
  isMe,
  avatar,
  name,
  msgTime,
  msgStatus,
}: {
  src: string;
  isMe: boolean;
  avatar?: string;
  name: string;
  msgTime?: string;
  msgStatus?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setProgress(
        (audioRef.current.currentTime / audioRef.current.duration) * 100,
      );
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      const seekTime =
        (Number(e.target.value) / 100) * audioRef.current.duration;
      audioRef.current.currentTime = seekTime;
      setProgress(Number(e.target.value));
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 min-w-[250px] sm:min-w-[280px] pt-1 pb-1",
        isMe ? "text-white" : "text-foreground",
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        className="hidden"
      />

      {/* Avatar com Microfone */}
      <div className="relative shrink-0 ml-1">
        <ContactAvatar name={name} avatar={avatar} size="md" />
        <div
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full p-[2px] border-2",
            isMe ? "border-primary bg-primary" : "border-card bg-card",
          )}
        >
          <Mic
            className={cn(
              "w-[10px] h-[10px]",
              isMe ? "text-green-300" : "text-green-500",
            )}
            fill="currentColor"
          />
        </div>
      </div>

      <div className="flex flex-col flex-1 gap-0.5 pr-2">
        <div className="flex items-center gap-2">
          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            className="p-1 shrink-0 focus:outline-none opacity-80 hover:opacity-100 transition-opacity"
          >
            {isPlaying ? (
              <Pause className="w-[22px] h-[22px]" fill="currentColor" />
            ) : (
              <Play className="w-[22px] h-[22px]" fill="currentColor" />
            )}
          </button>

          {/* Progress Bar */}
          <div className="flex-1 flex items-center relative h-5">
            <input
              type="range"
              min="0"
              max="100"
              value={progress || 0}
              onChange={handleSeek}
              className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
            />
            {/* Custom Track */}
            <div className="w-full h-[3px] bg-black/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-current transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            {/* Custom Thumb */}
            <div
              className="absolute h-2.5 w-2.5 rounded-full bg-current shadow-sm transition-all pointer-events-none"
              style={{ left: `calc(${progress}% - 5px)` }}
            />
          </div>
        </div>

        {/* Time Text & Message Meta */}
        <div className="flex items-center justify-between pl-[40px] mt-0.5">
          <span className="text-[11px] opacity-70 font-medium tracking-wide">
            {formatAudioTime(isPlaying ? currentTime : duration)}
          </span>

          <div className="flex items-center gap-1 opacity-70">
            <span className="text-[9px] font-bold">{msgTime}</span>
            {isMe &&
              (msgStatus === "read" ? (
                <CheckCheck
                  className="w-3.5 h-3.5"
                  style={{ color: "#32e043", filter: "drop-shadow(0px 0px 3px #32e043)" }}
                />
              ) : msgStatus === "delivered" ? (
                <CheckCheck className="w-3.5 h-3.5 text-white" />
              ) : (
                <Check className="w-3.5 h-3.5 text-white" />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface UserProfile {
  id?: string;
  name: string;
  email?: string;
  role: string;
  avatar?: string;
  operator_code?: string;
  operatorCode?: string;
  // Usados só para decidir quem aprova arquivamento com o cliente esperando.
  is_admin?: boolean;
  is_leader?: boolean;
}

// Interface mínima do provider de WhatsApp (só o que esta tela consome). Permite
// injetar o Evolution v2 (padrão, comercial) OU o Evolution GO, mantendo o mesmo
// design. Ambos os clientes satisfazem estes métodos.
export interface WhatsappApi {
  getInstanceInfo(): Promise<{ instance?: { owner?: string; profilePictureUrl?: string } }>;
  getProfilePic(jid: string): Promise<string | null>;
  getChats(): Promise<unknown[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connectWebSocket(): { on: (e: string, cb: (...args: any[]) => void) => void; off: (e: string, cb: (...args: any[]) => void) => void };
  sendText(jid: string, text: string, quoted?: unknown): Promise<{ key?: { id?: string } }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendDocument(jid: string, ...args: any[]): Promise<{ key?: { id?: string } }>;
  subscribePresence(jid: string): Promise<void>;
  // Opcional: reagir (like/emoji) a uma mensagem. Só a API Oficial implementa hoje;
  // quando ausente, a UI de reação não é exibida.
  sendReaction?(jid: string, messageId: string, emoji: string): Promise<{ key?: { id?: string } }>;
}

export function WhatsappView({
  vendedorId,
  userProfile,
  api = evolutionApi as unknown as WhatsappApi,
}: {
  vendedorId?: string;
  userProfile?: UserProfile | null;
  api?: WhatsappApi;
}) {
  const { showNotification } = useNotification();
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  // Textarea, e não input: `input` não guarda quebra de linha nenhuma, então
  // Shift+Enter não tinha como funcionar. O balão já renderiza com
  // `whitespace-pre-wrap`, então a quebra aparece certo do outro lado.
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Cresce com o conteúdo até o teto e então rola, como no WhatsApp. O "auto"
  // antes de medir é necessário: sem zerar, o scrollHeight nunca diminui e o
  // campo ficaria travado na maior altura que já teve.
  useEffect(() => {
    const el = composerInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, ALTURA_MAX_COMPOSER)}px`;
  }, [inputText]);
  const [loading, setLoading] = useState(true);
  // Cadastro do cliente no ERP (casado pelo telefone da conversa).
  const [showCadastroErp, setShowCadastroErp] = useState(false);
  const [cadastroErp, setCadastroErp] = useState<ClienteErp | null>(null);
  const [cadastroErpLoading, setCadastroErpLoading] = useState(false);
  // Vínculo manual: busca de cadastro no ERP por nome/CNPJ, para os casos em que
  // o telefone da conversa não bate com nenhum cadastro.
  const [vinculoBusca, setVinculoBusca] = useState("");
  const [vinculoResultados, setVinculoResultados] = useState<ClienteErpBusca[]>([]);
  const [vinculoBuscando, setVinculoBuscando] = useState(false);
  const [vinculoAberto, setVinculoAberto] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpDateInput, setFollowUpDateInput] = useState("");
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  // Fila de arquivamentos aguardando o supervisor (só aparece para quem aprova).
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const podeAprovar = useMemo(() => podeAprovarArquivamento(userProfile), [userProfile]);
  const [customArchiveReason, setCustomArchiveReason] = useState("");
  const [isEnteringCustomReason, setIsEnteringCustomReason] = useState(false);
  const [materialInput, setMaterialInput] = useState("");
  const [isEnteringMaterial, setIsEnteringMaterial] = useState(false);
  const [selectedReason, setSelectedReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [archiveObservation, setArchiveObservation] = useState("");
  const [showTempDropdown, setShowTempDropdown] = useState(false);
  const [isNoteMode, setIsNoteMode] = useState(false);

  // Atribuição de atendente e resposta a mensagens
  const [operators, setOperators] = useState<
    { id: string; name: string; avatar?: string }[]
  >([]);
  const [replyingMessage, setReplyingMessage] = useState<Message | null>(null);

  // ERP Autcom Required Fields

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Gravação de áudio: a mecânica toda (microfone, onda, pausa, conversão para
  // Ogg) vive em GravadorAudio.tsx. Aqui fica só o liga/desliga.
  const [gravandoAudio, setGravandoAudio] = useState(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  // Menu do "+" do compositor.
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  // Inputs separados por tipo: o `accept` do seletor de arquivo é o que abre a
  // galeria certa no celular e evita o atendente mandar um .zip achando que é
  // foto. O antigo era um só, e não aceitava imagem — dava para mandar foto
  // apenas colando ou arrastando.
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [allProducts, setAllProducts] = useState<NormalizedProduct[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Chat[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [cartProducts, setCartProducts] = useState<NormalizedProduct[]>([]);
  const [avgResponseTime, setAvgResponseTime] = useState<number | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [loadingMoreChats, setLoadingMoreChats] = useState(false);
  // Paginação separada por modo (ativos x arquivados): a consulta de "carregar mais"
  // é filtrada no servidor, então cada modo tem seu próprio fim de lista.
  const hasMoreByModeRef = useRef({ active: false, archived: false });
  // Quantas conversas de cada modo já estão na tela — serve de offset do range().
  const loadedCountRef = useRef({ active: 0, archived: 0 });
  const loadedIdsRef = useRef<Set<string>>(new Set());
  // Lock síncrono do "carregar mais": evita disparos concorrentes do scroll (o estado
  // loadingMoreChats só atualiza no próximo render, tarde demais para o guard).
  const loadingMoreChatsRef = useRef(false);
  const productsLoadedRef = useRef(false);

  const chatListRef = useRef<HTMLDivElement>(null);
  const tempBtnRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // O auto-scroll só vale quando o atendente já está no fim da conversa. Sem
  // isso, qualquer mensagem nova (de qualquer cliente, pelo realtime) jogava a
  // tela para baixo no meio da leitura de mensagens antigas.
  const pertoDoFimRef = useRef(true);
  // Ao trocar de conversa, ou ao enviar, a ida para o fim é intencional.
  const forcarFimRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedChatRef = useRef<Chat | null>(null);
  // Trava a conversa-alvo de uma ação (arquivar) pelo ID, para que a reordenação
  // da lista por novas mensagens não faça a ação cair na conversa errada.
  const archiveTargetRef = useRef<Chat | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Chat | null>(null);
  const viewModeRef = useRef<"active" | "archived">("active");
  const lastPhoneJid = useRef<string | null>(null);
  const lidToJidMap = useRef<Map<string, string>>(new Map());
  const lastSeenMap = useRef<Map<string, Date>>(new Map());
  const processedMsgIds = useRef<Set<string>>(new Set());
  const manualOverrideRef = useRef<Map<string, number>>(new Map());
  // Última temperatura conhecida por lead — evita reescrever quando já está no topo.
  const knownTempRef = useRef<Map<string, Temperature>>(new Map());
  const tempClassifyTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Saúde do realtime. Um canal do Supabase pode cair sem avisar (aba em segundo
  // plano, máquina suspensa, oscilação de rede, renovação de token) e antes disso
  // a tela ficava congelada até o atendente dar F5 — mensagem de cliente chegava
  // e ninguém via. `realtimeGen` é incrementado para forçar a reassinatura dos
  // canais, e o resync recarrega o que chegou enquanto o canal esteve fora.
  const realtimeHealthyRef = useRef(true);
  const [realtimeGen, setRealtimeGen] = useState(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const agendarReconexaoRealtime = useCallback(() => {
    if (reconnectTimerRef.current) return; // já há uma tentativa agendada
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      setRealtimeGen((g) => g + 1);
    }, 2000);
  }, []);

  const [presenceChats, setPresenceChats] = useState<Map<string, string>>(
    new Map(),
  );
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const [, forceUpdate] = useState(0);
  const lidSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isClassifyingTemp, setIsClassifyingTemp] = useState(false);
  const [myAvatar, setMyAvatar] = useState<string>("");
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    chat: Chat;
  } | null>(null);

  useEffect(() => {
    selectedChatRef.current = selectedChat;
    viewModeRef.current = viewMode;
  }, [selectedChat, viewMode]);

  useEffect(() => {
    if (!showArchiveModal) {
      setCustomArchiveReason("");
      setIsEnteringCustomReason(false);
      setMaterialInput("");
      setIsEnteringMaterial(false);
      // Fechou o modal (sem confirmar ou já confirmado): descarta a trava do alvo.
      archiveTargetRef.current = null;
    }
  }, [showArchiveModal]);

  useEffect(() => {
    // Solicita permissão para notificações do Chrome
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Carrega operadores (usuários)
  useEffect(() => {
    const loadOperators = async () => {
      try {
        const { data, error } = await supabase
          .from("usuarios")
          .select("id, name, avatar")
          .order("name");
        if (!error && data) {
          setOperators(data);
        }
      } catch (err) {
        console.error("Erro ao carregar operadores:", err);
      }
    };
    loadOperators();
  }, []);

  // Realtime: escuta alterações de atendente/vendedor_id nos clientes em tempo real
  useEffect(() => {
    const channel = supabase
      .channel("whatsapp-clientes-changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "marketing_clientes" },
        (payload) => {
          const updated = payload.new as {
            remote_jid: string;
            vendedor_id?: string | null;
            temperatura?: Temperature | null;
            mensagens_nao_lidas?: number | null;
          };
          if (updated.remote_jid) {
            // Temperatura é classificada no servidor (webhook) e chega por aqui.
            if (updated.temperatura) {
              knownTempRef.current.set(updated.remote_jid, updated.temperatura);
            }
            const isSelected = selectedChatRef.current?.id === updated.remote_jid;
            setChats((prev) =>
              prev.map((c) => {
                if (c.id !== updated.remote_jid) return c;
                const newUnread = isSelected
                  ? 0
                  : updated.mensagens_nao_lidas !== undefined && updated.mensagens_nao_lidas !== null
                    ? updated.mensagens_nao_lidas
                    : c.unreadCount;
                return {
                  ...c,
                  vendedor_id: updated.vendedor_id || undefined,
                  unreadCount: newUnread,
                  leadInfo: updated.temperatura
                    ? {
                        ...(c.leadInfo || {}),
                        temperature: updated.temperatura,
                      }
                    : c.leadInfo,
                };
              }),
            );
            setSelectedChat((prev) => {
              if (prev && prev.id === updated.remote_jid) {
                return {
                  ...prev,
                  vendedor_id: updated.vendedor_id || undefined,
                  unreadCount: 0,
                  leadInfo: updated.temperatura
                    ? {
                        ...(prev.leadInfo || {}),
                        temperature: updated.temperatura,
                      }
                    : prev.leadInfo,
                };
              }
              return prev;
            });
          }
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn(`[WhatsApp] Realtime de clientes caiu (${status}). Reconectando...`);
          realtimeHealthyRef.current = false;
          agendarReconexaoRealtime();
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [realtimeGen, agendarReconexaoRealtime]);

  const sendBrowserNotification = (
    title: string,
    body: string,
    icon?: string,
  ) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, {
        body,
        icon: icon || "/favicon.png",
        badge: "/favicon.png",
      });
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem("wpp_lid_map");
      if (saved)
        new Map<string, string>(JSON.parse(saved)).forEach((v, k) =>
          lidToJidMap.current.set(k, v),
        );
    } catch {
      /* ignora */
    }
  }, []);

  // Busca a foto da própria instância (Trafego)
  useEffect(() => {
    api.getInstanceInfo().then((data) => {
      if (data?.instance?.profilePictureUrl) {
        setMyAvatar(data.instance.profilePictureUrl);
      } else if (data?.instance?.owner) {
        api.getProfilePic(data.instance.owner).then((url) => {
          if (url) setMyAvatar(url);
        });
      }
    });
  }, [api]);

  const fetchAvatar = useCallback(async (remoteJid: string, force = false) => {
    // Se já tentamos buscar (mesmo que tenha vindo vazio), não tenta de novo nesta sessão
    if (!force && avatarCache.has(remoteJid)) {
      return avatarCache.get(remoteJid)!;
    }

    try {
      const url = await api.getProfilePic(remoteJid);
      const finalUrl = url || "";
      // Cap: remove a entrada mais antiga quando ultrapassa 300 contatos
      if (avatarCache.size >= 300)
        avatarCache.delete(avatarCache.keys().next().value!);
      avatarCache.set(remoteJid, finalUrl);

      if (finalUrl) {
        setChats((prev) =>
          prev.map((c) =>
            c.id === remoteJid ? { ...c, avatar: finalUrl } : c,
          ),
        );
      }
      return finalUrl;
    } catch {
      // Silencia erros de busca de foto
    }
    return "";
  }, [api]);

  const CHATS_PAGE = 50;

  // `silent` = ressincronização em segundo plano (volta de aba, reconexão do
  // realtime). Recarrega a lista sem esvaziá-la nem mostrar o loading, para o
  // atendente não ver a tela piscar enquanto está trabalhando.
  const loadChats = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    try {
      if (!silent) {
        setChats([]);
        setLoading(true);
      }
      // 1. Busca no Supabase — carrega primeira página
      const dbClientes = await marketingService.getActiveClientes(
        "all",
        CHATS_PAGE,
        0,
      );
      // Se a primeira página (ativos + arquivados) veio incompleta, não existe mais
      // nada no banco — nem ativo nem arquivado. Só aí o "carregar mais" fica travado.
      const maybeMore = dbClientes.length === CHATS_PAGE;
      hasMoreByModeRef.current = { active: maybeMore, archived: maybeMore };

      const mappedChats: Chat[] = dbClientes.map((item) => {
        const detected =
          detectOrigin(item.ultima_mensagem || "") ||
          detectOrigin(item.nome || "") ||
          detectOrigin(item.push_name || "");
        const finalSource = item.origem || detected || "WhatsApp";

        if (
          detected &&
          (!item.origem || item.origem.toLowerCase() === "whatsapp")
        ) {
          marketingService
            .upsertCliente({ remote_jid: item.remote_jid, origem: detected })
            .catch(() => null);
        }

        return {
          id: item.remote_jid,
          name: item.nome || item.push_name || item.remote_jid.split("@")[0],
          lastMessage: item.ultima_mensagem || "",
          lastMessageType: inferMsgType(item.ultima_mensagem || ""),
          time: item.ultima_conversa_em
            ? formatBrTime(new Date(item.ultima_conversa_em))
            : "",
          unreadCount: item.mensagens_nao_lidas || 0,
          avatar: item.foto_url || "",
          arquivado: item.arquivado,
          fixado: item.fixado || false,
          vendedor_id: item.vendedor_id || undefined,
          leadInfo: {
            status: item.status || "Novo Lead",
            temperature: (item.temperatura as Temperature) || "Frio",
            source: finalSource,
            campaign: item.campanha || "Geral",
            followUpDate: item.follow_up_em || undefined,
            followUpAtendidoEm: item.follow_up_atendido_em || undefined,
            saleValue:
              (item.valor_venda ?? 0) > 0
                ? item.valor_venda!.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : undefined,
            saleFromErp: item.venda_origem === "erp",
            quoteFromErp: item.orcamento_origem === "erp",
            quoteDocument: item.orcamento_documento || undefined,
            quoteValue:
              (item.valor_orcamento ?? 0) > 0
                ? item.valor_orcamento!.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : undefined,
          },
        };
      });

      // Busca sender/status da última mensagem ANTES de renderizar, para evitar
      // flickering dos ícones ✓/✓✓ ao dar F5.
      const meta = await marketingService
        .getLastMessageMetaByJids(mappedChats.map((c) => c.id))
        .catch(() => new Map() as Map<string, { sender: string; status: string; tipo?: string }>);

      const chatsComStatus = meta.size > 0
        ? mappedChats.map((c) => {
            const m = meta.get(c.id);
            if (!m) return c;
            return {
              ...c,
              lastMessageSender: m.sender as "me" | "contact",
              lastMessageType: m.tipo || c.lastMessageType,
              lastMessageStatus:
                m.sender === "me"
                  ? ((m.status as "sent" | "delivered" | "read") || "sent")
                  : undefined,
            };
          })
        : mappedChats;

      setChats(sortChats(chatsComStatus));
      setLoading(false);

      // 2. Sincronização em segundo plano (Não trava o usuário)
      if (mappedChats.length > 0) {
        api.getChats().then(async (evoData) => {
          const evoChats = evoData as EvoChatResponse[];
          const updates: import("@/lib/marketing-service").MarketingCliente[] =
            [];

          mappedChats.forEach((chat) => {
            const evo = evoChats.find((e) => (e.id || e.remoteJid) === chat.id);
            if (!evo) return;

            const resolvedName = evo.name || evo.pushName || chat.name;
            const lastMsg =
              typeof evo.lastMessage === "string"
                ? evo.lastMessage
                : evo.lastMessage?.message?.conversation || chat.lastMessage;

            if (resolvedName !== chat.name || lastMsg !== chat.lastMessage) {
              updates.push({
                remote_jid: chat.id,
                push_name: resolvedName,
                ultima_mensagem: lastMsg,
                ultima_conversa_em: evo.updatedAt || new Date().toISOString(),
              });
            }
          });

          // Atualiza UI apenas se houver mudanças reais, preservando a ordem ATUAL do estado
          if (updates.length > 0) {
            setChats((prevChats) =>
              prevChats.map((chat) => {
                const evo = evoChats.find(
                  (e) => (e.id || e.remoteJid) === chat.id,
                );
                if (!evo) return chat;
                const resolvedName = evo.name || evo.pushName || chat.name;
                const lastMsg =
                  typeof evo.lastMessage === "string"
                    ? evo.lastMessage
                    : evo.lastMessage?.message?.conversation ||
                      chat.lastMessage;
                return { ...chat, name: resolvedName, lastMessage: lastMsg };
              }),
            );
            marketingService.upsertClientes(updates);
          }
        });
      }
    } catch (error) {
      console.error("Erro ao carregar chats:", error);
      setLoading(false);
    }
  }, [api]);

  const mapClienteToChat = useCallback(
    (item: import("@/lib/marketing-service").MarketingCliente): Chat => {
      const detected =
        detectOrigin(item.ultima_mensagem || "") ||
        detectOrigin(item.nome || "") ||
        detectOrigin(item.push_name || "");
      const finalSource = item.origem || detected || "WhatsApp";

      if (
        detected &&
        (!item.origem || item.origem.toLowerCase() === "whatsapp")
      ) {
        marketingService
          .upsertCliente({ remote_jid: item.remote_jid, origem: detected })
          .catch(() => null);
      }

      return {
        id: item.remote_jid,
        name: item.nome || item.push_name || item.remote_jid.split("@")[0],
        lastMessage: item.ultima_mensagem || "",
        lastMessageType: inferMsgType(item.ultima_mensagem || ""),
        time: item.ultima_conversa_em
          ? formatBrTime(new Date(item.ultima_conversa_em))
          : "",
        unreadCount: item.mensagens_nao_lidas || 0,
        avatar: item.foto_url || "",
        arquivado: item.arquivado,
        fixado: item.fixado || false,
        vendedor_id: item.vendedor_id || undefined,
        leadInfo: {
          status: item.status || "Novo Lead",
          temperature: (item.temperatura as Temperature) || "Frio",
          source: finalSource,
          campaign: item.campanha || "Geral",
          followUpDate: item.follow_up_em || undefined,
          followUpAtendidoEm: item.follow_up_atendido_em || undefined,
          saleValue:
            (item.valor_venda ?? 0) > 0
              ? item.valor_venda!.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : undefined,
          saleFromErp: item.venda_origem === "erp",
          quoteFromErp: item.orcamento_origem === "erp",
          quoteDocument: item.orcamento_documento || undefined,
          quoteValue:
            (item.valor_orcamento ?? 0) > 0
              ? item.valor_orcamento!.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : undefined,
        },
      };
    },
    [],
  );

  // Busca no servidor: encontra qualquer lead por nome ou telefone (com ou sem máscara),
  // independente de estar arquivado ou ativo. Debounce para não consultar a cada tecla.
  useEffect(() => {
    const term = chatSearch.trim();
    if (!term) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      const results = await marketingService.searchClientes(term);
      setSearchResults(sortChats(results.map(mapClienteToChat)));
      setSearching(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [chatSearch, mapClienteToChat]);

  const loadMoreChats = useCallback(async () => {
    const mode = viewModeRef.current;
    // Guard síncrono via ref: bloqueia os múltiplos disparos que o evento de scroll
    // gera antes do estado atualizar (o que causava fetches concorrentes na mesma página).
    if (loadingMoreChatsRef.current || !hasMoreByModeRef.current[mode]) return;
    loadingMoreChatsRef.current = true;
    setLoadingMoreChats(true);
    try {
      // A consulta já é filtrada pelo modo atual no servidor. Antes buscávamos 'all' e
      // filtrávamos na tela: páginas inteiras do outro modo não mostravam nada e o
      // spinner ficava girando "sem carregar nada" até varrer a tabela toda.
      const more = await marketingService.getActiveClientes(
        mode === "archived",
        CHATS_PAGE,
        loadedCountRef.current[mode],
      );
      const stillMore = more.length === CHATS_PAGE;
      hasMoreByModeRef.current = {
        ...hasMoreByModeRef.current,
        [mode]: stillMore,
      };
      if (more.length === 0) return;

      const mapped = more.map(mapClienteToChat);
      const added = mapped.filter((c) => !loadedIdsRef.current.has(c.id)).length;

      // Busca sender/status antes de adicionar à lista, evitando flickering
      const meta = await marketingService
        .getLastMessageMetaByJids(mapped.map((c) => c.id))
        .catch(() => new Map() as Map<string, { sender: string; status: string; tipo?: string }>);

      const mappedComStatus = meta.size > 0
        ? mapped.map((c) => {
            const mm = meta.get(c.id);
            if (!mm) return c;
            return {
              ...c,
              lastMessageSender: mm.sender as "me" | "contact",
              lastMessageType: mm.tipo || c.lastMessageType,
              lastMessageStatus:
                mm.sender === "me"
                  ? ((mm.status as "sent" | "delivered" | "read") || "sent")
                  : undefined,
            };
          })
        : mapped;

      setChats((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const newChats = mappedComStatus.filter((c) => !existingIds.has(c.id));
        return sortChats([...prev, ...newChats]);
      });
      // Página inteira repetida (a lista pode ter sido reordenada por mensagem nova
      // entre uma página e outra): encerra em vez de repetir o mesmo fetch para sempre.
      if (added === 0) {
        hasMoreByModeRef.current = { ...hasMoreByModeRef.current, [mode]: false };
        return;
      }
    } catch (err) {
      console.error("Erro ao carregar mais chats:", err);
    } finally {
      loadingMoreChatsRef.current = false;
      setLoadingMoreChats(false);
    }
  }, [mapClienteToChat]);

  useEffect(() => {
    const container = chatListRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (
        container.scrollTop + container.clientHeight >=
        container.scrollHeight - 200
      ) {
        loadMoreChats();
      }
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [loadMoreChats]);

  // Mantém o offset de cada modo (e os ids já carregados) iguais ao que está na tela.
  useEffect(() => {
    loadedCountRef.current = {
      active: chats.filter((c) => !c.arquivado).length,
      archived: chats.filter((c) => c.arquivado).length,
    };
    loadedIdsRef.current = new Set(chats.map((c) => c.id));
  }, [chats, viewMode]);

  // A primeira página vem misturada (ativos + arquivados), então o modo atual pode
  // receber poucas conversas e a lista nem gerar barra de rolagem — sem scroll, o
  // "carregar mais" nunca dispararia. Aqui completamos a tela automaticamente.
  useEffect(() => {
    if (loading || chatSearch.trim()) return;
    const container = chatListRef.current;
    if (!container) return;
    if (!hasMoreByModeRef.current[viewMode]) return;
    if (container.scrollHeight <= container.clientHeight + 200) {
      loadMoreChats();
    }
  }, [chats, viewMode, loading, chatSearch, loadingMoreChats, loadMoreChats]);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  const handlePinChat = (chat: Chat) => {
    const newStatus = !chat.fixado;

    // Atualiza UI imediatamente
    setChats((prev) =>
      prev
        .map((c) => (c.id === chat.id ? { ...c, fixado: newStatus } : c))
        .sort((a, b) => (a.fixado === b.fixado ? 0 : a.fixado ? -1 : 1)),
    );
    if (selectedChat?.id === chat.id)
      setSelectedChat({ ...selectedChat, fixado: newStatus });
    setContextMenu(null);

    // Persiste em segundo plano
    marketingService
      .togglePin(chat.id, newStatus)
      .catch((err) => console.error("Erro ao fixar chat:", err));
  };

  const handleMarkUnread = (chat: Chat) => {
    // Trava o alvo pelo ID: mesmo que a lista reordene por novas mensagens, a marcação
    // atinge a conversa clicada, e nunca a que estiver aberta no momento.
    const targetId = chat.id;
    const newCount = chat.unreadCount > 0 ? chat.unreadCount : 1;
    setContextMenu(null);

    // Atualiza a UI imediatamente
    setChats((prev) =>
      prev.map((c) =>
        c.id === targetId ? { ...c, unreadCount: newCount } : c,
      ),
    );
    // Se a conversa marcada estiver aberta, fecha para não "re-ler" na hora
    if (selectedChatRef.current?.id === targetId) setSelectedChat(null);

    // Persiste em segundo plano
    marketingService
      .markAsUnread(targetId, newCount)
      .catch((err) => console.error("Erro ao marcar como não lido:", err));
  };

  /**
   * Abre o cadastro do cliente no ERP. O vínculo é feito pelo telefone da
   * conversa — não existe chave formal entre o WhatsApp e o CADCLI.
   */
  const abrirCadastroErp = async () => {
    if (!selectedChat) return;
    setShowCadastroErp(true);
    setCadastroErp(null);
    setCadastroErpLoading(true);
    try {
      const resposta = await apiClientePorTelefone(selectedChat.id);
      setCadastroErp(resposta);
    } catch {
      setCadastroErp({ encontrado: false });
    } finally {
      setCadastroErpLoading(false);
    }
  };

  // Fila de aprovação: contador ao vivo no ícone do supervisor. Não roda para
  // quem não aprova, para não consultar/assinar realtime à toa.
  useEffect(() => {
    if (!podeAprovar) return;
    let cancelado = false;

    const atualizar = async () => {
      const { count } = await supabase
        .from("marketing_arquivamento_aprovacoes")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente");
      if (!cancelado) setPendingApprovals(count || 0);
    };

    atualizar();
    const canal = supabase
      .channel("whatsapp-archive-approvals-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "marketing_arquivamento_aprovacoes" },
        () => atualizar(),
      )
      .subscribe();

    return () => {
      cancelado = true;
      supabase.removeChannel(canal);
    };
  }, [podeAprovar]);

  const buscarCadastroErp = async () => {
    const termo = vinculoBusca.trim();
    if (termo.length < 3) return;
    setVinculoBuscando(true);
    try {
      setVinculoResultados(await apiBuscarClientesErp(termo));
    } catch (err) {
      console.error("Erro ao buscar cadastros no ERP:", err);
      setVinculoResultados([]);
    } finally {
      setVinculoBuscando(false);
    }
  };

  /**
   * Amarra a conversa ao cadastro escolhido. A partir daí o orçamento e a venda
   * daquele cliente passam a ser puxados pela varredura do ERP, que até então
   * não achava ninguém pelo telefone.
   */
  const vincularCadastroErp = async (codigo: string, nome: string) => {
    if (!selectedChat) return;
    try {
      await marketingService.vincularClienteErp(selectedChat.id, codigo, "manual");
      setVinculoAberto(false);
      setVinculoBusca("");
      setVinculoResultados([]);

      // Puxa na hora. Sem isso o vendedor vincula e não vê nada mudar por até 5
      // min — e, quando o ERP não tem documento na janela do lead, nunca saberia
      // o motivo de os valores continuarem os antigos.
      const sync = await apiSincronizarLeadErp(selectedChat.id).catch(() => null);
      await abrirCadastroErp();
      await loadChats();

      const achou = sync && (sync.orcamento || sync.venda);
      const brl = (v: number) =>
        v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

      showNotification(
        achou ? "success" : "info",
        "Cadastro vinculado",
        achou
          ? `${nome} ligado à conversa. Importado da Citel: ` +
            [
              sync?.orcamento ? `orçamento ${brl(sync.orcamento)}` : null,
              sync?.venda ? `venda ${brl(sync.venda)}` : null,
            ]
              .filter(Boolean)
              .join(" e ") +
            "."
          : `${nome} ligado à conversa, mas a Citel não tem orçamento nem pedido deste cliente emitido depois do início desta conversa. Os valores na tela continuam sendo os que vieram pelo chat.`,
        true,
        `vinculo-erp-${selectedChat.id}`,
      );
    } catch (err) {
      console.error("Erro ao vincular cadastro do ERP:", err);
      showNotification("error", "Não foi possível vincular", "Tente novamente.");
    }
  };

  const handleCloseArchiveModal = () => {
    setShowArchiveModal(false);
    setIsEnteringMaterial(false);
    setIsEnteringCustomReason(false);
    setMaterialInput("");
    setCustomArchiveReason("");
    setSelectedReason("");
    setPaymentMethod("");
    setArchiveObservation("");
  };

  const handleArchiveChat = async (reasonText?: string) => {
    // Usa a referência travada no momento em que a ação foi iniciada (abertura do
    // modal / clique no menu). Só cai para contextMenu/selectedChat se não houver
    // trava, evitando arquivar a conversa errada quando a lista reordena.
    const chatToArchive =
      archiveTargetRef.current || contextMenu?.chat || selectedChat;
    if (!chatToArchive) return;

    const targetId = chatToArchive.id;
    archiveTargetRef.current = null;

    const finalReason = reasonText || selectedReason;
    const finalPayment = finalReason === "Convertido" ? paymentMethod : "";
    const finalObs = finalReason === "Convertido" ? archiveObservation : "";

    // ── Dívida aberta: arquivar não pode apagar o cliente esperando ───────────
    // Se a última mensagem é do cliente (ou há não lidas), o atendente não arquiva:
    // o clique vira um pedido na fila do supervisor e a conversa CONTINUA ativa,
    // sendo cobrada pelo escalador de SLA até alguém decidir.
    let debito: DebtSnapshot | null = null;
    try {
      debito = await verificarDebitoAberto(targetId);
    } catch (err) {
      // Sem conseguir checar, o caminho seguro é seguir com o arquivamento
      // normal — a conversa continua auditada por `arquivado_por`.
      console.error("Erro ao verificar dívida da conversa:", err);
    }

    if (debito?.temDebito && !podeAprovar) {
      handleCloseArchiveModal();
      setContextMenu(null);
      try {
        const { criado } = await solicitarAprovacaoArquivamento({
          remoteJid: targetId,
          clienteNome: chatToArchive.name,
          motivo: finalReason || "Sem motivo informado",
          formaPagamento: finalPayment,
          observacao: finalObs,
          solicitante: userProfile,
          debito,
        });
        showNotification(
          "info",
          criado ? "Pedido enviado ao supervisor" : "Pedido já está na fila",
          criado
            ? `${chatToArchive.name} está aguardando resposta há ${debito.minutosEspera ?? 0} min. O arquivamento precisa da aprovação do supervisor de vendas — a conversa continua ativa até lá.`
            : "Esta conversa já tem um pedido de arquivamento aguardando aprovação.",
          true,
          `arq-aprov-${targetId}`,
        );
      } catch (err) {
        console.error("Erro ao solicitar aprovação de arquivamento:", err);
        showNotification(
          "error",
          "Não foi possível pedir a aprovação",
          "Tente novamente. A conversa continua ativa.",
        );
      }
      return;
    }

    // Aprovador arquivando com o cliente esperando: passa direto (é ele quem
    // decidiria de qualquer forma), mas o aviso deixa claro que houve dívida —
    // sem isso o bypass é silencioso e parece que a trava não existe.
    if (debito?.temDebito && podeAprovar) {
      showNotification(
        "info",
        "Arquivado com o cliente aguardando",
        `${chatToArchive.name} está sem resposta há ${debito.minutosEspera ?? 0} min. Como você aprova arquivamentos, foi arquivado direto — para o atendente, isso viraria um pedido de aprovação.`,
        true,
        `arq-bypass-${targetId}`,
      );
    }

    // Finalizou: grava o desfecho (Convertido se houve venda, senão Perdido) e limpa
    // o guard, para o lead deixar de constar como Quente e poder ser reclassificado do
    // zero caso o cliente volte a conversar.
    const outcomeTemp: Temperature =
      finalReason === "Convertido" ? "Convertido" : "Perdido";
    knownTempRef.current.delete(targetId);
    setChats((prev) =>
      prev.map((c) =>
        c.id === targetId
          ? {
              ...c,
              arquivado: true,
              leadInfo: c.leadInfo
                ? {
                    ...c.leadInfo,
                    status: finalReason,
                    temperature: outcomeTemp,
                    formaPagamento: finalPayment,
                    observacao: finalObs,
                  }
                : {
                    status: finalReason,
                    temperature: outcomeTemp,
                    formaPagamento: finalPayment,
                    observacao: finalObs,
                  },
            }
          : c,
      ),
    );
    if (selectedChatRef.current?.id === targetId) setSelectedChat(null);
    handleCloseArchiveModal();
    setContextMenu(null);

    marketingService
      .toggleArchived(targetId, true, finalReason, finalPayment, finalObs, userProfile?.id)
      .catch((err) => console.error("Erro ao arquivar chat:", err));
  };

  const handleUnarchiveChat = async () => {
    const chatToUnarchive = contextMenu?.chat || selectedChat;
    if (!chatToUnarchive) return;

    setChats((prev) =>
      prev.map((c) =>
        c.id === chatToUnarchive.id ? { ...c, arquivado: false } : c,
      ),
    );
    if (selectedChat?.id === chatToUnarchive.id) setSelectedChat(null);
    setContextMenu(null);

    marketingService
      .toggleArchived(chatToUnarchive.id, false, undefined, undefined, undefined, userProfile?.id)
      .catch((err) => console.error("Erro ao desarquivar chat:", err));
  };


  // Marca origem/campanha a partir do anúncio Meta (Click-to-WhatsApp). É autoritativo:
  // sobrescreve a origem genérica, pois vem do metadado do anúncio, não de texto do cliente.
  const applyAdOrigin = (remoteJid: string, platform: string, campanha?: string) => {
    marketingService
      .upsertCliente({ remote_jid: remoteJid, origem: platform, ...(campanha ? { campanha } : {}) })
      .catch(() => null);
    const patch = (info: LeadMetadata | undefined): LeadMetadata => ({
      ...info,
      source: platform,
      ...(campanha ? { campaign: campanha } : {}),
    });
    setChats((prev) => prev.map((c) => (c.id === remoteJid ? { ...c, leadInfo: patch(c.leadInfo) } : c)));
    setSelectedChat((s) => (s && s.id === remoteJid ? { ...s, leadInfo: patch(s.leadInfo) } : s));
  };

  // Orçamento gerado no ERP ou enviado como PDF: extrai número/valor e grava no lead
  const processAndApplyQuote = async (
    remoteJid: string,
    fileOrName: File | string,
    isoTs?: string,
  ) => {
    try {
      const fileName = typeof fileOrName === "string" ? fileOrName : fileOrName.name;
      let total: number | null = null;
      let numeroDoc: string | null = null;

      if (typeof fileOrName !== "string" && (fileOrName.type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf"))) {
        // Leitura direta do PDF usando pdfjs-dist
        const extracted = await parseOrcamentoPdf(fileOrName, fileName);
        if (extracted.valor && extracted.valor > 0) {
          total = extracted.valor;
        }
        if (extracted.numero) numeroDoc = extracted.numero;
      }

      if (!numeroDoc) {
        const m = fileName.match(/^OR[_-](\d{4,})/i) || fileName.match(/(\d{6,})/);
        if (m) numeroDoc = m[1];
      }

      // O documento é consultado no ERP mesmo quando o PDF já deu o valor: é dele
      // que sai o CÓDIGO DO CLIENTE, o único vínculo exato entre a conversa e o
      // cadastro da Citel. O casamento por telefone falha justamente quando quem
      // conversa é a pessoa física e o cadastro está no CNPJ da empresa dela.
      if (numeroDoc) {
        const list = await apiCrmOrcamentos({ documento: numeroDoc });

        if (!total || total <= 0) {
          total = (list || []).reduce(
            (max, o) => Math.max(max, parseFloat(String(o.VALOR_TOTAL_ORCAMENTO)) || 0),
            0,
          );
        }

        const codCliente = (list || [])
          .map((o) => (o.COD_CLIENTE || "").trim())
          .find(Boolean);
        if (codCliente) {
          marketingService
            .vincularClienteErp(remoteJid, codCliente, "documento")
            .catch((err) => console.error("[ORCAMENTO] Erro ao vincular cliente do ERP:", err));
        }
      }

      if (total && total > 0) {
        const formatted = total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const patch = (info: LeadMetadata | undefined): LeadMetadata => ({ ...info, quoteValue: formatted });
        setChats((prev) => prev.map((c) => (c.id === remoteJid ? { ...c, leadInfo: patch(c.leadInfo) } : c)));
        setSelectedChat((s) => (s && s.id === remoteJid ? { ...s, leadInfo: patch(s.leadInfo) } : s));
        marketingService.registerOrcamento(remoteJid, total, isoTs).catch((err) =>
          console.error("[ORCAMENTO] Erro ao salvar orçamento no Supabase:", err)
        );
      }
    } catch (err) {
      console.error("[ORCAMENTO] Erro ao processar orçamento do documento:", err);
    }
  };

  useEffect(() => {
    const currentTimers = tempClassifyTimers.current;
    // Conecta ao WebSocket para receber mensagens em tempo real
    const socket = api.connectWebSocket();

    const processMessage = async (message: EvoMessageResponse) => {
      const remoteJid = message.key?.remoteJid;
      if (!remoteJid || !remoteJid.endsWith("@s.whatsapp.net")) return;

      const messageContent = message.message;

      // Tratamento de reações (antes da deduplicação — reações reutilizam o key.id)
      if (messageContent?.reactionMessage) {
        const reactedMsgId = messageContent.reactionMessage.key?.id;
        const reactionText = messageContent.reactionMessage.text || "";
        if (reactedMsgId) {
          if (message.key && !message.key.fromMe) {
            const senderName = message.pushName || remoteJid.split("@")[0];
            const text = "Nova reação recebida";
            sendBrowserNotification(`Nova reação de ${senderName}`, text);
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === reactedMsgId ? { ...m, reacao: reactionText } : m,
            ),
          );
          return;
        }
      }

      // Tratamento de mensagens editadas — protocolMessage/editedMessage (texto legível)
      const editedMsg = (messageContent as Record<string, unknown>)
        ?.editedMessage as Record<string, unknown> | undefined;
      const protocolMsg = (messageContent as Record<string, unknown>)
        ?.protocolMessage as Record<string, unknown> | undefined;
      if (
        editedMsg ||
        (protocolMsg &&
          (protocolMsg.type === 14 || protocolMsg.type === "MESSAGE_EDIT"))
      ) {
        const editedContent =
          (editedMsg?.message as Record<string, unknown> | undefined) ||
          (protocolMsg?.editedMessage as Record<string, unknown> | undefined);
        const editedMsgId =
          ((editedMsg?.key as Record<string, unknown>)?.id as
            | string
            | undefined) ||
          ((protocolMsg?.key as Record<string, unknown>)?.id as
            | string
            | undefined);
        if (editedContent && editedMsgId) {
          const newText =
            (editedContent.conversation as string) ||
            ((editedContent.extendedTextMessage as Record<string, unknown>)
              ?.text as string) ||
            "";
          if (newText) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === editedMsgId ? { ...m, text: newText } : m,
              ),
            );
            marketingService
              .saveMessage({
                message_id: editedMsgId,
                remote_jid: remoteJid,
                texto: newText,
                sender: message.key?.fromMe ? "me" : "contact",
                timestamp: new Date().toISOString(),
              })
              .catch(() => null);
          }
        }
        return;
      }

      // secretEncryptedMessage = edição criptografada — marca como editada na UI
      const secretMsg = (messageContent as Record<string, unknown>)
        ?.secretEncryptedMessage as Record<string, unknown> | undefined;
      if (secretMsg?.targetMessageKey) {
        const targetId = (secretMsg.targetMessageKey as Record<string, unknown>)
          .id as string | undefined;
        if (targetId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === targetId ? { ...m, editado: true } : m)),
          );
        }
        return;
      }

      // messageType secretEncryptedMessage sem targetMessageKey — ignorar
      if (
        (message as Record<string, unknown>).messageType ===
        "secretEncryptedMessage"
      )
        return;

      // Deduplicação: ignora se esta mensagem já foi processada na sessão
      const msgKeyId = message.key?.id;
      if (msgKeyId) {
        if (processedMsgIds.current.has(msgKeyId)) return;
        processedMsgIds.current.add(msgKeyId);
        if (processedMsgIds.current.size > 500) {
          const arr = [...processedMsgIds.current];
          processedMsgIds.current = new Set(arr.slice(250));
        }
      }

      // Busca dados do cliente no banco
      let dbCliente = null;
      try {
        dbCliente = await marketingService.getCliente(remoteJid);
      } catch (err) {
        console.error("Erro ao buscar cliente do banco:", err);
      }

      // Se o cliente está arquivado, desarquiva no banco e atualiza status
      if (dbCliente?.arquivado) {
        try {
          await marketingService.toggleArchived(remoteJid, false);
          dbCliente.arquivado = false;

          if (
            dbCliente.status &&
            dbCliente.status !== "Novo Lead" &&
            dbCliente.status !== "Em Contato" &&
            dbCliente.status !== "Negociando" &&
            dbCliente.status !== "Convertido"
          ) {
            dbCliente.status = "Em Contato";
            await marketingService.upsertCliente({
              remote_jid: remoteJid,
              status: "Em Contato",
            });
          }
        } catch (err) {
          console.error("Erro ao desarquivar cliente:", err);
        }
      }

      // Guarda o JID para correlacionar com o LID do chats.update que vem logo após
      lastPhoneJid.current = remoteJid;

      // Ignora mensagens com mais de 7 dias
      const MIN_SYNC_TIMESTAMP = Math.floor(
        (Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000,
      );
      const msgTimestamp = message.messageTimestamp || 0;
      if (msgTimestamp > 0 && msgTimestamp < MIN_SYNC_TIMESTAMP) return;

      const isAudio = !!messageContent?.audioMessage;
      const isSticker = !!messageContent?.stickerMessage;
      const isDocument = !!messageContent?.documentMessage;
      const text =
        messageContent?.conversation ||
        messageContent?.extendedTextMessage?.text ||
        messageContent?.imageMessage?.caption ||
        messageContent?.videoMessage?.caption ||
        (isDocument
          ? messageContent.documentMessage?.fileName || "Documento"
          : null) ||
        (isAudio ? "🎵 Áudio" : isSticker ? "🖼️ Figurinha" : "📎 Mídia");

      // Preview de link (Open Graph) que o WhatsApp já manda junto no payload da mensagem recebida
      const extText = messageContent?.extendedTextMessage;
      const linkPreview: LinkPreview | null =
        extText && (extText.jpegThumbnail || extText.description)
          ? {
              url: extText.canonicalUrl || extText.matchedText || "",
              title: extText.title || null,
              description: extText.description || null,
              image: extText.jpegThumbnail
                ? `data:image/jpeg;base64,${extText.jpegThumbnail}`
                : null,
            }
          : null;

      // Extrair citação (reply/quote)
      const ctxInfo =
        messageContent?.extendedTextMessage?.contextInfo ||
        messageContent?.imageMessage?.contextInfo ||
        messageContent?.videoMessage?.contextInfo ||
        messageContent?.audioMessage?.contextInfo ||
        messageContent?.documentMessage?.contextInfo ||
        message.contextInfo;
      const quotedMsg = ctxInfo?.quotedMessage;
      const quotedText = quotedMsg
        ? quotedMsg.conversation ||
          quotedMsg.extendedTextMessage?.text ||
          quotedMsg.imageMessage?.caption ||
          quotedMsg.videoMessage?.caption ||
          ""
        : undefined;
      const quotedIsFromMe = ctxInfo?.participant ? false : true;
      const quotedSender: "me" | "contact" | undefined = quotedText
        ? ctxInfo?.stanzaId
          ? quotedIsFromMe
            ? "me"
            : "contact"
          : undefined
        : undefined;

      const timestamp = message.messageTimestamp
        ? new Date(message.messageTimestamp * 1000).toISOString()
        : new Date().toISOString();

      // Anúncio Meta (Click-to-WhatsApp): a 1ª mensagem do lead carrega o metadado do
      // anúncio no contextInfo.externalAdReply — marca origem/campanha sem depender de texto.
      const adReply = ctxInfo?.externalAdReply;
      if (!message.key?.fromMe && adReply) {
        const src = (adReply.sourceUrl || "").toLowerCase();
        const platform = src.includes("instagram")
          ? "Instagram"
          : src.includes("facebook") || src.includes("fb.")
            ? "Facebook"
            : "Meta Ads";
        const campanha = (adReply.title || adReply.body || "").trim().slice(0, 120) || undefined;
        applyAdOrigin(remoteJid, platform, campanha);
      }

      if (!message.key?.fromMe) {
        const senderName = message.pushName || remoteJid.split("@")[0];
        sendBrowserNotification(`Nova mensagem de ${senderName}`, text);
      }

      const time = formatBrTime(new Date(timestamp));

      const msgId = message.key?.id || Date.now().toString();

      // Determinando o tipo da mensagem e dados básicos para a UI
      const tipoMsg = messageContent?.stickerMessage
        ? "sticker"
        : messageContent?.imageMessage
          ? "image"
          : messageContent?.audioMessage
            ? "audio"
            : messageContent?.videoMessage
              ? "video"
              : messageContent?.documentMessage
                ? "document"
                : "text";

      // Orçamento do ERP enviado como PDF (OR_<numero>.pdf) ou documento recebido
      const docFileName = messageContent?.documentMessage?.fileName || (tipoMsg === "document" ? text : null);
      if (docFileName) processAndApplyQuote(remoteJid, docFileName, timestamp);

      const validPushName =
        !message.key?.fromMe && message.pushName ? message.pushName : null;
      // Mídia já resolvida pelo provider (ex.: API Oficial, que injeta a URL pública
      // do Storage direto do banco). Quando presente, renderiza na hora e dispensa
      // o download assíncrono abaixo.
      const preResolvedMediaUrl = (message as unknown as { __resolvedMediaUrl?: string })
        .__resolvedMediaUrl;
      const mediaUrl: string | undefined = preResolvedMediaUrl;
      const isMediaMsg = [
        "audio",
        "image",
        "video",
        "document",
        "sticker",
      ].includes(tipoMsg);

      // Persiste a mensagem no Supabase para garantir que apareça após refresh
      marketingService
        .saveMessage({
          message_id: msgId,
          remote_jid: remoteJid,
          texto: text,
          sender: message.key?.fromMe ? "me" : "contact",
          timestamp,
          tipo: tipoMsg,
          status:
            message.status === "READ" || String(message.status) === "3"
              ? "read"
              : message.status === "DELIVERY_ACK" ||
                  String(message.status) === "2"
                ? "delivered"
                : "sent",
          ...(message.key?.fromMe ? { vendedor_id: vendedorId } : {}),
          quoted_text: quotedText,
          quoted_sender: quotedSender,
          ...(linkPreview ? { link_preview: linkPreview } : {}),
        })
        .then(() => {
          if (text) {
            detectAndSaveOrigin(remoteJid, text);
          }
        })
        .catch(() => null);

      // Download assíncrono de mídia — não bloqueia a renderização da mensagem.
      // Pulado quando a URL já veio resolvida (API Oficial já subiu no Storage).
      if (isMediaMsg && !preResolvedMediaUrl) {
        interface EvoMediaPayload {
          base64?: string;
          message?: {
            base64?: string;
            imageMessage?: { mimetype?: string };
            videoMessage?: { mimetype?: string };
            documentMessage?: { mimetype?: string };
            audioMessage?: { mimetype?: string };
          };
        }

        const payload = message as unknown as EvoMediaPayload;
        const mediaBase64 = payload.message?.base64 || payload.base64;
        const mimetype =
          payload.message?.imageMessage?.mimetype ||
          payload.message?.videoMessage?.mimetype ||
          payload.message?.documentMessage?.mimetype ||
          payload.message?.audioMessage?.mimetype ||
          "application/octet-stream";

        if (mediaBase64) {
          // O Websocket já mandou a imagem pra gente, subimos direto!
          const ext = mimetype.split("/")[1]?.split(";")[0] || "bin";
          const uploadName = docFileName ? `${msgId}/${docFileName}` : `${msgId}.${ext}`;
          marketingService
            .uploadMedia(mediaBase64, mimetype, uploadName)
            .then(async (publicUrl) => {
              if (publicUrl) {
                await marketingService.updateMessageMediaUrl(msgId, publicUrl);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === msgId ? { ...m, mediaUrl: publicUrl } : m,
                  ),
                );
              }
            });
        } else {
          // Fallback
          evolutionApi
            .getMediaBase64(message)
            .then(async (media) => {
              if (!media?.base64) return;
              const ext = media.mimetype?.split("/")[1]?.split(";")[0] || "bin";
              const fallbackName = docFileName ? `${msgId}/${docFileName}` : `${msgId}.${ext}`;
              const publicUrl = await marketingService.uploadMedia(
                media.base64,
                media.mimetype,
                fallbackName,
              );
              if (!publicUrl) return;
              await marketingService.updateMessageMediaUrl(msgId, publicUrl);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId ? { ...m, mediaUrl: publicUrl } : m,
                ),
              );
            })
            .catch(() => null);
        }
      }

      // Classificação automática de temperatura — só mensagens do contato
      if (!message.key?.fromMe) {
        const existing = tempClassifyTimers.current.get(remoteJid);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          tempClassifyTimers.current.delete(remoteJid);
          triggerTempClassifyRef.current(remoteJid);
        }, 5000);
        tempClassifyTimers.current.set(remoteJid, timer);
      }

      // Upsert do cliente para manter nome atualizado
      if (validPushName) {
        marketingService
          .upsertCliente({ remote_jid: remoteJid, nome: validPushName })
          .catch(() => null);
      }

      startTransition(() =>
        setChats((prevChats) => {
          const existingChatIndex = prevChats.findIndex(
            (c) => c.id === remoteJid,
          );

          if (existingChatIndex !== -1) {
            const updatedChats = [...prevChats];
            const chat = { ...updatedChats[existingChatIndex] };

            // Se estava arquivado: muda para não arquivado e limpa o status (motivo) se necessário
            if (chat.arquivado) {
              chat.arquivado = false;
              const currentStatus = chat.leadInfo?.status;
              const isArchiveReason =
                currentStatus &&
                currentStatus !== "Novo Lead" &&
                currentStatus !== "Em Contato" &&
                currentStatus !== "Negociando" &&
                currentStatus !== "Convertido";
              chat.leadInfo = {
                ...(chat.leadInfo || {
                  status: "Em Contato",
                  temperature: "Frio",
                  source: "WhatsApp",
                  campaign: "Geral",
                }),
                status: isArchiveReason
                  ? "Em Contato"
                  : currentStatus || "Novo Lead",
              };
            }

            chat.lastMessage = text;
            chat.lastMessageSender = message.key?.fromMe ? "me" : "contact";
            chat.lastMessageType = tipoMsg;
            chat.lastMessageStatus = message.key?.fromMe ? "sent" : undefined;
            chat.time = time;

            // Atualiza nome se ainda estiver como número de telefone e tiver push name válido
            if (validPushName) {
              const isPhoneNumber =
                /^\d+$/.test(chat.name.replace(/\D/g, "")) &&
                chat.name.length >= 8;
              if (isPhoneNumber || chat.name === "Novo Lead") {
                chat.name = validPushName;
              }
            }

            // Se a mensagem for do atendente (fromMe), zera o badge de não lidas imediatamente
            if (message.key?.fromMe) {
              chat.unreadCount = 0;
              supabase
                .from("marketing_clientes")
                .update({ mensagens_nao_lidas: 0, updated_at: new Date().toISOString() })
                .eq("remote_jid", remoteJid)
                .then();
            } else if (selectedChatRef.current?.id !== remoteJid) {
              // Incrementa unread apenas se for mensagem recebida do contato e não for o chat selecionado
              chat.unreadCount = (chat.unreadCount || 0) + 1;
              marketingService.incrementUnread(remoteJid);
            }

            updatedChats.splice(existingChatIndex, 1);
            if (!chat.avatar) chat.avatar = dbCliente?.foto_url || "";
            // Reinsere respeitando fixados: fixados ficam no topo
            return sortChats([chat, ...updatedChats]);
          } else {
            if (!dbCliente?.foto_url) fetchAvatar(remoteJid);

            // Se estamos no modo ativo, adicionamos o chat desarquivado ou novo
            if (viewModeRef.current === "active") {
              const newChat: Chat = {
                id: remoteJid,
                name:
                  dbCliente?.nome ||
                  dbCliente?.push_name ||
                  message.pushName ||
                  remoteJid.split("@")[0],
                lastMessage: text,
                lastMessageSender: message.key?.fromMe ? "me" : "contact",
                lastMessageType: tipoMsg,
                lastMessageStatus: message.key?.fromMe ? "sent" : undefined,
                time: time,
                unreadCount: message.key?.fromMe || selectedChatRef.current?.id === remoteJid ? 0 : 1,
                avatar: dbCliente?.foto_url || avatarCache.get(remoteJid) || "",
                arquivado: false,
                leadInfo: {
                  status: dbCliente?.status || "Novo Lead",
                  temperature:
                    (dbCliente?.temperatura as Temperature) || "Frio",
                  source: dbCliente?.origem || "WhatsApp",
                  campaign: dbCliente?.campanha || "Geral",
                  saleValue:
                    (dbCliente?.valor_venda ?? 0) > 0
                      ? dbCliente!.valor_venda!.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : undefined,
                  saleFromErp: dbCliente?.venda_origem === "erp",
                  quoteFromErp: dbCliente?.orcamento_origem === "erp",
                  quoteDocument: dbCliente?.orcamento_documento || undefined,
                  quoteValue:
                    (dbCliente?.valor_orcamento ?? 0) > 0
                      ? dbCliente!.valor_orcamento!.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : undefined,
                },
              };
              return sortChats([newChat, ...prevChats]);
            }
            // Se estamos no modo arquivados, e ele foi desarquivado, não fazemos nada na listagem de arquivados
            return prevChats;
          }
        }),
      );

      setSelectedChat((currentSelected) => {
        if (currentSelected?.id === remoteJid) {
          setMessages((prevMsgs) => {
            if (prevMsgs.some((m) => m.id === msgId)) return prevMsgs;
            const newMsg: Message = {
              id: msgId,
              text: text,
              time: time,
              rawTimestamp: timestamp,
              sender: message.key?.fromMe ? "me" : "contact",
              status: "sent",
              tipo: tipoMsg,
              mediaUrl: mediaUrl,
              ...(docFileName ? { fileName: docFileName } : {}),
              ...(quotedText ? { quotedText, quotedSender } : {}),
              ...(linkPreview ? { linkPreview } : {}),
            };
            return [...prevMsgs, newMsg];
          });
        }
        return currentSelected;
      });
    };

    const handleIncomingMessage = (data: Record<string, unknown>) => {
      // Com WEBSOCKET_GLOBAL_EVENTS=true o payload vem como { instance, data: msg|msg[] }
      // Filtra apenas eventos da instância configurada
      const instanceName = import.meta.env.VITE_EVO_INSTANCE as string;
      if (data.instance && data.instance !== instanceName) return;

      const raw = data.data ?? data;
      const messages: EvoMessageResponse[] = Array.isArray(raw)
        ? (raw as EvoMessageResponse[])
        : [raw as EvoMessageResponse];

      messages.forEach(processMessage);
    };

    socket.on("messages.upsert", handleIncomingMessage);
    socket.on("MESSAGES_UPSERT", handleIncomingMessage);
    socket.on("message", handleIncomingMessage);
    socket.on("message-received", handleIncomingMessage);

    const handleMessageUpdate = (data: Record<string, unknown>) => {
      const instanceName = import.meta.env.VITE_EVO_INSTANCE as string;
      if (data.instance && data.instance !== instanceName) return;

      interface UpdateItemNested {
        key?: { id?: string; remoteJid?: string };
        update?: { status?: string | number };
      }
      interface UpdateItemFlat {
        keyId?: string;
        remoteJid?: string;
        status?: string | number;
      }

      const rawData = data.data;
      const items: unknown[] = Array.isArray(rawData)
        ? rawData
        : rawData
          ? [rawData]
          : [data];

      items.forEach((item) => {
        const flat = item as UpdateItemFlat;
        const nested = item as UpdateItemNested;

        // Suporta formato plano { keyId, status } e formato aninhado { key: { id }, update: { status } }
        const msgId = flat.keyId || nested.key?.id;
        const rawStatus = flat.status ?? nested.update?.status;

        if (!msgId || rawStatus === undefined || rawStatus === null) return;

        let newStatus: "sent" | "delivered" | "read" | undefined;
        if (rawStatus === 2 || rawStatus === "DELIVERY_ACK")
          newStatus = "delivered";
        if (
          rawStatus === 3 ||
          rawStatus === "READ" ||
          rawStatus === 4 ||
          rawStatus === "PLAYED"
        )
          newStatus = "read";

        if (newStatus) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, status: newStatus as "sent" | "delivered" | "read" }
                : m,
            ),
          );
          // Atualiza o status na lista lateral APENAS da conversa dona do recibo.
          // Antes não havia checagem de JID: um único "lido" marcava como lido a
          // última mensagem de toda conversa cuja última mensagem fosse minha.
          const jidDoRecibo = flat.remoteJid || nested.key?.remoteJid;
          const alvo = jidDoRecibo || selectedChatRef.current?.id;
          if (alvo) {
            setChats((prev) =>
              prev.map((c) =>
                c.id === alvo && c.lastMessageSender === "me"
                  ? { ...c, lastMessageStatus: newStatus }
                  : c,
              ),
            );
          }
          marketingService.updateMessageStatus(msgId, newStatus);
        }
      });
    };

    socket.on("messages.update", handleMessageUpdate);
    socket.on("MESSAGES_UPDATE", handleMessageUpdate);

    const handleMessageEdit = (data: Record<string, unknown>) => {
      const instanceName = import.meta.env.VITE_EVO_INSTANCE as string;
      if (data.instance && data.instance !== instanceName) return;
      console.log(
        "[WS] messages.edit recebido:",
        JSON.stringify(data, null, 2).substring(0, 800),
      );

      const payload = (data.data || data) as Record<string, unknown>;
      const editKey = payload.key as Record<string, unknown> | undefined;
      const originalMsgId = editKey?.id as string | undefined;
      if (!originalMsgId) return;

      const editedContent = payload.editedMessage as
        | Record<string, unknown>
        | undefined;
      if (editedContent) {
        const newText =
          (editedContent.conversation as string) ||
          ((editedContent.extendedTextMessage as Record<string, unknown>)
            ?.text as string) ||
          "";
        if (newText) {
          const remoteJid = (editKey?.remoteJid as string) || "";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === originalMsgId ? { ...m, text: newText } : m,
            ),
          );
          if (remoteJid) {
            marketingService
              .saveMessage({
                message_id: originalMsgId,
                remote_jid: remoteJid,
                texto: newText,
                sender: editKey?.fromMe ? "me" : "contact",
                timestamp: new Date().toISOString(),
              })
              .catch(() => null);
          }
        }
      }
    };

    socket.on("messages.edit", handleMessageEdit);
    socket.on("MESSAGES_EDIT", handleMessageEdit);
    socket.on("MESSAGES_EDITED", handleMessageEdit);

    // Usa profilePicUrl direto do evento contacts.update (sem chamada extra à API)
    const handleContactsUpdate = (data: Record<string, unknown>) => {
      const instanceName = import.meta.env.VITE_EVO_INSTANCE as string;
      if (data.instance && data.instance !== instanceName) return;

      const raw = data.data ?? data;
      const contacts = Array.isArray(raw) ? raw : [raw];

      (
        contacts as Array<{ remoteJid?: string; profilePicUrl?: string }>
      ).forEach((c) => {
        const jid = c.remoteJid;
        const picUrl = c.profilePicUrl;
        if (!jid || !picUrl) return;

        if (jid.endsWith("@lid")) {
          // Mapeia LID → JID real usando o mesmo profilePicUrl
          const matchedJid = [...avatarCache.entries()].find(
            ([, url]) => url === picUrl,
          )?.[0];
          if (matchedJid) lidToJidMap.current.set(jid, matchedJid);
          return;
        }

        if (!jid.endsWith("@s.whatsapp.net")) return;
        avatarCache.set(jid, picUrl);
        marketingService.upsertCliente({ remote_jid: jid, foto_url: picUrl });
        setChats((prev) =>
          prev.map((chat) =>
            chat.id === jid ? { ...chat, avatar: picUrl } : chat,
          ),
        );
      });
    };

    socket.on("contacts.update", handleContactsUpdate);
    socket.on("CONTACTS_UPDATE", handleContactsUpdate);

    const handlePresenceUpdate = (data: Record<string, unknown>) => {
      const instanceName = import.meta.env.VITE_EVO_INSTANCE as string;
      if (data.instance && data.instance !== instanceName) return;

      interface RawPresenceData {
        key?: { remoteJid?: string };
        id?: string;
        presences?: Record<string, { lastKnownPresence?: string }>;
        presence?: string;
      }
      const raw = (data.data ?? data) as RawPresenceData;
      const rawJid = raw.key?.remoteJid || raw.id;
      if (!rawJid) return;

      const jid = rawJid.endsWith("@lid")
        ? (lidToJidMap.current.get(rawJid) ?? rawJid)
        : rawJid;

      const presences = raw.presences as
        | Record<string, { lastKnownPresence?: string }>
        | undefined;
      const presence = presences
        ? Object.values(presences)[0]?.lastKnownPresence
        : (raw.presence as string | undefined);
      // Recebido: "typing" ou "composing" = digitando | "recording" = gravando áudio
      const presenceType =
        presence === "composing" || presence === "typing"
          ? "composing"
          : presence === "recording"
            ? "recording"
            : null;

      setPresenceChats((prev: Map<string, string>) => {
        const next = new Map(prev);
        if (presenceType) {
          next.set(jid, presenceType);
          const existing = typingTimers.current.get(jid);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(() => {
            setPresenceChats((s: Map<string, string>) => {
              const n = new Map(s);
              n.delete(jid);
              return n;
            });
            typingTimers.current.delete(jid);
          }, 5000);
          typingTimers.current.set(jid, timer);
        } else {
          // Contato ficou offline/indisponível — registra o "visto por último"
          if (presence === "unavailable" || presence === "paused") {
            lastSeenMap.current.set(jid, new Date());
            forceUpdate((n: number) => n + 1); // re-render para atualizar o header
          }
          next.delete(jid);
          const existing = typingTimers.current.get(jid);
          if (existing) {
            clearTimeout(existing);
            typingTimers.current.delete(jid);
          }
        }
        return next;
      });
    };

    socket.on("presence.update", handlePresenceUpdate);
    socket.on("PRESENCE_UPDATE", handlePresenceUpdate);

    // Correlaciona LID com JID de telefone usando a sequência de eventos
    const handleChatsUpdate = (data: Record<string, unknown>) => {
      const instanceName = import.meta.env.VITE_EVO_INSTANCE as string;
      if (data.instance && data.instance !== instanceName) return;
      const raw = data.data ?? data;
      const items = Array.isArray(raw) ? raw : [raw];
      (items as Array<{ remoteJid?: string }>).forEach((item) => {
        const lid = item.remoteJid;
        if (lid?.endsWith("@lid") && lastPhoneJid.current) {
          lidToJidMap.current.set(lid, lastPhoneJid.current);
          // Debounce: evita serialização síncrona em cada evento WS
          if (lidSaveTimer.current) clearTimeout(lidSaveTimer.current);
          lidSaveTimer.current = setTimeout(() => {
            localStorage.setItem(
              "wpp_lid_map",
              JSON.stringify([...lidToJidMap.current.entries()]),
            );
          }, 2000);
        }
      });
    };
    socket.on("chats.update", handleChatsUpdate);
    socket.on("CHATS_UPDATE", handleChatsUpdate);

    socket.on("disconnect", () => {});

    return () => {
      socket.off("messages.upsert", handleIncomingMessage);
      socket.off("MESSAGES_UPSERT", handleIncomingMessage);
      socket.off("message", handleIncomingMessage);
      socket.off("message-received", handleIncomingMessage);
      socket.off("contacts.update", handleContactsUpdate);
      socket.off("CONTACTS_UPDATE", handleContactsUpdate);
      socket.off("presence.update", handlePresenceUpdate);
      socket.off("PRESENCE_UPDATE", handlePresenceUpdate);
      socket.off("chats.update", handleChatsUpdate);
      socket.off("CHATS_UPDATE", handleChatsUpdate);
      socket.off("messages.edit", handleMessageEdit);
      socket.off("MESSAGES_EDIT", handleMessageEdit);
      socket.off("MESSAGES_EDITED", handleMessageEdit);
      // ESTES faltavam — sem remover, o handler de status se acumulava a cada
      // re-run do efeito e uma única atualização disparava N gravações (loop/flood).
      socket.off("messages.update", handleMessageUpdate);
      socket.off("MESSAGES_UPDATE", handleMessageUpdate);
      currentTimers.forEach((t) => clearTimeout(t));
      currentTimers.clear();
    };
  }, [api, fetchAvatar, vendedorId]);

  // Realtime: escuta inserções e edições de mensagens salvas no Supabase (inclui notas internas).
  // Filtra server-side pelo chat ABERTO — sem isso o Supabase transmitia toda mensagem de
  // todas as conversas para todos os clientes conectados (grande fonte de egress). A lista
  // de conversas continua atualizando pelo socket.io da Evolution.
  useEffect(() => {
    const jid = selectedChat?.id;
    if (!jid) return;
    const channel = supabase
      .channel(`whatsapp-msg-changes-${jid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "marketing_whatsapp", filter: `remote_jid=eq.${jid}` },
        (payload) => {
          const updated = payload.new as {
            message_id?: string;
            texto?: string;
            editado?: boolean;
            status?: string;
            reacao?: string;
          };
          if (!updated.message_id) return;
          // Só "sobe" o status (enviado → entregue → lido); nunca regride.
          const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== updated.message_id) return m;
              const next = { ...m };
              if (updated.texto) next.text = updated.texto;
              if (updated.editado !== undefined) next.editado = updated.editado;
              if (updated.reacao !== undefined) next.reacao = updated.reacao || undefined;
              const s = updated.status;
              if (
                (s === "sent" || s === "delivered" || s === "read") &&
                (rank[s] || 0) > (rank[m.status] || 0)
              ) {
                next.status = s;
              }
              return next;
            }),
          );
          // Reflete o status na lista lateral (última msg minha do chat aberto).
          if (updated.status === "delivered" || updated.status === "read") {
            setChats((prev) =>
              prev.map((c) =>
                c.id === selectedChatRef.current?.id && c.lastMessageSender === "me"
                  ? { ...c, lastMessageStatus: updated.status as "delivered" | "read" }
                  : c,
              ),
            );
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "marketing_whatsapp", filter: `remote_jid=eq.${jid}` },
        (payload) => {
          interface SupabaseMessageInsert {
            message_id: string;
            remote_jid: string;
            texto?: string;
            tipo?: string;
            sender: "me" | "contact";
            status?: string;
            timestamp: string;
            media_url?: string;
            reacao?: string;
            editado?: boolean;
            quoted_text?: string;
            quoted_sender?: "me" | "contact";
            link_preview?: LinkPreview | null;
            vendedor_id?: string;
          }
          const m = payload.new as SupabaseMessageInsert;
          if (
            m &&
            selectedChatRef.current &&
            m.remote_jid === selectedChatRef.current.id
          ) {
            const newMsg: Message = {
              id: m.message_id,
              text: m.texto || "",
              time: formatBrTime(new Date(m.timestamp)),
              rawTimestamp: m.timestamp,
              sender: m.sender,
              status: (m.status as "sent" | "delivered" | "read") || "sent",
              tipo: m.tipo,
              mediaUrl: m.media_url,
              reacao: m.reacao,
              editado: m.editado || false,
              quotedText: m.quoted_text,
              quotedSender: m.quoted_sender,
              linkPreview: m.link_preview ?? null,
              vendedorId: m.vendedor_id,
            };
            setMessages((prev) => {
              if (prev.some((msg) => msg.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        },
      )
      .subscribe((status) => {
        // Sem esse tratamento a queda do canal era silenciosa: o atendente ficava
        // com a conversa congelada e só via as mensagens novas ao dar F5.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn(`[WhatsApp] Realtime da conversa caiu (${status}). Reconectando...`);
          realtimeHealthyRef.current = false;
          agendarReconexaoRealtime();
        } else if (status === "SUBSCRIBED") {
          realtimeHealthyRef.current = true;
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChat?.id, realtimeGen, agendarReconexaoRealtime]);

  // Rede de segurança do realtime.
  // Mesmo com reconexão automática, existe a janela em que o canal esteve fora e
  // as mensagens daquele intervalo não chegaram por push. Aqui ressincronizamos
  // ao voltar para a aba, ao reconectar a internet e periodicamente — assim uma
  // mensagem de cliente nunca fica esperando por um F5.
  useEffect(() => {
    let resyncing = false;

    const resync = async (motivo: string) => {
      if (resyncing || document.visibilityState === "hidden") return;
      resyncing = true;
      try {
        // Reassina os canais (no-op se já estiverem saudáveis) e recarrega a lista
        // sem piscar. `silent` evita esvaziar a lista sob os olhos do atendente.
        if (!realtimeHealthyRef.current) {
          console.warn(`[WhatsApp] Ressincronizando após ${motivo}.`);
          setRealtimeGen((g) => g + 1);
        }
        await loadChats({ silent: true });

        // Recarrega a conversa aberta, mesclando só o que faltar (não substitui o
        // estado inteiro para não perder posição de scroll nem mensagem otimista).
        const jid = selectedChatRef.current?.id;
        if (jid) {
          const dbMessages = await marketingService.getMessagesByJid(jid, 50);
          setMessages((prev) => {
            const existentes = new Set(prev.map((m) => m.id));
            const faltando = dbMessages
              .filter((m) => !existentes.has(m.message_id))
              .map((m) => ({
                id: m.message_id,
                text: m.texto || "",
                time: formatBrTime(new Date(m.timestamp)),
                rawTimestamp: m.timestamp,
                sender: m.sender,
                status: (m.status as "sent" | "delivered" | "read") || "sent",
                tipo: m.tipo,
                mediaUrl: m.media_url,
                reacao: m.reacao,
                editado: m.editado || false,
                quotedText: m.quoted_text,
                quotedSender: m.quoted_sender,
                linkPreview: m.link_preview ?? null,
                vendedorId: m.vendedor_id,
              })) as Message[];
            if (faltando.length === 0) return prev;
            return [...prev, ...faltando].sort(
              (a, b) =>
                new Date(a.rawTimestamp || 0).getTime() -
                new Date(b.rawTimestamp || 0).getTime(),
            );
          });
        }
      } catch (err) {
        console.error("[WhatsApp] Falha ao ressincronizar:", err);
      } finally {
        resyncing = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") resync("volta para a aba");
    };
    const onOnline = () => resync("reconexão da internet");

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onVisibility);

    // Batimento periódico: cobre o caso da aba ficar aberta e visível o dia todo,
    // em que nenhum dos eventos acima dispara.
    const heartbeat = setInterval(() => resync("verificação periódica"), 60_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onVisibility);
      clearInterval(heartbeat);
    };
  }, [loadChats]);

  useEffect(() => {
    loadChats();
    setLoading(false);
  }, [loadChats]);

  // Reclassifica leads sem temperatura definida (Frio padrão) ao carregar.
  // Usa APENAS a heurística (custo zero) — sem chamadas de IA no carregamento.
  // A IA fica reservada ao fluxo de mensagens novas (com cooldown e parada no Quente).
  useEffect(() => {
    const reclassifyUnclassified = async () => {
      try {
        const allClientes = await marketingService.getActiveClientes(
          "all",
          200,
          0,
        );
        if (!allClientes || allClientes.length === 0) return;
        const targets = allClientes.filter(
          (c) => !c.temperatura || c.temperatura === "Frio",
        );
        for (let i = 0; i < Math.min(targets.length, 30); i++) {
          try {
            const cliente = targets[i];
            const msgs = await marketingService.getMessagesByJid(
              cliente.remote_jid,
              15,
            );
            if (!msgs || msgs.length < 3) continue;
            const newTemp = classifyByRules(
              msgs.map((m) => ({
                sender: m.sender as "me" | "contact",
                text: m.texto || "",
              })),
            );
            if (newTemp && newTemp !== "Frio") {
              knownTempRef.current.set(
                cliente.remote_jid,
                newTemp as Temperature,
              );
              await marketingService.upsertCliente({
                remote_jid: cliente.remote_jid,
                temperatura: newTemp,
              });
              setChats((prev) =>
                prev.map((c) =>
                  c.id === cliente.remote_jid
                    ? {
                        ...c,
                        leadInfo: {
                          ...(c.leadInfo || {}),
                          temperature: newTemp as Temperature,
                        },
                      }
                    : c,
                ),
              );
            }
          } catch {
            // silencia erros individuais para não interromper o lote
          }
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch {
        // silencia erros de rede no carregamento inicial
      }
    };
    const id = setTimeout(reclassifyUnclassified, 5000);
    return () => clearTimeout(id);
  }, []);

  // Tempo médio de 1ª resposta do dia (atualiza a cada 5 min)
  useEffect(() => {
    const fetchResponseTime = async () => {
      try {
        const today = new Date();
        const val = await marketingService.getAvgFirstResponseTime(
          today,
          today,
        );
        setAvgResponseTime(val);
      } catch {
        // mantém o valor anterior em caso de erro de rede
      }
    };
    fetchResponseTime();
    const id = setInterval(fetchResponseTime, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(
      () => {
        const now = Date.now();
        manualOverrideRef.current.forEach((ts, jid) => {
          if (now - ts > 10 * 60 * 1000) manualOverrideRef.current.delete(jid);
        });
      },
      5 * 60 * 1000,
    );
    return () => clearInterval(id);
  }, []);

  // Auto-scroll para o fim — mas só quando faz sentido:
  //  • nunca durante o load-more (senão perde a posição das antigas);
  //  • quando o atendente já está no fim, para acompanhar a conversa ao vivo;
  //  • sempre ao abrir outra conversa ou ao enviar mensagem.
  // Antes ele descia a cada alteração em `messages`, e como o realtime atualiza
  // status, reação e mensagem de qualquer cliente, a tela pulava para baixo no
  // meio da leitura.
  useEffect(() => {
    if (loadingMoreMessages) return;
    const el = scrollRef.current;
    if (!el) return;
    if (!forcarFimRef.current && !pertoDoFimRef.current) return;
    el.scrollTop = el.scrollHeight;
    forcarFimRef.current = false;
  }, [messages, loadingMoreMessages]);

  // Trocar de conversa sempre abre no fim, como no WhatsApp.
  useEffect(() => {
    forcarFimRef.current = true;
    pertoDoFimRef.current = true;
  }, [selectedChat?.id]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !selectedChat) return;

    // Quem envia quer ver o que enviou, mesmo tendo subido para reler algo.
    forcarFimRef.current = true;

    const textToSend = inputText;
    setInputText("");

    // Respondeu: se havia pedido de arquivamento na fila do supervisor, ele perde
    // o motivo de existir e sai da fila sozinho.
    cancelarPedidoPendente(selectedChat.id);

    // Se o chat estiver arquivado, desarquiva imediatamente ao responder
    if (selectedChat.arquivado) {
      marketingService.toggleArchived(selectedChat.id, false);
      setSelectedChat({ ...selectedChat, arquivado: false });
      setChats((prev) =>
        prev.map((c) =>
          c.id === selectedChat.id ? { ...c, arquivado: false } : c,
        ),
      );
    }

    try {
      const msgId = "me_" + Date.now().toString();
      const timestamp = new Date().toISOString();
      const time = formatBrTime(new Date(timestamp));

      const quoted = replyingMessage
        ? {
            key: {
              id: replyingMessage.id,
              fromMe: replyingMessage.sender === "me",
            },
            message: {
              conversation: replyingMessage.text,
            },
          }
        : undefined;

      const quotedText = replyingMessage?.text;
      const quotedSender = replyingMessage?.sender;

      const newMsg: Message = {
        id: msgId,
        text: textToSend,
        time: time,
        rawTimestamp: timestamp,
        sender: "me",
        status: "sent",
        tipo: "text",
        ...(quotedText ? { quotedText, quotedSender } : {}),
      };

      setMessages((prev) => [...prev, newMsg]);
      setReplyingMessage(null);

      // Atualiza o lastMessage no chat da sidebar, atribui o vendedor_id localmente
      // e já sobe a conversa para o topo (sem esperar o eco do WebSocket).
      setChats((prev) =>
        bumpChatToTop(prev, selectedChat.id, {
          lastMessage: textToSend,
          lastMessageSender: "me",
          lastMessageType: "text",
          lastMessageStatus: "sent",
          time: "Agora",
          vendedor_id: vendedorId,
        }),
      );
      setSelectedChat((prev) =>
        prev ? { ...prev, vendedor_id: vendedorId } : null,
      );

      const sendResp = await api.sendText(
        selectedChat.id,
        textToSend,
        quoted,
      );
      const realId = sendResp?.key?.id;
      if (realId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, id: realId } : m)),
        );
      }

      await marketingService.upsertCliente({
        remote_jid: selectedChat.id,
        ultima_mensagem: textToSend,
        ultima_conversa_em: timestamp,
        status: "Em Contato",
        vendedor_id: vendedorId,
      });

      await marketingService.saveMessage({
        message_id: realId || msgId,
        remote_jid: selectedChat.id,
        texto: textToSend,
        sender: "me",
        timestamp,
        status: "sent",
        tipo: "text",
        vendedor_id: vendedorId,
        quoted_text: quotedText,
        quoted_sender: quotedSender,
      });
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
    }
  };

  const handleSendDocument = async (file: File) => {
    if (!selectedChat) return;
    setPendingFile(file);
  };

  // A prévia usa object URL; sem revogar, cada gravação vaza um blob na memória.
  useEffect(() => {
    if (pendingFile) return;
    setAudioPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }, [pendingFile]);

  // Insere o emoji na posição do cursor (não no fim), preservando o que já foi
  // digitado dos dois lados, e devolve o foco ao campo com o cursor após o emoji.
  const inserirEmoji = (emoji: string) => {
    const input = composerInputRef.current;
    if (!input) {
      setInputText((prev) => prev + emoji);
      return;
    }
    const inicio = input.selectionStart ?? inputText.length;
    const fim = input.selectionEnd ?? inputText.length;
    const novo = inputText.slice(0, inicio) + emoji + inputText.slice(fim);
    setInputText(novo);
    requestAnimationFrame(() => {
      input.focus();
      const pos = inicio + emoji.length;
      input.setSelectionRange(pos, pos);
    });
  };

  // Reagir (like/emoji) a uma mensagem — só quando o provider suporta (API Oficial).
  const handleSendReaction = async (msg: Message, emoji: string) => {
    if (!selectedChat || !api.sendReaction || !msg.id) return;
    // Alterna: reagir com o mesmo emoji remove a reação (envia emoji vazio).
    const novoEmoji = msg.reacao === emoji ? "" : emoji;
    // Otimista na tela.
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, reacao: novoEmoji || undefined } : m)),
    );
    try {
      await api.sendReaction(selectedChat.id, msg.id, novoEmoji);
      marketingService.updateMessageReaction?.(msg.id, novoEmoji);
    } catch (error) {
      console.error("Erro ao reagir à mensagem:", error);
      // Reverte em caso de falha.
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, reacao: msg.reacao } : m)),
      );
    }
  };

  // `arquivoDireto` existe para o gravador de áudio: ele já mostrou a prévia e
  // entrega o arquivo pronto, sem passar pela barra de anexo pendente (e sem
  // depender do setState de `pendingFile`, que não vale no mesmo tick).
  const confirmSendFile = async (arquivoDireto?: File) => {
    const file = arquivoDireto ?? pendingFile;
    if (!file || !selectedChat) return;
    const caption = inputText;
    setPendingFile(null);
    setInputText("");

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Full = reader.result as string;
      const base64 = base64Full.split(",")[1];

      // Tipo real da mídia (antes tudo virava "document", então imagem enviada
      // sumia ao recarregar por ser renderizada como documento).
      const mt = file.type || "";
      const fileTipo = mt === "image/webp"
        ? "sticker"
        : mt.startsWith("image/")
          ? "image"
          : mt.startsWith("video/")
            ? "video"
            : mt.startsWith("audio/")
              ? "audio"
              : "document";
      const previaTxt = fileTipo === "image" ? "📷 Foto" : fileTipo === "video" ? "🎥 Vídeo" : fileTipo === "audio" ? "🎵 Áudio" : fileTipo === "sticker" ? "🖼️ Figurinha" : `📎 ${file.name}`;

      const msgId = "doc_" + Date.now();
      const timestamp = new Date().toISOString();
      const time = formatBrTime(new Date(timestamp));

      const quoted = replyingMessage
        ? {
            key: {
              id: replyingMessage.id,
              fromMe: replyingMessage.sender === "me",
            },
            message: {
              conversation: replyingMessage.text,
            },
          }
        : undefined;

      const quotedText = replyingMessage?.text;
      const quotedSender = replyingMessage?.sender;

      const newMsg: Message = {
        id: msgId,
        text: caption || (fileTipo === "document" ? file.name : ""),
        time,
        sender: "me",
        status: "sent",
        tipo: fileTipo,
        mediaUrl: base64Full,
        fileName: file.name,
        rawTimestamp: timestamp,
        ...(quotedText ? { quotedText, quotedSender } : {}),
      };
      setMessages((prev) => [...prev, newMsg]);
      setReplyingMessage(null);

      // Sobe a conversa junto com o balão otimista — não depois do upload/envio,
      // senão a lista só reordenaria quando a mídia terminasse de subir.
      setChats((prev) =>
        bumpChatToTop(prev, selectedChat.id, {
          lastMessage: previaTxt,
          lastMessageSender: "me",
          lastMessageType: fileTipo,
          lastMessageStatus: "sent",
          time: "Agora",
          vendedor_id: vendedorId,
        }),
      );

      // Inicia a extração e aplicação otimista do orçamento na hora
      if (fileTipo === "document" || file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        processAndApplyQuote(selectedChat.id, file, timestamp);
      }

      try {
        const ext = file.name.split(".").pop() || "bin";
        const filename = `${msgId}.${ext}`;
        const publicUrl = await marketingService.uploadMedia(
          base64,
          file.type,
          filename,
        );

        if (publicUrl) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, mediaUrl: publicUrl } : m,
            ),
          );
        }

        const docResp = await api.sendDocument(
          selectedChat.id,
          base64,
          file.type,
          file.name,
          caption,
          quoted,
        );
        const realDocId = docResp?.key?.id;
        if (realDocId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === msgId ? { ...m, id: realDocId } : m)),
          );
        }

        setSelectedChat((prev) =>
          prev ? { ...prev, vendedor_id: vendedorId } : null,
        );

        await marketingService.upsertCliente({
          remote_jid: selectedChat.id,
          ultima_mensagem: `📎 ${file.name}`,
          ultima_conversa_em: timestamp,
          status: "Em Contato",
          vendedor_id: vendedorId,
        });

        await marketingService.saveMessage({
          message_id: realDocId || msgId,
          remote_jid: selectedChat.id,
          texto: caption || (fileTipo === "document" ? file.name : ""),
          sender: "me",
          timestamp,
          status: "sent",
          tipo: fileTipo,
          media_url: publicUrl || undefined,
          vendedor_id: vendedorId,
          quoted_text: quotedText,
          quoted_sender: quotedSender,
        });
      } catch (error) {
        console.error("Erro ao enviar documento:", error);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const item = e.clipboardData.items[0];
    if (item?.kind === "file") {
      const file = item.getAsFile();
      if (file) handleSendDocument(file);
    }
  };

  // Arrastar arquivo para a conversa.
  //
  // O `dragleave` dispara toda vez que o ponteiro passa de um elemento para um
  // filho — e a área de mensagens é cheia deles. Com um simples liga/desliga, o
  // overlay piscava a cada balão que o arquivo cruzava. Pior: o próprio overlay
  // é um filho que aparece durante o arrasto, então ele se auto-derrubava em
  // loop (aparece → ponteiro entra nele → leave no pai → some → aparece...).
  //
  // A contagem de enter/leave resolve o primeiro caso; o `pointer-events-none`
  // no overlay resolve o segundo.
  const dragCounterRef = useRef(0);

  /** Só reage a arquivo de verdade — arrastar texto dentro do app não conta. */
  const arrastandoArquivo = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types || []).includes("Files");

  const handleDragEnter = (e: React.DragEvent) => {
    if (!arrastandoArquivo(e)) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!arrastandoArquivo(e)) return;
    // Sem o preventDefault no dragover o navegador recusa o drop.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!arrastandoArquivo(e)) return;
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleSendDocument(file);
  };

  // Soltar o arquivo fora da janela (ou apertar Esc) não dispara drop nem leave
  // na área — sem isto o overlay ficava preso na tela até o próximo arrasto.
  useEffect(() => {
    if (!isDragging) return;
    const limpar = () => {
      dragCounterRef.current = 0;
      setIsDragging(false);
    };
    window.addEventListener("dragend", limpar);
    window.addEventListener("drop", limpar);
    return () => {
      window.removeEventListener("dragend", limpar);
      window.removeEventListener("drop", limpar);
    };
  }, [isDragging]);

  const loadProducts = useCallback(async () => {
    if (productsLoadedRef.current) return;
    setLoadingProducts(true);
    try {
      const data = await apiDashboardProdutos();
      // Normaliza preços uma única vez no fetch — elimina parsing repetido no render
      const normalized: NormalizedProduct[] = data.map((p) => {
        const parseBrl = (val: string | number | null | undefined) => {
          if (val === undefined || val === null || val === "") return 0;
          const s = String(val).trim();
          // Se tiver vírgula e ponto, ou só vírgula, assume formato BRL (1.234,56 ou 1234,56)
          if (s.includes(",")) {
            return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
          }
          return parseFloat(s) || 0;
        };

        const preco = parseBrl(p.PRECO_VENDA);
        const debito = preco;
        const credito = preco * 1.0466;

        const raw = p as unknown as Record<string, unknown>;
        const fotoUrl =
          (typeof raw.FOTO_URL === "string" ? raw.FOTO_URL : undefined) ||
          (typeof raw.IMAGEM_URL === "string" ? raw.IMAGEM_URL : undefined) ||
          (typeof raw.foto_url === "string" ? raw.foto_url : undefined) ||
          (typeof raw.imagem_url === "string" ? raw.imagem_url : undefined);

        return {
          cod: p.COD_ITEM,
          descricao: p.DESCRICAO,
          marca: p.MARCA || "",
          disponivel: parseBrl(p.TOTAL_DISPONIVEL),
          preco,
          debito,
          credito,
          foto_url: fotoUrl,
        };
      });

      // Mostra a lista JÁ (nome/preço/estoque vêm do ERP). As fotos da Shopify foram
      // removidas por deixar o carregamento lento (paginava toda a loja). Só faltam
      // as fotos salvas no Supabase (uma query rápida), buscadas em segundo plano.
      setAllProducts(normalized);
      productsLoadedRef.current = true;
      setLoadingProducts(false);

      // Enriquecimento de fotos em segundo plano (só Supabase — rápido).
      void (async () => {
        try {
          const { data: fotosData } = await supabase.from("produtos_fotos").select("cod_item, foto_url");
          const photoByCod = new Map<string, string>();
          (fotosData as Array<{ cod_item?: string; foto_url?: string }> | null)?.forEach((f) => {
            if (f.cod_item && f.foto_url) photoByCod.set(String(f.cod_item), f.foto_url);
          });
          if (photoByCod.size > 0) {
            setAllProducts((prev) =>
              prev.map((p) =>
                p.foto_url || !photoByCod.has(p.cod) ? p : { ...p, foto_url: photoByCod.get(p.cod) },
              ),
            );
          }
        } catch {
          /* ignora se a tabela não existir */
        }
      })();
    } catch (error) {
      console.error("Erro ao carregar produtos:", error);
      setLoadingProducts(false);
    }
  }, []); // Sem deps: usa ref para o flag, não recria a função após o load

  useEffect(() => {
    if (showProductSelector) loadProducts();
  }, [showProductSelector, loadProducts]);

  const displayedChats = useMemo(
    () =>
      chats.filter((c) =>
        viewMode === "archived" ? c.arquivado : !c.arquivado,
      ),
    [chats, viewMode],
  );

  const filteredChats = useMemo(() => {
    const searchLower = chatSearch.trim().toLowerCase();
    if (!searchLower) return displayedChats;

    // Durante a busca ignoramos o filtro arquivado/ativo: o resultado do servidor
    // (searchResults) já traz qualquer lead que casa por nome ou telefone. Combinamos
    // com os chats já carregados em memória para exibição instantânea, sem duplicar.
    const digits = searchLower.replace(/\D/g, "");
    const localMatches = chats.filter(
      (c) =>
        c.name.toLowerCase().includes(searchLower) ||
        c.id.toLowerCase().includes(searchLower) ||
        c.lastMessage.toLowerCase().includes(searchLower) ||
        (digits.length > 0 && c.id.replace(/\D/g, "").includes(digits)),
    );

    const byId = new Map<string, Chat>();
    for (const c of [...localMatches, ...searchResults]) {
      if (!byId.has(c.id)) byId.set(c.id, c);
    }
    return sortChats([...byId.values()]);
  }, [displayedChats, chats, searchResults, chatSearch]);

  const filteredProducts = useMemo(() => {
    const searchLower = productSearch.trim().toLowerCase();

    // Filtra itens indesejados e itens que já estão no carrinho
    const cartIds = new Set(cartProducts.map((x) => x.cod));
    const validProducts = allProducts.filter(
      (p) =>
        p.descricao !== "ITEM CONVERSAO" && p.debito > 0 && !cartIds.has(p.cod),
    );

    if (searchLower.length < 2) return validProducts.slice(0, 30);

    const words = searchLower.split(/\s+/);
    return validProducts
      .filter((p) => {
        const desc = p.descricao.toLowerCase();
        const cod = p.cod.toLowerCase();
        return (
          words.every((w) => desc.includes(w)) || cod.includes(searchLower)
        );
      })
      .slice(0, 50);
  }, [allProducts, productSearch, cartProducts]);

  const cartMap = useMemo(() => {
    const m = new Map<string, NormalizedProduct>();
    cartProducts.forEach((p) => m.set(p.cod, p));
    return m;
  }, [cartProducts]);

  const cartTotals = useMemo(
    () => ({
      debito: cartProducts.reduce(
        (s, p) => s + p.debito * (p.quantidade || 1),
        0,
      ),
      credito: cartProducts.reduce(
        (s, p) => s + p.credito * (p.quantidade || 1),
        0,
      ),
    }),
    [cartProducts],
  );

  const handleToggleCart = (p: NormalizedProduct) => {
    setCartProducts((prev) => {
      const exists = prev.find((x) => x.cod === p.cod);
      if (exists) return prev.filter((x) => x.cod !== p.cod);
      return [...prev, { ...p, quantidade: 1 }];
    });
  };

  const handleUpdateQuantity = (cod: string, delta: number) => {
    setCartProducts((prev) =>
      prev.map((p) => {
        if (p.cod === cod) {
          const newQty = Math.max(1, (p.quantidade || 1) + delta);
          return { ...p, quantidade: newQty };
        }
        return p;
      }),
    );
  };

  const handleSetQuantity = (cod: string, value: string) => {
    const num = parseInt(value, 10);
    setCartProducts((prev) =>
      prev.map((p) => {
        if (p.cod === cod) {
          return {
            ...p,
            quantidade: isNaN(num) ? undefined : Math.max(1, num),
          };
        }
        return p;
      }),
    );
  };

  const handleBlurQuantity = (cod: string, value: number | undefined) => {
    if (value === undefined || value < 1) {
      setCartProducts((prev) =>
        prev.map((p) => {
          if (p.cod === cod) {
            return { ...p, quantidade: 1 };
          }
          return p;
        }),
      );
    }
  };

  const detectAndSaveOrigin = (remoteJid: string, text: string) => {
    const detected = detectOrigin(text);
    if (!detected) return;

    setChats((prev) => {
      const chat = prev.find((c) => c.id === remoteJid);
      const currentOrigin = chat?.leadInfo?.source;
      const isGeneric =
        !currentOrigin || currentOrigin.toLowerCase() === "whatsapp";

      if (isGeneric) {
        marketingService
          .upsertCliente({ remote_jid: remoteJid, origem: detected })
          .catch(() => null);

        setSelectedChat((s) => {
          if (s && s.id === remoteJid) {
            return {
              ...s,
              leadInfo: {
                ...s.leadInfo,
                source: detected,
              },
            };
          }
          return s;
        });

        return prev.map((c) =>
          c.id === remoteJid
            ? {
                ...c,
                leadInfo: {
                  ...c.leadInfo,
                  source: detected,
                },
              }
            : c,
        );
      }
      return prev;
    });
  };

  const handleInsertQuote = () => {
    if (cartProducts.length === 0) return;

    const totalDebito = cartProducts.reduce(
      (s, p) => s + p.debito * (p.quantidade || 1),
      0,
    );
    const totalCredito = cartProducts.reduce(
      (s, p) => s + p.credito * (p.quantidade || 1),
      0,
    );

    let text = `📦 *ORÇAMENTO:*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `📋 *ITENS DO PEDIDO:*\n\n`;

    cartProducts.forEach((p, index) => {
      const qty = p.quantidade || 1;
      text += `${index + 1}️⃣ *${p.descricao.toUpperCase()}*\n`;
      text += `   ▫️ *Quantidade:* ${qty}\n`;

      if (qty > 1) {
        text += `   ▫️ *Unitário:* R$ ${p.debito.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (Pix)\n`;
      }

      text += `   ▫️ *Subtotal:* R$ ${(p.debito * qty).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (Pix)\n\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `💰 *VALORES TOTAIS:* \n\n`;
    text += `💵 *À VISTA (PIX/DÉBITO):*\n`;
    text += `👉 *R$ ${totalDebito.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}*\n\n`;

    text += `💳 *CARTÃO DE CRÉDITO:*\n`;
    text += `👉 *R$ ${totalCredito.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}*\n`;
    text += `*(Ou 3x de R$ ${(totalCredito / 3).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} s/ juros)*\n\n`;

    text += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `⚠️ _Valores sujeitos a alteração de estoque._\n`;
    text += `🚀 _Aguardamos sua confirmação para reserva!_`;

    setInputText((prev) => prev + text);
    setShowProductSelector(false);
    setCartProducts([]);

    // Marca no lead que houve orçamento e guarda o valor total à vista (PIX),
    // espelhando o registro de venda. Usa o ref travado para não errar de conversa.
    const quoteTarget = selectedChatRef.current;
    if (quoteTarget && totalDebito > 0) {
      const formatted = totalDebito.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const updatedLeadInfo = {
        ...(quoteTarget.leadInfo || {}),
        quoteValue: formatted,
      };
      setSelectedChat((prev) =>
        prev && prev.id === quoteTarget.id
          ? { ...prev, leadInfo: updatedLeadInfo }
          : prev,
      );
      setChats((prev) =>
        prev.map((c) =>
          c.id === quoteTarget.id
            ? {
                ...c,
                leadInfo: { ...(c.leadInfo || {}), quoteValue: formatted },
              }
            : c,
        ),
      );
      marketingService
        .registerOrcamento(quoteTarget.id, totalDebito)
        .catch((err) => console.error("Erro ao registrar orçamento:", err));
    }
  };

  const handleTranscribe = async (msg: Message) => {
    if (!msg.mediaUrl || msg.isTranscribing) return;

    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, isTranscribing: true } : m)),
    );

    try {
      // 1. Busca o áudio e converte para base64
      const response = await fetch(msg.mediaUrl);
      const blob = await response.blob();

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () =>
          resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(blob);
      });

      const base64 = await base64Promise;
      const transcription = await transcribeAudio(
        base64,
        blob.type || "audio/ogg",
      );

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, transcription, isTranscribing: false } : m,
        ),
      );
    } catch (error) {
      console.error("Erro ao transcrever:", error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, isTranscribing: false } : m,
        ),
      );
    }
  };

  const handleSelectChat = useCallback(async (chat: Chat) => {
    setSelectedChat(chat);
    setReplyingMessage(null);
    setChats((prev) =>
      prev.map((c) => (c.id === chat.id ? { ...c, unreadCount: 0 } : c)),
    );
    // Persiste no banco que o usuário leu as mensagens
    if ((chat.unreadCount || 0) > 0) {
      marketingService.markAsRead(chat.id);
    }
    setLoadingMessages(true);
    api.subscribePresence(chat.id);

    setHasMoreMessages(false);
    setLoadingMoreMessages(false);

    try {
      const dbMessages = await marketingService.getMessagesByJid(chat.id, 50);

      const msgs: Message[] = dbMessages.map((m) => ({
        id: m.message_id,
        text: m.texto || "",
        time: formatBrTime(new Date(m.timestamp)),
        rawTimestamp: m.timestamp,
        sender: m.sender,
        status: (m.status as "sent" | "delivered" | "read") || "sent",
        tipo: m.tipo,
        mediaUrl: m.media_url,
        reacao: m.reacao,
        editado: m.editado || false,
        quotedText: m.quoted_text,
        quotedSender: m.quoted_sender,
        linkPreview: m.link_preview ?? null,
        vendedorId: m.vendedor_id,
      }));

      setMessages(msgs);
      setHasMoreMessages(dbMessages.length === 50);

      // Scan message history to detect traffic source
      dbMessages.forEach((m) => {
        if (m.texto) {
          detectAndSaveOrigin(chat.id, m.texto);
        }
      });

      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        setChats((prev) =>
          prev.map((c) =>
            c.id === chat.id
              ? {
                  ...c,
                  lastMessageSender: lastMsg.sender,
                  lastMessageType: lastMsg.tipo || inferMsgType(lastMsg.text),
                  lastMessageStatus:
                    lastMsg.sender === "me" ? lastMsg.status : undefined,
                }
              : c,
          ),
        );
      }
    } catch (error) {
      console.error("Erro ao carregar mensagens:", error);
    } finally {
      setLoadingMessages(false);
    }
  }, [api]);

  const loadMoreMessages = useCallback(async () => {
    if (!selectedChat || loadingMoreMessages || !hasMoreMessages) return;
    const oldest = messages[0];
    if (!oldest?.rawTimestamp) return;

    setLoadingMoreMessages(true);
    try {
      const older = await marketingService.getMessagesByJid(
        selectedChat.id,
        50,
        undefined,
        oldest.rawTimestamp,
      );
      if (older.length === 0) {
        setHasMoreMessages(false);
        return;
      }

      const mapped: Message[] = older.map((m) => ({
        id: m.message_id,
        text: m.texto || "",
        time: formatBrTime(new Date(m.timestamp)),
        rawTimestamp: m.timestamp,
        sender: m.sender,
        status: (m.status as "sent" | "delivered" | "read") || "sent",
        tipo: m.tipo,
        mediaUrl: m.media_url,
        reacao: m.reacao,
        quotedText: m.quoted_text,
        quotedSender: m.quoted_sender,
        linkPreview: m.link_preview ?? null,
        vendedorId: m.vendedor_id,
      }));

      // Preserva a posição do scroll ao inserir mensagens no topo
      const container = scrollRef.current;
      const prevHeight = container?.scrollHeight ?? 0;

      setMessages((prev) => [...mapped, ...prev]);
      setHasMoreMessages(older.length === 50);

      requestAnimationFrame(() => {
        if (container)
          container.scrollTop = container.scrollHeight - prevHeight;
      });
    } catch (err) {
      console.error("[loadMore] Erro:", err);
    } finally {
      setLoadingMoreMessages(false);
    }
  }, [selectedChat, messages, loadingMoreMessages, hasMoreMessages]);

  // Função para abrir diretamente um chat (mesmo que não esteja na 1ª página carregada)
  const openDirectChat = useCallback(async (jid: string) => {
    if (!jid) return;
    localStorage.removeItem("carflax_pending_chat");

    // 1. Tenta encontrar na lista atual de chats já carregados
    const found = chats.find((c) => c.id === jid);
    if (found) {
      if (found.arquivado && viewMode !== "archived") {
        setViewMode("archived");
      } else if (!found.arquivado && viewMode !== "active") {
        setViewMode("active");
      }
      handleSelectChat(found);
      return;
    }

    // 2. Se não estiver na memória (ex: além dos 50 primeiros), busca direto no banco
    try {
      const { data: item } = await supabase
        .from("marketing_clientes")
        .select("*")
        .eq("remote_jid", jid)
        .maybeSingle();

      const detected =
        detectOrigin(item?.ultima_mensagem || "") ||
        detectOrigin(item?.nome || "") ||
        detectOrigin(item?.push_name || "");
      const finalSource = item?.origem || detected || "WhatsApp";

      const newChat: Chat = {
        id: jid,
        name: item?.nome || item?.push_name || jid.split("@")[0],
        lastMessage: item?.ultima_mensagem || "",
        lastMessageType: inferMsgType(item?.ultima_mensagem || ""),
        time: item?.ultima_conversa_em
          ? formatBrTime(new Date(item.ultima_conversa_em))
          : "",
        unreadCount: item?.mensagens_nao_lidas || 0,
        avatar: item?.foto_url || "",
        arquivado: item?.arquivado,
        fixado: item?.fixado || false,
        vendedor_id: item?.vendedor_id || undefined,
        leadInfo: {
          status: item?.status || "Novo Lead",
          temperature: (item?.temperatura as Temperature) || "Frio",
          source: finalSource,
          campaign: item?.campanha || "Geral",
          saleValue:
            (item?.valor_venda ?? 0) > 0
              ? item?.valor_venda!.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : undefined,
          saleFromErp: item?.venda_origem === "erp",
          quoteFromErp: item?.orcamento_origem === "erp",
          quoteDocument: item?.orcamento_documento || undefined,
          quoteValue:
            (item?.valor_orcamento ?? 0) > 0
              ? item?.valor_orcamento!.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : undefined,
        },
      };

      if (newChat.arquivado && viewMode !== "archived") {
        setViewMode("archived");
      } else if (!newChat.arquivado && viewMode !== "active") {
        setViewMode("active");
      }

      setChats((prev) => [newChat, ...prev.filter((c) => c.id !== jid)]);
      handleSelectChat(newChat);
    } catch (err) {
      console.error("[openDirectChat] Erro ao buscar lead:", err);
    }
  }, [chats, viewMode, handleSelectChat]);

  // Listener para eventos de abertura de chat externos e pending chat
  useEffect(() => {
    const checkPending = () => {
      const pendingChatJid = localStorage.getItem("carflax_pending_chat");
      if (pendingChatJid) {
        openDirectChat(pendingChatJid);
      }
    };

    checkPending();

    const handleOpenChatEvent = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        openDirectChat(customEvent.detail);
      }
    };

    window.addEventListener("carflax-open-chat", handleOpenChatEvent);
    return () => {
      window.removeEventListener("carflax-open-chat", handleOpenChatEvent);
    };
  }, [openDirectChat]);

  // Seleção automática inicial (se nada estiver aberto e não houver chat pendente)
  useEffect(() => {
    const pendingChatJid = localStorage.getItem("carflax_pending_chat");
    if (displayedChats.length > 0 && !selectedChat && !pendingChatJid) {
      handleSelectChat(displayedChats[0]);
    }
  }, [displayedChats, selectedChat, handleSelectChat]);

  /**
   * Agenda (ou cancela) o retorno da conversa.
   *
   * Agendar ARQUIVA: o combinado é que a conversa suma da caixa de entrada até
   * a hora marcada. Quem devolve aos ativos é o agendador do servidor, que roda
   * mesmo com o HUB fechado — por isso o valor precisa ir para o banco, e não
   * ficar só no estado da tela como era antes.
   *
   * O alvo é explícito porque o modal também abre pelo menu de contexto, para
   * uma conversa diferente da que está aberta.
   */
  const scheduleFollowUp = async (quandoLocal: string, alvo?: Chat | null) => {
    const chat = alvo ?? selectedChat;
    if (!chat) return;

    // `datetime-local` devolve hora local sem fuso; o `new Date` interpreta no
    // fuso do navegador, que é o que o atendente quis dizer.
    const iso = quandoLocal ? new Date(quandoLocal).toISOString() : null;
    const agendando = Boolean(iso);

    const updatedLeadInfo = {
      ...(chat.leadInfo || {
        status: "Novo Lead",
        temperature: "Frio" as Temperature,
        source: "WhatsApp",
        campaign: "Geral",
      }),
      followUpDate: iso || undefined,
      followUpAtendidoEm: undefined,
    };

    if (selectedChat?.id === chat.id) setSelectedChat(null);
    setChats((prev) =>
      prev.map((c) =>
        c.id === chat.id
          ? { ...c, leadInfo: updatedLeadInfo, arquivado: agendando ? true : c.arquivado }
          : c,
      ),
    );

    try {
      await marketingService.agendarFollowUp(chat.id, iso, userProfile?.id);
    } catch {
      showNotification(
        "error",
        "Não foi possível agendar",
        "O follow-up não foi salvo. Tente de novo.",
      );
    }
  };

  const handleTemperatureChange = useCallback(
    (newTemp: Temperature) => {
      if (!selectedChat) return;
      manualOverrideRef.current.set(selectedChat.id, Date.now());
      knownTempRef.current.set(selectedChat.id, newTemp);
      const updatedLeadInfo = {
        ...(selectedChat.leadInfo || {}),
        temperature: newTemp,
      };
      setSelectedChat({ ...selectedChat, leadInfo: updatedLeadInfo });
      setChats((prev) =>
        prev.map((c) =>
          c.id === selectedChat.id ? { ...c, leadInfo: updatedLeadInfo } : c,
        ),
      );
      setShowTempDropdown(false);
      marketingService
        .upsertCliente({ remote_jid: selectedChat.id, temperatura: newTemp })
        .catch((err) =>
          console.error("[Temp] Erro ao salvar temperatura:", err),
        );
    },
    [selectedChat],
  );

  const triggerTemperatureClassification = useCallback(
    async (remoteJid: string) => {
      const OVERRIDE_TTL = 10 * 60 * 1000;
      const lastOverride = manualOverrideRef.current.get(remoteJid);
      if (lastOverride && Date.now() - lastOverride < OVERRIDE_TTL) return;

      // Já está no topo: não há para onde subir.
      if (knownTempRef.current.get(remoteJid) === "Quente") return;

      try {
        const dbMessages = await marketingService.getMessagesByJid(
          remoteJid,
          15,
        );
        if (dbMessages.length < 3) return;

        const mapped = dbMessages.map((m) => ({
          sender: m.sender as "me" | "contact",
          text: m.texto || "",
        }));

        // Só heurística no cliente (custo zero) — feedback imediato na UI.
        // A IA para casos ambíguos roda no servidor (webhook) e chega por realtime.
        const newTemp = classifyByRules(mapped) as Temperature | null;
        if (!newTemp) return;

        knownTempRef.current.set(remoteJid, newTemp);

        await marketingService.upsertCliente({
          remote_jid: remoteJid,
          temperatura: newTemp,
        });

        setChats((prev) =>
          prev.map((c) =>
            c.id === remoteJid
              ? {
                  ...c,
                  leadInfo: {
                    ...(c.leadInfo || {}),
                    temperature: newTemp as Temperature,
                  },
                }
              : c,
          ),
        );
        setSelectedChat((cur) => {
          if (!cur || cur.id !== remoteJid) return cur;
          return {
            ...cur,
            leadInfo: {
              ...(cur.leadInfo || {}),
              temperature: newTemp as Temperature,
            },
          };
        });
      } catch (err) {
        console.error("[Temp] Falha na classificação automática:", err);
      } finally {
        setIsClassifyingTemp(false);
      }
    },
    [],
  );

  const triggerTempClassifyRef = useRef(triggerTemperatureClassification);
  useEffect(() => {
    triggerTempClassifyRef.current = triggerTemperatureClassification;
  }, [triggerTemperatureClassification]);

  const handleSendInternalNote = async () => {
    if (!inputText.trim() || !selectedChat) return;
    const noteText = inputText.trim();
    setInputText("");

    const rawTimestamp = new Date().toISOString();
    const noteMsgId = "note_" + Date.now();

    const activeVendedorId = userProfile?.id || vendedorId;
    const noteMsg: Message = {
      id: noteMsgId,
      text: noteText,
      time: formatBrTime(new Date()),
      rawTimestamp,
      sender: "me",
      status: "read",
      tipo: "internal_note",
      vendedorId: activeVendedorId,
    };

    // Atualiza o estado da UI instantaneamente
    setMessages((prev) => [...prev, noteMsg]);

    // Salva permanentemente no Supabase usando a tabela de mensagens do marketing_whatsapp
    try {
      await marketingService.saveMessage({
        message_id: noteMsgId,
        remote_jid: selectedChat.id,
        texto: noteText,
        tipo: "internal_note",
        sender: "me",
        status: "read",
        timestamp: rawTimestamp,
        vendedor_id: activeVendedorId,
      });
    } catch (err) {
      console.error("Erro ao salvar nota interna:", err);
    }
  };

  return (
    <div className="flex h-full bg-background overflow-hidden border border-border/50 rounded-2xl shadow-2xl m-4 relative">
      {/* Modals */}

      {/* Cadastro do cliente no ERP */}
      {showCadastroErp && (
        <div
          className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowCadastroErp(false)}
        >
          <div
            className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserRound className="w-5 h-5 text-primary" />
                <h3 className="font-black text-sm uppercase tracking-tighter text-card-foreground">
                  Cadastro no ERP
                </h3>
              </div>
              <button
                onClick={() => setShowCadastroErp(false)}
                className="p-1.5 hover:bg-secondary rounded-lg transition-colors text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              {cadastroErpLoading ? (
                <div className="space-y-3 animate-pulse">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-3 bg-secondary dark:bg-slate-800 rounded" />
                  ))}
                </div>
              ) : !cadastroErp?.encontrado || !cadastroErp.cliente ? (
                <div className="text-center py-6">
                  <p className="text-[13px] font-bold text-card-foreground mb-1">
                    Nenhum cadastro encontrado
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Não existe cliente no ERP com este telefone. O vínculo é feito
                    pelo número da conversa — se o cadastro na Citel usa outro
                    telefone, ele não é encontrado.
                  </p>
                  {/* Vínculo manual. Sem isto, comprador pessoa física com o
                      cadastro no CNPJ da empresa fica para sempre sem orçamento e
                      sem venda no HUB — e some dos relatórios de conversão. */}
                  <div className="mt-5 pt-4 border-t border-border/50 text-left">
                    {!vinculoAberto ? (
                      <button
                        onClick={() => setVinculoAberto(true)}
                        className="w-full px-4 py-2.5 rounded-xl border border-primary/30 text-primary text-[11px] font-black uppercase tracking-widest hover:bg-primary/10 transition-all"
                      >
                        Vincular cadastro manualmente
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <input
                            value={vinculoBusca}
                            onChange={(e) => setVinculoBusca(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") buscarCadastroErp();
                            }}
                            autoFocus
                            placeholder="Nome, CNPJ/CPF ou código"
                            className="flex-1 min-w-0 bg-secondary/50 border border-border rounded-xl px-3 py-2 text-[11px] font-bold text-foreground outline-none focus:border-primary/50"
                          />
                          <button
                            onClick={buscarCadastroErp}
                            disabled={vinculoBusca.trim().length < 3 || vinculoBuscando}
                            className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-[10px] font-black uppercase disabled:opacity-50"
                          >
                            {vinculoBuscando ? "..." : "Buscar"}
                          </button>
                        </div>

                        {vinculoResultados.length === 0 && !vinculoBuscando && (
                          <p className="text-[10px] text-muted-foreground">
                            Busque pelo nome do cadastro na Citel — costuma ser a
                            razão social da empresa, não o nome de quem conversa.
                          </p>
                        )}

                        <div className="space-y-1.5 max-h-52 overflow-y-auto">
                          {vinculoResultados.map((c) => (
                            <button
                              key={c.codigo}
                              onClick={() => vincularCadastroErp(c.codigo, c.nome)}
                              className="w-full text-left px-3 py-2 rounded-xl border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all"
                            >
                              <p className="text-[11px] font-black text-card-foreground truncate">
                                {c.nome}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {[c.codigo, c.documento, c.cidade && `${c.cidade}/${c.uf || ""}`, c.telefone]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-[15px] font-black text-card-foreground leading-tight">
                      {cadastroErp.cliente.nome}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] font-black text-primary tabular-nums">
                        {cadastroErp.cliente.codigo}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {cadastroErp.cliente.tipo}
                      </span>
                      {/* Vínculo por documento é exato; por telefone é inferido.
                          Quem lê precisa saber a diferença antes de confiar. */}
                      {cadastroErp.vinculo && (
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider leading-none border",
                            cadastroErp.vinculo === "documento"
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
                          )}
                          title={
                            cadastroErp.vinculo === "documento"
                              ? "Identificado pelo número do orçamento enviado na conversa"
                              : "Identificado pelo telefone da conversa — confira se é o cliente certo"
                          }
                        >
                          {cadastroErp.vinculo === "documento" ? "Orçamento" : "Telefone"}
                        </span>
                      )}
                    </div>
                  </div>

                  {[
                    { r: "Documento", v: cadastroErp.cliente.documento },
                    {
                      r: "Endereço",
                      v: [cadastroErp.cliente.endereco, cadastroErp.cliente.bairro]
                        .filter(Boolean)
                        .join(", "),
                    },
                    {
                      r: "Cidade",
                      v: cadastroErp.cliente.cidade
                        ? `${cadastroErp.cliente.cidade}/${cadastroErp.cliente.uf || ""}`
                        : null,
                    },
                    { r: "E-mail", v: cadastroErp.cliente.email },
                    // Número da conversa. Fica aqui porque o cabeçalho do chat
                    // deixou de mostrá-lo — e é o único sempre conhecido: o
                    // cadastro da Citel muitas vezes tem outro telefone (ou
                    // nenhum), que só aparece na linha seguinte quando difere.
                    {
                      r: "WhatsApp",
                      v: selectedChat ? telefoneDoJid(selectedChat.id) : null,
                    },
                    {
                      r: "Telefone no ERP",
                      v: (() => {
                        const doErp =
                          cadastroErp.cliente.celular || cadastroErp.cliente.telefone;
                        if (!doErp) return null;
                        const soDigitos = (t: string) => t.replace(/\D/g, "").slice(-8);
                        const daConversa = selectedChat
                          ? telefoneDoJid(selectedChat.id) || ""
                          : "";
                        return soDigitos(doErp) === soDigitos(daConversa) ? null : doErp;
                      })(),
                    },
                    { r: "Vendedor", v: cadastroErp.cliente.cod_vendedor },
                  ]
                    .filter((l) => l.v)
                    .map((l, i) => (
                      <div key={i} className="flex justify-between items-start gap-4 text-[11px]">
                        <span className="font-bold text-muted-foreground uppercase tracking-tight shrink-0">
                          {l.r}
                        </span>
                        <span className="text-card-foreground text-right">{l.v}</span>
                      </div>
                    ))}

                  <div className="pt-3 border-t border-border/50 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                        Faturado 12 meses
                      </p>
                      <p className="text-[15px] font-black text-emerald-600 dark:text-emerald-400">
                        {(cadastroErp.compras?.total || 0).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                        Pedidos
                      </p>
                      <p className="text-[15px] font-black text-card-foreground">
                        {cadastroErp.compras?.pedidos || 0}
                      </p>
                    </div>
                  </div>

                  {/* Orçamentos da Citel. O card mostrava só faturamento e pedido,
                      e por isso aparecia vazio justamente quando havia orçamento.
                      Inclui o que já virou pedido: some-lo era esconder o documento
                      do atendimento no exato momento em que a venda fechou. */}
                  {(cadastroErp.compras?.orcamentos_total || 0) > 0 && (
                    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                        Orçamento · {cadastroErp.compras?.orcamentos_qtd} doc(s)
                        {(cadastroErp.compras?.orcamentos_fechados || 0) > 0 &&
                          ` · ${cadastroErp.compras?.orcamentos_fechados} virou pedido`}
                      </span>
                      <span className="text-[13px] font-black text-blue-600 dark:text-blue-400">
                        {(cadastroErp.compras?.orcamentos_total || 0).toLocaleString("pt-BR", {
                          style: "currency", currency: "BRL", maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  )}

                  {/* Pedido fechado e ainda sem nota. Sem isto, quem comprou hoje
                      aparecia zerado, como se nunca tivesse comprado. */}
                  {(cadastroErp.compras?.em_aberto_total || 0) > 0 && (
                    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                        Em aberto · {cadastroErp.compras?.em_aberto_pedidos} pedido(s)
                      </span>
                      <span className="text-[13px] font-black text-amber-600 dark:text-amber-400">
                        {(cadastroErp.compras?.em_aberto_total || 0).toLocaleString("pt-BR", {
                          style: "currency", currency: "BRL", maximumFractionDigits: 0,
                        })}
                      </span>
                    </div>
                  )}

                  {/* Telefone repetido em mais de um cadastro: o mostrado é o de
                      compra mais recente, mas o vendedor precisa saber que há outros. */}
                  {(cadastroErp.outros_cadastros || 0) > 0 && (
                    <p className="text-[10px] text-amber-500 font-bold">
                      Atenção: mais {cadastroErp.outros_cadastros} cadastro(s) com este
                      mesmo telefone no ERP.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showFollowUpModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all duration-300">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-yellow-500" />
                <h3 className="font-black text-sm uppercase tracking-tighter text-card-foreground">
                  Agendar Follow-up
                </h3>
              </div>
              <button
                onClick={() => setShowFollowUpModal(false)}
                className="p-1 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">
                  Data e hora do retorno
                </label>
                <input
                  type="datetime-local"
                  value={followUpDateInput}
                  onChange={(e) => setFollowUpDateInput(e.target.value)}
                  className="w-full bg-secondary/50 border border-border/80 rounded-2xl px-4 py-3 text-sm font-bold text-foreground outline-none focus:border-yellow-500/50 focus:ring-2 focus:ring-yellow-500/20 transition-all"
                />
                <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">
                  A conversa vai para <span className="text-foreground">Arquivados</span> e
                  volta sozinha para os ativos na hora marcada, com o selo de follow-up.
                </p>
              </div>

              {(archiveTarget ?? selectedChat)?.leadInfo?.followUpDate && (
                <div className="p-3 bg-yellow-500/5 border border-yellow-500/10 rounded-2xl text-[11px] text-yellow-500/90 font-bold flex items-center justify-between">
                  <span>
                    Agendado:{" "}
                    {formatFollowUpDate(
                      (archiveTarget ?? selectedChat)!.leadInfo!.followUpDate,
                    )}
                  </span>
                  <button
                    onClick={() => {
                      scheduleFollowUp("", archiveTarget ?? selectedChat);
                      setFollowUpDateInput("");
                      showNotification(
                        "success",
                        "Follow-up Removido",
                        "O agendamento foi cancelado.",
                      );
                      setShowFollowUpModal(false);
                    }}
                    className="text-rose-500 hover:underline cursor-pointer font-black uppercase tracking-wider text-[9px]"
                  >
                    Desativar
                  </button>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-border/50 flex items-center justify-end gap-2 bg-secondary/10">
              <button
                onClick={() => setShowFollowUpModal(false)}
                className="px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-secondary rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!followUpDateInput) {
                    showNotification(
                      "error",
                      "Erro",
                      "Por favor, selecione uma data.",
                    );
                    return;
                  }
                  scheduleFollowUp(followUpDateInput, archiveTarget ?? selectedChat);
                  showNotification(
                    "success",
                    "Agendado",
                    `Follow-up definido para ${formatFollowUpDate(followUpDateInput)}`,
                  );
                  setShowFollowUpModal(false);
                }}
                className="px-5 py-2 text-xs font-black uppercase bg-yellow-500 hover:bg-yellow-600 text-black rounded-xl transition-all shadow-md hover:shadow-yellow-500/20 active:scale-95"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {podeAprovar && (
        <ArchiveApprovalModal
          open={showApprovalModal}
          onClose={() => setShowApprovalModal(false)}
          aprovador={{
            id: userProfile?.id,
            name: userProfile?.name,
            role: userProfile?.role,
            is_admin: userProfile?.is_admin,
            is_leader: userProfile?.is_leader,
          }}
          onDecidido={(pedido, aprovado) => {
            if (!aprovado) return;
            // Aprovado: a conversa saiu dos ativos (o arquivamento já foi feito
            // no banco pelo decidirAprovacao).
            setChats((prev) =>
              prev.map((c) =>
                c.id === pedido.remote_jid ? { ...c, arquivado: true } : c,
              ),
            );
            if (selectedChatRef.current?.id === pedido.remote_jid) setSelectedChat(null);
          }}
          onAbrirConversa={(remoteJid) => {
            const alvo = chats.find((c) => c.id === remoteJid);
            if (alvo) handleSelectChat(alvo);
          }}
        />
      )}

      {showArchiveModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div
            className={cn(
              "bg-card border border-border rounded-3xl shadow-2xl w-full overflow-hidden transform transition-all duration-300",
              // Os dois passos de digitação continuam estreitos: é um campo só.
              isEnteringMaterial || isEnteringCustomReason ? "max-w-sm" : "max-w-2xl",
            )}
          >
            <div className="p-6 border-b border-border/50 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-black text-sm uppercase tracking-tighter">
                  {isEnteringMaterial
                    ? "Qual Material?"
                    : isEnteringCustomReason
                    ? "Escreva o Motivo"
                    : "Encerrar Atendimento"}
                </h3>
                {!isEnteringMaterial && !isEnteringCustomReason && (
                  <p className="text-[10px] font-bold text-muted-foreground">
                    Como terminou a conversa com{" "}
                    <span className="text-foreground">
                      {archiveTarget?.name || "este cliente"}
                    </span>
                    ?
                  </p>
                )}
              </div>
              <button
                onClick={handleCloseArchiveModal}
                className="p-1 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isEnteringMaterial ? (
              <div className="space-y-4">
                <div className="p-6 space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">
                    Qual material o cliente procurava?
                  </label>
                  <input
                    value={materialInput}
                    onChange={(e) => setMaterialInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && materialInput.trim()) {
                        const reason = `Não vendemos o material: ${materialInput.trim()}`;
                        setIsEnteringMaterial(false);
                        handleArchiveChat(reason);
                      }
                    }}
                    placeholder="Ex: Cabo flexível 2.5mm, disjuntor DR..."
                    className="w-full bg-secondary/50 border border-border rounded-2xl px-4 py-3 text-xs font-bold text-foreground outline-none focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/20 transition-all"
                    autoFocus
                  />
                </div>
                <div className="p-6 border-t border-border/50 flex items-center justify-between gap-2 bg-secondary/10">
                  <button
                    onClick={() => setIsEnteringMaterial(false)}
                    className="px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-secondary rounded-xl transition-all"
                  >
                    Voltar
                  </button>
                  <button
                    disabled={!materialInput.trim()}
                    onClick={() => {
                      if (materialInput.trim()) {
                        const reason = `Não vendemos o material: ${materialInput.trim()}`;
                        setIsEnteringMaterial(false);
                        handleArchiveChat(reason);
                      }
                    }}
                    className="px-5 py-2 text-xs font-black uppercase bg-rose-500 hover:bg-rose-600 text-white rounded-xl transition-all shadow-md hover:shadow-rose-500/20 active:scale-95 disabled:opacity-55 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            ) : isEnteringCustomReason ? (
              <div className="space-y-4">
                <div className="p-6 space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">
                    Descreva o motivo personalizado
                  </label>
                  <textarea
                    value={customArchiveReason}
                    onChange={(e) => setCustomArchiveReason(e.target.value)}
                    placeholder="Ex: Cliente fechou com o concorrente, não responde..."
                    rows={3}
                    className="w-full bg-secondary/50 border border-border/80 rounded-2xl px-4 py-3 text-xs font-bold text-foreground outline-none focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/20 transition-all resize-none"
                    autoFocus
                  />
                </div>
                <div className="p-6 border-t border-border/50 flex items-center justify-between gap-2 bg-secondary/10">
                  <button
                    onClick={() => setIsEnteringCustomReason(false)}
                    className="px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-secondary rounded-xl transition-all"
                  >
                    Voltar
                  </button>
                  <button
                    disabled={!customArchiveReason.trim()}
                    onClick={() => {
                      if (customArchiveReason.trim()) {
                        const reason = customArchiveReason.trim();
                        setIsEnteringCustomReason(false);
                        handleArchiveChat(reason);
                      }
                    }}
                    className="px-5 py-2 text-xs font-black uppercase bg-rose-500 hover:bg-rose-600 text-white rounded-xl transition-all shadow-md hover:shadow-rose-500/20 active:scale-95 disabled:opacity-55 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                {/* 1. GANHOU — primeiro e em destaque: é o desfecho que o time
                    persegue, e era o mais difícil de achar na lista antiga. */}
                <button
                  onClick={() =>
                    setSelectedReason(
                      selectedReason === ARCHIVE_REASON_GANHO ? "" : ARCHIVE_REASON_GANHO,
                    )
                  }
                  className={cn(
                    "w-full p-4 flex items-center gap-3 text-left rounded-2xl border transition-all duration-200 active:scale-[0.99]",
                    selectedReason === ARCHIVE_REASON_GANHO
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10",
                  )}
                >
                  <span className="text-xl leading-none">🎉</span>
                  <span className="flex-1">
                    <span className="block text-xs font-black uppercase tracking-tight text-emerald-500">
                      Fechou negócio
                    </span>
                    <span className="block text-[10px] font-bold text-muted-foreground mt-0.5">
                      Registra a venda e arquiva como convertido
                    </span>
                  </span>
                  <span className="text-emerald-500 text-sm font-black">
                    {selectedReason === ARCHIVE_REASON_GANHO ? "✓" : "→"}
                  </span>
                </button>

                {/* 2. PERDEU — em grade de duas colunas: a lista em coluna única
                    estourava a altura do modal e escondia o rodapé. */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    Não fechou — qual o motivo?
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ARCHIVE_REASONS_PERDA.map((r) => (
                      <button
                        key={r.text}
                        onClick={() => {
                          if (r.text === "Outros") {
                            setIsEnteringCustomReason(true);
                          } else if (r.text === "Não vendemos o material") {
                            setIsEnteringMaterial(true);
                          } else {
                            handleArchiveChat(r.text);
                          }
                        }}
                        className="w-full px-4 py-3 flex items-center gap-2.5 text-left rounded-xl text-xs font-semibold border border-border/40 text-muted-foreground hover:text-foreground hover:bg-secondary/50 hover:border-border transition-all duration-200 active:scale-[0.99] group"
                      >
                        <span className="opacity-70 group-hover:opacity-100 transition-opacity shrink-0">
                          {r.icon}
                        </span>
                        <span className="flex-1 leading-tight">{r.text}</span>
                        {/* Reticências avisam que ainda vai pedir mais informação
                            antes de arquivar, em vez de arquivar no clique. */}
                        {(r.text === "Outros" || r.text === "Não vendemos o material") && (
                          <span className="text-[10px] font-black opacity-40 shrink-0">...</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Se for Convertido, mostra a Forma de Pagamento e Observação logo abaixo na mesma tela */}
                {selectedReason === "Convertido" && (
                  <div className="space-y-3.5 pt-4 border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">
                        Forma de Pagamento
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full bg-secondary/50 border border-border/80 rounded-2xl px-4 py-3 text-xs font-bold text-foreground outline-none focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/20 transition-all cursor-pointer"
                      >
                        <option value="">Selecione a forma de pagamento</option>
                        <option value="Pix">Pix</option>
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="Cartão de Crédito">Cartão de Crédito</option>
                        <option value="Cartão de Débito">Cartão de Débito</option>
                        <option value="Boleto">Boleto</option>
                        <option value="Faturamento">Faturamento (Faturado)</option>
                        <option value="Outra">Outra</option>
                        <option value="Nenhuma">Não se aplica / Nenhuma</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">
                        Observação / Detalhes (Opcional)
                      </label>
                      <textarea
                        value={archiveObservation}
                        onChange={(e) => setArchiveObservation(e.target.value)}
                        placeholder="Adicione observações importantes sobre este atendimento..."
                        rows={2}
                        className="w-full bg-secondary/50 border border-border/80 rounded-2xl px-4 py-3 text-xs font-bold text-foreground outline-none focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/20 transition-all resize-none"
                      />
                    </div>

                    <button
                      onClick={() => handleArchiveChat()}
                      disabled={!paymentMethod}
                      className="w-full p-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-55 disabled:cursor-not-allowed disabled:active:scale-100 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all active:scale-[0.98] text-center"
                    >
                      Confirmar e Arquivar
                    </button>
                  </div>
                )}

                {/* Follow-up: veio do sino que ficava no cabeçalho da conversa.
                    Fica separado da lista de propósito — não é motivo de perda,
                    é o oposto: manter a conversa viva para retomar depois, e
                    clicar aqui NÃO arquiva. */}
                <div className="pt-4 border-t border-border/50 space-y-2">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    Ainda vai decidir?
                  </p>
                  <button
                    onClick={() => {
                      setFollowUpDateInput(
                        paraInputDateTime(archiveTarget?.leadInfo?.followUpDate),
                      );
                      setShowArchiveModal(false);
                      setShowFollowUpModal(true);
                    }}
                    className={cn(
                      "w-full px-4 py-3 flex items-center justify-between text-left rounded-xl text-xs font-semibold border transition-all duration-200 active:scale-[0.99] group",
                      archiveTarget?.leadInfo?.followUpDate
                        ? "border-yellow-500/30 bg-yellow-500/5 text-foreground font-bold"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border/30 hover:bg-secondary/50",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Bell className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity" />
                      <span>
                        {archiveTarget?.leadInfo?.followUpDate
                          ? `Retornar em ${formatFollowUpDate(archiveTarget.leadInfo.followUpDate)} — não arquiva`
                          : "Agendar retorno e manter a conversa aberta"}
                      </span>
                    </span>
                    <span className="text-[10px] opacity-0 group-hover:opacity-60 transition-all transform translate-x-2 group-hover:translate-x-0 font-bold">
                      →
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sidebar - Chats */}
      <div className="w-80 border-r border-border flex flex-col bg-card/50 backdrop-blur-md">
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center mb-6">
            <div className="flex flex-col gap-1">
              <h2 className="font-black text-base tracking-tighter uppercase leading-none">
                {viewMode === "active" ? "Mensagens" : "Arquivados"}
              </h2>
              {viewMode === "active" && (
                <div className="flex items-center gap-1 group relative">
                  <span className="text-[8px] font-black text-muted-foreground uppercase tracking-wider">
                    Tempo médio:
                  </span>
                  <span
                    className={cn(
                      "text-[8px] font-black uppercase tracking-wider",
                      avgResponseTime === null
                        ? "text-muted-foreground"
                        : avgResponseTime < 3
                          ? "text-emerald-500"
                          : avgResponseTime < 5
                            ? "text-amber-500"
                            : "text-rose-500",
                    )}
                  >
                    {avgResponseTime === null
                      ? "—"
                      : avgResponseTime < 1
                        ? "< 1 min"
                        : avgResponseTime < 60
                          ? `${Math.round(avgResponseTime)} min`
                          : `${Math.floor(avgResponseTime / 60)}h ${Math.round(avgResponseTime % 60)}min`}
                  </span>
                  {/* Ícone de dica */}
                  <button className="w-3.5 h-3.5 rounded-full bg-muted-foreground/20 text-muted-foreground flex items-center justify-center text-[8px] font-black leading-none hover:bg-primary/20 hover:text-primary transition-colors shrink-0">
                    !
                  </button>
                  {/* Tooltip */}
                  <div className="absolute left-0 top-full mt-2 w-56 bg-popover border border-border rounded-xl p-3 shadow-xl z-50 hidden group-hover:flex flex-col gap-1.5 pointer-events-none">
                    <p className="text-[9px] font-black uppercase tracking-widest text-foreground mb-1">
                      Como melhorar
                    </p>
                    <div className="flex items-start gap-1.5">
                      <span className="text-emerald-500 font-black text-[9px] shrink-0">
                        ●
                      </span>
                      <span className="text-[9px] text-muted-foreground leading-relaxed">
                        Ative notificações no navegador para não perder
                        mensagens
                      </span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-emerald-500 font-black text-[9px] shrink-0">
                        ●
                      </span>
                      <span className="text-[9px] text-muted-foreground leading-relaxed">
                        Deixe a aba aberta durante o horário comercial
                      </span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-emerald-500 font-black text-[9px] shrink-0">
                        ●
                      </span>
                      <span className="text-[9px] text-muted-foreground leading-relaxed">
                        Meta: responder em menos de 3 minutos
                      </span>
                    </div>
                    <div className="mt-1 pt-1.5 border-t border-border flex gap-2 text-[8px] font-black uppercase tracking-widest">
                      <span className="text-emerald-500">Verde &lt;3min</span>
                      <span className="text-amber-500">Âmbar &lt;5min</span>
                      <span className="text-rose-500">Vermelho ≥5min</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-1">
              {podeAprovar && (
                <button
                  onClick={() => setShowApprovalModal(true)}
                  className="p-2 hover:bg-secondary rounded-xl text-muted-foreground hover:text-primary transition-colors relative"
                  title="Arquivamentos aguardando aprovação"
                >
                  <ShieldAlert
                    className={cn(
                      "w-4 h-4",
                      pendingApprovals > 0 ? "text-rose-500" : "text-muted-foreground",
                    )}
                  />
                  {pendingApprovals > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                      {pendingApprovals > 9 ? "9+" : pendingApprovals}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={() =>
                  setViewMode(viewMode === "archived" ? "active" : "archived")
                }
                className="p-2 hover:bg-secondary rounded-xl transition-colors relative"
                title="Arquivados"
              >
                <Archive
                  className={`w-4 h-4 transition-colors ${viewMode === "archived" ? "text-red-500" : "text-muted-foreground hover:text-primary"}`}
                />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar..."
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-2xl pl-11 pr-4 py-3 text-xs font-bold"
            />
          </div>
        </div>

        <div
          ref={chatListRef}
          className="flex-1 overflow-y-auto px-3 space-y-1"
        >
          {loading ? (
            <div className="flex flex-col items-center py-12 gap-2 opacity-50">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Sincronizando...
              </span>
            </div>
          ) : (
            filteredChats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => handleSelectChat(chat)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, chat });
                }}
                className={cn(
                  "w-full p-4 rounded-2xl flex gap-4 transition-all relative group mb-1",
                  selectedChat?.id === chat.id
                    ? "bg-primary/10 border border-primary/20 shadow-[0_0_20px_-5px_rgba(var(--primary),0.2)]"
                    : "hover:bg-secondary/50 border border-transparent text-muted-foreground",
                )}
              >
                {/* Indicador Ativo */}
                {selectedChat?.id === chat.id && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
                )}

                <div className="relative shrink-0">
                  <ContactAvatar
                    name={chat.name}
                    avatar={chat.avatar}
                    size="lg"
                    onClick={
                      chat.avatar
                        ? (e) => {
                            e.stopPropagation();
                            setSelectedImage(chat.avatar!);
                          }
                        : undefined
                    }
                  />
                  {getOriginBadge(chat.leadInfo?.source)}
                </div>
                <div className="flex-1 min-w-0 flex justify-between gap-2">
                  <div className="flex-1 min-w-0 flex flex-col justify-start pt-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className={cn(
                          "font-bold text-sm truncate tracking-tight font-inter",
                          selectedChat?.id === chat.id
                            ? "text-primary"
                            : "text-foreground",
                        )}
                      >
                        {chat.name
                          .toLowerCase()
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
                      </span>
                      <span title={chat.leadInfo?.temperature || "Frio"}>
                        <Flame
                          className={cn(
                            "w-3.5 h-3.5 shrink-0",
                            getTempIconColor(chat.leadInfo?.temperature),
                          )}
                        />
                      </span>
                      {chat.fixado && (
                        <Pin className="w-3 h-3 text-primary rotate-45 shrink-0" />
                      )}
                      {chat.vendedor_id && (
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tight shrink-0 border flex items-center gap-1",
                            chat.vendedor_id === vendedorId
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : "bg-slate-500/10 text-slate-500 border-slate-500/10",
                          )}
                          title={`Atendido por: ${operators.find((o) => o.id === chat.vendedor_id)?.name || "Outro Atendente"}`}
                        >
                          <div className="w-3.5 h-3.5 rounded-full overflow-hidden border border-border/40 flex items-center justify-center shrink-0 bg-secondary">
                            {(() => {
                              const op = operators.find(
                                (o) => o.id === chat.vendedor_id,
                              );
                              return op?.avatar ? (
                                <img
                                  src={op.avatar}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <User className="w-2 h-2 text-muted-foreground" />
                              );
                            })()}
                          </div>
                          <span>
                            {chat.vendedor_id === vendedorId
                              ? "Você"
                              : operators
                                  .find((o) => o.id === chat.vendedor_id)
                                  ?.name?.split(" ")[0] || "Atendido"}
                          </span>
                        </span>
                      )}
                    </div>

                    <p
                      className={cn(
                        "text-[11px] truncate font-medium pr-2 text-left",
                        presenceChats.has(chat.id)
                          ? "text-white font-semibold animate-pulse"
                          : selectedChat?.id === chat.id
                            ? "text-primary/70"
                            : "text-muted-foreground/80",
                      )}
                    >
                      {presenceChats.has(chat.id) ? (
                        presenceChats.get(chat.id) === "recording" ? (
                          "Gravando áudio..."
                        ) : (
                          "Digitando..."
                        )
                      ) : (
                        <span className="flex items-center gap-1 min-w-0">
                          {chat.lastMessageSender === "me" &&
                            (() => {
                              const s = chat.lastMessageStatus;
                              return s === "read" ? (
                                <CheckCheck
                                  className="w-3 h-3 shrink-0"
                                  style={{ color: "#32e043" }}
                                />
                              ) : s === "delivered" ? (
                                <CheckCheck className="w-3 h-3 shrink-0 text-muted-foreground" />
                              ) : (
                                <Check className="w-3 h-3 shrink-0 text-muted-foreground" />
                              );
                            })()}
                          {chat.lastMessageType === "image" && (
                            <Camera className="w-3 h-3 shrink-0" />
                          )}
                          {chat.lastMessageType === "video" && (
                            <Video className="w-3 h-3 shrink-0" />
                          )}
                          {chat.lastMessageType === "audio" && (
                            <Mic className="w-3 h-3 shrink-0" />
                          )}
                          {chat.lastMessageType === "document" && (
                            <Paperclip className="w-3 h-3 shrink-0" />
                          )}
                          {chat.lastMessageType === "sticker" && (
                            <Smile className="w-3 h-3 shrink-0" />
                          )}
                          <span className="truncate">
                            {chat.lastMessageType === "image"
                              ? "Foto"
                              : chat.lastMessageType === "video"
                                ? "Vídeo"
                                : chat.lastMessageType === "audio"
                                  ? "Áudio"
                                  : chat.lastMessageType === "document"
                                    ? "Documento"
                                    : chat.lastMessageType === "sticker"
                                      ? "Figurinha"
                                      : chat.lastMessage}
                          </span>
                        </span>
                      )}
                    </p>

                    {/* Follow-up: dois estados bem diferentes, por isso dois
                        rótulos. Arquivado, informa quando volta; devolvido pelo
                        agendador, cobra a ação — é a conversa que o atendente
                        pediu para reencontrar. */}
                    {chat.leadInfo?.followUpAtendidoEm ? (
                      <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-yellow-500/15 text-yellow-500 text-[8px] font-black uppercase tracking-widest">
                        <Bell className="w-2.5 h-2.5" />
                        Follow-up
                      </span>
                    ) : chat.leadInfo?.followUpDate ? (
                      <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground text-[8px] font-black uppercase tracking-widest">
                        <Bell className="w-2.5 h-2.5" />
                        Volta {formatFollowUpDate(chat.leadInfo.followUpDate)}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-end justify-between py-0.5 shrink-0 min-w-[40px]">
                    <span className="text-[9px] font-bold opacity-50">
                      {chat.time}
                    </span>
                    {chat.unreadCount > 0 ? (
                      <div className="w-5 h-5 bg-primary text-white rounded-full flex items-center justify-center text-[9px] font-black">
                        {chat.unreadCount}
                      </div>
                    ) : (
                      <div className="h-5" />
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
          {!loading && searching && filteredChats.length === 0 && (
            <div className="flex flex-col items-center py-12 gap-2 opacity-50">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Buscando...
              </span>
            </div>
          )}
          {!loading && !searching && chatSearch.trim() && filteredChats.length === 0 && (
            <div className="flex flex-col items-center py-12 gap-2 opacity-50 text-center px-4">
              <Search className="w-6 h-6" />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Nenhum lead encontrado
              </span>
            </div>
          )}
          {loadingMoreChats && (
            <div className="flex items-center justify-center py-4">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-background relative overflow-hidden">
        {selectedChat ? (
          <>
            <div className="p-4 flex items-center justify-between border-b border-border bg-card/20 backdrop-blur-md z-40 relative">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <ContactAvatar
                    name={selectedChat.name}
                    avatar={selectedChat.avatar}
                    size="sm"
                    onClick={
                      selectedChat.avatar
                        ? () => setSelectedImage(selectedChat.avatar!)
                        : undefined
                    }
                  />
                  {getOriginBadge(selectedChat.leadInfo?.source)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-base tracking-tight font-inter">
                      {nomeESobrenome(selectedChat.name)}
                    </h4>
                    {/* Campanha que trouxe o cliente — clicar abre o detalhe do clique. */}
                    {/* key: troca de conversa remonta o componente, zerando o
                        detalhe carregado sem precisar de efeito de reset. */}
                    <CampanhaBadge key={selectedChat.id} chat={selectedChat} />
                  </div>
                  <div className="flex items-center gap-2">
                    {presenceChats.has(selectedChat.id) ? (
                      <p className="text-[10px] text-white font-bold tracking-widest animate-pulse">
                        {presenceChats.get(selectedChat.id) === "recording"
                          ? "Gravando áudio..."
                          : "Digitando..."}
                      </p>
                    ) : lastSeenMap.current.has(selectedChat.id) ? (
                      <p className="text-[10px] text-muted-foreground font-medium">
                        visto por último às{" "}
                        {formatBrTime(lastSeenMap.current.get(selectedChat.id)!)}
                      </p>
                    ) : (
                      <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">
                        Online
                      </p>
                    )}
                    {/* Número da conversa. Some em grupo, onde não existe um só. */}
                    {telefoneDoJid(selectedChat.id) && (
                      <>
                        <span className="text-[10px] text-muted-foreground/50">•</span>
                        <p className="text-[10px] text-muted-foreground font-medium tabular-nums select-all">
                          {telefoneDoJid(selectedChat.id)}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Atendente (vendedor_id) Estático */}
                {selectedChat.vendedor_id ? (
                  <div
                    className="h-8 pl-1 pr-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"
                    title={`Atendido por ${operators.find((o) => o.id === selectedChat.vendedor_id)?.name || "atendente"}`}
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden border border-emerald-500/30 flex items-center justify-center shrink-0">
                      {(() => {
                        const op = operators.find(
                          (o) => o.id === selectedChat.vendedor_id,
                        );
                        return op?.avatar ? (
                          <img
                            src={op.avatar}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-3 h-3 text-muted-foreground" />
                        );
                      })()}
                    </div>
                    <span className="text-[10px] font-black uppercase whitespace-nowrap">
                      {operators
                        .find((o) => o.id === selectedChat.vendedor_id)
                        ?.name?.split(" ")[0] || "Atendente"}
                    </span>
                  </div>
                ) : (
                  <div className="h-8 px-2.5 rounded-lg border border-dashed border-border/80 bg-secondary/30 flex items-center justify-center gap-1.5 text-muted-foreground">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[10px] font-black uppercase whitespace-nowrap">
                      Aguardando
                    </span>
                  </div>
                )}

                <div className="relative">
                  <button
                    ref={tempBtnRef}
                    onClick={() => setShowTempDropdown(!showTempDropdown)}
                    className={cn(
                      "h-9 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all",
                      getTempColor(selectedChat.leadInfo?.temperature),
                    )}
                  >
                    {isClassifyingTemp ? (
                      <Sparkles className="w-4 h-4 pointer-events-none animate-pulse" />
                    ) : (
                      <Flame className="w-4 h-4 pointer-events-none" />
                    )}
                    <span className="text-[10px] font-black uppercase pointer-events-none">
                      {selectedChat.leadInfo?.temperature || "Frio"}
                    </span>
                    <ChevronDown className="w-3 h-3 pointer-events-none" />
                  </button>
                  {showTempDropdown && (
                    <div className="absolute top-12 right-0 w-32 bg-card border border-border rounded-xl shadow-2xl z-[9999] overflow-hidden">
                      {(["Quente", "Morno", "Frio"] as Temperature[]).map(
                        (t) => (
                          <button
                            key={t}
                            onClick={() => handleTemperatureChange(t)}
                            className="w-full p-3 text-[10px] font-black uppercase hover:bg-secondary text-left"
                          >
                            {t}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </div>
                {selectedChat.leadInfo?.quoteValue && (
                  <button
                    onClick={abrirCadastroErp}
                    className="flex items-center justify-center gap-1.5 h-9 px-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-500 hover:bg-blue-500/20 transition-colors"
                    title={
                      selectedChat.leadInfo.quoteFromErp
                        ? `Orçamento ${selectedChat.leadInfo.quoteDocument || ""} da Citel — R$ ${selectedChat.leadInfo.quoteValue}. Clique para ver o cadastro no ERP.`
                        : `Orçamento enviado — R$ ${selectedChat.leadInfo.quoteValue} (à vista). Clique para ver o cadastro no ERP.`
                    }
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-black">
                      R$ {selectedChat.leadInfo.quoteValue}
                    </span>
                    {selectedChat.leadInfo.quoteFromErp && (
                      <img
                        src="/citel.png"
                        alt="Documento gerado na Citel"
                        className="w-3 h-3 object-contain shrink-0"
                      />
                    )}
                  </button>
                )}
                {selectedChat.leadInfo?.saleValue && (
                  <button
                    onClick={abrirCadastroErp}
                    className="flex items-center justify-center gap-1.5 h-9 px-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                    title={`Venda de R$ ${selectedChat.leadInfo.saleValue} lida dos pedidos da Citel. Clique para ver o cadastro no ERP.`}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-black">
                      R$ {selectedChat.leadInfo.saleValue}
                    </span>
                    {selectedChat.leadInfo.saleFromErp && (
                      <img
                        src="/citel.png"
                        alt="Pedido gerado na Citel"
                        className="w-3 h-3 object-contain shrink-0"
                      />
                    )}
                  </button>
                )}
                {/* Cadastro do cliente no ERP, casado pelo telefone da conversa.
                    Com orçamento ou venda na tela, o atalho é o próprio valor —
                    o ícone solto só aparece quando não há nenhum dos dois, senão
                    o lead sem documento ficaria sem como abrir o cadastro. */}
                {!selectedChat.leadInfo?.quoteValue &&
                  !selectedChat.leadInfo?.saleValue && (
                <button
                  onClick={abrirCadastroErp}
                  className="p-2.5 hover:bg-secondary rounded-xl transition-all group"
                  title="Ver cadastro do cliente no ERP"
                >
                  {/* Logo da Citel, servido junto com o app: link externo quebraria
                      o ícone se a origem saísse do ar ou mudasse a URL. */}
                  <img
                    src="/citel.png"
                    alt="Cadastro no ERP"
                    className="w-4 h-4 object-contain opacity-70 group-hover:opacity-100 transition-opacity"
                  />
                </button>
                )}
                {viewMode === "active" ? (
                  <button
                    onClick={() => {
                      archiveTargetRef.current = selectedChat;
                      setArchiveTarget(selectedChat);
                      setShowArchiveModal(true);
                    }}
                    className="p-2.5 hover:bg-secondary rounded-xl text-muted-foreground hover:text-rose-500 transition-colors"
                    title="Arquivar Conversa"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleUnarchiveChat}
                    className="p-2.5 hover:bg-secondary rounded-xl text-primary transition-all"
                    title="Desarquivar Conversa"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className="flex-1 min-h-0 flex flex-col bg-[url('https://w0.peakpx.com/wallpaper/580/650/HD-wallpaper-whatsapp-background-dark-mode-pattern-whatsapp-dark-mode-thumbnail.jpg')] bg-repeat relative"
            >
              {isDragging && (
                <div className="absolute inset-0 z-50 bg-primary/20 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-primary m-4 rounded-3xl animate-in fade-in duration-200 pointer-events-none">
                  <div className="bg-card p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                      <Paperclip className="w-8 h-8 text-primary animate-bounce" />
                    </div>
                    <p className="text-xl font-black uppercase tracking-tighter">
                      Solte para enviar
                    </p>
                  </div>
                </div>
              )}
              {loadingMessages ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                    Carregando...
                  </span>
                </div>
              ) : (
                <div
                  ref={scrollRef}
                  className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4"
                  onScroll={(e) => {
                    const alvo = e.currentTarget as HTMLDivElement;
                    // 120px de tolerância: quem está "quase no fim" continua
                    // acompanhando ao vivo; quem subiu para ler fica onde está.
                    pertoDoFimRef.current =
                      alvo.scrollHeight - alvo.scrollTop - alvo.clientHeight < 120;

                    if (alvo.scrollTop === 0 && hasMoreMessages && !loadingMoreMessages) {
                      loadMoreMessages();
                    }
                  }}
                >
                  {/* Indicador de load-more no topo */}
                  {loadingMoreMessages && (
                    <div className="flex justify-center py-2">
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {hasMoreMessages && !loadingMoreMessages && (
                    <div className="flex justify-center">
                      <button
                        onClick={loadMoreMessages}
                        className="text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors py-1"
                      ></button>
                    </div>
                  )}
                  {messages.map((msg, idx) => {
                    const isVisualMedia =
                      msg.tipo === "image" ||
                      msg.tipo === "video" ||
                      msg.tipo === "sticker";
                    const isDocumentMsg = msg.tipo === "document";
                    const isSticker = msg.tipo === "sticker";

                    const currentDateFormatted = getFormattedMessageDate(
                      msg.rawTimestamp,
                    );
                    const previousMsg = messages[idx - 1];
                    const previousDateFormatted = previousMsg
                      ? getFormattedMessageDate(previousMsg.rawTimestamp)
                      : "";
                    const showDateDivider =
                      currentDateFormatted &&
                      currentDateFormatted !== previousDateFormatted;

                    if (msg.tipo === "internal_note") {
                      const op = operators.find((o) => o.id === msg.vendedorId);
                      const isMe =
                        !msg.vendedorId ||
                        msg.vendedorId === userProfile?.id ||
                        msg.vendedorId === vendedorId ||
                        msg.sender === "me";
                      const senderName = op
                        ? op.name
                        : isMe
                          ? userProfile?.name || "Atendente"
                          : "Atendente";
                      const senderFirstName = senderName.split(" ")[0];
                      const senderAvatar =
                        op?.avatar || (isMe ? userProfile?.avatar : undefined);
                      const senderInitial = senderName.charAt(0).toUpperCase();

                      return (
                        <Fragment key={msg.id}>
                          {showDateDivider && (
                            <div className="flex justify-center my-4 select-none">
                              <span className="bg-secondary/80 text-[10px] font-black uppercase tracking-widest text-muted-foreground px-3 py-1 rounded-lg border border-border/50 shadow-sm backdrop-blur-sm">
                                {currentDateFormatted}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-center my-3 px-4 animate-in fade-in slide-in-from-bottom-1 duration-200 select-none">
                            <div className="max-w-[85%] bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-2.5 text-center shadow-sm backdrop-blur-sm flex flex-col items-center gap-1.5">
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-amber-500/30">
                                  {senderAvatar ? (
                                    <img
                                      src={senderAvatar}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-amber-500 flex items-center justify-center text-white text-[8px] font-black">
                                      {senderInitial}
                                    </div>
                                  )}
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-1">
                                  <Eye className="w-3 h-3 text-amber-500" />{" "}
                                  Nota Interna · {senderFirstName}
                                </span>
                              </div>
                              <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold leading-relaxed whitespace-pre-wrap">
                                {msg.text}
                              </p>
                              <span className="text-[8px] text-amber-500/50">
                                {msg.time}
                              </span>
                            </div>
                          </div>
                        </Fragment>
                      );
                    }

                    return (
                      <Fragment key={msg.id}>
                        {showDateDivider && (
                          <div className="flex justify-center my-4 animate-in fade-in duration-300 select-none">
                            <span className="bg-secondary/80 text-[10px] font-black uppercase tracking-widest text-muted-foreground px-3 py-1 rounded-lg border border-border/50 shadow-sm backdrop-blur-sm">
                              {currentDateFormatted}
                            </span>
                          </div>
                        )}
                        <div
                          className={cn(
                            "flex flex-col",
                            msg.sender === "me" ? "items-end" : "items-start",
                          )}
                        >
                          <div
                            className="flex items-center gap-2 group/msg-row max-w-[85%]"
                            style={{
                              flexDirection:
                                msg.sender === "me" ? "row-reverse" : "row",
                            }}
                          >
                            <div
                              className={cn(
                                "rounded-2xl shadow-sm relative flex flex-col group transition-all shrink-0 max-w-full",
                                isSticker
                                  ? "bg-transparent shadow-none border-none"
                                  : msg.sender === "me"
                                    ? "bg-primary text-white rounded-tr-none"
                                    : "bg-card border border-border text-foreground rounded-tl-none",
                                isDocumentMsg
                                  ? "p-0 overflow-hidden"
                                  : isVisualMedia
                                    ? "p-1"
                                    : "px-4 py-2",
                              )}
                            >
                              {/* Mídia: Imagem ou Figurinha */}
                              {(msg.tipo === "image" ||
                                msg.tipo === "sticker") &&
                                msg.mediaUrl && (
                                  <div className="relative group/img">
                                    <img
                                      src={msg.mediaUrl}
                                      alt={
                                        isSticker
                                          ? "Figurinha"
                                          : "Imagem Recebida"
                                      }
                                      onClick={() =>
                                        !isSticker &&
                                        setSelectedImage(msg.mediaUrl!)
                                      }
                                      className={cn(
                                        isSticker
                                          ? "w-40 sm:w-48 h-auto object-contain"
                                          : "w-72 max-w-full object-cover cursor-pointer hover:opacity-95 transition-all duration-300",
                                        msg.text &&
                                          ![
                                            "Mídia",
                                            "📷 Imagem",
                                            "🖼️ Figurinha",
                                          ].includes(msg.text)
                                          ? "rounded-t-xl rounded-b-sm"
                                          : "rounded-xl",
                                        msg.sender === "me" && !isSticker
                                          ? "rounded-tr-none"
                                          : !isSticker
                                            ? "rounded-tl-none"
                                            : "",
                                      )}
                                    />
                                  </div>
                                )}

                              {/* Mídia: Vídeo */}
                              {msg.tipo === "video" && msg.mediaUrl && (
                                <video
                                  src={msg.mediaUrl}
                                  controls
                                  className={cn(
                                    "w-72 max-w-full",
                                    msg.text &&
                                      !["Mídia", "📹 Vídeo"].includes(msg.text)
                                      ? "rounded-t-xl rounded-b-sm"
                                      : "rounded-xl",
                                    msg.sender === "me"
                                      ? "rounded-tr-none"
                                      : "rounded-tl-none",
                                  )}
                                />
                              )}

                              {/* Mídia: Áudio */}
                              {msg.tipo === "audio" && msg.mediaUrl && (
                                <div
                                  className={cn(
                                    "p-2 relative group/audio",
                                    isVisualMedia ? "px-3 py-2" : "",
                                  )}
                                >
                                  {/* Botão de Transcrição Minimalista */}
                                  {!msg.transcription &&
                                    !msg.isTranscribing && (
                                      <button
                                        onClick={() => handleTranscribe(msg)}
                                        title="Transcrever com AI"
                                        className={cn(
                                          "absolute -top-1 -right-1 p-1.5 rounded-lg opacity-0 group-hover/audio:opacity-100 transition-all z-20 shadow-lg border border-white/10",
                                          msg.sender === "me"
                                            ? "bg-white/10 text-white hover:bg-white/20"
                                            : "bg-primary/10 text-primary hover:bg-primary/20",
                                        )}
                                      >
                                        <Sparkles className="w-3.5 h-3.5" />
                                      </button>
                                    )}

                                  {msg.isTranscribing && (
                                    <div className="absolute -top-1 -right-1 p-1.5 rounded-lg bg-primary/20 text-primary animate-pulse z-20">
                                      <Sparkles className="w-3.5 h-3.5 animate-spin" />
                                    </div>
                                  )}

                                  <CustomAudioPlayer
                                    src={msg.mediaUrl}
                                    isMe={msg.sender === "me"}
                                    avatar={
                                      msg.sender === "me"
                                        ? myAvatar
                                        : selectedChat?.avatar
                                    }
                                    name={
                                      msg.sender === "me"
                                        ? userProfile?.name || "Eu"
                                        : selectedChat?.name || "Contato"
                                    }
                                    msgTime={msg.time}
                                    msgStatus={msg.status}
                                  />
                                  <div className="mt-1 flex flex-col gap-2">
                                    {msg.transcription && (
                                      <div
                                        className={cn(
                                          "p-3 rounded-xl text-sm leading-relaxed animate-in fade-in slide-in-from-top-1 duration-300 relative overflow-hidden",
                                          msg.sender === "me"
                                            ? "bg-black/20 text-white/90"
                                            : "bg-secondary/50 text-foreground",
                                        )}
                                      >
                                        <div className="flex items-center gap-2 mb-1.5 opacity-50">
                                          <Sparkles className="w-3 h-3 text-primary" />
                                          <span className="text-[9px] font-black uppercase tracking-widest">
                                            Transcrição AI
                                          </span>
                                        </div>
                                        <p className="italic relative z-10">
                                          "{msg.transcription}"
                                        </p>
                                        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                          <Sparkles className="w-12 h-12 rotate-12" />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Mídia: Documento */}
                              {msg.tipo === "document" && (
                                <div className="flex flex-col gap-0 min-w-[280px] max-w-[320px] rounded-2xl overflow-hidden shadow-lg group/doc">
                                  {/* Preview Area (Simulado) */}
                                  <div
                                    className={cn(
                                      "h-32 flex flex-col items-center justify-center relative overflow-hidden",
                                      msg.sender === "me"
                                        ? "bg-white/10"
                                        : "bg-card border-b border-border/10",
                                    )}
                                  >
                                    <div className="w-20 h-24 bg-white rounded shadow-md p-3 flex flex-col gap-1.5 transform rotate-2 group-hover/doc:rotate-0 transition-transform duration-500">
                                      <div className="w-full h-1 bg-slate-200 rounded-full" />
                                      <div className="w-3/4 h-1 bg-slate-100 rounded-full" />
                                      <div className="w-full h-1 bg-slate-200 rounded-full" />
                                      <div className="w-1/2 h-1 bg-slate-100 rounded-full" />
                                      <div className="w-full h-1 bg-slate-200 rounded-full mt-2" />
                                      <div className="w-full h-6 bg-slate-50 rounded" />
                                    </div>
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent pointer-events-none" />
                                  </div>

                                  {/* Metadata Bar */}
                                  <div
                                    className={cn(
                                      "flex items-center gap-3 px-4 py-4",
                                      msg.sender === "me"
                                        ? "bg-black/40"
                                        : "bg-black/10",
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        "w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm",
                                        getFileIconColor(
                                          msg.fileName || msg.text,
                                        ),
                                      )}
                                    >
                                      <div className="flex flex-col items-center">
                                        <FileText className="w-5 h-5" />
                                        <span className="text-[7px] font-black uppercase tracking-tighter leading-none mt-0.5">
                                          {getFileExt(msg.fileName || msg.text)}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p
                                        className={cn(
                                          "text-[13px] font-bold truncate leading-tight mb-0.5",
                                          msg.sender === "me"
                                            ? "text-white"
                                            : "text-foreground",
                                        )}
                                      >
                                        {msg.text ||
                                          msg.fileName ||
                                          "Documento"}
                                      </p>
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={cn(
                                            "text-[9px] font-black uppercase tracking-widest",
                                            msg.sender === "me"
                                              ? "text-white/70"
                                              : "text-muted-foreground",
                                          )}
                                        >
                                          {getFileExt(msg.fileName || msg.text)}
                                        </span>
                                        <span className="w-1 h-1 rounded-full bg-current opacity-30" />
                                        <span
                                          className={cn(
                                            "text-[9px] font-black uppercase tracking-widest",
                                            msg.sender === "me"
                                              ? "text-white/70"
                                              : "text-muted-foreground",
                                          )}
                                        >
                                          740 KB
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 opacity-80">
                                      <span
                                        className={cn(
                                          "text-[10px] font-bold",
                                          msg.sender === "me"
                                            ? "text-white/90"
                                            : "text-muted-foreground",
                                        )}
                                      >
                                        {msg.editado && (
                                          <span className="italic mr-1">
                                            editada
                                          </span>
                                        )}
                                        {msg.time}
                                      </span>
                                      {msg.sender === "me" &&
                                        (msg.status === "read" ? (
                                          <CheckCheck
                                            className="w-3.5 h-3.5"
                                            style={{ color: "#32e043", filter: "drop-shadow(0px 0px 3px #32e043)" }}
                                          />
                                        ) : msg.status === "delivered" ? (
                                          <CheckCheck className="w-3.5 h-3.5 text-white" />
                                        ) : (
                                          <Check className="w-3.5 h-3.5 text-white" />
                                        ))}
                                    </div>
                                  </div>

                                  {/* Actions Area */}
                                  <div
                                    className={cn(
                                      "grid grid-cols-2 border-t",
                                      msg.sender === "me"
                                        ? "bg-white/5 border-white/10"
                                        : "bg-card/50 border-border/50",
                                    )}
                                  >
                                    <a
                                      href={msg.mediaUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={cn(
                                        "py-3 text-center text-[11px] font-black uppercase tracking-widest hover:bg-white/5 transition-colors",
                                        msg.sender === "me"
                                          ? "text-white"
                                          : "text-primary",
                                      )}
                                    >
                                      Abrir
                                    </a>
                                    <button
                                      onClick={async () => {
                                        try {
                                          const res = await fetch(msg.mediaUrl!);
                                          const blob = await res.blob();
                                          const url = URL.createObjectURL(blob);
                                          const a = document.createElement("a");
                                          a.href = url;
                                          a.download = msg.fileName || msg.text || "arquivo";
                                          document.body.appendChild(a);
                                          a.click();
                                          a.remove();
                                          URL.revokeObjectURL(url);
                                        } catch {
                                          window.open(msg.mediaUrl!, "_blank");
                                        }
                                      }}
                                      className={cn(
                                        "py-3 text-center text-[11px] font-black uppercase tracking-widest hover:bg-white/5 transition-colors border-l cursor-pointer",
                                        msg.sender === "me"
                                          ? "text-white/80 border-white/10"
                                          : "text-primary border-border/50",
                                      )}
                                    >
                                      Salvar como...
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Mensagem citada (reply/quote) */}
                              {msg.quotedText && (
                                <div
                                  className={cn(
                                    "rounded-lg px-3 py-2 mb-1 border-l-3",
                                    msg.sender === "me"
                                      ? "bg-white/10 border-l-white/40"
                                      : "bg-secondary/60 border-l-blue-500",
                                  )}
                                  style={{ borderLeftWidth: 3 }}
                                >
                                  <p
                                    className={cn(
                                      "text-[10px] font-black uppercase tracking-wider mb-0.5",
                                      msg.sender === "me"
                                        ? "text-white/60"
                                        : "text-blue-500",
                                    )}
                                  >
                                    {msg.quotedSender === "me"
                                      ? "Você"
                                      : "Cliente"}
                                  </p>
                                  <p
                                    className={cn(
                                      "text-xs font-medium line-clamp-3 whitespace-pre-wrap",
                                      msg.sender === "me"
                                        ? "text-white/70"
                                        : "text-muted-foreground",
                                    )}
                                  >
                                    {msg.quotedText}
                                  </p>
                                </div>
                              )}

                              {/* Preview de link: usa o do payload ou busca via backend (só recebidas) */}
                              {!isDocumentMsg && (
                                <MessageLinkPreview
                                  msg={msg}
                                  enabled={msg.sender === "contact"}
                                  onResolved={(preview) => {
                                    setMessages((prev) =>
                                      prev.map((m) =>
                                        m.id === msg.id
                                          ? { ...m, linkPreview: preview }
                                          : m,
                                      ),
                                    );
                                    marketingService.updateMessageLinkPreview(
                                      msg.id,
                                      preview,
                                    );
                                  }}
                                />
                              )}

                              {/* Texto ou Fallback de Erro */}
                              {msg.text &&
                                !isDocumentMsg &&
                                (!msg.mediaUrl &&
                                [
                                  "Mídia",
                                  "🎵 Áudio",
                                  "📎 Mídia",
                                  "🖼️ Figurinha",
                                ].includes(msg.text) ? (
                                  <p
                                    className={cn(
                                      "text-sm font-medium whitespace-pre-wrap text-red-400",
                                      isVisualMedia ? "px-2 pt-2" : "",
                                    )}
                                  >
                                    {msg.text} (Indisponível)
                                  </p>
                                ) : ![
                                    "Mídia",
                                    "🎵 Áudio",
                                    "📎 Mídia",
                                    "📷 Imagem",
                                    "📹 Vídeo",
                                    "🖼️ Figurinha",
                                  ].includes(msg.text) ? (
                                  <p
                                    className={cn(
                                      "text-sm font-medium whitespace-pre-wrap",
                                      isVisualMedia ? "px-2 pt-1 pb-1" : "",
                                    )}
                                  >
                                    <Linkify text={msg.text} />
                                  </p>
                                ) : null)}

                              {/* Time & Status (hidden for audio/document as they have their own layout) */}
                              {msg.tipo !== "audio" && !isDocumentMsg && (
                                <div
                                  className={cn(
                                    "flex justify-end gap-1",
                                    (() => {
                                      const hasRealText =
                                        msg.text &&
                                        ![
                                          "Mídia",
                                          "🎵 Áudio",
                                          "📎 Mídia",
                                          "📷 Imagem",
                                          "📹 Vídeo",
                                          "🖼️ Figurinha",
                                        ].includes(msg.text);
                                      if (isVisualMedia && !hasRealText) {
                                        return cn(
                                          "absolute bottom-2 right-2.5 px-1.5 py-0.5 rounded-full z-10 text-white/90",
                                          isSticker
                                            ? "bg-black/20 backdrop-blur-[2px]"
                                            : "bg-black/30 backdrop-blur-md",
                                        );
                                      }
                                      return cn(
                                        "opacity-60",
                                        isVisualMedia
                                          ? "px-2 pb-0.5 mt-0.5"
                                          : "mt-1",
                                      );
                                    })(),
                                  )}
                                >
                                  <span className="text-[9px] font-bold mt-[1px]">
                                    {msg.editado && (
                                      <span className="italic mr-1">
                                        editada
                                      </span>
                                    )}
                                    {msg.time}
                                  </span>
                                  {msg.sender === "me" && (
                                    <span>
                                      {msg.status === "read" ? (
                                        <CheckCheck
                                          className="w-3.5 h-3.5"
                                          style={{ color: "#32e043", filter: "drop-shadow(0px 0px 3px #32e043)" }}
                                        />
                                      ) : msg.status === "delivered" ? (
                                        <CheckCheck className="w-3.5 h-3.5 text-white" />
                                      ) : (
                                        <Check className="w-3.5 h-3.5 text-white" />
                                      )}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            {!isSticker && (
                              <div className="flex items-center gap-1 opacity-0 group-hover/msg-row:opacity-100 transition-all duration-200 shrink-0 animate-in zoom-in">
                                {api.sendReaction && (
                                  <div className="flex items-center gap-0.5 bg-card border border-border rounded-full px-1.5 py-1 shadow-md">
                                    {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((e) => (
                                      <button
                                        key={e}
                                        onClick={() => handleSendReaction(msg, e)}
                                        className={cn(
                                          "text-sm leading-none hover:scale-125 transition-transform px-0.5",
                                          msg.reacao === e && "scale-125",
                                        )}
                                        title={`Reagir ${e}`}
                                      >
                                        {e}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <button
                                  onClick={() => setReplyingMessage(msg)}
                                  className="p-1.5 hover:bg-secondary rounded-lg transition-all duration-200 text-muted-foreground hover:text-foreground"
                                  title="Responder esta mensagem"
                                >
                                  <CornerUpLeft className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Reação */}
                          {msg.reacao && (
                            <div
                              className={cn(
                                "text-lg -mt-3 z-10",
                                msg.sender === "me" ? "mr-4" : "ml-4",
                              )}
                            >
                              <div className="bg-card border border-border shadow-md rounded-full px-1.5 py-0.5 text-sm">
                                {msg.reacao}
                              </div>
                            </div>
                          )}
                        </div>
                      </Fragment>
                    );
                  })}

                  {/* Indicador de Digitando / Gravando */}
                  {selectedChat && presenceChats.has(selectedChat.id) && (
                    <div className="flex justify-start mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="bg-card/80 backdrop-blur-md px-4 py-3 rounded-2xl rounded-tl-none border border-border/50 flex gap-1.5 items-center">
                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="p-4 border-t border-border bg-card/50 backdrop-blur-md relative">
                {/* Preview de Arquivo Pendente */}
                {pendingFile && (
                  <div className="absolute bottom-full left-0 right-0 p-4 bg-card/90 backdrop-blur-xl border-t border-border animate-in slide-in-from-bottom-4 duration-300 z-50">
                    <div className="max-w-5xl mx-auto flex items-center gap-4">
                      <div
                        className={cn(
                          "w-12 h-14 rounded-xl flex flex-col items-center justify-center text-white shrink-0 shadow-lg",
                          getFileIconColor(pendingFile.name),
                        )}
                      >
                        <FileText className="w-6 h-6" />
                        <span className="text-[8px] font-black uppercase mt-0.5">
                          {getFileExt(pendingFile.name)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">
                          {audioPreviewUrl ? "Áudio gravado" : pendingFile.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                          {(pendingFile.size / 1024).toFixed(1)} KB • Pronto
                          para enviar
                        </p>
                        {/* Ouvir antes de mandar: áudio é o único anexo que não
                            dá para conferir olhando o nome do arquivo. */}
                        {audioPreviewUrl && (
                          <audio
                            controls
                            src={audioPreviewUrl}
                            className="mt-2 h-8 w-full max-w-xs"
                          />
                        )}
                      </div>
                      <button
                        onClick={() => setPendingFile(null)}
                        className="p-2 hover:bg-rose-500/10 text-rose-500 rounded-xl transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Seletor de Produtos Integrado */}
                {showProductSelector && (
                  <div className="absolute bottom-full left-0 right-0 bg-card/95 backdrop-blur-2xl border-t border-border animate-in slide-in-from-bottom-4 duration-300 z-50 overflow-hidden shadow-2xl">
                    <div className="max-w-5xl mx-auto flex flex-col h-[400px]">
                      <div className="p-4 border-b border-border/50 flex items-center gap-4 bg-muted/20">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                          <Package className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            autoFocus
                            type="text"
                            placeholder="Pesquise o nome do produto (mín. 2 letras)..."
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-primary/50 transition-all shadow-inner"
                          />
                        </div>
                        <button
                          onClick={() => {
                            setShowProductSelector(false);
                            setProductSearch("");
                            setCartProducts([]);
                          }}
                          className="p-3 hover:bg-rose-500/10 text-rose-500 rounded-xl transition-colors"
                        >
                          <X className="w-6 h-6" />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                        {/* Itens Selecionados (Carrinho) */}
                        {cartProducts.length > 0 && (
                          <div className="mb-6 animate-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center justify-between px-3 mb-2">
                              <h3 className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                                <ShoppingBag className="w-3.5 h-3.5" /> Itens no
                                Orçamento ({cartProducts.length})
                              </h3>
                              <button
                                onClick={() => setCartProducts([])}
                                className="text-[9px] font-black uppercase text-rose-500 hover:text-rose-600 transition-colors"
                              >
                                Limpar Tudo
                              </button>
                            </div>
                            <div className="flex flex-col divide-y divide-border/30 bg-primary/5 rounded-2xl overflow-hidden border border-primary/10">
                              {cartProducts.map((p) => {
                                const [gradient] = getBrandStyle(
                                  p.marca || p.descricao,
                                );
                                const initials = getBrandInitials(
                                  p.marca || p.descricao,
                                );
                                return (
                                  <div
                                    key={`cart-${p.cod}`}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 bg-background/40"
                                  >
                                    <div
                                      className={cn(
                                        "w-12 h-12 rounded-xl shrink-0 bg-gradient-to-br flex flex-col items-center justify-center shadow-sm relative overflow-hidden",
                                        gradient,
                                      )}
                                    >
                                      {p.foto_url ? (
                                        <img src={p.foto_url} alt={p.descricao} className="w-full h-full object-cover" />
                                      ) : (
                                        <span className="text-white font-black text-xs leading-none">
                                          {initials}
                                        </span>
                                      )}
                                      <div className="absolute inset-0 bg-primary/20 backdrop-blur-[1px] flex items-center justify-center">
                                        <Check className="w-4 h-4 text-white drop-shadow" />
                                      </div>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      <p className="text-[11px] font-bold leading-snug truncate text-primary">
                                        {p.descricao}
                                      </p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] font-black text-foreground">
                                          💵 R${" "}
                                          {(
                                            p.debito * (p.quantidade || 1)
                                          ).toLocaleString("pt-BR", {
                                            minimumFractionDigits: 2,
                                          })}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center bg-background rounded-lg p-1 border border-border/50 shadow-sm">
                                      <button
                                        onClick={() =>
                                          handleUpdateQuantity(p.cod, -1)
                                        }
                                        className="w-6 h-6 flex items-center justify-center hover:bg-secondary rounded-md text-muted-foreground transition-colors"
                                      >
                                        -
                                      </button>
                                      <input
                                        type="number"
                                        value={
                                          p.quantidade === undefined
                                            ? ""
                                            : p.quantidade
                                        }
                                        onChange={(e) =>
                                          handleSetQuantity(
                                            p.cod,
                                            e.target.value,
                                          )
                                        }
                                        onBlur={() =>
                                          handleBlurQuantity(
                                            p.cod,
                                            p.quantidade,
                                          )
                                        }
                                        className="w-10 text-center text-xs font-black bg-transparent border-none focus:outline-none focus:ring-0 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                                        min="1"
                                      />
                                      <button
                                        onClick={() =>
                                          handleUpdateQuantity(p.cod, 1)
                                        }
                                        className="w-6 h-6 flex items-center justify-center hover:bg-secondary rounded-md text-muted-foreground transition-colors"
                                      >
                                        +
                                      </button>
                                    </div>

                                    <button
                                      onClick={() => handleToggleCart(p)}
                                      className="p-2 text-muted-foreground hover:text-rose-500 transition-colors"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="relative h-8 flex items-center justify-center mt-2">
                              <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                              <span className="relative bg-background px-4 text-[9px] font-black uppercase text-muted-foreground/40 tracking-[0.2em]">
                                Resultados da Busca
                              </span>
                            </div>
                          </div>
                        )}

                        {loadingProducts ? (
                          <div className="h-full flex flex-col items-center justify-center gap-4">
                            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground animate-pulse">
                              Sincronizando produtos...
                            </span>
                          </div>
                        ) : filteredProducts.length > 0 ? (
                          <div className="flex flex-col divide-y divide-border/30">
                            {filteredProducts.map((p) => {
                              const inCart = cartMap.has(p.cod);
                              const [gradient] = getBrandStyle(
                                p.marca || p.descricao,
                              );
                              const initials = getBrandInitials(
                                p.marca || p.descricao,
                              );
                              const stockColor =
                                p.disponivel <= 0
                                  ? "border-l-4 border-l-rose-500 bg-rose-500/5"
                                  : p.disponivel <= 10
                                    ? "border-l-4 border-l-amber-500 bg-amber-500/5"
                                    : "border-l-4 border-l-emerald-500 bg-emerald-500/5";
                              return (
                                <div
                                  key={p.cod}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => handleToggleCart(p)}
                                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleToggleCart(p)}
                                  className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all group cursor-pointer",
                                    inCart ? "bg-primary/8" : stockColor,
                                  )}
                                >
                                  {/* Imagem / Placeholder da marca */}
                                  <div
                                    className={cn(
                                      "w-14 h-14 rounded-xl shrink-0 bg-gradient-to-br flex flex-col items-center justify-center shadow-sm relative overflow-hidden",
                                      gradient,
                                    )}
                                  >
                                    {p.foto_url ? (
                                      <img src={p.foto_url} alt={p.descricao} className="w-full h-full object-cover" />
                                    ) : (
                                      <>
                                        <span className="text-white font-black text-base leading-none tracking-tight">
                                          {initials}
                                        </span>
                                        {p.marca && (
                                          <span className="text-white/60 text-[7px] font-bold uppercase tracking-wider mt-0.5 px-1 text-center leading-tight truncate w-full text-center">
                                            {p.marca}
                                          </span>
                                        )}
                                      </>
                                    )}
                                    {inCart && (
                                      <div className="absolute inset-0 bg-primary/30 backdrop-blur-[1px] flex items-center justify-center">
                                        <Check className="w-5 h-5 text-white drop-shadow" />
                                      </div>
                                    )}
                                  </div>

                                  {/* Info do produto */}
                                  <div className="flex-1 min-w-0">
                                    <p
                                      className={cn(
                                        "text-[12px] font-bold leading-snug truncate transition-colors",
                                        inCart
                                          ? "text-primary"
                                          : "text-foreground group-hover:text-primary",
                                      )}
                                    >
                                      {p.descricao}
                                    </p>
                                    {p.marca && (
                                      <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                                        {p.marca}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-3 mt-1">
                                      <span className="text-[11px] font-black text-foreground">
                                        💵 R${" "}
                                        {p.debito.toLocaleString("pt-BR", {
                                          minimumFractionDigits: 2,
                                        })}
                                      </span>
                                      <span className="text-border/60">·</span>
                                      <span className="text-[11px] font-black text-primary">
                                        💳 R${" "}
                                        {p.credito.toLocaleString("pt-BR", {
                                          minimumFractionDigits: 2,
                                        })}
                                      </span>
                                      <span className="text-border/60">·</span>
                                      <span
                                        className={cn(
                                          "text-[10px] font-bold",
                                          p.disponivel <= 0
                                            ? "text-rose-500"
                                            : p.disponivel <= 10
                                              ? "text-amber-500"
                                              : "text-emerald-500",
                                        )}
                                      >
                                        Est: {p.disponivel}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Botão +/✓ e Controle de Quantidade */}
                                  <div className="flex items-center gap-2 shrink-0">
                                    {inCart && (
                                      <div className="flex items-center bg-secondary/50 rounded-lg p-1 animate-in fade-in zoom-in-95 duration-200">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleUpdateQuantity(p.cod, -1);
                                          }}
                                          className="w-6 h-6 flex items-center justify-center hover:bg-background rounded-md text-muted-foreground transition-colors"
                                        >
                                          -
                                        </button>
                                        <input
                                          type="number"
                                          value={
                                            cartMap.get(p.cod)?.quantidade ===
                                            undefined
                                              ? ""
                                              : cartMap.get(p.cod)?.quantidade
                                          }
                                          onChange={(e) =>
                                            handleSetQuantity(
                                              p.cod,
                                              e.target.value,
                                            )
                                          }
                                          onBlur={() =>
                                            handleBlurQuantity(
                                              p.cod,
                                              cartMap.get(p.cod)?.quantidade,
                                            )
                                          }
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-10 text-center text-xs font-black bg-transparent border-none focus:outline-none focus:ring-0 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                                          min="1"
                                        />
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleUpdateQuantity(p.cod, 1);
                                          }}
                                          className="w-6 h-6 flex items-center justify-center hover:bg-background rounded-md text-muted-foreground transition-colors"
                                        >
                                          +
                                        </button>
                                      </div>
                                    )}

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleCart(p);
                                      }}
                                      className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all",
                                        inCart
                                          ? "bg-primary border-primary text-white"
                                          : "border-border/50 text-muted-foreground hover:border-primary hover:text-primary",
                                      )}
                                    >
                                      {inCart ? (
                                        <Check className="w-4 h-4" />
                                      ) : (
                                        <span className="text-lg leading-none font-bold">
                                          +
                                        </span>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                            <Search className="w-16 h-16 mb-4" />
                            <p className="text-sm font-black uppercase tracking-tighter">
                              Nenhum produto encontrado com "{productSearch}"
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Footer do carrinho */}
                      {cartProducts.length > 0 && (
                        <div className="border-t border-border bg-card/80 backdrop-blur-md px-4 py-3 flex items-center gap-4">
                          <div className="flex-1 flex items-center gap-6">
                            <div className="flex flex-col">
                              <span className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">
                                {cartProducts.length}{" "}
                                {cartProducts.length === 1
                                  ? "produto"
                                  : "produtos"}{" "}
                                selecionados
                              </span>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs font-bold text-foreground">
                                  Débito:{" "}
                                  <span className="text-primary">
                                    R${" "}
                                    {cartTotals.debito.toLocaleString("pt-BR", {
                                      minimumFractionDigits: 2,
                                    })}
                                  </span>
                                </span>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-xs font-bold text-foreground">
                                  Crédito (3x de R${" "}
                                  {(cartTotals.credito / 3).toLocaleString(
                                    "pt-BR",
                                    { minimumFractionDigits: 2 },
                                  )}{" "}
                                  s/ juros):{" "}
                                  <span className="text-primary">
                                    R${" "}
                                    {cartTotals.credito.toLocaleString(
                                      "pt-BR",
                                      { minimumFractionDigits: 2 },
                                    )}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => setCartProducts([])}
                            className="px-3 py-2 text-[10px] font-black uppercase text-muted-foreground hover:text-rose-500 transition-colors"
                          >
                            Limpar
                          </button>
                          <button
                            onClick={handleInsertQuote}
                            className="px-5 py-2.5 bg-primary text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-lg shadow-primary/20"
                          >
                            <Send className="w-3.5 h-3.5" />
                            Montar Orçamento
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Replying Message Preview */}
                {replyingMessage && (
                  <div className="max-w-5xl mx-auto mb-3 p-3 bg-secondary/80 border border-border/80 rounded-xl flex items-center justify-between animate-in slide-in-from-bottom-2 duration-200">
                    <div
                      className="flex-1 min-w-0 border-l-2 border-primary pl-3"
                      style={{ borderLeftWidth: 3 }}
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary block mb-0.5">
                        Respondendo a:{" "}
                        {replyingMessage.sender === "me" ? "Você" : "Cliente"}
                      </span>
                      <p className="text-xs text-muted-foreground truncate leading-tight">
                        {replyingMessage.text}
                      </p>
                    </div>
                    <button
                      onClick={() => setReplyingMessage(null)}
                      className="p-1.5 hover:bg-rose-500/10 text-rose-500 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Gravando, o compositor inteiro dá lugar ao gravador — como
                    no WhatsApp. Conviver com catálogo, emoji e campo de texto
                    convidaria a clicar neles no meio de uma gravação. */}
                {gravandoAudio ? (
                  <GravadorAudio
                    onCancelar={() => setGravandoAudio(false)}
                    onEnviar={(arquivo) => {
                      setGravandoAudio(false);
                      setAudioPreviewUrl(null);
                      confirmSendFile(arquivo);
                    }}
                    onErro={(titulo, mensagem) =>
                      showNotification("error", titulo, mensagem)
                    }
                  />
                ) : (
                <div className="flex items-center gap-2 max-w-5xl mx-auto">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleSendDocument(file);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={mediaInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,video/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleSendDocument(file);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={audioInputRef}
                    type="file"
                    className="hidden"
                    accept="audio/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleSendDocument(file);
                      e.target.value = "";
                    }}
                  />
                  {/* "+" — reúne o que antes eram três botões soltos na barra
                      (catálogo, anexo e anotação interna) num menu só, como no
                      WhatsApp. O badge do carrinho fica aqui porque o catálogo
                      passou a morar dentro do menu e o aviso sumiria da vista. */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowPlusMenu((p) => !p)}
                      className={cn(
                        "p-2.5 rounded-xl transition-all relative",
                        showPlusMenu
                          ? "bg-primary/15 text-primary"
                          : "hover:bg-secondary text-muted-foreground",
                      )}
                      title="Anexar"
                      aria-label="Anexar"
                      aria-expanded={showPlusMenu}
                    >
                      <Plus
                        className={cn(
                          "w-5 h-5 transition-transform duration-200",
                          showPlusMenu && "rotate-45",
                        )}
                      />
                      {cartProducts.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center">
                          {cartProducts.length}
                        </span>
                      )}
                    </button>

                    {showPlusMenu && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setShowPlusMenu(false)}
                        />
                        <div className="absolute bottom-full left-0 mb-2 z-50 w-60 bg-card border border-border rounded-2xl shadow-2xl p-1.5 overflow-hidden">
                          {[
                            {
                              icone: <FileText className="w-4 h-4 text-blue-500" />,
                              texto: "Documento",
                              acao: () => fileInputRef.current?.click(),
                            },
                            {
                              icone: <Camera className="w-4 h-4 text-violet-500" />,
                              texto: "Fotos e vídeos",
                              acao: () => mediaInputRef.current?.click(),
                            },
                            {
                              icone: <Mic className="w-4 h-4 text-rose-500" />,
                              texto: "Áudio",
                              acao: () => audioInputRef.current?.click(),
                            },
                            {
                              icone: <Package className="w-4 h-4 text-emerald-500" />,
                              texto: "Catálogo",
                              detalhe:
                                cartProducts.length > 0
                                  ? `${cartProducts.length} no carrinho`
                                  : undefined,
                              acao: () => setShowProductSelector(true),
                            },
                            {
                              icone: <Eye className="w-4 h-4 text-amber-500" />,
                              texto: "Anotação interna",
                              detalhe: isNoteMode ? "ativa" : undefined,
                              acao: () => {
                                setIsNoteMode((p) => !p);
                                setInputText("");
                              },
                            },
                          ].map((item) => (
                            <button
                              key={item.texto}
                              type="button"
                              onClick={() => {
                                setShowPlusMenu(false);
                                item.acao();
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-bold text-foreground hover:bg-secondary transition-colors"
                            >
                              <span className="shrink-0">{item.icone}</span>
                              <span className="flex-1">{item.texto}</span>
                              {item.detalhe && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                                  {item.detalhe}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Seletor de emoji — antes só dava para inserir emoji pelo
                      atalho do sistema operacional, que ninguém do atendimento usa. */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker((p) => !p)}
                      className={cn(
                        "p-2.5 rounded-xl transition-all",
                        showEmojiPicker
                          ? "bg-primary/15 text-primary"
                          : "hover:bg-secondary text-muted-foreground",
                      )}
                      title="Inserir emoji"
                      aria-label="Inserir emoji"
                      aria-expanded={showEmojiPicker}
                    >
                      <Smile className="w-5 h-5" />
                    </button>

                    {showEmojiPicker && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setShowEmojiPicker(false)}
                        />
                        <div className="absolute bottom-full left-0 mb-2 z-50 w-[19rem] max-h-72 overflow-y-auto bg-card border border-border rounded-2xl shadow-2xl p-3 space-y-3">
                          {EMOJI_CATEGORIAS.map((cat) => (
                            <div key={cat.nome}>
                              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1.5">
                                {cat.nome}
                              </span>
                              <div className="grid grid-cols-8 gap-1">
                                {cat.emojis.map((e, i) => (
                                  <button
                                    key={`${cat.nome}-${i}`}
                                    type="button"
                                    onClick={() => inserirEmoji(e)}
                                    className="text-xl leading-none p-1 rounded-lg hover:bg-secondary hover:scale-110 transition-transform"
                                    title={e}
                                  >
                                    {e}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <textarea
                    ref={composerInputRef}
                    rows={1}
                    value={inputText}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (!isNoteMode) {
                        const trimmed = val.trim().toLowerCase();
                        if (trimmed === "/info") {
                          val =
                            "- Para quando precisa do material?\n- Endereço da Obra (com CEP)\n- Dados para cadastro\n- Metodo do pagamento\n\nObs: em caso de Pessoa Fisica, irei precisar do nome completo, CPF, endereço com o CEP. \nJá em Pessoa Juridica encaminhar a ficha cadastral, por gentileza.";
                        } else if (trimmed === "/bom") {
                          const hr = new Date().getHours();
                          const greeting = hr < 12 ? "Bom dia" : "Boa tarde";
                          const attendantName = (
                            userProfile?.name || "Consultora Comercial"
                          ).split(" ")[0];
                          val = `${greeting}, tudo bem? \nPrazer, sou ${attendantName} da Carflax. \n\nComo posso te ajudar?`;
                        } else if (trimmed === "/nao") {
                          val =
                            "Infelizmente, não trabalhamos com esse material. Somos especialistas em materiais hidráulicos e elétricos. Se precisar de algum produto dessas linhas, será um prazer ajudar!";
                        } else if (trimmed === "/avalia") {
                          val = `Olá! 😊 Gostou do nosso atendimento?\n\nSua opinião é super importante para nós! Poderia deixar uma avaliação rápida de 5 estrelas no nosso Google? Leva menos de 1 minuto! ⭐⭐⭐⭐⭐\n\n👉 https://g.page/r/CZbhPzatSAjdEBM/review\n\nMuito obrigado pelo apoio e pela preferência! 🙌`;
                        }
                      }
                      setInputText(val);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape" && showEmojiPicker) {
                        setShowEmojiPicker(false);
                        return;
                      }
                      if (e.key === "Enter" && !e.shiftKey) {
                        // Sem o preventDefault o textarea ainda insere a quebra
                        // antes de o campo ser limpo pelo envio.
                        e.preventDefault();
                        setShowEmojiPicker(false);
                        if (isNoteMode) {
                          handleSendInternalNote();
                        } else {
                          if (pendingFile) {
                            confirmSendFile();
                          } else {
                            handleSendMessage();
                          }
                        }
                      }
                    }}
                    onPaste={handlePaste}
                    placeholder={
                      isNoteMode
                        ? "✏️ Anotação interna (não enviada ao cliente)..."
                        : pendingFile
                          ? "Adicione uma legenda..."
                          : "Responda agora..."
                    }
                    className={cn(
                      "flex-1 border rounded-xl px-4 py-2.5 text-sm outline-none transition-colors resize-none overflow-y-auto leading-relaxed",
                      isNoteMode
                        ? "bg-amber-500/5 border-amber-500/30 focus:border-amber-500/60 text-amber-700 dark:text-amber-300 placeholder:text-amber-500/50"
                        : "bg-background border-border focus:border-primary/50",
                    )}
                    style={{ maxHeight: ALTURA_MAX_COMPOSER }}
                  />
                  {/* Lado direito do campo, como no WhatsApp: sem nada escrito
                      fica só o microfone; ao começar a digitar (ou com arquivo
                      na fila) ele dá lugar ao botão de enviar. Anexar é tudo
                      pelo "+". Em modo anotação o enviar fica sempre visível —
                      um áudio iria para o cliente, e a anotação é interna. */}
                  {isNoteMode || inputText.trim().length > 0 || pendingFile ? (
                    <button
                      onClick={() => {
                        if (isNoteMode) {
                          handleSendInternalNote();
                        } else {
                          if (pendingFile) {
                            confirmSendFile();
                          } else {
                            handleSendMessage();
                          }
                        }
                      }}
                      className={cn(
                        "w-11 h-11 rounded-xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all shrink-0 animate-in fade-in zoom-in-75 duration-150",
                        isNoteMode
                          ? "bg-amber-500 text-white shadow-amber-500/20"
                          : "bg-primary text-white",
                      )}
                      title={isNoteMode ? "Salvar anotação" : "Enviar"}
                      aria-label={isNoteMode ? "Salvar anotação" : "Enviar"}
                    >
                      {isNoteMode ? (
                        <Eye className="w-5 h-5" />
                      ) : (
                        <Send
                          className={cn("w-5 h-5", pendingFile && "animate-pulse")}
                        />
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setGravandoAudio(true)}
                      className="p-2.5 hover:bg-secondary rounded-xl text-muted-foreground transition-all shrink-0 animate-in fade-in duration-150"
                      title="Gravar áudio"
                      aria-label="Gravar áudio"
                    >
                      <Mic className="w-5 h-5" />
                    </button>
                  )}
                </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-4">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center animate-pulse">
              <Megaphone className="w-12 h-12 text-primary" />
            </div>
            <h3 className="text-2xl font-black uppercase">
              Gerenciador de Leads
            </h3>
            <p className="text-muted-foreground max-w-md">
              Selecione uma conversa para começar o atendimento.
            </p>
          </div>
        )}
      </div>

      {/* Context Menu UI */}
      {contextMenu && (
        <div
          className="fixed z-[9999] bg-card border border-border rounded-xl shadow-2xl overflow-hidden py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handlePinChat(contextMenu.chat)}
            className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-secondary flex items-center gap-3 transition-colors"
          >
            {contextMenu.chat.fixado ? (
              <>
                <PinOff className="w-4 h-4 text-muted-foreground" /> Desafixar
              </>
            ) : (
              <>
                <Pin className="w-4 h-4 text-primary" /> Fixar Conversa
              </>
            )}
          </button>

          <button
            onClick={() => handleMarkUnread(contextMenu.chat)}
            className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-secondary flex items-center gap-3 transition-colors"
          >
            <Bell className="w-4 h-4 text-emerald-500" /> Marcar como não lido
          </button>

          <button
            onClick={() => {
              if (viewMode === "active") {
                // Trava a conversa clicada antes de limpar o menu, pois o modal
                // pede o motivo de forma assíncrona e o contextMenu vira null.
                archiveTargetRef.current = contextMenu.chat;
                setArchiveTarget(contextMenu.chat);
                setContextMenu(null);
                setShowArchiveModal(true);
              } else {
                handleUnarchiveChat();
              }
            }}
            className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-secondary flex items-center gap-3 transition-colors text-rose-500"
          >
            {viewMode === "active" ? (
              <>
                <Archive className="w-4 h-4" /> Arquivar
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" /> Desarquivar
              </>
            )}
          </button>
        </div>
      )}
      {/* Lightbox de Imagem */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300"
          onClick={() => setSelectedImage(null)}
        >
          <div className="absolute top-8 right-8 flex flex-col items-center gap-4 z-[10000]">
            <button
              onClick={() => setSelectedImage(null)}
              className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all group"
              title="Fechar"
            >
              <X className="w-6 h-6 group-hover:scale-110 transition-transform" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                const printWindow = window.open("", "_blank");
                if (printWindow) {
                  printWindow.document.write(`
                    <html>
                      <head><title>Imprimir Imagem</title></head>
                      <body style="margin:0;display:flex;justify-content:center;align-items:center;background:white;">
                        <img src="${selectedImage}" style="max-width:100%;height:auto;" onload="window.print();setTimeout(() => window.close(), 500);">
                      </body>
                    </html>
                  `);
                  printWindow.document.close();
                }
              }}
              className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all group"
              title="Imprimir Imagem"
            >
              <Printer className="w-6 h-6 group-hover:scale-110 transition-transform" />
            </button>
          </div>

          <div
            className="relative max-w-7xl w-full h-full flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImage}
              alt="Preview"
              className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
