import { supabase } from "@/lib/supabase";
import { apiPosVendaVendas, type PosVendaClienteDia } from "@/lib/api";
import {
  CONFIG_PADRAO,
  fmtData,
  somarDias,
  type HubUser,
  type PosVendaConfig,
  type PosVendaContato,
  type Segmento,
} from "./types";

// ── Configuração ────────────────────────────────────────────────────────────

export async function carregarConfig(): Promise<PosVendaConfig> {
  const { data, error } = await supabase.from("pos_venda_config").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return { ...CONFIG_PADRAO, ...(data || {}) };
}

export async function salvarConfig(config: PosVendaConfig, userId?: string) {
  const { error } = await supabase
    .from("pos_venda_config")
    .upsert({ id: 1, ...config, updated_at: new Date().toISOString(), updated_by: userId || null });
  if (error) throw error;
}

export async function carregarUsuarios(): Promise<HubUser[]> {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, name, avatar, role, department, operator_code")
    .eq("status", "ativo")
    .order("name");
  if (error) throw error;
  return data || [];
}

// ── Vendedor → usuário e carteira ───────────────────────────────────────────
// Casa pelo código exato primeiro: vendedor "050" e motorista "00050" viram o
// mesmo número sem os zeros (ver avatar-by-code.ts).

const semZeros = (s: string) => s.replace(/^0+/, "") || s;

export function criarResolverVendedor(usuarios: HubUser[]) {
  const exato = new Map<string, HubUser>();
  const normal = new Map<string, HubUser[]>();
  for (const u of usuarios) {
    const cod = String(u.operator_code ?? "").trim();
    if (!cod) continue;
    exato.set(cod, u);
    const n = semZeros(cod);
    normal.set(n, [...(normal.get(n) || []), u]);
  }
  return (codigo?: string | null): HubUser | undefined => {
    const c = String(codigo ?? "").trim();
    if (!c) return undefined;
    if (exato.has(c)) return exato.get(c);
    const candidatos = normal.get(semZeros(c));
    return candidatos?.length === 1 ? candidatos[0] : undefined;
  };
}

/** Carteira pelo cargo do vendedor; cargo misto ou desconhecido cai no tipo de pessoa. */
export function segmentoDaVenda(vendedor: HubUser | undefined, tipoPessoa: string | null): Segmento {
  const role = vendedor?.role?.toUpperCase() || "";
  const b2b = role.includes("B2B");
  const b2c = role.includes("B2C");
  if (b2b && !b2c) return "B2B";
  if (b2c && !b2b) return "B2C";
  return tipoPessoa === "PJ" ? "B2B" : "B2C";
}

// ── Lista do dia ────────────────────────────────────────────────────────────

const STATUS_NA_FILA = ["pendente", "a_ligar", "retornar"];

export async function carregarContatosDoDia(dataVenda: string): Promise<PosVendaContato[]> {
  const { data, error } = await supabase
    .from("pos_venda_contatos")
    .select("*")
    .eq("data_venda", dataVenda)
    .order("prioridade", { ascending: true, nullsFirst: false })
    .order("valor_total", { ascending: false });
  if (error) throw error;
  return (data || []) as PosVendaContato[];
}

/**
 * Traz as vendas do dia do ERP e grava no Supabase quem ainda não está lá.
 * Idempotente: quem já foi gravado (e possivelmente mexido pelo gestor) não é
 * sobrescrito.
 */
export async function sincronizarDia(
  dataVenda: string,
  config: PosVendaConfig,
  usuarios: HubUser[],
): Promise<{ novos: number; totalVendas: number }> {
  const resp = await apiPosVendaVendas(dataVenda, {
    recorrencia_pedidos: config.recorrencia_pedidos,
    recorrencia_dias: config.recorrencia_dias,
    pouco_historico: config.pouco_historico_pedidos,
  });
  const clientes = resp.clientes;
  if (!clientes.length) return { novos: 0, totalVendas: 0 };

  const codigos = clientes.map((c) => c.cod_cliente);
  const [{ data: existentesDia }, { data: historico }] = await Promise.all([
    supabase.from("pos_venda_contatos").select("cod_cliente").eq("data_venda", dataVenda),
    supabase
      .from("pos_venda_contatos")
      .select("cod_cliente, data_venda, status, contatado_em")
      .in("cod_cliente", codigos)
      .neq("data_venda", dataVenda)
      .or(`status.in.(${STATUS_NA_FILA.join(",")}),contatado_em.gte.${somarDias(dataVenda, -config.dias_sem_recontato)}`),
  ]);

  const jaGravados = new Set((existentesDia || []).map((r) => r.cod_cliente));
  const historicoPorCliente = new Map<string, { data_venda: string; status: string; contatado_em: string | null }>();
  for (const h of historico || []) historicoPorCliente.set(h.cod_cliente, h);

  const resolver = criarResolverVendedor(usuarios);
  const linhas = clientes
    .filter((c) => !jaGravados.has(c.cod_cliente))
    .map((c) => montarLinha(c, dataVenda, resolver, historicoPorCliente.get(c.cod_cliente)));

  if (linhas.length) {
    const { error } = await supabase
      .from("pos_venda_contatos")
      .upsert(linhas, { onConflict: "data_venda,cod_cliente", ignoreDuplicates: true });
    if (error) throw error;
  }
  return { novos: linhas.length, totalVendas: clientes.length };
}

