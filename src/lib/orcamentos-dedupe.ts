// Deduplicação da lista de orçamentos do ERP.
//
// Vive aqui, e não dentro da tela, porque a Tx de Conversão do painel precisa
// somar exatamente o mesmo conjunto que a tela Comercial > Orçamentos exibe.
// Sem isso o painel somava 1.072 orçamentos onde a tela mostra 1.058, e as duas
// telas apresentavam taxas de conversão diferentes para o mesmo mês.
import type { CrmOrcamento } from "@/lib/api";

/** Status que o ERP sugere, antes de qualquer override do CRM. */
export function statusPadraoErp(r: CrmOrcamento): string {
  if (r.MOTIVO_CANCELAMENTO !== "SEM MOTIVO") return "PERDIDO";
  if (r.PEDIDO === "Sim" || r.NOTA_FISCAL || (r.DATA_BAIXA && r.DATA_BAIXA !== "SEM DATA")) return "VENDA";
  return "EMITIDO";
}

const normDoc = (s?: string) => String(s || "").split("-")[0].replace(/\D/g, "").padStart(12, "0");

export function dedupeOrcamentos(raw: CrmOrcamento[]): CrmOrcamento[] {
  // 1) Mesmo documento em lojas diferentes → mantém o de status mais avançado.
  const statusPriority: Record<string, number> = { VENDA: 3, PERDIDO: 2 };
  const byDoc = new Map<string, CrmOrcamento>();
  for (const r of raw) {
    const key = String(r.ORCAMENTO || "").trim();
    const existing = byDoc.get(key);
    if (!existing) {
      byDoc.set(key, r);
    } else if ((statusPriority[statusPadraoErp(r)] || 0) > (statusPriority[statusPadraoErp(existing)] || 0)) {
      byDoc.set(key, r);
    }
  }

  // 2) Orçamento "migrado" entre empresas: um orçamento faturado guarda em
  // DOC_GERADO (FGO_NUMFAT) o pedido/venda que gerou. Se esse número aparece como
  // outro documento da lista, a origem (ainda em aberto) some — fica o resultado.
  const lista = Array.from(byDoc.values());
  const idsPresentes = new Set(lista.map((r) => normDoc(r.ORCAMENTO)));
  return lista.filter((r) => {
    const status = statusPadraoErp(r);
    if (status === "VENDA" || status === "PERDIDO") return true; // nunca esconde definitivo
    const gerado = r.DOC_GERADO;
    if (!gerado) return true;
    const g = normDoc(gerado);
    if (g === normDoc(r.ORCAMENTO)) return true; // aponta pra si mesmo
    return !idsPresentes.has(g);
  });
}
