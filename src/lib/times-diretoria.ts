import type { VendedorResumo } from "@/lib/api";
import { formatTeamName } from "@/lib/utils";

/**
 * Total Geral + subtotal de cada time, como a diretoria vê no Dashboard Geral.
 *
 * Vive fora do painel porque duas telas precisam da MESMA conta: o Dashboard
 * Geral (RightPanelComponents) e o Gestor (/gestor). Se cada uma montasse os
 * times por conta própria, o mesmo time mostraria números diferentes.
 */

// Usuário vindo do Supabase para montar a hierarquia (Diretor → Supervisores → Vendedores)
export interface OrgUser {
  id: string;
  operator_code?: string | null;
  name?: string | null;
  role?: string | null;
  responsavel_id?: string | null;
  is_leader?: boolean | null;
}

// Soma as métricas de um conjunto de vendedores em uma única linha agregada.
// Usado para o total "Meu Time" (supervisor) e para os subtotais por time na
// visão do Diretor. Recalcula todos os campos exibidos — não pode herdar da
// linha da loja inteira, senão margem/prazo/hoje viriam com o total da loja.
export function buildTeamTotal(
  rows: VendedorResumo[],
  base: VendedorResumo | undefined,
  cod: string,
  nome: string,
  memberCodes?: string[],
): VendedorResumo {
  const sum = (key: keyof VendedorResumo) =>
    rows.reduce((acc, r) => acc + (parseFloat(String(r[key])) || 0), 0);
  const totalMETA = sum("META");
  const totalFATURADO = sum("FATURADO");
  const totalQtdVendas = sum("QTD_VENDAS");
  const totalMargemReal = sum("MARGEM_REAL");
  const prazoPonderado = rows.reduce(
    (acc, r) => acc + (parseFloat(String(r.PRAZO_MEDIO_DIAS)) || 0) * (parseFloat(String(r.FATURADO)) || 0),
    0,
  );
  return {
    ...(base || rows[0]),
    COD_VENDEDOR: cod,
    NOME_VENDEDOR: nome,
    MEMBER_CODES: memberCodes ?? rows.map(r => String(r.COD_VENDEDOR || "").trim()),
    META: totalMETA,
    FATURADO: totalFATURADO,
    EM_ABERTO: sum("EM_ABERTO"),
    TOTAL: sum("TOTAL"),
    FALTANTE: Math.max(0, totalMETA - sum("TOTAL")),
    TOTAL_VENDIDO_HOJE: sum("TOTAL_VENDIDO_HOJE"),
    QTD_VENDAS: totalQtdVendas,
    QTD_ORCAMENTOS: sum("QTD_ORCAMENTOS"),
    ORC_FECHADOS: sum("ORC_FECHADOS"),
    CUSTO: sum("CUSTO"),
    MARGEM_REAL: totalMargemReal,
    MARGEM_REAL_PERC: totalFATURADO > 0 ? (totalMargemReal / totalFATURADO) * 100 : 0,
    TICKET_MEDIO: totalQtdVendas > 0 ? totalFATURADO / totalQtdVendas : 0,
    PRAZO_MEDIO_DIAS: totalFATURADO > 0 ? prazoPonderado / totalFATURADO : 0,
  };
}

/**
 * Monta a linha do Total Geral ("MEDIA"), um subtotal por time (cada supervisor
 * = usuário responsável por ≥1 pessoa) e os vendedores com meta que ainda não
 * têm linha no ERP.
 */
export function montarTotalETimes(
  response: VendedorResumo[],
  usuarios: OrgUser[],
  metaMap: Map<string, number>,
) {
  const mediaRow = response.find(r => r.COD_VENDEDOR === "MEDIA");
  const individuais = response.filter(r => r.COD_VENDEDOR !== "MEDIA");
  const erpByCod = new Map(individuais.map(r => [String(r.COD_VENDEDOR).trim(), r]));

  // Agrupa subordinados por responsável (supervisor)
  const membrosPorResponsavel = new Map<string, OrgUser[]>();
  for (const u of usuarios) {
    if (!u.responsavel_id) continue;
    if (!membrosPorResponsavel.has(u.responsavel_id)) membrosPorResponsavel.set(u.responsavel_id, []);
    membrosPorResponsavel.get(u.responsavel_id)!.push(u);
  }

  const teamTotals: VendedorResumo[] = [];
  // Os mesmos vendedores sem linha no ERP também precisam aparecer na
  // lista individual — senão a diretoria não consegue abrir o card de
  // quem ainda não vendeu no mês.
  const semLinhaGlobal: VendedorResumo[] = [];
  for (const sup of usuarios) {
    const membros = membrosPorResponsavel.get(sup.id);
    if (!membros || membros.length === 0) continue;
    const cods = new Set<string>();
    if (sup.operator_code) cods.add(String(sup.operator_code).trim());
    membros.forEach(m => { if (m.operator_code) cods.add(String(m.operator_code).trim()); });
    // Vendedor sem faturamento no mês não tem linha no ERP. Descartá-lo
    // apagava a meta dele do total do time: o card do Canal Mesa aparecia
    // com 765.217 para a diretoria e 968.233 para o supervisor, porque
    // dois membros ainda não tinham vendido. Entra com a meta real (CADMET)
    // e o resto zerado — mesmo tratamento que o caminho do supervisor já
    // fazia.
    const rowsErp = [...cods].map((c) => erpByCod.get(c)).filter(Boolean) as VendedorResumo[];
    const semLinha: VendedorResumo[] = [...cods]
      .filter((c) => !erpByCod.has(c))
      .map((c) => ({ cod: c, meta: metaMap.get(c) || 0 }))
      .filter(({ meta }) => meta > 0)
      .map(({ cod, meta }) => {
        const membro = [sup, ...membros].find(
          (u) => String(u.operator_code || "").trim() === cod,
        );
        return {
          COD_VENDEDOR: cod,
          NOME_VENDEDOR: membro?.name || cod,
          META: meta, FATURADO: 0, EM_ABERTO: 0, TOTAL: 0, FALTANTE: meta,
          CUSTO: 0, MARGEM_REAL: 0, MARGEM_REAL_PERC: 0,
          QTD_VENDAS: 0, TICKET_MEDIO: 0, QTD_ORCAMENTOS: 0, ORC_FECHADOS: 0,
          PRAZO_MEDIO_DIAS: 0, TOTAL_VENDIDO_HOJE: 0,
        } as VendedorResumo;
      });
    const rows = [...rowsErp, ...semLinha];
    if (rows.length === 0) continue;
    semLinhaGlobal.push(...semLinha);
    teamTotals.push(buildTeamTotal(rows, mediaRow, `TEAM:${sup.id}`, formatTeamName(sup.name), [...cods]));
  }
  teamTotals.sort(
    (a, b) => (parseFloat(String(b.FATURADO)) || 0) - (parseFloat(String(a.FATURADO)) || 0),
  );

  return {
    mediaRow,
    teamTotals,
    individuais,
    semLinha: semLinhaGlobal.filter(
      (p, i, arr) => arr.findIndex((o) => o.COD_VENDEDOR === p.COD_VENDEDOR) === i,
    ),
  };
}
