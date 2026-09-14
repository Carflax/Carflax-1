// ── Prospecção do dia ────────────────────────────────────────────────────────
// Escolhe 3 clientes da carteira do vendedor, cada um por um motivo diferente,
// e grava no Supabase para a escolha valer o dia inteiro, em qualquer máquina.

import { supabase } from "@/lib/supabase";
import { apiProspeccaoCandidatos, type ProspeccaoCandidato } from "@/lib/api";
import { fmtBRLCompact } from "../clientes/frv-utils";

export type Pilar = "risco" | "oportunidade" | "reativacao" | "relacionamento";

export interface ProspeccaoDia {
  id: string;
  data: string;
  cod_vendedor: string;
  cliente_id: string;
  nome_cliente: string;
  ordem: 1 | 2 | 3;
  pilar: Pilar;
  motivo: string;
  metricas: Metricas;
  telefone: string | null;
  oportunidade: string | null;
  risco: string | null;
  potencial: string | null;
  necessidade: string | null;
  acao: string | null;
  proximo_passo: string | null;
  proximo_contato: string | null;
  proximo_contato_feito: boolean;
  concluido_em: string | null;
  concluido_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface Metricas {
  valor_12m: number;
  pedidos_12m: number;
  margem_12m: number;
  valor_3m: number;
  valor_3m_anterior: number;
  marcas_12m: number;
  ultima_compra: string | null;
  recencia_dias: number | null;
  cadencia_dias: number | null;
}

export const PILARES: Record<Pilar, { label: string; descricao: string; cor: string }> = {
  risco: {
    label: "Risco de perda",
    descricao: "Está comprando menos ou atrasou a recompra.",
    cor: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/25",
  },
  oportunidade: {
    label: "Oportunidade",
    descricao: "Cliente ativo com espaço para crescer em mix ou frequência.",
    cor: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
  },
  reativacao: {
    label: "Reativação",
    descricao: "Parado há meses. Descobrir o motivo e trazer de volta.",
    cor: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/25",
  },
  relacionamento: {
    label: "Relacionamento",
    descricao: "Cliente importante da carteira. Manter proximidade.",
    cor: "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/25",
  },
};

/** Os 6 campos do trabalho de carteira, na ordem em que o vendedor preenche. */
export const CAMPOS = [
  { key: "oportunidade", label: "Oportunidade", dica: "Onde existe potencial de venda ou crescimento?" },
  { key: "risco", label: "Risco", dica: "O que pode fazer o cliente comprar menos ou ir para a concorrência? Quem atende hoje?" },
  { key: "potencial", label: "Potencial", dica: "Quanto ele pode comprar vs. quanto compra hoje?" },
  { key: "necessidade", label: "Necessidade", dica: "Obras, projetos, expansões ou compras previstas." },
  { key: "acao", label: "Ação", dica: "O que você vai fazer por este cliente?" },
] as const;

// Quem apareceu nesse intervalo não volta, enquanto houver outra opção.
const DIAS_SEM_REPETIR = 30;
const DIAS_SEM_REPETIR_MINIMO = 7;
const DIA_MS = 86_400_000;

export const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const somarDias = (iso: string, dias: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const r = new Date(y, m - 1, d + dias);
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, "0")}-${String(r.getDate()).padStart(2, "0")}`;
};

const diasDesde = (iso: string | null, hoje: string) =>
  iso ? Math.max(0, Math.round((Date.parse(hoje) - Date.parse(iso.slice(0, 10))) / DIA_MS)) : null;

const fmtDataCurta = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export function calcularMetricas(c: ProspeccaoCandidato, hoje: string): Metricas {
  const recencia = diasDesde(c.ultima_compra, hoje);
  // Cadência só com 3+ pedidos: com 2 o intervalo é um acaso, não um hábito.
  let cadencia: number | null = null;
  if (c.pedidos_12m >= 3 && c.primeira_12m && c.ultima_compra) {
    const span = (Date.parse(c.ultima_compra) - Date.parse(c.primeira_12m)) / DIA_MS;
    cadencia = Math.max(1, Math.round(span / (c.pedidos_12m - 1)));
  }
  return {
    valor_12m: c.valor_12m,
    pedidos_12m: c.pedidos_12m,
    margem_12m: c.margem_12m,
    valor_3m: c.valor_3m,
    valor_3m_anterior: c.valor_3m_anterior,
    marcas_12m: c.marcas_12m,
    ultima_compra: c.ultima_compra,
    recencia_dias: recencia,
    cadencia_dias: cadencia,
  };
}

interface Escolha {
  candidato: ProspeccaoCandidato;
  pilar: Pilar;
  motivo: string;
  metricas: Metricas;
}

type Avaliador = (c: ProspeccaoCandidato, m: Metricas) => { score: number; motivo: string } | null;

const AVALIADORES: Record<Exclude<Pilar, "relacionamento">, Avaliador> = {
  // Comprava com regularidade e atrasou, ou as compras caíram forte no trimestre.
  risco: (_c, m) => {
    if (m.pedidos_12m < 2 || m.recencia_dias === null || m.recencia_dias > 365) return null;
    const limiteAtraso = Math.max(30, (m.cadencia_dias ?? 45) * 1.5);
    const atrasado = m.recencia_dias >= limiteAtraso;
    const queda = m.valor_3m_anterior >= 500 ? (m.valor_3m - m.valor_3m_anterior) / m.valor_3m_anterior : 0;
    if (!atrasado && queda > -0.3) return null;

    const peso = atrasado ? Math.min(3, m.recencia_dias / limiteAtraso) : 1 + Math.min(1, -queda);
    const motivo = atrasado
      ? m.cadencia_dias
        ? `Comprava a cada ~${m.cadencia_dias} dias e está há ${m.recencia_dias} dias sem comprar.`
        : `Está há ${m.recencia_dias} dias sem comprar. Faturou ${fmtBRLCompact(m.valor_12m)} em 12 meses.`
      : `Compras caíram ${Math.round(-queda * 100)}% no último trimestre (${fmtBRLCompact(m.valor_3m_anterior)} → ${fmtBRLCompact(m.valor_3m)}).`;
    return { score: m.valor_12m * peso, motivo };
  },

  // Ativo e relevante, mas comprando poucas marcas ou crescendo: dá para ampliar.
  oportunidade: (_c, m) => {
    if (m.pedidos_12m < 2 || m.recencia_dias === null || m.recencia_dias > 60) return null;
    // Base mínima: sair de R$ 30 para R$ 900 não é "cresceu 2900%".
    const crescimento = m.valor_3m_anterior >= 1000 ? (m.valor_3m - m.valor_3m_anterior) / m.valor_3m_anterior : 0;
    const score = (m.valor_12m / Math.sqrt(Math.max(1, m.marcas_12m))) * (1 + Math.min(1, Math.max(0, crescimento)));
    const motivo = crescimento >= 0.2
      ? `Compras subiram de ${fmtBRLCompact(m.valor_3m_anterior)} para ${fmtBRLCompact(m.valor_3m)} no último trimestre. Bom momento para ampliar mix e frequência.`
      : `Cliente ativo (${fmtBRLCompact(m.valor_12m)} em 12 meses) comprando ${m.marcas_12m} marca(s). Há espaço para aumentar o mix.`;
    return { score, motivo };
  },

  // Parado há 4+ meses. Quem parou há menos tempo e tem telefone vem primeiro.
  reativacao: (c, m) => {
    if (m.recencia_dias !== null && m.recencia_dias < 120) return null;
    const temFone = c.celular || c.telefone ? 1 : 0.3;
    const frescor = m.recencia_dias === null ? 0.2 : Math.max(0.2, 1 - m.recencia_dias / 1500);
    const motivo = m.ultima_compra
      ? `Sem comprar desde ${fmtDataCurta(m.ultima_compra)} (${m.recencia_dias} dias).`
      : "Cliente da carteira sem compra registrada.";
    return { score: temFone * frescor * (1 + m.valor_12m / 1000), motivo };
  },
};

/**
 * Função pura: dada a carteira e quem já apareceu recentemente, devolve até 3
 * escolhas com pilares diferentes. Pilar sem candidato vira "relacionamento".
 */
export function escolherDoDia(
  candidatos: ProspeccaoCandidato[],
  ultimaAparicao: Map<string, string>,
  hoje: string,
): Escolha[] {
  const metricas = new Map(candidatos.map((c) => [c.cliente_id, calcularMetricas(c, hoje)]));
  const escolhidos = new Set<string>();
  const out: Escolha[] = [];

  const disponivel = (c: ProspeccaoCandidato, janela: number) => {
    if (escolhidos.has(c.cliente_id)) return false;
    const ultima = ultimaAparicao.get(c.cliente_id);
    return !ultima || ultima < somarDias(hoje, -janela);
  };

  const melhor = (avaliar: Avaliador, janela: number) => {
    let top: { c: ProspeccaoCandidato; score: number; motivo: string } | null = null;
    for (const c of candidatos) {
      if (!disponivel(c, janela)) continue;
      const r = avaliar(c, metricas.get(c.cliente_id)!);
      if (r && (!top || r.score > top.score)) top = { c, ...r };
    }
    return top;
  };

  const relacionamento: Avaliador = (_c, m) => ({
    score: m.valor_12m + m.margem_12m,
    motivo: m.valor_12m > 0
      ? `Cliente da carteira com ${fmtBRLCompact(m.valor_12m)} em ${m.pedidos_12m} pedido(s) nos últimos 12 meses.`
      : "Cliente da carteira sem histórico recente. Conhecer a necessidade dele.",
  });

  for (const pilar of ["risco", "oportunidade", "reativacao"] as const) {
    const r =
      melhor(AVALIADORES[pilar], DIAS_SEM_REPETIR) ??
      melhor(AVALIADORES[pilar], DIAS_SEM_REPETIR_MINIMO) ??
      melhor(relacionamento, DIAS_SEM_REPETIR) ??
      melhor(relacionamento, DIAS_SEM_REPETIR_MINIMO);
    if (!r) continue;
    const pilarFinal = AVALIADORES[pilar](r.c, metricas.get(r.c.cliente_id)!) ? pilar : "relacionamento";
    escolhidos.add(r.c.cliente_id);
    out.push({ candidato: r.c, pilar: pilarFinal, motivo: r.motivo, metricas: metricas.get(r.c.cliente_id)! });
  }
  return out;
}

// ── Persistência ────────────────────────────────────────────────────────────

const COLUNAS = "*";

export async function carregarDia(codVendedor: string, data: string): Promise<ProspeccaoDia[]> {
  const { data: rows, error } = await supabase
    .from("carteira_prospeccao_diaria")
    .select(COLUNAS)
    .eq("cod_vendedor", codVendedor)
    .eq("data", data)
    .order("ordem");
  if (error) throw error;
  return (rows || []) as ProspeccaoDia[];
}

/** Garante os 3 do dia: se já existem, só lê; senão escolhe e grava. */
export async function garantirDia(codVendedor: string): Promise<ProspeccaoDia[]> {
  const hoje = hojeIso();
  const existentes = await carregarDia(codVendedor, hoje);
  if (existentes.length >= 3) return existentes;

  const [{ clientes }, { data: recentes, error }] = await Promise.all([
    apiProspeccaoCandidatos(codVendedor),
    supabase
      .from("carteira_prospeccao_diaria")
      .select("cliente_id, data")
      .eq("cod_vendedor", codVendedor)
      .gte("data", somarDias(hoje, -DIAS_SEM_REPETIR)),
  ]);
  if (error) throw error;

  const ultimaAparicao = new Map<string, string>();
  for (const r of recentes || []) {
    const atual = ultimaAparicao.get(r.cliente_id);
    if (!atual || r.data > atual) ultimaAparicao.set(r.cliente_id, r.data);
  }

  const ocupadas = new Set(existentes.map((e) => e.ordem));
  const livres = ([1, 2, 3] as const).filter((o) => !ocupadas.has(o));
  const escolhas = escolherDoDia(clientes, ultimaAparicao, hoje).slice(0, livres.length);

  if (escolhas.length) {
    const linhas = escolhas.map((e, i) => ({
      data: hoje,
      cod_vendedor: codVendedor,
      cliente_id: e.candidato.cliente_id,
      nome_cliente: e.candidato.nome_cliente,
      ordem: livres[i],
      pilar: e.pilar,
      motivo: e.motivo,
      metricas: e.metricas,
      telefone: e.candidato.celular || e.candidato.telefone,
    }));
    // Duas abas abertas ao mesmo tempo: a segunda cai no unique e só relê.
    const { error: errIns } = await supabase
      .from("carteira_prospeccao_diaria")
      .upsert(linhas, { onConflict: "data,cod_vendedor,ordem", ignoreDuplicates: true });
    if (errIns) throw errIns;
  }
  return carregarDia(codVendedor, hoje);
}

export async function salvarProspeccao(id: string, patch: Partial<ProspeccaoDia>) {
  const { data, error } = await supabase
    .from("carteira_prospeccao_diaria")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLUNAS)
    .single();
  if (error) throw error;
  return data as ProspeccaoDia;
}

/** Próximos contatos combinados em prospecções anteriores e ainda não feitos. */
export async function carregarAgenda(codVendedor: string): Promise<ProspeccaoDia[]> {
  const { data, error } = await supabase
    .from("carteira_prospeccao_diaria")
    .select(COLUNAS)
    .eq("cod_vendedor", codVendedor)
    .not("proximo_contato", "is", null)
    .eq("proximo_contato_feito", false)
    .lt("data", hojeIso())
    .order("proximo_contato")
    .limit(50);
  if (error) throw error;
  return (data || []) as ProspeccaoDia[];
}

/** Resumo das últimas semanas para o gestor acompanhar a disciplina. */
export async function carregarHistorico(codVendedor: string, dias = 28): Promise<ProspeccaoDia[]> {
  const { data, error } = await supabase
    .from("carteira_prospeccao_diaria")
    .select(COLUNAS)
    .eq("cod_vendedor", codVendedor)
    .gte("data", somarDias(hojeIso(), -dias))
    .lt("data", hojeIso())
    .order("data", { ascending: false })
    .order("ordem");
  if (error) throw error;
  return (data || []) as ProspeccaoDia[];
}
