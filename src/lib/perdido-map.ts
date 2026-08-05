// Mapa de valor PERDIDO por vendedor em um período — denominador da Tx de Conversão
// (vendido / (vendido + perdido)).
//
// Fica em módulo próprio porque dois lugares precisam do mesmo cálculo com períodos
// diferentes: o App monta o do mês corrente para o painel, e o modal "Todos os
// Vendedores" remonta para o mês que o usuário filtrar.
import { apiCrmOrcamentos, mapCrmItem } from "@/lib/api";
import { getCrmStatusMap } from "@/lib/crm-service";

export async function buildPerdidoMap(inicio: string, fim: string): Promise<Map<string, number>> {
  const orcData = await apiCrmOrcamentos({ inicio, fim }).catch(() => null);
  if (!orcData || orcData.length === 0) return new Map();

  const docs = orcData.map((r) => r.ORCAMENTO);
  const statusMap = await getCrmStatusMap(docs);
  const map = new Map<string, number>();

  for (const r of orcData) {
    const crmStatus = statusMap.get(r.ORCAMENTO?.trim())?.status_crm;
    let status = "EMITIDO";
    if (r.MOTIVO_CANCELAMENTO !== "SEM MOTIVO") status = "PERDIDO";
    else if (r.PEDIDO === "Sim" || r.NOTA_FISCAL || (r.DATA_BAIXA && r.DATA_BAIXA !== "SEM DATA")) status = "VENDA";
    if (crmStatus) status = crmStatus;

    if (status === "PERDIDO") {
      const products = (r.PRODUTOS || []).map(mapCrmItem);
      const totalVenda = products.reduce(
        (acc: number, p: { QUANTIDADE: number | string; PRECO_UNITARIO: number | string }) =>
          acc + (parseFloat(String(p.QUANTIDADE)) || 0) * (parseFloat(String(p.PRECO_UNITARIO)) || 0),
        0,
      );
      const total = parseFloat(r.VALOR_TOTAL_ORCAMENTO) || 0;
      const valor = totalVenda || total;
      const cod = String(r.COD_VENDEDOR || "").trim();
      map.set(cod, (map.get(cod) || 0) + valor);
    }
  }

  // Linha "MEDIA" = total da loja, usada pelo card agregado.
  let totalPerdido = 0;
  map.forEach((v) => { totalPerdido += v; });
  map.set("MEDIA", totalPerdido);

  return map;
}
