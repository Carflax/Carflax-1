// ── Como abordar o cliente ───────────────────────────────────────────────────
// Regras (sem IA) que transformam o contexto do ERP em leitura rápida para o
// vendedor: o que está acontecendo, o que fazer e uma frase para abrir a conversa.

import type { ProspeccaoContexto, ProspeccaoProduto } from "@/lib/api";
import { fmtBRLCompact } from "../clientes/frv-utils";
import type { ProspeccaoDia } from "./prospeccao-dia";

export interface Abordagem {
  /** Fatos do ERP que explicam o card. */
  leitura: string[];
  /** O que o vendedor pode fazer/perguntar. */
  sugestoes: string[];
  /** Frase pronta para iniciar a conversa. */
  abertura: string;
  /** Rascunhos para os campos do registro (viram placeholder). */
  rascunho: { oportunidade?: string; risco?: string; potencial?: string; necessidade?: string };
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "TUBO SOLD PVC 110MM (98535) AMANCO" → "Tubo sold PVC 110MM" */
export function nomeProduto(p: Pick<ProspeccaoProduto, "descricao" | "marca">): string {
  let d = (p.descricao || "").split(" (")[0].trim();
  if (p.marca && d.toUpperCase().endsWith(` ${p.marca.toUpperCase()}`)) d = d.slice(0, -p.marca.length - 1).trim();
  // Só a primeira letra maiúscula; medidas e siglas (com dígito ou até 3 letras) ficam como no ERP.
  return d
    .split(" ")
    .filter(Boolean)
    .map((w, i) => (/\d/.test(w) || (w.length <= 3 && i > 0) ? w : i === 0 ? w[0] + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(" ");
}

/** Nome curto para falar ao telefone: "Uniao PPR verde c/flange…" → "união PPR". */
function assuntoCurto(p: Pick<ProspeccaoProduto, "descricao" | "marca">): string {
  const [primeira = "", segunda = ""] = nomeProduto(p).split(" ");
  const alvo = /\d/.test(segunda) ? primeira : `${primeira} ${segunda}`;
  return alvo.trim().replace(/^\S/, (c) => c.toLowerCase()).replace(/^uniao\b/, "união");
}

const fmtData = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const mesAno = (iso: string) => {
  const [y, m] = iso.split("-");
  return `${MESES[Number(m) - 1]} de ${y}`;
};

const lista = (itens: string[]) =>
  itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;

export function gerarAbordagem(p: ProspeccaoDia, ctx: ProspeccaoContexto, vendedor: string): Abordagem {
  const leitura: string[] = [];
  const sugestoes: string[] = [];
  const rascunho: Abordagem["rascunho"] = {};
  const primeiroNome = vendedor.split(" ")[0]?.toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) || "";

  const caindo = ctx.marcas
    .filter((m) => m.valor_3m_anterior >= 1000 && m.valor_3m < m.valor_3m_anterior * 0.5)
    .sort((a, b) => b.valor_3m_anterior - b.valor_3m - (a.valor_3m_anterior - a.valor_3m));
  const subindo = ctx.marcas
    .filter((m) => m.valor_3m >= 1000 && m.valor_3m > m.valor_3m_anterior * 1.5)
    .sort((a, b) => b.valor_3m - b.valor_3m_anterior - (a.valor_3m - a.valor_3m_anterior));
  const abertos = ctx.orcamentos.filter((o) => o.status === "aberto");
  const perdidos = ctx.orcamentos.filter((o) => o.status === "perdido");
  const parou = ctx.parou_de_comprar.slice(0, 3);
  const agora = ctx.comprando_agora.slice(0, 3);
  const top = ctx.mais_comprados_12m.slice(0, 3);
  const marcasCompradas = ctx.marcas.filter((m) => m.valor_12m > 0);

  // ── Leitura (fatos) ──
  for (const m of caindo.slice(0, 2)) {
    leitura.push(`${m.marca} caiu de ${fmtBRLCompact(m.valor_3m_anterior)} para ${fmtBRLCompact(m.valor_3m)} no último trimestre.`);
  }
  for (const m of subindo.slice(0, 2)) {
    leitura.push(`${m.marca} subiu para ${fmtBRLCompact(m.valor_3m)} no trimestre (antes ${fmtBRLCompact(m.valor_3m_anterior)}).`);
  }
  if (abertos.length) {
    const soma = abertos.reduce((s, o) => s + o.valor, 0);
    leitura.push(`${abertos.length} orçamento(s) em aberto somando ${fmtBRLCompact(soma)}.`);
  }
  if (perdidos.length) {
    const maior = [...perdidos].sort((a, b) => b.valor - a.valor)[0];
    leitura.push(
      perdidos.length === 1
        ? `Orçamento ${maior.numero} de ${fmtBRLCompact(maior.valor)} (${fmtData(maior.data)}) foi baixado sem venda.`
        : `${perdidos.length} orçamentos baixados sem venda nos últimos 90 dias (maior: ${fmtBRLCompact(maior.valor)}).`,
    );
  }

  // ── Sugestões por motivo ──
  if (p.pilar === "risco") {
    if (caindo[0]) {
      const m = caindo[0];
      sugestoes.push(`Pergunte sobre ${m.marca}: por trimestre era ${fmtBRLCompact(m.valor_3m_anterior)}, agora ${fmtBRLCompact(m.valor_3m)}. A obra acabou ou está comprando em outro lugar?`);
      rascunho.risco = `Queda em ${m.marca}. Verificar se está comprando da concorrência.`;
    }
    if (parou.length) {
      sugestoes.push(`Ofereça reposição do que o cliente levava e parou: ${lista(parou.map(nomeProduto))}.`);
    }
    if (perdidos.length) {
      rascunho.risco ??= "Orçamento recente perdido. Entender o motivo.";
    }
    if (!sugestoes.length && p.metricas.cadencia_dias) {
      sugestoes.push(`O cliente costuma pedir a cada ~${p.metricas.cadencia_dias} dias. Ligue para a reposição do que sempre leva: ${lista(top.map(nomeProduto))}.`);
    }
  }

  if (p.pilar === "oportunidade") {
    if (subindo.length) {
      sugestoes.push(`Está comprando mais ${lista(subindo.slice(0, 2).map((m) => m.marca))}. Pergunte qual obra ou projeto está em andamento e o que mais vai precisar.`);
      rascunho.necessidade = `Aumento em ${subindo[0].marca}: confirmar obra/projeto em andamento.`;
    }
    if (marcasCompradas.length <= 5) {
      sugestoes.push(`Compra só ${marcasCompradas.length} marca(s) com a gente (${lista(marcasCompradas.slice(0, 3).map((m) => m.marca))}). Pergunte o que mais usa e de quem compra hoje.`);
      rascunho.oportunidade = "Ampliar mix: levantar o que ele compra de outros fornecedores.";
    }
    if (parou.length) {
      sugestoes.push(`Parou de levar ${lista(parou.slice(0, 2).map(nomeProduto))}. Ofereça junto no próximo pedido.`);
    }
    rascunho.potencial = `Hoje: ${fmtBRLCompact(p.metricas.valor_12m)} em 12 meses.`;
  }

  if (p.pilar === "reativacao") {
    if (ctx.ultima_compra) {
      sugestoes.push(`Última compra em ${fmtData(ctx.ultima_compra.data)}: ${lista(ctx.ultima_compra.itens.slice(0, 3).map(nomeProduto))}. Comece a conversa por aí.`);
    } else if (!p.metricas.ultima_compra) {
      sugestoes.push(`Cadastrado${ctx.data_cadastro ? ` em ${fmtData(ctx.data_cadastro)}` : ""} e nunca comprou. Descubra o ramo, o que eles usam e quem decide a compra.`);
      rascunho.oportunidade = "Primeira venda: entender ramo e necessidade.";
    } else {
      sugestoes.push(`Sem compras nos últimos 12 meses (última em ${fmtData(p.metricas.ultima_compra)}). Pergunte o que mudou: fornecedor, preço ou fim da obra?`);
    }
    if (p.metricas.ultima_compra) {
      sugestoes.push("Não abra com oferta. Primeiro entenda por que parou.");
      rascunho.risco = "Cliente parado. Entender o motivo antes de ofertar.";
    }
  }

  if (p.pilar === "relacionamento" && top.length) {
    sugestoes.push(`Confirme se está tudo certo com os últimos pedidos (${lista(top.slice(0, 2).map(nomeProduto))}) e se tem algo previsto para os próximos meses.`);
  }

  if (perdidos.length) {
    sugestoes.push(
      perdidos.length === 1
        ? "Descubra por que o orçamento não virou pedido: preço, prazo de entrega ou falta de produto?"
        : `${perdidos.length} orçamentos não viraram pedido. Pergunte o que faltou: preço, prazo ou produto?`,
    );
  }

  if (abertos.length) {
    const maisRecente = abertos[0];
    sugestoes.push(`Retome o orçamento ${maisRecente.numero} de ${fmtBRLCompact(maisRecente.valor)} (${fmtData(maisRecente.data)}).`);
  }

  // ── Frase de abertura ──
  const eu = primeiroNome ? `Aqui é ${primeiroNome}, da Carflax` : "Aqui é da Carflax";
  let abertura: string;
  if (p.pilar === "risco" && (parou[0] || caindo[0])) {
    const assunto = parou[0] ? assuntoCurto(parou[0]) : caindo[0].marca;
    abertura = `Oi, tudo bem? ${eu}. Vi que faz um tempo que vocês não pedem ${assunto} com a gente. Mudou alguma coisa aí na demanda?`;
  } else if (p.pilar === "oportunidade" && agora[0]) {
    abertura = `Oi, tudo bem? ${eu}. Tudo certo com o ${assuntoCurto(agora[0])} que vocês levaram? Queria entender o que vocês têm previsto para os próximos meses para já deixar separado.`;
  } else if (p.pilar === "reativacao" && ctx.ultima_compra?.itens[0]) {
    abertura = `Oi, tudo bem? ${eu}. Vocês compraram ${assuntoCurto(ctx.ultima_compra.itens[0])} com a gente em ${mesAno(ctx.ultima_compra.data)}. Ainda usam? Queria entender como posso ajudar vocês hoje.`;
  } else if (p.pilar === "reativacao") {
    abertura = `Oi, tudo bem? ${eu}. Vocês têm cadastro com a gente, mas ainda não fizemos negócio. O que vocês mais compram de material elétrico e hidráulico hoje?`;
  } else {
    abertura = `Oi, tudo bem? ${eu}. Estou passando para saber se está tudo certo com os últimos pedidos e se tem algo previsto para as próximas semanas.`;
  }

  return { leitura, sugestoes: sugestoes.slice(0, 4), abertura, rascunho };
}

/** Pergunta pronta para o chat de IA da carteira. */
export function promptIA(p: ProspeccaoDia, a: Abordagem): string {
  return [
    `Estou preparando a abordagem de ${p.nome_cliente} (${p.motivo})`,
    a.leitura.length ? `Contexto: ${a.leitura.join(" ")}` : "",
    "Monte um roteiro curto de ligação: abertura, 3 perguntas para descobrir necessidade e uma oferta coerente com o que ele compra.",
  ].filter(Boolean).join("\n");
}