function montarLinha(
  c: PosVendaClienteDia,
  dataVenda: string,
  resolver: ReturnType<typeof criarResolverVendedor>,
  anterior?: { data_venda: string; status: string; contatado_em: string | null },
) {
  const vendedor = resolver(c.cod_vendedor);
  const sugerido = c.categoria === "primeira_compra" || c.categoria === "pouco_historico";

  let status: PosVendaContato["status"] = sugerido ? "pendente" : "fora";
  let motivo: string | null = sugerido ? null : c.categoria === "recorrente" ? "Compra com frequência" : "Cliente ativo";

  // Evita ligar duas vezes para o mesmo cliente.
  if (anterior) {
    status = "fora";
    motivo = STATUS_NA_FILA.includes(anterior.status)
      ? `Já está na lista de ${fmtData(anterior.data_venda)}`
      : `Contatado em ${fmtData(anterior.contatado_em)}`;
  }

  return {
    data_venda: dataVenda,
    segmento: segmentoDaVenda(vendedor, c.tipo_pessoa),
    cod_cliente: c.cod_cliente,
    cliente_nome: c.cliente,
    tipo_pessoa: c.tipo_pessoa,
    telefone: c.telefone,
    celular: c.celular,
    cidade: c.cidade,
    documentos: c.documentos,
    valor_total: c.valor,
    cod_vendedor: c.cod_vendedor,
    nome_vendedor: c.nome_vendedor,
    vendedor_user_id: vendedor?.id || null,
    categoria: c.categoria,
    pedidos_365d: c.pedidos_365d,
    pedidos_janela: c.pedidos_janela,
    prioridade: c.categoria === "primeira_compra" ? 1 : c.categoria === "pouco_historico" ? 2 : null,
    status,
    motivo_fora: motivo,
  };
}

export async function atualizarContato(id: string, patch: Partial<PosVendaContato>) {
  const { data, error } = await supabase
    .from("pos_venda_contatos")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as PosVendaContato;
}

export async function carregarAprovacoes(dataVenda: string) {
  const { data, error } = await supabase.from("pos_venda_listas").select("*").eq("data_venda", dataVenda);
  if (error) throw error;
  return (data || []) as { segmento: Segmento; aprovado_por: string | null; aprovado_em: string }[];
}

export async function aprovarLista(dataVenda: string, segmento: Segmento, userId?: string) {
  const { error: e1 } = await supabase
    .from("pos_venda_contatos")
    .update({ status: "a_ligar", updated_at: new Date().toISOString() })
    .eq("data_venda", dataVenda)
    .eq("segmento", segmento)
    .eq("status", "pendente");
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("pos_venda_listas")
    .upsert(
      { data_venda: dataVenda, segmento, aprovado_por: userId || null, aprovado_em: new Date().toISOString() },
      { onConflict: "data_venda,segmento" },
    );
  if (e2) throw e2;
}

// ── Consultas das abas ──────────────────────────────────────────────────────

export async function carregarFila(): Promise<PosVendaContato[]> {
  const { data, error } = await supabase
    .from("pos_venda_contatos")
    .select("*")
    .in("status", ["a_ligar", "retornar"])
    .order("prioridade", { ascending: true, nullsFirst: false })
    .order("data_venda", { ascending: true });
  if (error) throw error;
  return (data || []) as PosVendaContato[];
}

export async function carregarPeriodo(inicio: string, fim: string): Promise<PosVendaContato[]> {
  const todos: PosVendaContato[] = [];
  const PAGINA = 1000;
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from("pos_venda_contatos")
      .select("*")
      .gte("data_venda", inicio)
      .lte("data_venda", fim)
      .order("data_venda", { ascending: false })
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    todos.push(...((data || []) as PosVendaContato[]));
    if (!data || data.length < PAGINA) break;
  }
  return todos;
}

export async function carregarTratativas(): Promise<PosVendaContato[]> {
  const { data, error } = await supabase
    .from("pos_venda_contatos")
    .select("*")
    .not("tratativa_status", "is", null)
    .order("contatado_em", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []) as PosVendaContato[];
}

export async function carregarOportunidades(vendedorId?: string): Promise<PosVendaContato[]> {
  let q = supabase
    .from("pos_venda_contatos")
    .select("*")
    .eq("interesse_comercial", true)
    .order("contatado_em", { ascending: false })
    .limit(500);
  if (vendedorId) q = q.eq("vendedor_user_id", vendedorId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as PosVendaContato[];
}

export async function carregarReclamacoesPublicas(inicio: string, fim: string) {
  const { data, error } = await supabase
    .from("avaliacao_reviews")
    .select("star_rating, review_create_date")
    .gte("review_create_date", inicio)
    .lte("review_create_date", fim)
    .lte("star_rating", 2);
  if (error) return null;
  return (data || []).length;
}

// ── Avisos no HUB ───────────────────────────────────────────────────────────

export async function notificar(
  userId: string | null | undefined,
  tipo: "pos_venda_critico" | "pos_venda_insatisfeito" | "pos_venda_interesse",
  titulo: string,
  descricao: string,
  contatoId: string,
) {
  if (!userId) return false;
  const { error } = await supabase
    .from("hub_notificacoes")
    .insert({ user_id: userId, tipo, titulo, descricao, metadata: { contato_id: contatoId } });
  if (error) {
    console.error("[PosVenda] falha ao notificar:", error.message);
    return false;
  }
  return true;
}
