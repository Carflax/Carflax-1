// Base da Taxa de Conversão por vendedor em um período.
//
// Mesma conta da tela Comercial > Orçamentos, para os dois lugares baterem:
//
//   conversão = (faturado + pedidos em aberto) ÷ (total orçado − desconsiderado)
//
// "Desconsiderado" são as perdas por MÃO DE OBRA E MATERIAL, que não representam
// perda comercial e por isso saem da base.
//
// Fica em módulo próprio porque dois lugares precisam do mesmo cálculo com períodos
// diferentes: o App monta o do mês corrente para o painel, e o modal "Todos os
// Vendedores" remonta para o mês que o usuário filtrar.
import { apiCrmOrcamentos } from "@/lib/api";
import { getCrmStatusMap } from "@/lib/crm-service";
import { dedupeOrcamentos, statusPadraoErp } from "@/lib/orcamentos-dedupe";

export interface ConversaoBase {
  /** Soma de todos os orçamentos do vendedor no período. */
  orcado: number;
  /** Quanto foi perdido (qualquer motivo) — usado só para exibição. */
  perdido: number;
  /** Perdas por mão de obra e material, descontadas da base. */
  desconsiderado: number;
}

export const MOTIVOS_NAO_COMERCIAIS = ["MÃO DE OBRA E MATERIAL", "MAO DE OBRA E MATERIAL"];

const vazio = (): ConversaoBase => ({ orcado: 0, perdido: 0, desconsiderado: 0 });

export async function buildConversaoMap(inicio: string, fim: string): Promise<Map<string, ConversaoBase>> {
  const bruto = await apiCrmOrcamentos({ inicio, fim }).catch(() => null);
  if (!bruto || bruto.length === 0) return new Map();
  // Mesmo conjunto que a tela de Orçamentos exibe — sem isso a base fica maior
  // (documentos repetidos entre lojas e orçamentos migrados que já viraram venda).
  const orcData = dedupeOrcamentos(bruto);

  const docs = orcData.map((r) => r.ORCAMENTO);
  const statusMap = await getCrmStatusMap(docs);
  const map = new Map<string, ConversaoBase>();

  for (const r of orcData) {
    const crm = statusMap.get(r.ORCAMENTO?.trim());
    let status = statusPadraoErp(r);
    if (crm?.status_crm) status = crm.status_crm;

    // Mesmo valor que a tela de Orçamentos usa como `totalValue`.
    const valor = parseFloat(r.VALOR_TOTAL_ORCAMENTO) || 0;
    const cod = String(r.COD_VENDEDOR || "").trim();
    const acc = map.get(cod) || vazio();
    acc.orcado += valor;

    if (status === "PERDIDO") {
      acc.perdido += valor;
      // Motivo do ERP tem precedência; o do CRM entra quando o ERP não trouxe.
      const motivo = (r.MOTIVO_CANCELAMENTO !== "SEM MOTIVO" ? r.MOTIVO_CANCELAMENTO : crm?.motivo_perda) || "";
      if (MOTIVOS_NAO_COMERCIAIS.includes(motivo.toUpperCase().trim())) acc.desconsiderado += valor;
    }
    map.set(cod, acc);
  }

  // Linha "MEDIA" = loja inteira, usada pelo card agregado.
  const total = vazio();
  map.forEach((v) => {
    total.orcado += v.orcado;
    total.perdido += v.perdido;
    total.desconsiderado += v.desconsiderado;
  });
  map.set("MEDIA", total);

  return map;
}
