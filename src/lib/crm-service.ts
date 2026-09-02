import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { apiCrmMotivosPerda } from "./api";

// ─── Firestore REST (sem SDK) ─────────────────────────────────────────────────
const FIREBASE_PROJECT = "gestao-de-tempo";
const FIREBASE_API_KEY = "AIzaSyCVJtHQ_nzIWGKoMYVCk81Dz67L1zvTvuA";
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;

type FsValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { nullValue: null }
  | { integerValue: string };

function fsField(v: FsValue | undefined): string | boolean | null {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("integerValue" in v) return v.integerValue;
  return null;
}

async function fsGetAll(collection: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(`${FS_BASE}/${collection}`);
    url.searchParams.set("key", FIREBASE_API_KEY);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Firestore ${collection}: ${res.status}`);
    const json = await res.json();

    for (const doc of json.documents ?? []) {
      const f = doc.fields ?? {};
      rows.push(
        Object.fromEntries(
          Object.entries(f).map(([k, v]) => [k, fsField(v as FsValue)])
        )
      );
    }

    pageToken = json.nextPageToken ?? null;
  } while (pageToken);

  return rows;
}

// ─── Motivos de perda ─────────────────────────────────────────────────────────
// Fonte única: o cadastro do ERP (CADCOC, COC_CODTOC = '00001') — a mesma lista
// que o vendedor vê no Citel. Incluir/remover motivo lá reflete aqui sozinho.
// O filtro de orçamentos, o seletor de "marcar como perdido" e o cadastro de
// responsáveis por notificação (Configurações) usam `useLossReasons()`.
//
// A notificação casa o motivo por igualdade de texto (case-insensitive) contra
// crm_loss_responsibles, então renomear um motivo no ERP órfã o cadastro que
// aponta para o texto antigo.
//
// Esta constante é só o fallback de quando o ERP não responde — a tela nunca
// fica sem motivos. Não use direto na UI.
export const LOSS_REASONS_FALLBACK = [
  "PREÇO ALTO",
  "FALTA DE ESTOQUE",
  "PRAZO DE ENTREGA",
  "ERRO VENDEDOR",
  "DESISTIU",
  "POSTERGOU",
  "LIBERAÇÃO FINANCEIRA",
  "PREÇO ALTO FABRICANTE",
] as const;

/**
 * Status para o orçamento que não é venda nem perda comercial: o cliente
 * comprou material com mão de obra junto, coisa que a Carflax não fornece.
 * Fica fora do "em aberto" (não há o que cobrar) e fora do "perdido" (não se
 * perdeu para concorrente) — por isso é status, não motivo de perda.
 */
export const STATUS_MAO_DE_OBRA = "MÃO DE OBRA E MATERIAL";

/**
 * Motivos de perda que NÃO são perda comercial e por isso não entram no
 * denominador da taxa de conversão. "Mão de obra e material" virou status
 * próprio, mas o texto segue aqui por causa dos orçamentos antigos, marcados
 * como PERDIDO com esse motivo antes da mudança.
 */
export const MOTIVOS_NAO_COMERCIAIS = new Set([
  "MÃO DE OBRA E MATERIAL",
  "MAO DE OBRA E MATERIAL",
]);

export function isPerdaComercial(motivo?: string | null): boolean {
  return !MOTIVOS_NAO_COMERCIAIS.has((motivo ?? "").toUpperCase().trim());
}

/**
 * Taxa de conversão por valor — regra única do HUB.
 *
 * vendido ÷ (vendido + perdido comercial). O "vendido" é o FATURADO: pedido em
 * aberto não é conversão decidida, é promessa. O painel Geral usava o TOTAL
 * (faturado + em aberto) no numerador e por isso mostrava uma taxa bem mais
 * alta que a tela de Orçamentos para o mesmo vendedor.
 */
export function taxaConversaoValor(faturado: number, perdidoComercial: number): number {
  const decididos = faturado + perdidoComercial;
  return decididos > 0 ? (faturado / decididos) * 100 : 0;
}

/**
 * Motivos aposentados: saíram da lista de perda a pedido do comercial.
 * "Mão de obra e material" virou o status acima; "Comparativo de linhas" foi
 * descontinuado. O cadastro segue existindo no ERP (CADCOC) — filtramos aqui
 * para não precisar mexer no Citel e para que os orçamentos antigos que já
 * usam esses textos continuem legíveis.
 */
const MOTIVOS_APOSENTADOS = new Set([
  "MÃO DE OBRA E MATERIAL",
  "MAO DE OBRA E MATERIAL",
  "COMPARATIVO DE LINHAS",
]);

/** Remove da lista de escolha os motivos aposentados. */
function semAposentados(lista: string[]): string[] {
  return lista.filter((m) => !MOTIVOS_APOSENTADOS.has(m.toUpperCase().trim()));
}

export const LOSS_REASON_ALL = "Todos os Motivos";

/** Motivo que exige marcar quais itens do orçamento se perderam. */
export function isEstoqueLossReason(motivo: string | null | undefined): boolean {
  return (motivo ?? "").toUpperCase().includes("ESTOQUE");
}

// Cache de módulo: a lista muda raríssimo e várias telas pedem ao mesmo tempo.
// `inflight` evita N requisições simultâneas na primeira montagem.
let lossReasonsCache: string[] | null = null;
let lossReasonsInflight: Promise<string[]> | null = null;

export async function getLossReasons(): Promise<string[]> {
  if (lossReasonsCache) return lossReasonsCache;
  if (lossReasonsInflight) return lossReasonsInflight;

  lossReasonsInflight = apiCrmMotivosPerda()
    .then((rows) => {
      const list = semAposentados(rows.map((r) => r.descricao.trim()).filter(Boolean));
      if (list.length === 0) return [...LOSS_REASONS_FALLBACK];
      lossReasonsCache = list;
      return list;
    })
    .catch(() => [...LOSS_REASONS_FALLBACK])
    .finally(() => {
      lossReasonsInflight = null;
    });

  return lossReasonsInflight;
}

/** Lista de motivos do ERP. Começa no fallback e troca pelo cadastro real ao carregar. */
export function useLossReasons(): string[] {
  const [reasons, setReasons] = useState<string[]>(
    () => lossReasonsCache ?? [...LOSS_REASONS_FALLBACK],
  );

  useEffect(() => {
    let alive = true;
    getLossReasons().then((list) => {
      if (alive) setReasons(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  return reasons;
}

// ─── Tipos Supabase ───────────────────────────────────────────────────────────
export interface CrmStatus {
  documento: string;
  empresa: string;
  status_crm: string;
  motivo_perda?: string | null;
  concorrente?: string | null;
  lembrete_data?: string | null;
  vendedor?: string | null;
  vendedor_codigo?: string | null;
  endereco_obra?: string | null;
  fechamento_previsto?: string | null;
  entrega_prevista?: string | null;
  updated_at?: string;
  itens_estoque?: string[] | null;
  itens_preco?: string[] | null;
  // Timestamp de quando o alerta de "PERDA DE ORÇAMENTO" foi enviado por WhatsApp.
  // Usado como trava de idempotência para não reenviar o mesmo orçamento.
  perda_notificada_em?: string | null;
}

export interface CrmConversa {
  id?: string;
  documento: string;
  empresa: string;
  obs: string;
  enviado_por?: string | null;
  enviado_por_nome: string;
  enviado_por_foto?: string | null;
  timestamp?: string;
  lida?: boolean;
  fechada?: boolean;
  // null = sem destinatário resolvido (ex: vendedor ainda sem responsável definido) — a mensagem
  // fica registrada, mas não aparece na caixa de entrada de ninguém.
  destino?: string | null;
  // ── Auditoria de entrega/leitura (modelo WhatsApp) ──────────────────────────
  // created_at  = ENVIADA  (servidor recebeu; imutável, default now())
  // entregue_em = ENTREGUE (chegou no app do destinatário, ele logado)
  // lida_em     = VISTA    (o balão apareceu de fato na tela dele)
  created_at?: string | null;
  entregue_em?: string | null;
  lida_em?: string | null;
  escalado_em?: string | null;
}

// ─── Supabase helpers ────────────────────────────────────────────────────────
export async function getCrmStatus(documento: string): Promise<CrmStatus | null> {
  const { data } = await supabase
    .from("crm_status")
    .select("*")
    .eq("documento", documento)
    .single();
  return data ?? null;
}

export async function upsertCrmStatus(payload: CrmStatus): Promise<void> {
  await supabase
    .from("crm_status")
    .upsert(
      { ...payload, updated_at: new Date().toISOString() },
      { onConflict: "documento,empresa" }
    );
}

export async function getConversas(documento: string): Promise<CrmConversa[]> {
  const { data } = await supabase
    .from("crm_conversas")
    .select("*")
    .eq("documento", documento)
    .order("timestamp", { ascending: true });
  return data ?? [];
}

// Oculta conversas da central DO USUÁRIO (não afeta os outros participantes) —
// persiste entre dispositivos/sessões, sem apagar o histórico. Uma mensagem nova
// (diálogo com timestamp posterior a `ocultado_em`) reabre a conversa na central.
// Substitui o antigo `fecharConversas`, que marcava crm_conversas.fechada=true por
// DOCUMENTO e escondia a conversa para todos os participantes daquele orçamento.
export async function ocultarConversas(
  userId: string,
  documentos: string[]
): Promise<void> {
  if (!userId) return;
  const docs = [...new Set(documentos.filter(Boolean))];
  if (docs.length === 0) return;
  const agora = new Date().toISOString();
  const CHUNK = 500;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = docs.slice(i, i + CHUNK).map((documento) => ({
      user_id: userId,
      documento,
      ocultado_em: agora,
    }));
    const { error } = await supabase
      .from("crm_central_ocultas")
      .upsert(batch, { onConflict: "user_id,documento" });
    if (error) {
      console.error("[CRM] erro ao ocultar conversas:", error.message);
      throw error;
    }
  }
}

// Retorna o mapa documento → ocultado_em (ISO) das conversas que o usuário ocultou
// da própria central. Usado para esconder da lista as conversas sem mensagem nova.
export async function getConversasOcultas(
  userId: string
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!userId) return mapa;
  const { data, error } = await supabase
    .from("crm_central_ocultas")
    .select("documento, ocultado_em")
    .eq("user_id", userId);
  if (error) {
    console.error("[CRM] erro ao buscar conversas ocultas:", error.message);
    return mapa;
  }
  for (const row of data ?? []) {
    if (row.documento) mapa.set(row.documento, row.ocultado_em);
  }
  return mapa;
}

// Marca ENTREGUE: a mensagem chegou no app deste destinatário (ele está logado).
// Só grava `entregue_em` uma vez (não sobrescreve). Idempotente por lista de ids.
export async function marcarEntregue(ids: string[]): Promise<void> {
  const limpos = [...new Set(ids.filter(Boolean))];
  if (limpos.length === 0) return;
  const { error } = await supabase
    .from("crm_conversas")
    .update({ entregue_em: new Date().toISOString() })
    .in("id", limpos)
    .is("entregue_em", null);
  if (error) console.error("[CRM] erro ao marcar entregue:", error.message);
}

// Marca VISTA: o balão apareceu de fato na tela do destinatário. Esta é a ÚNICA
// forma de uma mensagem virar "lida" — fechar a conversa NÃO marca mais como lida.
// Grava `lida_em` só uma vez e sincroniza o booleano `lida` (retrocompatibilidade).
export async function marcarVista(ids: string[]): Promise<void> {
  const limpos = [...new Set(ids.filter(Boolean))];
  if (limpos.length === 0) return;
  const { error } = await supabase
    .from("crm_conversas")
    .update({ lida_em: new Date().toISOString(), lida: true })
    .in("id", limpos)
    .is("lida_em", null);
  if (error) console.error("[CRM] erro ao marcar vista:", error.message);
}

export async function addConversa(conversa: Omit<CrmConversa, "id">): Promise<void> {
  const { error } = await supabase
    .from("crm_conversas")
    .insert({
      ...conversa,
      timestamp: conversa.timestamp ?? new Date().toISOString(),
    });

  if (error) {
    console.error("[CRM] erro ao adicionar conversa:", error.message, error.details);
    throw error;
  }
}

// ─── Migração Firebase → Supabase (completa) ──────────────────────────────────
export async function migrarDoFirebase(): Promise<{ status: number; conversas: number }> {
  // 1. crm_status
  const statusRows = await fsGetAll("crm_status");
  let statusCount = 0;
  if (statusRows.length > 0) {
    const { error } = await supabase.from("crm_status").upsert(
      statusRows.map((r) => ({
        documento: String(r.documento ?? ""),
        empresa: String(r.empresa ?? "001"),
        status_crm: String(r.status_crm ?? "Emitido"),
        motivo_perda: r.motivo_perda ?? null,
        concorrente: r.concorrente ?? null,
        lembrete_data: r.lembrete_data ?? r.lembreteData ?? r.proximo_contato ?? null,
        vendedor: r.vendedor ?? null,
        vendedor_codigo: r.vendedor_codigo ?? null,
        endereco_obra: r.endereco_obra ?? null,
        fechamento_previsto: r.fechamento_previsto ?? null,
        entrega_prevista: r.entrega_prevista ?? null,
        updated_at: String(r.updatedAt ?? r.updated_at ?? new Date().toISOString()),
      })),
      { onConflict: "documento,empresa" }
    );
    if (!error) statusCount = statusRows.length;
  }

  // 2. crm_notificacoes → crm_conversas
  const notifRows = await fsGetAll("crm_notificacoes");
  let conversasCount = 0;
  if (notifRows.length > 0) {
    const { error } = await supabase.from("crm_conversas").upsert(
      notifRows
        .filter((r) => r.documento && r.obs)
        .map((r) => ({
          documento: String(r.documento),
          empresa: String(r.empresa ?? "001"),
          obs: String(r.obs),
          enviado_por: r.enviado_por ? String(r.enviado_por) : null,
          enviado_por_nome: String(r.enviado_por_nome ?? "Sistema"),
          enviado_por_foto: r.enviado_por_foto ? String(r.enviado_por_foto) : null,
          timestamp: r.timestamp ? String(r.timestamp) : new Date().toISOString(),
          lida: Boolean(r.lida),
          fechada: Boolean(r.fechada),
          destino: String(r.destino ?? "todos"),
        })),
      { ignoreDuplicates: true }
    );
    if (!error) conversasCount = notifRows.length;
  }

  return { status: statusCount, conversas: conversasCount };
}

// ─── Sincroniza apenas lembrete_data faltante do Firestore → Supabase ────────
export async function sincronizarLembreteData(): Promise<{ atualizados: number; erros: number }> {
  const fsRows = await fsGetAll("crm_status");
  let atualizados = 0;
  let erros = 0;

  const comLembrete = fsRows.filter((r) =>
    r.lembrete_data ?? r.lembreteData ?? r.proximo_contato
  );

  for (const r of comLembrete) {
    const documento = String(r.documento ?? "");
    if (!documento) continue;
    const lembrete = String(r.lembrete_data ?? r.lembreteData ?? r.proximo_contato);

    const { error } = await supabase
      .from("crm_status")
      .update({ lembrete_data: lembrete })
      .eq("documento", documento)
      .is("lembrete_data", null);

    if (error) erros++;
    else atualizados++;
  }

  return { atualizados, erros };
}

// ─── Responsável (líder direto) de um vendedor ───────────────────────────────
// Cada vendedor tem um "responsável" (usuarios.responsavel_id) que substitui o
// antigo centralizador único global: agora cada um recebe as mensagens só dos
// seus próprios subordinados. Aceita tanto o código de operador do ERP (ex:
// "058") quanto o uuid do usuário (algumas mensagens antigas guardam o uuid
// em enviado_por/destino), por isso tenta os dois formatos.
export async function getResponsavelIdForVendedor(
  sellerCodeOrId?: string | null
): Promise<string | null> {
  const raw = String(sellerCodeOrId || "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/^0+/, "");
  if (!normalized) return null;

  const { data } = await supabase
    .from("usuarios")
    .select("id, operator_code, responsavel_id")
    .not("responsavel_id", "is", null);

  const match = (data || []).find((u) => {
    if (u.id === raw) return true;
    const code = String(u.operator_code || "").trim().replace(/^0+/, "");
    return !!code && code === normalized;
  });

  return match?.responsavel_id || null;
}

export async function getCrmStatusMap(
  documentos: string[]
): Promise<Map<string, CrmStatus>> {
  if (!documentos || documentos.length === 0) return new Map();

  // Divide em blocos de 500 para evitar limites de query do Supabase/Postgrest
  const chunks: string[][] = [];
  for (let i = 0; i < documentos.length; i += 500) {
    chunks.push(documentos.slice(i, i + 500));
  }

  const map = new Map<string, CrmStatus>();

  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from("crm_status")
      .select("documento,empresa,status_crm,motivo_perda,lembrete_data,fechamento_previsto,entrega_prevista,endereco_obra,vendedor,vendedor_codigo,updated_at")
      .in("documento", chunk);

    if (error) {
      console.error("[CRM] getCrmStatusMap error:", error.code, error.message, error.details);
      continue;
    }

    if (!data || data.length === 0) {
      console.warn(`[CRM] No data found for chunk of ${chunk.length} items. First ID: ${chunk[0]}`);
    }

    for (const row of data ?? []) {
      map.set(row.documento.trim(), row);
    }
  }

  return map;
}
