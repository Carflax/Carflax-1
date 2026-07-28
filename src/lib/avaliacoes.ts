import { supabase } from "./supabase";

export interface AvaliacaoScan {
  id: string;
  vendedor_cod: string | null;
  vendedor_nome: string | null;
  canal_id: string | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  user_agent: string | null;
  created_at: string;
  review_id: string | null;
  matched_at: string | null;
}

export interface AvaliacaoCanal {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
}

export interface CanalScore extends AvaliacaoCanal {
  scans: number;
}

export interface AvaliacaoReview {
  review_id: string;
  star_rating: number | null;
  reviewer_name: string | null;
  comment: string | null;
  review_create_date: string | null;
  review_reply_comment: string | null;
  location_id: string | null;
  synced_at: string;
  scan_id: string | null;
  vendedor_cod: string | null;
  matched_at: string | null;
  matched_by: string | null;
}

export interface VendedorScore {
  vendedor_cod: string;
  vendedor_nome: string;
  avatar?: string | null;
  scans: number;            // quantos escanearam o QR
  identificados: number;    // scans em que o cliente deixou nome/telefone
  confirmadas: number;      // avaliações do Google confirmadas (pontos)
}

const REVIEW_URL_KEY = "google_review_url";
const PREMIO_KEY = "avaliacao_premio_sorteio";
const PREMIO_IMG_KEY = "avaliacao_premio_imagem";

// ── Config (em crm_config) ───────────────────────────────────────────────────
async function getConfig(key: string): Promise<string> {
  const { data } = await supabase.from("crm_config").select("value").eq("key", key).maybeSingle();
  return (data?.value as string) || "";
}
async function setConfig(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from("crm_config").upsert({ key, value: value.trim() }, { onConflict: "key" });
  if (error) throw error;
}

// Link fixo de avaliação do Google da Carflax. Fica no código porque não muda;
// ainda assim um valor em crm_config (se existir) tem prioridade, caso um dia
// precise trocar sem publicar.
export const DEFAULT_REVIEW_URL = "https://g.page/r/CZbhPzatSAjdEBM/review";
export const getGoogleReviewUrl = async () => (await getConfig(REVIEW_URL_KEY)) || DEFAULT_REVIEW_URL;
export const getPremioSorteio = () => getConfig(PREMIO_KEY);
export const setPremioSorteio = (v: string) => setConfig(PREMIO_KEY, v);
export const getPremioImagem = () => getConfig(PREMIO_IMG_KEY);
export const setPremioImagem = (v: string) => setConfig(PREMIO_IMG_KEY, v);

// ── Página pública ───────────────────────────────────────────────────────────
// Resolve o nome do vendedor pelo código do ERP (operator_code).
export async function resolverVendedor(cod: string): Promise<{ nome: string | null }> {
  const { data } = await supabase
    .from("usuarios").select("name").eq("operator_code", cod).maybeSingle();
  return { nome: (data?.name as string) || null };
}

