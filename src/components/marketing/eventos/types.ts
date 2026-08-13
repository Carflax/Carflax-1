import { supabase } from "@/lib/supabase";

export type EventoStatus = "planejamento" | "confirmado" | "realizado" | "cancelado";
export type FornecedorStatus = "nao_contatado" | "media_kit_enviado" | "follow_up" | "inscricao_recebida" | "confirmado" | "recusado";
export type ConvidadoStatus = "pendente" | "confirmado" | "recusado";
export type Segmento = "hidraulico" | "eletrico";
export type Carteira = "B2B" | "B2C" | "Perdido";

export interface Evento {
  id: string;
  nome: string;
  subtitulo?: string | null;
  descricao?: string | null;
  data_evento: string;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  local?: string | null;
  publico_meta_min?: number | null;
  publico_meta_max?: number | null;
  convidados_meta?: number | null;
  verba_meta: number;
  // Kit Instalador: controlado no evento, não por fornecedor — o kit é montado
  // uma vez, com um item de cada marca.
  brindes_meta: number;
  brindes_recebidos: number;
  status: EventoStatus;
}

export interface EventoFornecedor {
  id: string;
  evento_id: string;
  marca: string;
  segmento?: Segmento | null;
  contato_nome?: string | null;
  contato_telefone?: string | null;
  status: FornecedorStatus;
  cota_valor: number;
  cota_confidencial: boolean;
  cota_paga: boolean;
  data_confirmacao?: string | null;
  premio_descricao?: string | null;
  premio_valor?: number | null;
  promotor_nome?: string | null;
  promotor_confirmado: boolean;
  estrutura_ok: boolean;
  apoio_master: boolean;
  observacoes?: string | null;
}

export interface EventoConvidado {
  id: string;
  evento_id: string;
  nome: string;
  telefone?: string | null;
  cliente_id?: string | null;
  vendedor_cod?: string | null;
  vendedor_nome?: string | null;
  carteira?: Carteira | null;
  status: ConvidadoStatus;
  voucher_numero?: string | null;
  numero_sorteio?: number | null;
  lembrete_d7: boolean;
  lembrete_d2: boolean;
  presente: boolean;
  checkin_at?: string | null;
  observacoes?: string | null;
}

export const FORNECEDOR_STATUS_LABEL: Record<FornecedorStatus, string> = {
  nao_contatado: "Não contatado",
  media_kit_enviado: "Media kit enviado",
  follow_up: "Em follow-up",
  inscricao_recebida: "Inscrição Recebida",
  confirmado: "Confirmado",
  recusado: "Recusado",
};

// Cores seguem a semântica já usada no painel: azul = ok, âmbar = em curso,
// rosa = problema, cinza = não começou.
export const FORNECEDOR_STATUS_COLOR: Record<FornecedorStatus, string> = {
  nao_contatado: "bg-secondary text-muted-foreground border-border",
  media_kit_enviado: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900/50",
  follow_up: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900/50",
  inscricao_recebida: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-900/50",
  confirmado: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-900/50",
  recusado: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-900/50",
};

export const CONVIDADO_STATUS_LABEL: Record<ConvidadoStatus, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  recusado: "Recusado",
};

export const CONVIDADO_STATUS_COLOR: Record<ConvidadoStatus, string> = {
  pendente: "bg-secondary text-muted-foreground border-border",
  confirmado: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-900/50",
  recusado: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-900/50",
};

// Erro do Supabase é um PostgrestError ({ message, details, hint, code }), não
// uma instância de Error — String(e) nele vira "[object Object]" e esconde a
// causa. Extrai a mensagem legível de qualquer um dos formatos.
export function mensagemErro(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const partes = [o.message, o.details, o.hint].filter(
      (p): p is string => typeof p === "string" && p.length > 0
    );
    if (partes.length > 0) {
      const codigo = typeof o.code === "string" && o.code ? ` (${o.code})` : "";
      return partes.join(" — ") + codigo;
    }
    try { return JSON.stringify(e); } catch { /* cai no fallback */ }
  }
  return String(e);
}

export const formatBRL = (val: number | string | null | undefined) => {
  const num = typeof val === "string" ? parseFloat(val) : val;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(num || 0);
};

export const formatDate = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
};

// "07:30:00" → "07h30"
export const formatHora = (t?: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${h}h${m}`;
};

// Dias corridos até o evento. Negativo = já passou.
export const diasAte = (iso: string) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${iso.split("T")[0]}T00:00:00`);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
};

// ── Acesso a dados ──────────────────────────────────────────────────────────

export async function fetchEventos() {
  const { data, error } = await supabase.from("eventos").select("*").order("data_evento", { ascending: false });
  if (error) throw error;
  return (data || []) as Evento[];
}

export async function fetchFornecedores(eventoId: string) {
  const { data, error } = await supabase
    .from("evento_fornecedores").select("*").eq("evento_id", eventoId).order("marca");
  if (error) throw error;
  return (data || []) as EventoFornecedor[];
}

export async function fetchConvidados(eventoId: string) {
  const { data, error } = await supabase
    .from("evento_convidados").select("*").eq("evento_id", eventoId).order("nome");
  if (error) throw error;
  return (data || []) as EventoConvidado[];
}

// Confirmar convidado = gerar voucher nominal + número da sorte.
// O número é sequencial por evento e tem índice único no banco; se dois
// atendentes confirmarem ao mesmo tempo, um recebe violação de unicidade (23505)
// e aqui refazemos a conta em vez de deixar o erro subir para a tela.
export async function confirmarConvidado(convidado: EventoConvidado, tentativas = 5): Promise<EventoConvidado> {
  // Já tem número (ex: confirmou, voltou para pendente e está reconfirmando):
  // só muda o status. Reemitir trocaria o número que o cliente já recebeu.
  if (convidado.numero_sorteio) {
    const { data, error } = await supabase
      .from("evento_convidados")
      .update({ status: "confirmado", updated_at: new Date().toISOString() })
      .eq("id", convidado.id)
      .select()
      .single();
    if (error) throw error;
    return data as EventoConvidado;
  }

  for (let i = 0; i < tentativas; i++) {
    const { data: maxRow, error: maxErr } = await supabase
      .from("evento_convidados")
      .select("numero_sorteio")
      .eq("evento_id", convidado.evento_id)
      .not("numero_sorteio", "is", null)
      .order("numero_sorteio", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) throw maxErr;

    const proximo = (maxRow?.numero_sorteio || 0) + 1;
    const ano = new Date().getFullYear();
    const { data, error } = await supabase
      .from("evento_convidados")
      .update({
        status: "confirmado",
        numero_sorteio: proximo,
        voucher_numero: `EI${ano}-${String(proximo).padStart(3, "0")}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", convidado.id)
      .select()
      .single();

    if (!error) return data as EventoConvidado;
    if (error.code !== "23505") throw error;
  }
  throw new Error("Não foi possível gerar o número da sorte — tente novamente.");
}
