import type { PosVendaCategoria } from "@/lib/api";

export type Segmento = "B2B" | "B2C";

export type ContatoStatus =
  | "fora"          // não entrou na lista (recorrente, ativo ou contatado há pouco)
  | "pendente"      // sugerido, aguardando aprovação do gestor
  | "excluido"      // gestor tirou da lista
  | "a_ligar"
  | "retornar"      // tentativa sem sucesso, volta para a fila
  | "contatado"
  | "nao_contatado"; // esgotou tentativas ou número errado

export type Classificacao = "satisfeito" | "melhoria" | "insatisfeito" | "critico";

export type ResultadoTentativa = "atendeu" | "nao_atendeu" | "caixa_postal" | "numero_errado" | "pediu_retorno";

export interface PosVendaContato {
  id: string;
  data_venda: string;
  segmento: Segmento;
  cod_cliente: string;
  cliente_nome: string;
  tipo_pessoa: string | null;
  telefone: string | null;
  celular: string | null;
  cidade: string | null;
  documentos: string[];
  valor_total: number;
  cod_vendedor: string | null;
  nome_vendedor: string | null;
  vendedor_user_id: string | null;
  categoria: PosVendaCategoria;
  pedidos_365d: number;
  pedidos_janela: number;
  prioridade: 1 | 2 | 3 | null;
  status: ContatoStatus;
  motivo_fora: string | null;
  tentativas: number;
  ultima_tentativa_em: string | null;
  ultimo_resultado: ResultadoTentativa | null;
  retornar_em: string | null;
  experiencia_esperada: "sim" | "parcial" | "nao" | null;
  dificuldades: string[];
  dificuldade_detalhe: string | null;
  melhoria: string | null;
  nota: number | null;
  voltaria_comprar: "sim" | "talvez" | "nao" | null;
  classificacao: Classificacao | null;
  observacoes: string | null;
  duracao_segundos: number | null;
  ligado_por: string | null;
  contatado_em: string | null;
  interesse_comercial: boolean;
  interesse_produto: string | null;
  vendedor_notificado_em: string | null;
  vendedor_retorno_em: string | null;
  vendedor_retorno_obs: string | null;
  supervisor_id: string | null;
  supervisor_notificado_em: string | null;
  tratativa_responsavel: string | null;
  tratativa_prazo: string | null;
  tratativa_status: "aberta" | "resolvida" | null;
  tratativa_resolucao: string | null;
  tratativa_resolvida_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface PosVendaConfig {
  gestor_b2b: string | null;
  gestor_b2c: string | null;
  supervisor_b2b: string | null;
  supervisor_b2c: string | null;
  recorrencia_pedidos: number;
  recorrencia_dias: number;
  pouco_historico_pedidos: number;
  dias_sem_recontato: number;
  max_tentativas: number;
  prazo_critico_dias: number;
  prazo_insatisfeito_dias: number;
}

export const CONFIG_PADRAO: PosVendaConfig = {
  gestor_b2b: null,
  gestor_b2c: null,
  supervisor_b2b: null,
  supervisor_b2c: null,
  recorrencia_pedidos: 4,
  recorrencia_dias: 90,
  pouco_historico_pedidos: 2,
  dias_sem_recontato: 60,
  max_tentativas: 3,
  prazo_critico_dias: 1,
  prazo_insatisfeito_dias: 3,
};

export interface HubUser {
  id: string;
  name: string;
  avatar?: string | null;
  role?: string | null;
  department?: string | null;
  operator_code?: string | null;
}

export interface PosVendaUserProfile {
  id?: string;
  name: string;
  role: string;
  department?: string;
  is_admin?: boolean;
  is_leader?: boolean;
}

export const CLASSIFICACOES: Record<Classificacao, { label: string; emoji: string; cor: string; descricao: string }> = {
  satisfeito: {
    label: "Satisfeito", emoji: "🟢",
    cor: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    descricao: "Boa experiência. Registrar e encerrar.",
  },
  melhoria: {
    label: "Ponto de melhoria", emoji: "🟡",
    cor: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
    descricao: "Pequena dificuldade. Registrar para análise.",
  },
  insatisfeito: {
    label: "Insatisfeito", emoji: "🟠",
    cor: "text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/30",
    descricao: "Frustração ou problema relevante. Avisa o supervisor.",
  },
  critico: {
    label: "Crítico", emoji: "🔴",
    cor: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30",
    descricao: "Problema grave ou risco de reclamação. Aviso imediato.",
  },
};

export const INTERESSE_BADGE = {
  label: "Interesse comercial", emoji: "🔵",
  cor: "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/30",
};

export const CATEGORIAS: Record<PosVendaCategoria, { label: string; cor: string }> = {
  primeira_compra: { label: "1ª compra", cor: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  pouco_historico: { label: "Pouco histórico", cor: "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/30" },
  ativo: { label: "Ativo", cor: "text-muted-foreground bg-secondary border-border" },
  recorrente: { label: "Recorrente", cor: "text-muted-foreground bg-secondary border-border" },
};

export const PRIORIDADES: Record<1 | 2 | 3, string> = {
  1: "P1 · Primeira compra",
  2: "P2 · Pouco histórico",
  3: "P3 · Indicado pelo gestor",
};

export const DIFICULDADES = [
  { id: "atendimento", label: "Atendimento" },
  { id: "pagamento", label: "Pagamento" },
  { id: "separacao", label: "Separação" },
  { id: "entrega_retirada", label: "Entrega / Retirada" },
] as const;

export const RESULTADOS: Record<ResultadoTentativa, string> = {
  atendeu: "Atendeu",
  nao_atendeu: "Não atendeu",
  caixa_postal: "Caixa postal",
  numero_errado: "Número errado",
  pediu_retorno: "Pediu para retornar",
};

// ── Regras de acesso dentro da tela ─────────────────────────────────────────

export function isGestorGeral(p?: PosVendaUserProfile | null): boolean {
  const role = p?.role?.toUpperCase() || "";
  return !!p?.is_admin || role === "ADMIN" || role.includes("GERENTE") || role.includes("DIRETOR");
}

export function gestorDoSegmento(config: PosVendaConfig, userId?: string): Segmento[] {
  if (!userId) return [];
  const s: Segmento[] = [];
  if (config.gestor_b2b === userId) s.push("B2B");
  if (config.gestor_b2c === userId) s.push("B2C");
  return s;
}

export function isSupervisor(config: PosVendaConfig, userId?: string): boolean {
  return !!userId && (config.supervisor_b2b === userId || config.supervisor_b2c === userId);
}

/** Vendedor puro só enxerga as oportunidades encaminhadas para ele. */
export function isSomenteVendedor(p: PosVendaUserProfile | null | undefined, config: PosVendaConfig): boolean {
  const role = p?.role?.toUpperCase() || "";
  if (!role.includes("VENDEDOR")) return false;
  if (isGestorGeral(p) || p?.is_leader) return false;
  return gestorDoSegmento(config, p?.id).length === 0 && !isSupervisor(config, p?.id);
}

// ── Utilidades ──────────────────────────────────────────────────────────────

export const fmtMoeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const fmtData = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export const fmtDataHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtDuracao = (seg?: number | null) => {
  if (!seg && seg !== 0) return "—";
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

/** YYYY-MM-DD no fuso local. */
export const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Dia anterior com expediente: segunda puxa o sábado. */
export function diaVendaPadrao(hoje = new Date()): string {
  const d = new Date(hoje);
  d.setDate(d.getDate() - 1);
  if (d.getDay() === 0) d.setDate(d.getDate() - 1);
  return isoLocal(d);
}

export const somarDias = (iso: string, dias: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return isoLocal(new Date(y, m - 1, d + dias));
};

/** "11 999998888" → "11999998888"; mantém só dígitos. */
export const soDigitos = (t?: string | null) => (t || "").replace(/\D/g, "");

/** Sugestão de classificação a partir das respostas; o operador pode trocar. */
export function sugerirClassificacao(c: {
  experiencia_esperada: PosVendaContato["experiencia_esperada"];
  dificuldades: string[];
  nota: number | null;
  voltaria_comprar: PosVendaContato["voltaria_comprar"];
}): Classificacao | null {
  if (c.nota === null && !c.experiencia_esperada) return null;
  if (c.experiencia_esperada === "nao" || c.voltaria_comprar === "nao" || (c.nota !== null && c.nota <= 6)) {
    return "insatisfeito";
  }
  if (c.dificuldades.length > 0 || c.experiencia_esperada === "parcial" || c.voltaria_comprar === "talvez" || (c.nota !== null && c.nota <= 8)) {
    return "melhoria";
  }
  return "satisfeito";
}

export const inputCls =
  "w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all";
export const labelCls = "text-[10px] font-black uppercase tracking-widest text-muted-foreground";