// Registra o scan e devolve o id — não bloqueia o cliente se falhar.
// A origem é UMA de: vendedor (vendedor_cod) ou canal avulso (canal_id).
export async function registrarScan(input: {
  vendedor_cod?: string | null;
  vendedor_nome?: string | null;
  canal_id?: string | null;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from("avaliacao_scans")
    .insert([{
      vendedor_cod: input.vendedor_cod || null,
      vendedor_nome: input.vendedor_nome || null,
      canal_id: input.canal_id || null,
      cliente_nome: input.cliente_nome || null,
      cliente_telefone: input.cliente_telefone || null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    }])
    .select("id")
    .single();
  if (error) return null;
  return (data?.id as string) || null;
}

// Enriquecer o scan com os dados do cliente (form da página pública).
export async function atualizarScanCliente(id: string, cliente_nome: string | null, cliente_telefone: string | null): Promise<void> {
  await supabase.from("avaliacao_scans")
    .update({ cliente_nome: cliente_nome || null, cliente_telefone: cliente_telefone || null })
    .eq("id", id);
}

// Histórico de avaliações (scans) de um vendedor, mais recentes primeiro.
export async function fetchScansVendedor(cod: string): Promise<AvaliacaoScan[]> {
  const { data, error } = await supabase
    .from("avaliacao_scans").select("*").eq("vendedor_cod", cod)
    .order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return (data || []) as AvaliacaoScan[];
}

// Exclui um scan (avaliação) do histórico. Se ele estava casado a uma review,
// solta o vínculo na review antes (mantém a review, evita ponteiro órfão).
export async function removerScan(id: string): Promise<void> {
  await supabase.from("avaliacao_reviews")
    .update({ scan_id: null }).eq("scan_id", id);
  const { error } = await supabase.from("avaliacao_scans").delete().eq("id", id);
  if (error) throw error;
}

export async function resolverCanal(id: string): Promise<{ nome: string | null }> {
  const { data } = await supabase
    .from("avaliacao_canais").select("nome").eq("id", id).maybeSingle();
  return { nome: (data?.nome as string) || null };
}

// ── Canais avulsos (ex.: cupom da NF) ────────────────────────────────────────
export async function fetchCanaisScore(): Promise<CanalScore[]> {
  const [{ data: canais, error }, { data: scans }] = await Promise.all([
    supabase.from("avaliacao_canais").select("*").order("created_at"),
    supabase.from("avaliacao_scans").select("canal_id").not("canal_id", "is", null),
  ]);
  if (error) throw error;

  const contagem = new Map<string, number>();
  for (const s of (scans || [])) {
    const k = String(s.canal_id);
    contagem.set(k, (contagem.get(k) || 0) + 1);
  }
  return (canais || []).map((c) => ({
    ...(c as AvaliacaoCanal),
    scans: contagem.get(c.id as string) || 0,
  }));
}

export async function criarCanal(nome: string): Promise<void> {
  const { error } = await supabase.from("avaliacao_canais").insert([{ nome: nome.trim() }]);
  if (error) {
    console.error("[criarCanal] Erro Supabase:", JSON.stringify(error, null, 2));
    throw new Error(error.message || JSON.stringify(error));
  }
}

export async function removerCanal(id: string): Promise<void> {
  const { error } = await supabase.from("avaliacao_canais").delete().eq("id", id);
  if (error) throw error;
}

// ── Placar (tela de Marketing) ───────────────────────────────────────────────
interface SellerLite { operator_code: string; name: string; avatar?: string | null }

export async function fetchScoreboard(sellers: SellerLite[]): Promise<VendedorScore[]> {
  const [{ data: scans }, { data: reviews }] = await Promise.all([
    supabase.from("avaliacao_scans").select("vendedor_cod,cliente_nome,cliente_telefone"),
    supabase.from("avaliacao_reviews").select("vendedor_cod,matched_at"),
  ]);

  const norm = (c: string | null | undefined) => String(c || "").trim();

  const porVendedor = new Map<string, VendedorScore>();
  for (const s of sellers) {
    porVendedor.set(norm(s.operator_code), {
      vendedor_cod: s.operator_code,
      vendedor_nome: s.name,
      avatar: s.avatar,
      scans: 0, identificados: 0, confirmadas: 0,
    });
  }

  for (const sc of (scans || [])) {
    const row = porVendedor.get(norm(sc.vendedor_cod));
    if (!row) continue;
    row.scans++;
    if (sc.cliente_nome || sc.cliente_telefone) row.identificados++;
  }

  // Só avaliação confirmada (matched_at) conta ponto.
  for (const rv of (reviews || [])) {
    if (!rv.matched_at) continue;
    const row = porVendedor.get(norm(rv.vendedor_cod));
    if (row) row.confirmadas++;
  }

  return [...porVendedor.values()].sort((a, b) =>
    b.confirmadas - a.confirmadas || b.scans - a.scans
  );
}

// ── Confirmação manual (Camada 2 sem integração) ────────────────────────────
// Enquanto o Google não está conectado, o gestor registra a avaliação na mão e
// já a marca como confirmada — é o que dá o ponto ao vendedor.
export async function confirmarAvaliacaoManual(input: {
  vendedor_cod: string;
  star_rating: number | null;
  reviewer_name?: string | null;
  comment?: string | null;
  review_create_date?: string | null;
  scan_id?: string | null;
  matched_by?: string | null;
}): Promise<void> {
  // review_id é PK. Prefixo "manual-" separa das reviews reais que o Google
  // trará depois (id do Google), evitando colisão e deixando rastreável a origem.
  const reviewId = `manual-${crypto.randomUUID()}`;
  const { error } = await supabase.from("avaliacao_reviews").insert([{
    review_id: reviewId,
    star_rating: input.star_rating,
    reviewer_name: input.reviewer_name || null,
    comment: input.comment || null,
    review_create_date: input.review_create_date || new Date().toISOString().slice(0, 10),
    vendedor_cod: input.vendedor_cod,
    scan_id: input.scan_id || null,
    matched_at: new Date().toISOString(),
    matched_by: input.matched_by || null,
  }]);
  if (error) throw error;

  // Se veio de um scan, marca o scan como casado (fecha o ciclo).
  if (input.scan_id) {
    await supabase.from("avaliacao_scans")
      .update({ review_id: reviewId, matched_at: new Date().toISOString() })
      .eq("id", input.scan_id);
  }
}

export async function fetchReviews(): Promise<AvaliacaoReview[]> {
  const { data, error } = await supabase
    .from("avaliacao_reviews").select("*").order("matched_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data || []) as AvaliacaoReview[];
}

export async function removerReview(reviewId: string): Promise<void> {
  // Solta o scan que estava casado, para ele voltar a poder ser confirmado.
  await supabase.from("avaliacao_scans")
    .update({ review_id: null, matched_at: null }).eq("review_id", reviewId);
  const { error } = await supabase.from("avaliacao_reviews").delete().eq("review_id", reviewId);
  if (error) throw error;
}

// Scans identificados (cliente deixou nome/telefone) ainda não casados — ajudam
// o gestor a achar a qual atendimento a avaliação nova corresponde.
export async function fetchScansPendentes(): Promise<AvaliacaoScan[]> {
  const { data, error } = await supabase
    .from("avaliacao_scans")
    .select("*")
    .is("matched_at", null)
    .or("cliente_nome.not.is.null,cliente_telefone.not.is.null")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []) as AvaliacaoScan[];
}

// Colaboradores da campanha: todos os ativos das empresas Carflax, Zelex e JCM
// (Consultoria é excluída). Precisam ter operator_code preenchido para ter QR.
export async function fetchVendedoresCampanha(): Promise<SellerLite[]> {
  const { data, error } = await supabase
    .from("usuarios")
    .select("name,operator_code,avatar,company,status")
    .eq("status", "ativo")
    .not("operator_code", "is", null)
    .in("company", ["Carflax", "Zelex", "JCM"])
    .order("name");
  if (error) throw error;

  return (data || []).map((u) => ({
    operator_code: String(u.operator_code),
    name: u.name as string,
    avatar: (u.avatar as string) || null,
  }));
}

