import { supabase } from "./supabase";
import { apiAdminSQL } from "./api";

/**
 * Cargo que define quem atende o tráfego pago. Precisa bater exatamente com a
 * opção do setor Marketing em UsersView (ROLES_BY_DEPARTMENT) — é o vínculo
 * entre a designação do usuário e o tempo médio de resposta do WhatsApp.
 */
export const CARGO_ATENDENTE_TRAFEGO = "Atendente do Tráfego";

interface MsgResposta {
  remote_jid?: string | null;
  sender?: string | null;
  timestamp?: string | null;
  vendedor_id?: string | null;
}

/**
 * Tempo até a 1ª resposta de cada conversa, com quem respondeu.
 *
 * Regra única do HUB para "1ª resposta", usada tanto pelo cabeçalho das
 * Mensagens quanto pela coluna 1ª RESP. do relatório de marketing. As duas
 * contas ficaram duplicadas por um tempo e divergiram — o cabeçalho descartava
 * mensagem fora do horário comercial e o relatório não —, então o mesmo
 * atendente aparecia com dois tempos diferentes em duas telas. Qualquer
 * mudança de critério tem que ser feita AQUI.
 *
 * Conta da primeira mensagem do contato até a primeira resposta nossa depois
 * dela. Espera acima de 24h é descartada como conversa que virou outra coisa.
 *
 * @param msgs mensagens do período, ordenadas por timestamp crescente
 */
export function paresPrimeiraResposta(
  msgs: MsgResposta[],
): { vendedorId: string | null; minutos: number }[] {
  const byJid: Record<string, MsgResposta[]> = {};
  for (const m of msgs) {
    if (!m.remote_jid || !m.sender || !m.timestamp) continue;
    (byJid[m.remote_jid] ||= []).push(m);
  }

  const pares: { vendedorId: string | null; minutos: number }[] = [];
  for (const lista of Object.values(byJid)) {
    const idxContato = lista.findIndex((m) => m.sender === "contact");
    if (idxContato === -1) continue;
    const resposta = lista.slice(idxContato + 1).find((m) => m.sender === "me");
    if (!resposta) continue;
    const minutos =
      (new Date(resposta.timestamp!).getTime() -
        new Date(lista[idxContato].timestamp!).getTime()) / 60000;
    if (minutos < 0 || minutos > 1440) continue;
    pares.push({ vendedorId: resposta.vendedor_id || null, minutos });
  }
  return pares;
}

/**
 * Escapa um valor para uso dentro de um filtro `.or()`/`.ilike()` do PostgREST.
 * Sem isso, caracteres reservados como ( ) , da máscara de telefone quebram a query.
 * O valor deve ser envolvido em aspas duplas na condição (ex: `col.ilike."%valor%"`).
 */
function pgSafe(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const _descartado28_29Start = new Date('2026-07-28T00:00:00Z').getTime();
const _descartado28_29End = new Date('2026-07-30T00:00:00Z').getTime();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isDescartado(l: any): boolean {
  if (l.descartado) return true;
  const t = new Date(l.created_at).getTime();
  return t >= _descartado28_29Start && t < _descartado28_29End
    && (!l.temperatura || l.temperatura === 'Frio' || l.temperatura === 'Perdido')
    && (!l.status || l.status === 'Cliente Curioso')
    && !l.valor_venda && !l.valor_orcamento;
}

export interface MarketingCliente {
  id?: string;
  remote_jid: string;
  nome?: string;
  push_name?: string;
  foto_url?: string;
  status?: string;
  temperatura?: string;
  vendedor_id?: string;
  ultima_mensagem?: string;
  ultima_conversa_em?: string;
  arquivado?: boolean;
  fixado?: boolean;
  motivo_arquivamento?: string;
  mensagens_nao_lidas?: number;
  valor_venda?: number | null;
  data_venda?: string | null;
  /** Quando a conversa deve voltar dos arquivados. */
  follow_up_em?: string | null;
  /** Preenchido pelo agendador do servidor ao devolver a conversa. */
  follow_up_atendido_em?: string | null;
  /** erp = valor sincronizado da Citel; manual = lançado/corrigido pelo vendedor. */
  venda_origem?: string | null;
  valor_orcamento?: number | null;
  data_orcamento?: string | null;
  /** erp = lido dos orçamentos da Citel; pdf/carrinho = veio pela conversa. */
  orcamento_origem?: string | null;
  orcamento_documento?: string | null;
  /** Cadastro do cliente no ERP casado com esta conversa. */
  cod_cliente_erp?: string | null;
  vinculo_origem?: string | null;
  vinculado_em?: string | null;
  origem?: string;
  campanha?: string;
  forma_pagamento?: string;
  observacao?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SellerReport {
  id: string;
  name: string;
  avatar?: string | null;
  leads: number;
  quotesCount: number;
  quotesValue: number;
  salesCount: number;
  salesValue: number;
  /** vendas / leads (%) */
  convRate: number;
  /** tempo médio de 1ª resposta em minutos, ou null se sem dados */
  avgResponseMinutes: number | null;
}

export interface OriginReport {
  origin: string;
  leads: number;
  salesCount: number;
  salesValue: number;
}

export interface CampaignReport {
  campaign: string;
  leads: number;
  salesCount: number;
  salesValue: number;
}

export interface TemperatureReport {
  temperature: string;
  leads: number;
}

export interface DailyPoint {
  /** yyyy-mm-dd */
  date: string;
  leads: number;
  sales: number;
  salesValue: number;
}

export interface ClientSale {
  valor: number;
  created_at: string;
}

export interface EvolutionClient {
  remote_jid: string;
  push_name: string;
  origem: string | null;
  campanha: string | null;
  vendedor_nome: string | null;
  created_at: string;
  vendas: ClientSale[];
  total_vendas: number;
}

export interface EvolutionData {
  clients: EvolutionClient[];
  totalValue: number;
  totalClients: number;
}

export interface VerbasGrupo {
  grupo: string;
  total: number;
  isTubo: boolean;
}

export interface VerbasTrimestre {
  trimestre: string;
  label: string;
  grupos: VerbasGrupo[];
  totalComprado: number;
  totalSemTubo: number;
  valorVerba: number;
  expiraEm: number;
  expirado: boolean;
}

export interface VerbasFornecedor {
  fornecedor: string;
  trimestres: VerbasTrimestre[];
  totalComprado: number;
  totalSemTubo: number;
  percentualVerba: number;
  valorVerba: number;
  valorRestante: number;
}

// ─── Pesquisas dos anúncios ───────────────────────────────────────────────────
// O que a pessoa digitou no Google antes de clicar. Vem do utm_term gravado pela
// ponte de atribuição (public/w.html), então só existe para quem chegou por
// anúncio — busca orgânica e contato direto não têm termo.
export interface TermoPesquisado {
  termo: string;
  cliques: number;
  /** Cliques que viraram conversa no WhatsApp. */
  conversas: number;
  campanhas: string[];
  ultimoEm: string;
}

export interface PesquisasData {
  termos: TermoPesquisado[];
  totalCliques: number;
  /** Cliques do período sem termo — anúncio sem o parâmetro na URL. */
  cliquesSemTermo: number;
}

export interface VerbasData {
  fornecedores: VerbasFornecedor[];
  totalGeral: number;
  totalVerbas: number;
}

export interface ReportsAnalytics {
  totals: {
    leads: number;
    quotesCount: number;
    quotesValue: number;
    salesCount: number;
    salesValue: number;
    avgTicket: number;
    /** vendas / leads (%) */
    convByCount: number;
    /** R$ vendido / R$ orçado (%) */
    convByValue: number;
    /** vendas / orçamentos enviados (%) */
    convByQuote: number;
    avgResponseMinutes: number | null;
  };
  /** Mesmo intervalo imediatamente anterior, para deltas. */
  previous: {
    leads: number;
    salesCount: number;
    salesValue: number;
  };
  bySeller: SellerReport[];
  byOrigin: OriginReport[];
  byCampaign: CampaignReport[];
  byTemperature: TemperatureReport[];
  dailySeries: DailyPoint[];
}

export interface MarketingMessage {
  id?: string;
  message_id: string;
  remote_jid: string;
  texto?: string;
  tipo?: string;
  sender: "me" | "contact";
  status?: string;
  timestamp: string;
  media_url?: string;
  reacao?: string;
  vendedor_id?: string;
  created_at?: string;
  editado?: boolean;
  quoted_text?: string;
  quoted_sender?: "me" | "contact";
  // Preview de link (Open Graph) capturado do payload do WhatsApp em mensagens recebidas
  link_preview?: {
    url: string;
    title?: string | null;
    description?: string | null;
    image?: string | null;
  } | null;
}

export interface MarketingVenda {
  id?: string;
  remote_jid: string;
  valor: number;
  created_at?: string;
}

// Ranking de status e dedupe em memória por mensagem. Protege contra qualquer
// rajada de chamadas de updateMessageStatus (ex.: listeners de realtime acumulados)
// curto-circuitando ANTES de qualquer requisição — sem isto, uma rajada estoura o
// navegador com ERR_INSUFFICIENT_RESOURCES.
const _statusRank: Record<string, number> = { sent: 1, failed: 1, delivered: 2, read: 3 };
const _lastStatusByMsg = new Map<string, string>();

export const marketingService = {
  /**
   * Atualiza ou insere múltiplos clientes de uma vez (Batch Upsert)
   */
  async upsertClientes(clientes: MarketingCliente[]) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("marketing_clientes")
      .upsert(
        clientes.map(c => ({ ...c, updated_at: now })),
        { onConflict: "remote_jid" }
      )
      .select();

    if (error) {
      console.error("[MarketingService] Erro ao upsert clientes:", error.message);
      return [];
    }
    return data;
  },

  /**
   * Atalho para atualizar um único cliente
   */
  async upsertCliente(cliente: MarketingCliente) {
    const results = await this.upsertClientes([cliente]);
    return results.length > 0 ? results[0] : null;
  },

  /**
   * Busca um cliente pelo remote_jid
   */
  async getCliente(remoteJid: string): Promise<MarketingCliente | null> {
    const { data, error } = await supabase
      .from("marketing_clientes")
      .select("*")
      .eq("remote_jid", remoteJid)
      .maybeSingle();

    if (error) {
      console.error("[MarketingService] Erro ao buscar cliente:", error.message);
      return null;
    }
    return data;
  },

  /**
   * Remove um cliente permanentemente
   */
  async deleteCliente(remoteJid: string) {
    const { error } = await supabase
      .from("marketing_clientes")
      .delete()
      .eq("remote_jid", remoteJid);

    if (error) {
      console.error("[MarketingService] Erro ao deletar cliente:", error.message);
      throw error;
    }
    return true;
  },

  /**
   * Busca apenas clientes que possuem mensagens no banco (CRM Ativo)
   */
  async getActiveClientes(includeArchived: boolean | 'all' = false, limit = 50, offset = 0, vendedorId?: string) {
    let query = supabase
      .from("marketing_clientes")
      .select("*")
      .not('ultima_conversa_em', 'is', null)
      .like('remote_jid', '%@s.whatsapp.net');

    if (vendedorId) {
      query = query.eq('vendedor_id', vendedorId);
    }

    if (includeArchived !== 'all') {
      if (!includeArchived) {
        query = query.or('arquivado.eq.false,arquivado.is.null');
      } else {
        query = query.eq('arquivado', true);
      }
    }

    const { data, error } = await query
      .order("ultima_conversa_em", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      if (error.message.includes("column") && error.message.includes("arquivado")) {
        const { data: retryData } = await supabase
          .from("marketing_clientes")
          .select("*")
          .not('ultima_conversa_em', 'is', null)
          .like('remote_jid', '%@s.whatsapp.net')
          .order("ultima_conversa_em", { ascending: false })
          .range(offset, offset + limit - 1);
        return (retryData || []) as MarketingCliente[];
      }
      console.error("[MarketingService] Erro ao buscar clientes ativos:", error.message);
      return [];
    }
    return (data || []) as MarketingCliente[];
  },

  /**
   * Busca clientes por nome ou telefone, independente de estarem arquivados.
   * O telefone é buscado apenas pelos dígitos (ignora máscara: parênteses, espaços, traços).
   */
  async searchClientes(term: string, limit = 50): Promise<MarketingCliente[]> {
    const trimmed = term.trim();
    if (!trimmed) return [];

    const digits = trimmed.replace(/\D/g, "");
    const orConditions = [
      `nome.ilike."%${pgSafe(trimmed)}%"`,
      `push_name.ilike."%${pgSafe(trimmed)}%"`,
      `remote_jid.ilike."%${pgSafe(trimmed)}%"`,
    ];
    if (digits) {
      orConditions.push(`remote_jid.ilike."%${digits}%"`);
    }

    const { data, error } = await supabase
      .from("marketing_clientes")
      .select("*")
      .like("remote_jid", "%@s.whatsapp.net")
      .or(orConditions.join(","))
      .order("ultima_conversa_em", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      console.error("[MarketingService] Erro ao buscar clientes:", error.message);
      return [];
    }
    return (data || []) as MarketingCliente[];
  },

  /**
   * Busca todos os clientes/contatos
   */
  async getClientes(includeArchived = false) {
    let query = supabase
      .from("marketing_clientes")
      .select("*");
    
    if (!includeArchived) {
      query = query.or('arquivado.eq.false,arquivado.is.null');
    }

    const { data, error } = await query.order("ultima_conversa_em", { ascending: false });

    if (error) {
      if (error.message.includes("column") && error.message.includes("arquivado")) {
        const { data: retryData } = await supabase
          .from("marketing_clientes")
          .select("*")
          .order("ultima_conversa_em", { ascending: false });
        return (retryData || []) as MarketingCliente[];
      }
      console.error("[MarketingService] Erro ao buscar clientes:", error.message);
      return [];
    }
    return data as MarketingCliente[];
  },

  /**
   * Salva uma nova mensagem
   */
  async saveMessage(msg: MarketingMessage) {
    const { error } = await supabase
      .from("marketing_whatsapp")
      .upsert(msg, { onConflict: "message_id" });

    if (error) {
      console.error("[MarketingService] Erro ao salvar mensagem:", error.message);
      return false;
    }

    // Atualiza ou cria o registro do cliente
    await supabase
      .from("marketing_clientes")
      .upsert({
        remote_jid: msg.remote_jid,
        ultima_mensagem: msg.texto,
        ultima_conversa_em: msg.timestamp,
        updated_at: new Date().toISOString()
      }, { onConflict: "remote_jid", ignoreDuplicates: false });

    return true;
  },

  /**
   * Busca histórico de mensagens de um JID específico.
   * Suporta paginação: `beforeDate` carrega mensagens ANTERIORES a esse timestamp (scroll infinito para cima).
   */
  async getMessagesByJid(remoteJid: string, limit = 50, sinceDate?: string, beforeDate?: string, vendedorId?: string) {
    let query = supabase
      .from("marketing_whatsapp")
      .select("message_id, remote_jid, sender, texto, tipo, status, timestamp, media_url, reacao, vendedor_id, editado, quoted_text, quoted_sender, link_preview")
      .eq("remote_jid", remoteJid);

    if (vendedorId) {
      query = query.eq("vendedor_id", vendedorId);
    }

    if (sinceDate) query = query.gte("timestamp", sinceDate);
    if (beforeDate) query = query.lt("timestamp", beforeDate);

    const { data, error } = await query
      .order("timestamp", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[MarketingService] Erro ao buscar mensagens:", error.message);
      return [];
    }
    return ((data as MarketingMessage[]) || []).reverse();
  },

  // Última mensagem de cada conversa (quem mandou + status de entrega), em UMA
  // consulta para a página inteira da lista.
  //
  // `marketing_clientes` guarda o texto e a data da última mensagem, mas não o
  // remetente nem o status — então a lista abria sem o ✓/✓✓ e ele só aparecia
  // depois de clicar na conversa, que é quando as mensagens eram carregadas.
  //
  // Busca limitada: pega as mensagens mais recentes desses JIDs e reduz para a
  // primeira de cada um (a query vem ordenada da mais nova para a mais antiga).
  // O teto evita varrer o histórico inteiro; conversa que ficar de fora apenas
  // segue sem o ícone, como era antes — nunca mostra informação errada.
  async getLastMessageMetaByJids(remoteJids: string[]) {
    const resultado = new Map<
      string,
      { sender: "me" | "contact"; status?: string; tipo?: string }
    >();
    if (remoteJids.length === 0) return resultado;

    const { data, error } = await supabase
      .from("marketing_whatsapp")
      .select("remote_jid, sender, status, tipo, timestamp")
      .in("remote_jid", remoteJids)
      // Anotação interna mora na mesma tabela, mas não é mensagem da conversa:
      // se entrasse aqui, uma nota apareceria como "última mensagem enviada",
      // com ✓, divergindo do texto que a lista mostra (vindo de marketing_clientes).
      .neq("tipo", "internal_note")
      .order("timestamp", { ascending: false })
      .limit(remoteJids.length * 8);

    if (error) {
      console.error(
        "[MarketingService] Erro ao buscar status da última mensagem:",
        error.message,
      );
      return resultado;
    }

    for (const row of (data || []) as {
      remote_jid: string;
      sender: "me" | "contact";
      status?: string;
      tipo?: string;
    }[]) {
      // Primeira ocorrência do JID = mensagem mais recente dele.
      if (!resultado.has(row.remote_jid)) {
        resultado.set(row.remote_jid, {
          sender: row.sender,
          status: row.status,
          tipo: row.tipo,
        });
      }
    }
    return resultado;
  },

  async togglePin(remoteJid: string, pin: boolean) {
    const { error } = await supabase
      .from("marketing_clientes")
      .update({ fixado: pin, updated_at: new Date().toISOString() })
      .eq("remote_jid", remoteJid);

    if (error) {
      console.error("[MarketingService] Erro ao fixar/desafixar:", error);
      throw error;
    }
  },

  async markAsRead(remoteJid: string) {
    const { error } = await supabase
      .from("marketing_clientes")
      .update({ mensagens_nao_lidas: 0, updated_at: new Date().toISOString() })
      .eq("remote_jid", remoteJid);

    if (error) {
      console.error("[MarketingService] Erro ao marcar como lido:", error.message);
    }
  },

  async markAsUnread(remoteJid: string, count = 1) {
    const { error } = await supabase
      .from("marketing_clientes")
      .update({ mensagens_nao_lidas: count, updated_at: new Date().toISOString() })
      .eq("remote_jid", remoteJid);

    if (error) {
      console.error("[MarketingService] Erro ao marcar como não lido:", error.message);
    }
  },

  async updateMessageStatus(messageId: string, status: string) {
    // TRAVA EM MEMÓRIA (antes de qualquer rede): se já processamos este status (ou
    // um maior) para esta mensagem, sai na hora. Impede que uma rajada de chamadas
    // (listeners de realtime acumulados) vire flood de queries / trave o navegador.
    const cached = _lastStatusByMsg.get(messageId);
    if (cached && (_statusRank[status] || 0) <= (_statusRank[cached] || 0)) return;
    _lastStatusByMsg.set(messageId, status);
    if (_lastStatusByMsg.size > 2000) {
      _lastStatusByMsg.delete(_lastStatusByMsg.keys().next().value as string);
    }

    // Usa upsert via message_id para evitar CORS com PATCH em alguns ambientes
    // maybeSingle: um status pode chegar para uma mensagem que ainda não está no
    // banco (ex.: enviada por outro dispositivo). Com .single() isso retornava 406.
    const { data: existing } = await supabase
      .from("marketing_whatsapp")
      .select("message_id, remote_jid, sender, timestamp, status")
      .eq("message_id", messageId)
      .maybeSingle();

    if (!existing) return;

    // IDEMPOTENTE + nunca regride (barreira no banco, além da trava em memória).
    if (status === existing.status || (_statusRank[status] || 0) < (_statusRank[existing.status] || 0)) {
      return;
    }

    const { error } = await supabase
      .from("marketing_whatsapp")
      .upsert({ ...existing, status }, { onConflict: "message_id" });

    if (error) {
      console.error("[MarketingService] Erro ao atualizar status da mensagem:", error.message);
    }
  },

  async incrementUnread(remoteJid: string) {
    // Incremento atômico via stored procedure — crie esta função no Supabase SQL Editor:
    // CREATE OR REPLACE FUNCTION increment_unread(jid TEXT) RETURNS void LANGUAGE sql AS
    // $$ UPDATE marketing_clientes SET mensagens_nao_lidas = COALESCE(mensagens_nao_lidas,0)+1,
    //    updated_at = now() WHERE remote_jid = jid; $$;
    const { error } = await supabase.rpc('increment_unread', { jid: remoteJid });
    if (error) {
      // Fallback (não atômico) enquanto a função não existir no banco
      const { data } = await supabase
        .from("marketing_clientes")
        .select("mensagens_nao_lidas")
        .eq("remote_jid", remoteJid)
        .maybeSingle();
      if (data) {
        await supabase
          .from("marketing_clientes")
          .update({ mensagens_nao_lidas: (data.mensagens_nao_lidas || 0) + 1, updated_at: new Date().toISOString() })
          .eq("remote_jid", remoteJid);
      }
    }
  },

  /**
   * Arquiva/desarquiva a conversa deixando rastro de QUEM e QUANDO.
   *
   * `actorId` é quem efetivou a ação (o aprovador, quando o arquivamento passou
   * pela fila de aprovação). Ao arquivar, carimba `sla_silenciado_em`: é o que
   * faz o escalador de SLA parar de cobrar a conversa — arquivar sozinho não
   * silencia mais nada, já que o escalador ignora `arquivado`. Ao desarquivar,
   * limpa o carimbo e o degrau de escalonamento, e a cobrança volta do zero.
   */
  async toggleArchived(
    remoteJid: string,
    archived: boolean,
    motivo?: string,
    formaPagamento?: string,
    observacao?: string,
    actorId?: string
  ) {
    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      arquivado: archived,
      updated_at: nowIso
    };

    if (archived) {
      updatePayload.arquivado_por = actorId || null;
      updatePayload.arquivado_em = nowIso;
      updatePayload.sla_silenciado_em = nowIso;
    } else {
      updatePayload.arquivado_por = null;
      updatePayload.arquivado_em = null;
      updatePayload.sla_silenciado_em = null;
      updatePayload.sla_nivel_alertado = 0;
      updatePayload.sla_alerta_ref = null;
    }

    // Ao finalizar/arquivar, o lead deixa de ser oportunidade "aberta": marca o desfecho
    // na temperatura — "Convertido" se houve venda, senão "Perdido" — para não continuar
    // constando como Quente (ex.: quentes que não fecharam no fim do mês). Ao desarquivar,
    // não mexe na temperatura.
    if (archived) {
      updatePayload.temperatura = motivo === "Convertido" ? "Convertido" : "Perdido";
    }

    // Salva o motivo no campo 'status' que já existe na tabela
    if (motivo) {
      updatePayload.status = motivo;
    }
    if (formaPagamento !== undefined) {
      updatePayload.forma_pagamento = formaPagamento;
    }
    if (observacao !== undefined) {
      updatePayload.observacao = observacao;
    }

    let { error } = await supabase
      .from("marketing_clientes")
      .update(updatePayload)
      .eq("remote_jid", remoteJid);

    // Resiliência: se as colunas opcionais (forma_pagamento/observacao) não existirem
    // na tabela, o Postgres rejeita o update inteiro (PGRST204). Refaz sem esses campos
    // para o arquivamento não quebrar — a forma de pagamento/observação só é salva se as
    // colunas existirem no banco.
    const missingColumn = error && (error.code === "PGRST204" || error.code === "42703");
    if (missingColumn) {
      delete updatePayload.forma_pagamento;
      delete updatePayload.observacao;
      // Colunas de auditoria/SLA (migration 20260826140000): se ainda não foram
      // aplicadas no banco, o arquivamento não pode quebrar por causa delas.
      delete updatePayload.arquivado_por;
      delete updatePayload.arquivado_em;
      delete updatePayload.sla_silenciado_em;
      delete updatePayload.sla_nivel_alertado;
      delete updatePayload.sla_alerta_ref;
      ({ error } = await supabase
        .from("marketing_clientes")
        .update(updatePayload)
        .eq("remote_jid", remoteJid));
    }

    if (error) {
      console.error(
        "[MarketingService] Erro ao arquivar/desarquivar:",
        error.message,
        "| details:", error.details,
        "| hint:", error.hint,
        "| code:", error.code
      );
      throw error;
    }
  },

  // archiveInactiveClientes foi removido: o arquivamento em massa por inatividade
  // marcava as conversas como "Perdido" sem ninguém olhar, e servia de álibi para
  // conversa deixada sem resposta. Arquivar é sempre uma decisão por conversa —
  // e, com dívida aberta, passa pela aprovação do supervisor (archive-approval.ts).

  /**
   * Busca leads de forma paginada com filtros aplicados diretamente no Supabase
   */
  async getLeadsPaginated(limit = 50, offset = 0, search = "", filterTemperature = "Todas as Temperaturas") {
    let query = supabase
      .from("marketing_clientes")
      .select("*", { count: "exact" })
      .or("status.is.null,and(status.neq.Negociando,status.neq.Convertido)");

    if (search) {
      // O telefone é salvo apenas com dígitos no remote_jid (ex: 5511997493556@...),
      // então buscamos o número sem a máscara (parênteses, espaços, traços).
      const digits = search.replace(/\D/g, "");
      // Aspas obrigatórias: sem elas, caracteres como ( ) , da máscara do telefone
      // são interpretados como sintaxe do .or() do PostgREST e quebram a query.
      const orConditions = [
        `nome.ilike."%${pgSafe(search)}%"`,
        `push_name.ilike."%${pgSafe(search)}%"`,
        `remote_jid.ilike."%${pgSafe(search)}%"`,
      ];
      if (digits) {
        orConditions.push(`remote_jid.ilike."%${digits}%"`);
      }
      query = query.or(orConditions.join(","));
    }

    if (filterTemperature === "Convertido") {
      // "Convertido" é derivado da venda, não da temperatura salva (que pode estar
      // defasada, ex.: "Perdido" com venda lançada depois).
      query = query.gt("valor_venda", 0);
    } else if (filterTemperature !== "Todas as Temperaturas") {
      // Demais buckets excluem quem tem venda (esses aparecem como Convertido).
      query = query
        .eq("temperatura", filterTemperature)
        .or("valor_venda.is.null,valor_venda.eq.0");
    }

    const { data, error, count } = await query
      .order("ultima_conversa_em", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[MarketingService] Erro ao buscar leads paginados:", error.message);
      return { data: [], count: 0 };
    }
    return { data: (data || []) as MarketingCliente[], count: count || 0 };
  },

  // registerSale/deleteSale foram removidos: a venda do lead não é mais digitada.
  // O valor vem dos pedidos da Citel (db/src/lib/leadErpSyncScheduler.js), que
  // grava em marketing_vendas com o número do pedido e recalcula valor_venda.

  /**
   * Amarra a conversa ao cadastro do cliente no ERP.
   *
   * Existe porque o vínculo por telefone falha exatamente no caso mais comum de
   * PJ: quem conversa é a pessoa física (celular dela) e o cadastro na Citel está
   * no CNPJ da empresa, com outro telefone. Sem vínculo, orçamento e venda nunca
   * são puxados e o lead some dos relatórios de conversão.
   *
   * `origem`: 'documento' (código lido do orçamento — exato), 'manual' (alguém
   * amarrou na tela) ou 'telefone' (casamento automático).
   *
   * Um vínculo mais forte nunca é rebaixado: 'documento' e 'manual' não são
   * sobrescritos por um casamento por telefone.
   */
  async vincularClienteErp(
    remoteJid: string,
    codCliente: string,
    origem: "documento" | "manual" | "telefone" = "documento",
  ) {
    const codigo = String(codCliente || "").trim();
    if (!codigo) return false;

    const { data: atual } = await supabase
      .from("marketing_clientes")
      .select("cod_cliente_erp, vinculo_origem")
      .eq("remote_jid", remoteJid)
      .maybeSingle();

    const jaForte = atual?.vinculo_origem === "documento" || atual?.vinculo_origem === "manual";
    if (jaForte && origem === "telefone") return false;
    if (atual?.cod_cliente_erp === codigo && atual?.vinculo_origem === origem) return false;

    const { error } = await supabase
      .from("marketing_clientes")
      .update({
        cod_cliente_erp: codigo,
        vinculo_origem: origem,
        vinculado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("remote_jid", remoteJid);

    if (error) {
      console.error("[MarketingService] Erro ao vincular cliente do ERP:", error.message);
      return false;
    }
    return true;
  },

  // Marca no lead que houve orçamento e guarda o valor total (à vista/PIX),
  // espelhando registerSale/valor_venda.
  async registerOrcamento(remoteJid: string, value: number, when?: string) {
    const { error } = await supabase
      .from("marketing_clientes")
      .update({
        valor_orcamento: value,
        data_orcamento: when || new Date().toISOString(),
        // Veio pela conversa (PDF enviado ou carrinho do chat), não do documento
        // gerado na Citel — senão o selo "ERP" na tela mentiria. A varredura do
        // ERP reassume o valor no ciclo seguinte, se houver orçamento lá.
        orcamento_origem: "conversa",
        orcamento_documento: null,
        updated_at: new Date().toISOString()
      })
      .eq("remote_jid", remoteJid);

    if (error) {
      console.error("[MarketingService] Erro ao registrar orçamento:", error.message);
      throw error;
    }
  },

  async deleteOrcamento(remoteJid: string) {
    await supabase
      .from("marketing_clientes")
      .update({ valor_orcamento: null, data_orcamento: null, updated_at: new Date().toISOString() })
      .eq("remote_jid", remoteJid);
  },

  /**
   * Agenda o retorno da conversa e a arquiva.
   *
   * Arquivar faz parte do agendamento, não é efeito colateral: o combinado é
   * "some da caixa de entrada até tal hora". Quem devolve para os ativos é o
   * agendador do servidor (db/src/lib/followUpScheduler.js), que roda mesmo com
   * o HUB fechado.
   *
   * `quandoIso` nulo cancela o follow-up (e não desarquiva — quem estava
   * arquivado por outro motivo continua arquivado).
   */
  async agendarFollowUp(remoteJid: string, quandoIso: string | null, autorId?: string) {
    const agora = new Date().toISOString();
    const patch: Record<string, unknown> = {
      follow_up_em: quandoIso,
      follow_up_atendido_em: null,
      follow_up_criado_por: quandoIso ? autorId ?? null : null,
      follow_up_criado_em: quandoIso ? agora : null,
      updated_at: agora,
    };
    if (quandoIso) {
      patch.arquivado = true;
      patch.arquivado_por = autorId ?? null;
      patch.arquivado_em = agora;
    }

    const { error } = await supabase
      .from("marketing_clientes")
      .update(patch)
      .eq("remote_jid", remoteJid);

    if (error) {
      console.error("[MarketingService] Erro ao agendar follow-up:", error.message);
      throw error;
    }
  },

  /** Limpa o selo depois que o atendente tratou a conversa que voltou. */
  async limparFollowUp(remoteJid: string) {
    await supabase
      .from("marketing_clientes")
      .update({
        follow_up_em: null,
        follow_up_atendido_em: null,
        follow_up_criado_por: null,
        follow_up_criado_em: null,
        updated_at: new Date().toISOString(),
      })
      .eq("remote_jid", remoteJid);
  },

  async getSalesByJid(remoteJid: string): Promise<MarketingVenda[]> {
    const { data } = await supabase
      .from("marketing_vendas")
      .select("*")
      .eq("remote_jid", remoteJid)
      .order("created_at", { ascending: false });
    return (data || []) as MarketingVenda[];
  },

  async updateMessageMediaUrl(messageId: string, mediaUrl: string) {
    await supabase
      .from("marketing_whatsapp")
      .update({ media_url: mediaUrl })
      .eq("message_id", messageId);
  },

  // Reação (like/emoji) de uma mensagem. String vazia limpa a reação.
  async updateMessageReaction(messageId: string, reacao: string) {
    await supabase
      .from("marketing_whatsapp")
      .update({ reacao: reacao || null })
      .eq("message_id", messageId);
  },

  async updateMessageLinkPreview(messageId: string, linkPreview: MarketingMessage["link_preview"]) {
    await supabase
      .from("marketing_whatsapp")
      .update({ link_preview: linkPreview })
      .eq("message_id", messageId);
  },

  /**
   * Faz o upload de uma mídia em base64 para o Supabase Storage e retorna a URL pública
   */
  async uploadMedia(base64: string, mimetype: string, filename: string): Promise<string | null> {
    try {
      // Converte base64 para Blob
      const res = await fetch(`data:${mimetype};base64,${base64}`);
      const blob = await res.blob();

      // Upload para o bucket "whatsapp-media"
      const { data, error } = await supabase.storage
        .from('whatsapp-media')
        .upload(filename, blob, {
          contentType: mimetype,
          upsert: true
        });

      if (error) {
        console.error('[MarketingService] Erro no upload da mídia:', error);
        return null;
      }

      // Retorna a URL pública. Em DEV, o client aponta para o proxy do Vite
      // (location.origin/supabase), o que gravaria uma URL "localhost" no banco e
      // quebraria em produção (Mixed Content / connection refused). Corrige para a
      // URL real do Supabase antes de retornar — mesma proteção do uploadImage.
      const { data: publicUrlData } = supabase.storage
        .from('whatsapp-media')
        .getPublicUrl(data.path);

      let publicUrl = publicUrlData.publicUrl;
      if (import.meta.env.DEV && publicUrl.includes("/supabase/storage/")) {
        const realSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://zwfvrmqffxcqurxpfewi.supabase.co";
        publicUrl = publicUrl.replace(`${window.location.origin}/supabase`, realSupabaseUrl);
      }
      return publicUrl;
    } catch (error) {
      console.error('[MarketingService] Erro ao processar mídia:', error);
      return null;
    }
  },

  /**
   * Busca estatísticas de leads (hoje e período) com suporte a filtros
   */
  async getMarketingStats(startDate: Date, endDate?: Date, filters?: { searchTerm?: string; status?: string; seller?: string; temperature?: string }) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = endDate ? new Date(endDate) : new Date(startDate);
    end.setHours(23, 59, 59, 999);

    // Para o comparativo mensal, pegamos sempre o mês inteiro da data inicial selecionada
    const firstDayOfMonth = new Date(start.getFullYear(), start.getMonth(), 1).toISOString();
    const lastDayOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyFilters = (query: any) => {
      if (filters?.searchTerm) {
        query = query.or(`nome.ilike.%${filters.searchTerm}%,remote_jid.ilike.%${filters.searchTerm}%`);
      }
      if (filters?.status && filters.status !== "Todos os Status") {
        query = query.eq('status', filters.status);
      }
      if (filters?.seller && filters.seller !== "Todos os Vendedores") {
        query = query.eq('vendedor_id', filters.seller);
      }
      if (filters?.temperature && filters.temperature !== "Todas as Temperaturas") {
        query = query.eq('temperatura', filters.temperature);
      }
      return query;
    };

    let leadsQuery = supabase
      .from('marketing_clientes')
      .select('remote_jid, temperatura, status, created_at, valor_venda, valor_orcamento')
      .not('ultima_conversa_em', 'is', null)
      .gte('ultima_conversa_em', start.toISOString())
      .lte('ultima_conversa_em', end.toISOString());
    leadsQuery = applyFilters(leadsQuery);
    const { data: leadsInPeriodRaw } = await leadsQuery.limit(5000);
    const leadsInPeriodFiltered = (leadsInPeriodRaw || []).filter(l => !isDescartado(l));
    const leadsInPeriod = leadsInPeriodFiltered.length;

    let leadsMonthQuery = supabase
      .from('marketing_clientes')
      .select('remote_jid, temperatura, status, created_at, valor_venda, valor_orcamento')
      .not('ultima_conversa_em', 'is', null)
      .gte('ultima_conversa_em', firstDayOfMonth)
      .lte('ultima_conversa_em', lastDayOfMonth);
    leadsMonthQuery = applyFilters(leadsMonthQuery);
    const { data: leadsMonthRaw } = await leadsMonthQuery.limit(5000);
    const leadsMonthFiltered = (leadsMonthRaw || []).filter(l => !isDescartado(l));
    const leadsMonth = leadsMonthFiltered.length;

    const frio = leadsInPeriodFiltered.filter(l => l.temperatura === 'Frio').length;
    const morno = leadsInPeriodFiltered.filter(l => l.temperatura === 'Morno').length;
    const quente = leadsInPeriodFiltered.filter(l => l.temperatura === 'Quente').length;

    // Faturamento no período: soma do valor_venda dos leads, atribuído pela data_venda.
    const { data: salesInPeriod } = await supabase
      .from('marketing_clientes')
      .select('valor_venda')
      .gt('valor_venda', 0)
      .not('data_venda', 'is', null)
      .gte('data_venda', start.toISOString())
      .lte('data_venda', end.toISOString());

    // Faturamento no mês inteiro
    const { data: salesMonth } = await supabase
      .from('marketing_clientes')
      .select('valor_venda')
      .gt('valor_venda', 0)
      .not('data_venda', 'is', null)
      .gte('data_venda', firstDayOfMonth)
      .lte('data_venda', lastDayOfMonth);

    const billingInPeriod = (salesInPeriod || []).reduce((acc, s) => acc + (Number(s.valor_venda) || 0), 0);
    const billingMonth = (salesMonth || []).reduce((acc, s) => acc + (Number(s.valor_venda) || 0), 0);

    return {
      leadsToday: leadsInPeriod || 0,
      leadsMonth: leadsMonth || 0,
      frioToday: frio,
      mornoToday: morno,
      quenteToday: quente,
      billingToday: billingInPeriod,
      billingMonth,
      salesCountToday: (salesInPeriod || []).length,
      salesCountMonth: (salesMonth || []).length
    };
  },

  /**
   * Calcula o tempo médio de primeira resposta (em minutos) para o período.
   * Lógica: para cada conversa, encontra a 1ª mensagem do cliente e a 1ª
   * resposta nossa após ela. Retorna a média em minutos (ou null se sem dados).
   */
  /**
   * Tempo médio de 1ª resposta.
   *
   * Só conta as conversas respondidas por quem tem o cargo "Atendente do
   * Tráfego" (setor Marketing). O WhatsApp é aberto ao time todo, então sem
   * esse recorte a média misturava quem trabalha campanha com quem só responde
   * um cliente próprio de vez em quando — e uma resposta de 2h de alguém de
   * fora estragava o indicador de quem atende o tráfego.
   *
   * Se NINGUÉM tiver o cargo, cai no comportamento antigo (conta todo mundo),
   * para a métrica não zerar antes de alguém ser designado.
   *
   * Usa paresPrimeiraResposta(), a mesma regra da coluna 1ª RESP. do relatório:
   * para o mesmo período e o mesmo atendente, os dois números batem.
   */
  async getAvgFirstResponseTime(startDate: Date, endDate?: Date): Promise<number | null> {
    try {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = endDate ? new Date(endDate) : new Date(startDate);
      end.setHours(23, 59, 59, 999);

      const { data: atendentes } = await supabase
        .from("usuarios")
        .select("id")
        .eq("role", CARGO_ATENDENTE_TRAFEGO);
      const idsTrafego = new Set((atendentes || []).map((u) => String(u.id)));

      const { data, error } = await supabase
        .from("marketing_whatsapp")
        .select("remote_jid, sender, timestamp, vendedor_id")
        .gte("timestamp", start.toISOString())
        .lte("timestamp", end.toISOString())
        .order("timestamp", { ascending: true });

      if (error || !data || data.length === 0) return null;

      // Resposta de quem não tem o cargo não entra na conta. Sem vendedor_id
      // gravado também fica de fora: não dá para creditar o tempo a ninguém.
      const deltas = paresPrimeiraResposta(data)
        .filter((par) => idsTrafego.size === 0 || idsTrafego.has(String(par.vendedorId || "")))
        .map((par) => par.minutos);

      if (deltas.length === 0) return null;
      return deltas.reduce((a, b) => a + b, 0) / deltas.length;
    } catch {
      return null;
    }
  },

  /**
   * Busca leads agrupados por hora para um gráfico de picos
   */
  async getHourlyLeads(startDate: Date, endDate?: Date, filters?: { searchTerm?: string; status?: string; seller?: string; temperature?: string }) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = endDate ? new Date(endDate) : new Date(startDate);
    end.setHours(23, 59, 59, 999);

    let query = supabase
      .from('marketing_clientes')
      .select('created_at, temperatura, status, valor_venda, valor_orcamento')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (filters?.searchTerm) {
      query = query.or(`nome.ilike.%${filters.searchTerm}%,remote_jid.ilike.%${filters.searchTerm}%`);
    }
    if (filters?.status && filters.status !== "Todos os Status") {
      query = query.eq('status', filters.status);
    }
    if (filters?.seller && filters.seller !== "Todos os Vendedores") {
      query = query.eq('vendedor_id', filters.seller);
    }
    if (filters?.temperature && filters.temperature !== "Todas as Temperaturas") {
      query = query.eq('temperatura', filters.temperature);
    }

    const { data } = await query;

    const hourlyCounts = new Array(24).fill(0);
    data?.filter(l => !isDescartado(l)).forEach(lead => {
      const hour = new Date(lead.created_at).getHours();
      hourlyCounts[hour]++;
    });

    return hourlyCounts;
  },

  /**
   * Analytics completo para a página de Relatórios: totais, conversões (por
   * quantidade, por valor e por orçamento), desempenho por vendedor (incluindo
   * tempo médio de 1ª resposta) e leads por origem. Todos os números vêm do banco.
   */
  async getReportsAnalytics(startDate: Date, endDate?: Date): Promise<ReportsAnalytics> {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = endDate ? new Date(endDate) : new Date(startDate);
    end.setHours(23, 59, 59, 999);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const [
      { data: leadsRaw },
      { data: quotesRaw },
      { data: salesRaw },
      { data: msgsRaw },
      { data: usersRaw },
    ] = await Promise.all([
      supabase
        .from("marketing_clientes")
        .select("remote_jid, vendedor_id, origem, campanha, temperatura, status, created_at, ultima_conversa_em, valor_venda, valor_orcamento")
        .not("ultima_conversa_em", "is", null)
        .gte("ultima_conversa_em", startIso)
        .lte("ultima_conversa_em", endIso)
        .limit(5000),
      supabase
        .from("marketing_clientes")
        .select("remote_jid, vendedor_id, valor_orcamento, data_orcamento")
        .not("valor_orcamento", "is", null)
        .gte("data_orcamento", startIso)
        .lte("data_orcamento", endIso)
        .limit(5000),
      supabase
        .from("marketing_clientes")
        .select("remote_jid, vendedor_id, origem, campanha, valor_venda, data_venda")
        .gt("valor_venda", 0)
        .not("data_venda", "is", null)
        .gte("data_venda", startIso)
        .lte("data_venda", endIso)
        .limit(5000),
      supabase
        .from("marketing_whatsapp")
        .select("remote_jid, sender, timestamp, vendedor_id")
        .gte("timestamp", startIso)
        .lte("timestamp", endIso)
        .order("timestamp", { ascending: true })
        .limit(50000),
      supabase.from("usuarios").select("id, name, avatar"),
    ]);

    const leads = (leadsRaw || []).filter(l => !isDescartado(l));
    const quotes = (quotesRaw || []).filter(l => !isDescartado(l));
    const sales = (salesRaw || []).filter(l => !isDescartado(l)).map((s) => ({
      remote_jid: s.remote_jid,
      valor: Number(s.valor_venda) || 0,
      vendedor_id: s.vendedor_id as string | null | undefined,
      origem: s.origem as string | null | undefined,
      campanha: s.campanha as string | null | undefined,
      data_venda: s.data_venda as string,
    }));
    const msgs = msgsRaw || [];

    const userNames = new Map<string, string>();
    const userAvatars = new Map<string, string | null>();
    (usersRaw || []).forEach((u) => { userNames.set(u.id, u.name); userAvatars.set(u.id, u.avatar); });

    // --- Tempo de 1ª resposta por conversa, atribuído a quem respondeu ---
    // Mesma regra do cabeçalho das Mensagens (paresPrimeiraResposta).
    const respBySeller: Record<string, { sum: number; count: number }> = {};
    let respGlobalSum = 0;
    let respGlobalCount = 0;
    for (const { vendedorId, minutos } of paresPrimeiraResposta(msgs)) {
      respGlobalSum += minutos;
      respGlobalCount += 1;
      const sid = vendedorId || "sem_vendedor";
      (respBySeller[sid] ||= { sum: 0, count: 0 });
      respBySeller[sid].sum += minutos;
      respBySeller[sid].count += 1;
    }

    // --- Agregação por vendedor ---
    interface SellerAcc {
      leads: number; quotesCount: number; quotesValue: number; salesCount: number; salesValue: number;
    }
    const sellerAcc = new Map<string, SellerAcc>();
    const ensureSeller = (id: string): SellerAcc => {
      let acc = sellerAcc.get(id);
      if (!acc) { acc = { leads: 0, quotesCount: 0, quotesValue: 0, salesCount: 0, salesValue: 0 }; sellerAcc.set(id, acc); }
      return acc;
    };

    leads.forEach((l) => { ensureSeller(l.vendedor_id || "sem_vendedor").leads += 1; });
    quotes.forEach((q) => {
      const acc = ensureSeller(q.vendedor_id || "sem_vendedor");
      acc.quotesCount += 1;
      acc.quotesValue += Number(q.valor_orcamento) || 0;
    });
    sales.forEach((s) => {
      const sid = s.vendedor_id || "sem_vendedor";
      const acc = ensureSeller(sid);
      acc.salesCount += 1;
      acc.salesValue += Number(s.valor) || 0;
    });

    // Leads/orçamentos/vendas sem atendente são atribuídos à Ingryd (foi quem atendeu).
    const ingrydId = [...userNames.entries()].find(([, n]) => n.trim().toLowerCase().includes("ingryd"))?.[0];
    if (ingrydId && sellerAcc.has("sem_vendedor")) {
      const orphan = sellerAcc.get("sem_vendedor")!;
      const target = ensureSeller(ingrydId);
      target.leads += orphan.leads;
      target.quotesCount += orphan.quotesCount;
      target.quotesValue += orphan.quotesValue;
      target.salesCount += orphan.salesCount;
      target.salesValue += orphan.salesValue;
      sellerAcc.delete("sem_vendedor");
      const orphanResp = respBySeller["sem_vendedor"];
      if (orphanResp) {
        respBySeller[ingrydId] ||= { sum: 0, count: 0 };
        respBySeller[ingrydId].sum += orphanResp.sum;
        respBySeller[ingrydId].count += orphanResp.count;
        delete respBySeller["sem_vendedor"];
      }
    }

    const bySeller: SellerReport[] = [...sellerAcc.entries()].map(([id, acc]) => {
      const resp = respBySeller[id];
      return {
        id,
        name: id === "sem_vendedor" ? "Sem atendente" : (userNames.get(id) || "Desconhecido"),
        avatar: userAvatars.get(id) || null,
        leads: acc.leads,
        quotesCount: acc.quotesCount,
        quotesValue: acc.quotesValue,
        salesCount: acc.salesCount,
        salesValue: acc.salesValue,
        convRate: acc.leads > 0 ? (acc.salesCount / acc.leads) * 100 : 0,
        avgResponseMinutes: resp && resp.count > 0 ? resp.sum / resp.count : null,
      };
    }).sort((a, b) => b.salesValue - a.salesValue || b.leads - a.leads);

    // --- Leads por origem (com vendas atribuídas) ---
    const originAcc = new Map<string, { leads: number; salesCount: number; salesValue: number }>();
    const normOrigin = (o?: string | null) => (o && o.trim() ? o.trim() : "Não informado");
    leads.forEach((l) => {
      const key = normOrigin(l.origem);
      const acc = originAcc.get(key) || { leads: 0, salesCount: 0, salesValue: 0 };
      acc.leads += 1;
      originAcc.set(key, acc);
    });
    sales.forEach((s) => {
      const key = normOrigin(s.origem);
      const acc = originAcc.get(key) || { leads: 0, salesCount: 0, salesValue: 0 };
      acc.salesCount += 1;
      acc.salesValue += Number(s.valor) || 0;
      originAcc.set(key, acc);
    });
    const byOrigin: OriginReport[] = [...originAcc.entries()]
      .map(([origin, v]) => ({ origin, ...v }))
      .sort((a, b) => b.leads - a.leads);

    // --- Leads por campanha (com vendas atribuídas) ---
    const campaignAcc = new Map<string, { leads: number; salesCount: number; salesValue: number }>();
    const normCampaign = (c?: string | null) => (c && c.trim() ? c.trim() : "Sem campanha");
    leads.forEach((l) => {
      const key = normCampaign(l.campanha);
      const acc = campaignAcc.get(key) || { leads: 0, salesCount: 0, salesValue: 0 };
      acc.leads += 1;
      campaignAcc.set(key, acc);
    });
    sales.forEach((s) => {
      const key = normCampaign(s.campanha);
      const acc = campaignAcc.get(key) || { leads: 0, salesCount: 0, salesValue: 0 };
      acc.salesCount += 1;
      acc.salesValue += Number(s.valor) || 0;
      campaignAcc.set(key, acc);
    });
    const byCampaign: CampaignReport[] = [...campaignAcc.entries()]
      .map(([campaign, v]) => ({ campaign, ...v }))
      .sort((a, b) => b.leads - a.leads);

    // --- Leads por temperatura (qualidade) ---
    const tempOrder = ["Quente", "Morno", "Frio"];
    const tempAcc = new Map<string, number>();
    leads.forEach((l) => {
      const key = tempOrder.includes(l.temperatura || "") ? (l.temperatura as string) : "Frio";
      tempAcc.set(key, (tempAcc.get(key) || 0) + 1);
    });
    const byTemperature: TemperatureReport[] = tempOrder.map((t) => ({ temperature: t, leads: tempAcc.get(t) || 0 }));

    // --- Série diária (leads x vendas por dia no intervalo) ---
    const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
    const dayMap = new Map<string, { leads: number; sales: number; salesValue: number }>();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dayMap.set(d.toISOString().slice(0, 10), { leads: 0, sales: 0, salesValue: 0 });
    }
    leads.forEach((l) => {
      const k = dayKey(l.created_at);
      const e = dayMap.get(k); if (e) e.leads += 1;
    });
    sales.forEach((s) => {
      const k = dayKey(s.data_venda);
      const e = dayMap.get(k); if (e) { e.sales += 1; e.salesValue += Number(s.valor) || 0; }
    });
    const dailySeries: DailyPoint[] = [...dayMap.entries()].map(([date, v]) => ({ date, ...v }));

    // --- Comparativo com período anterior (mesma duração imediatamente antes) ---
    const rangeMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(start.getTime() - 1 - rangeMs);
    const [{ data: prevLeadsRaw }, { data: prevSales }] = await Promise.all([
      supabase
        .from("marketing_clientes")
        .select("remote_jid, temperatura, status, created_at, valor_venda, valor_orcamento")
        .gte("created_at", prevStart.toISOString())
        .lte("created_at", prevEnd.toISOString())
        .limit(5000),
      supabase
        .from("marketing_clientes")
        .select("remote_jid, valor_venda, data_venda, temperatura, status, created_at, valor_orcamento")
        .gt("valor_venda", 0)
        .not("data_venda", "is", null)
        .gte("data_venda", prevStart.toISOString())
        .lte("data_venda", prevEnd.toISOString())
        .limit(5000),
    ]);
    const prevLeadsFiltered = (prevLeadsRaw || []).filter(l => !isDescartado(l));
    const prevSalesFiltered = (prevSales || []).filter(l => !isDescartado(l));
    const prevSalesValue = prevSalesFiltered.reduce((acc, s) => acc + (Number(s.valor_venda) || 0), 0);

    // --- Totais e conversões ---
    const leadsCount = leads.length;
    const quotesCount = quotes.length;
    const quotesValue = quotes.reduce((acc, q) => acc + (Number(q.valor_orcamento) || 0), 0);
    const salesCount = sales.length;
    const salesValue = sales.reduce((acc, s) => acc + (Number(s.valor) || 0), 0);

    return {
      totals: {
        leads: leadsCount,
        quotesCount,
        quotesValue,
        salesCount,
        salesValue,
        avgTicket: salesCount > 0 ? salesValue / salesCount : 0,
        // Conversão por quantidade: vendas / leads
        convByCount: leadsCount > 0 ? (salesCount / leadsCount) * 100 : 0,
        // Conversão por valor: R$ vendido / R$ orçado
        convByValue: quotesValue > 0 ? (salesValue / quotesValue) * 100 : 0,
        // Conversão por orçamento: vendas / orçamentos enviados
        convByQuote: quotesCount > 0 ? (salesCount / quotesCount) * 100 : 0,
        avgResponseMinutes: respGlobalCount > 0 ? respGlobalSum / respGlobalCount : null,
      },
      previous: {
        leads: prevLeadsFiltered.length,
        salesCount: prevSalesFiltered.length,
        salesValue: prevSalesValue,
      },
      bySeller,
      byOrigin,
      byCampaign,
      byTemperature,
      dailySeries,
    };
  },

  async getEvolutionData(): Promise<EvolutionData> {
    const [{ data: clientsRaw }, { data: vendasRaw }, { data: usersRaw }] = await Promise.all([
      supabase
        .from("marketing_clientes")
        .select("remote_jid, nome, push_name, origem, campanha, valor_venda, created_at, vendedor_id, status, temperatura")
        .gt("valor_venda", 0)
        .order("valor_venda", { ascending: false })
        .limit(5000),
      supabase
        .from("marketing_vendas")
        .select("remote_jid, valor, created_at")
        .order("created_at", { ascending: true })
        .limit(50000),
      supabase.from("usuarios").select("id, name"),
    ]);

    const userNames = new Map<string, string>();
    (usersRaw || []).forEach((u) => userNames.set(u.id, u.name));

    const vendasByJid = new Map<string, ClientSale[]>();
    for (const v of (vendasRaw || [])) {
      if (!v.remote_jid || !v.created_at) continue;
      const list = vendasByJid.get(v.remote_jid) || [];
      list.push({ valor: Number(v.valor) || 0, created_at: v.created_at });
      vendasByJid.set(v.remote_jid, list);
    }

    const clients: EvolutionClient[] = (clientsRaw || [])
      .filter((c) => !isDescartado(c))
      .map((c) => {
        const vendas = vendasByJid.get(c.remote_jid) || [];
        return {
          remote_jid: c.remote_jid,
          push_name: (c.nome && c.nome.trim()) || (c.push_name && c.push_name.trim()) || c.remote_jid.replace("@s.whatsapp.net", ""),
          origem: c.origem || null,
          campanha: c.campanha || null,
          vendedor_nome: c.vendedor_id ? (userNames.get(c.vendedor_id) || null) : null,
          created_at: c.created_at,
          vendas,
          total_vendas: vendas.reduce((s, v) => s + v.valor, 0),
        };
      });

    return {
      clients,
      totalValue: clients.reduce((s, c) => s + c.total_vendas, 0),
      totalClients: clients.length,
    };
  },

  async exportLeadsXlsx(startDate: Date, endDate?: Date) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = endDate ? new Date(endDate) : new Date(startDate);
    end.setHours(23, 59, 59, 999);

    const [{ data: leadsByCriacao }, { data: vendasNoPeriodo }, { data: usersData }] = await Promise.all([
      supabase
        .from('marketing_clientes')
        .select('*')
        .not('ultima_conversa_em', 'is', null)
        .gte('ultima_conversa_em', start.toISOString())
        .lte('ultima_conversa_em', end.toISOString())
        .limit(5000),
      supabase
        .from('marketing_clientes')
        .select('remote_jid, valor_venda, data_venda')
        .gt('valor_venda', 0)
        .not('data_venda', 'is', null)
        .gte('data_venda', start.toISOString())
        .lte('data_venda', end.toISOString())
        .limit(5000),
      supabase.from("usuarios").select("id, name"),
    ]);

    const userNamesMap = new Map<string, string>();
    (usersData || []).forEach(u => userNamesMap.set(u.id, u.name));

    const vendasByJid: Record<string, { valor: number; created_at: string }[]> = {};
    (vendasNoPeriodo || []).forEach(v => {
      if (!vendasByJid[v.remote_jid]) vendasByJid[v.remote_jid] = [];
      vendasByJid[v.remote_jid].push({ valor: Number(v.valor_venda) || 0, created_at: v.data_venda as string });
    });

    const jidsComVenda = Object.keys(vendasByJid);
    const jidsLeads = new Set((leadsByCriacao || []).map(l => l.remote_jid));
    const jidsFaltando = jidsComVenda.filter(jid => !jidsLeads.has(jid));

    let leadsFaltantes: typeof leadsByCriacao = [];
    if (jidsFaltando.length > 0) {
      const { data } = await supabase
        .from('marketing_clientes')
        .select('*')
        .in('remote_jid', jidsFaltando);
      leadsFaltantes = data || [];
    }

    const leadsMap = new Map<string, NonNullable<typeof leadsByCriacao>[0]>();
    [...(leadsByCriacao || []), ...leadsFaltantes].forEach(l => {
      if (!leadsMap.has(l.remote_jid)) leadsMap.set(l.remote_jid, l);
    });
    const leads = Array.from(leadsMap.values())
      .filter(l => !isDescartado(l))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (leads.length === 0) return null;

    const allJids = leads.map(l => l.remote_jid);
    const messagesByJid: Record<string, { sender: string; timestamp: string }[]> = {};

    const batchSize = 30;
    for (let i = 0; i < allJids.length; i += batchSize) {
      const batch = allJids.slice(i, i + batchSize);
      const { data: msgs } = await supabase
        .from('marketing_whatsapp')
        .select('remote_jid, sender, timestamp')
        .in('remote_jid', batch)
        .order('timestamp', { ascending: true })
        .limit(5000);
      (msgs || []).forEach(m => {
        if (!messagesByJid[m.remote_jid]) messagesByJid[m.remote_jid] = [];
        messagesByJid[m.remote_jid].push(m);
      });
    }

    const formatDate = (d: string | undefined | null) => {
      if (!d) return '';
      const date = new Date(d);
      return date.toLocaleDateString('pt-BR');
    };

    const formatPhone = (jid: string) => {
      const num = jid.replace('@s.whatsapp.net', '');
      if (num.length >= 12) {
        const ddd = num.slice(2, 4);
        const part1 = num.slice(4, 9);
        const part2 = num.slice(9);
        return `(${ddd}) ${part1}-${part2}`;
      }
      return num;
    };

    const calcResponseMinutes = (jid: string, createdAt: string): number | null => {
      const msgs = messagesByJid[jid];
      if (!msgs || msgs.length === 0) return null;
      const firstContact = msgs.find(m => m.sender === 'contact');
      if (!firstContact) {
        const firstOur = msgs.find(m => m.sender === 'me');
        if (!firstOur) return null;
        const diff = (new Date(firstOur.timestamp).getTime() - new Date(createdAt).getTime()) / 60000;
        return diff >= 0 && diff <= 1440 ? diff : null;
      }
      const firstResponse = msgs.find(m => m.sender === 'me' && m.timestamp > firstContact.timestamp);
      if (!firstResponse) return null;
      const diff = (new Date(firstResponse.timestamp).getTime() - new Date(firstContact.timestamp).getTime()) / 60000;
      return diff >= 0 && diff <= 1440 ? diff : null;
    };

    const allMinutes = leads.map(l => calcResponseMinutes(l.remote_jid, l.created_at)).filter((v): v is number => v !== null);
    const avgMinutes = allMinutes.length > 0 ? allMinutes.reduce((a, b) => a + b, 0) / allMinutes.length : 5;

    const formatMinutes = (min: number): string => {
      if (min < 1) return '< 1 min';
      if (min < 60) return `${Math.round(min)} min`;
      const h = Math.floor(min / 60);
      const m = Math.round(min % 60);
      return m > 0 ? `${h}h ${m}min` : `${h}h`;
    };

    const hasRealSale = (lead: typeof leads[0]) => {
      const vendas = vendasByJid[lead.remote_jid];
      return vendas && vendas.length > 0;
    };

    const resolveStatus = (lead: typeof leads[0]) => {
      if (hasRealSale(lead)) return 'Convertido';
      if (lead.status === 'Arquivado') return lead.motivo_arquivamento || 'Arquivado';
      if (lead.status && lead.status !== 'Novo Lead' && lead.status !== 'Convertido') return lead.status;
      const msgs = messagesByJid[lead.remote_jid];
      if (!msgs || msgs.length === 0) return 'Cliente Curioso';
      const hasOurReply = msgs.some(m => m.sender === 'me');
      return hasOurReply ? 'Em Conversa' : 'Cliente Curioso';
    };

    const resolveTemperatura = (lead: typeof leads[0]) => {
      if (hasRealSale(lead)) return 'Convertido';
      const temp = lead.temperatura || '';
      return temp === 'Convertido' ? 'Frio' : temp;
    };

    const resolveName = (lead: typeof leads[0]) => {
      if (lead.nome && lead.nome.trim()) return lead.nome.trim();
      if (lead.push_name && lead.push_name.trim()) return lead.push_name.trim();
      return formatPhone(lead.remote_jid);
    };

    const rows = leads.map((lead, idx) => {
      const vendas = vendasByJid[lead.remote_jid] || [];
      const totalVendas = vendas.reduce((acc, v) => acc + v.valor, 0);
      const ultimaVenda = vendas.length > 0 ? vendas.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at : null;

      return {
        'ID Lead': String(idx + 1).padStart(4, '0'),
        'Data de Entrada': formatDate(lead.created_at),
        'Nome Cliente': resolveName(lead),
        'WhatsApp/Telefone': formatPhone(lead.remote_jid),
        'Status': resolveStatus(lead),
        'Temperatura': resolveTemperatura(lead),
        'Vendedor': lead.vendedor_id ? (userNamesMap.get(lead.vendedor_id) || 'Desconhecido') : 'Sem atendente',
        'Última Interação': formatDate(lead.ultima_conversa_em),
        'Qtd Vendas': vendas.length,
        'Valor Venda (R$)': totalVendas,
        'Data Última Venda': formatDate(ultimaVenda),
        'Valor Orçamento (R$)': Number(lead.valor_orcamento) || 0,
        'Data Orçamento': formatDate(lead.data_orcamento),
        'Origem': lead.origem || 'Não identificada',
        'Campanha': lead.campanha || '—',
        'Tempo Resposta': formatMinutes(calcResponseMinutes(lead.remote_jid, lead.created_at) ?? avgMinutes)
      };
    });

    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const title = [['REGISTRO DE LEADS — CARFLAX']];
    const subtitle = [[`Período: ${formatDate(start.toISOString())} até ${formatDate(end.toISOString())}`]];
    const blank = [['']];

    const ws = XLSX.utils.aoa_to_sheet([...title, ...subtitle, ...blank]);
    XLSX.utils.sheet_add_json(ws, rows, { origin: 'A4' });

    const colWidths = [
      { wch: 10 }, { wch: 16 }, { wch: 25 }, { wch: 20 },
      { wch: 16 }, { wch: 12 }, { wch: 20 }, { wch: 16 },
      { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 18 },
      { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 18 }
    ];
    ws['!cols'] = colWidths;
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 15 } }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Leads Tráfego');

    const fileName = `Leads_Carflax_${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    return fileName;
  },

  /**
   * O que os clientes pesquisaram antes de clicar no anúncio.
   *
   * Fonte: `ads_cliques.utm_term`, gravado pela ponte de atribuição. Agrupa por
   * termo normalizado (minúsculo, sem espaço sobrando) porque o Google devolve
   * o mesmo termo com caixa diferente conforme o usuário digitou.
   */
  async getPesquisas(startDate?: Date, endDate?: Date): Promise<PesquisasData> {
    let query = supabase
      .from("ads_cliques")
      .select("utm_term, utm_campaign, remote_jid, created_at")
      .order("created_at", { ascending: false });

    if (startDate) query = query.gte("created_at", startDate.toISOString());
    if (endDate) {
      const fim = new Date(endDate);
      fim.setHours(23, 59, 59, 999);
      query = query.lte("created_at", fim.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      console.error("[Pesquisas] erro ao carregar:", error.message);
      return { termos: [], totalCliques: 0, cliquesSemTermo: 0 };
    }

    const linhas = data || [];
    const mapa = new Map<string, TermoPesquisado & { campanhasSet: Set<string> }>();
    let semTermo = 0;

    for (const linha of linhas) {
      const bruto = String(linha.utm_term || "").trim();
      if (!bruto) {
        semTermo++;
        continue;
      }
      const chave = bruto.toLowerCase();
      const atual =
        mapa.get(chave) ||
        {
          termo: bruto,
          cliques: 0,
          conversas: 0,
          campanhas: [] as string[],
          ultimoEm: linha.created_at,
          campanhasSet: new Set<string>(),
        };

      atual.cliques++;
      if (linha.remote_jid) atual.conversas++;
      if (linha.utm_campaign) atual.campanhasSet.add(String(linha.utm_campaign));
      // A consulta vem em ordem decrescente, então o primeiro visto é o mais recente.
      if (linha.created_at > atual.ultimoEm) atual.ultimoEm = linha.created_at;
      mapa.set(chave, atual);
    }

    const termos = Array.from(mapa.values())
      .map(({ campanhasSet, ...t }) => ({ ...t, campanhas: Array.from(campanhasSet) }))
      .sort((a, b) => b.cliques - a.cliques || b.conversas - a.conversas);

    return { termos, totalCliques: linhas.length, cliquesSemTermo: semTermo };
  },

  async getVerbasData(startDate?: Date, endDate?: Date): Promise<VerbasData> {
    const fornecedoresConfig: { nome: string; marca: string; percentual: number; expiraMeses: number }[] = [
      { nome: "AMANCO", marca: "AMANCO", percentual: 3, expiraMeses: 9 },
    ];

    const fornecedores: VerbasFornecedor[] = [];

    for (const cfg of fornecedoresConfig) {
      let sql = `SELECT GRUPO, DATA, TOTAL FROM VW_COMPRAS_PRODUTOS WHERE MARCA = '${cfg.marca}'`;
      if (startDate) sql += ` AND DATA >= '${startDate.toISOString().slice(0, 10)}'`;
      if (endDate) sql += ` AND DATA <= '${endDate.toISOString().slice(0, 10)}'`;
      sql += ` ORDER BY DATA`;

      const res = await apiAdminSQL(sql);
      if (!res.success || !res.data) continue;

      const rows = res.data as { GRUPO: string; DATA: string; TOTAL: string }[];

      const triMap = new Map<string, { grupo: string; total: number }[]>();
      for (const r of rows) {
        const d = new Date(r.DATA);
        const q = Math.ceil((d.getMonth() + 1) / 3);
        const key = `T ${String(q).padStart(2, "0")}-${String(d.getFullYear()).slice(2)}`;
        if (!triMap.has(key)) triMap.set(key, []);
        triMap.get(key)!.push({ grupo: (r.GRUPO || "").trim(), total: Number(r.TOTAL) || 0 });
      }

      const now = new Date();
      const trimestres: VerbasTrimestre[] = [];

      for (const [tri, items] of triMap) {
        const grupoAgg = new Map<string, number>();
        for (const it of items) {
          grupoAgg.set(it.grupo, (grupoAgg.get(it.grupo) || 0) + it.total);
        }
        const grupos: VerbasGrupo[] = Array.from(grupoAgg.entries())
          .map(([grupo, total]) => ({ grupo, total, isTubo: grupo.toUpperCase().startsWith("TUBO") }))
          .sort((a, b) => b.total - a.total);

        const totalComprado = grupos.reduce((s, g) => s + g.total, 0);
        const totalSemTubo = grupos.filter((g) => !g.isTubo).reduce((s, g) => s + g.total, 0);
        const valorVerba = totalSemTubo * (cfg.percentual / 100);

        const parts = tri.match(/T (\d+)-(\d+)/);
        const qNum = parts ? parseInt(parts[1]) : 1;
        const yShort = parts ? parseInt(parts[2]) : 0;
        const year = yShort < 50 ? 2000 + yShort : 1900 + yShort;
        const lastMonthOfQ = qNum * 3;
        const endOfQ = new Date(year, lastMonthOfQ, 0);
        const expireDate = new Date(endOfQ);
        expireDate.setMonth(expireDate.getMonth() + cfg.expiraMeses);
        const diffMs = expireDate.getTime() - now.getTime();
        const expiraEm = Math.max(0, Math.ceil(diffMs / (30 * 24 * 60 * 60 * 1000)));
        const expirado = diffMs <= 0;

        const labels: Record<number, string> = { 1: "1º Tri", 2: "2º Tri", 3: "3º Tri", 4: "4º Tri" };

        trimestres.push({
          trimestre: tri,
          label: `${labels[qNum] || tri} ${year}`,
          grupos,
          totalComprado,
          totalSemTubo,
          valorVerba,
          expiraEm,
          expirado,
        });
      }

      trimestres.sort((a, b) => {
        const pa = a.trimestre.match(/T (\d+)-(\d+)/);
        const pb = b.trimestre.match(/T (\d+)-(\d+)/);
        const ya = pa ? parseInt(pa[2]) : 0, qa = pa ? parseInt(pa[1]) : 0;
        const yb = pb ? parseInt(pb[2]) : 0, qb = pb ? parseInt(pb[1]) : 0;
        return ya !== yb ? ya - yb : qa - qb;
      });

      const totalComprado = trimestres.reduce((s, t) => s + t.totalComprado, 0);
      const totalSemTubo = trimestres.reduce((s, t) => s + t.totalSemTubo, 0);
      const valorVerba = trimestres.reduce((s, t) => s + t.valorVerba, 0);
      const valorRestante = trimestres.filter((t) => !t.expirado).reduce((s, t) => s + t.valorVerba, 0);

      fornecedores.push({
        fornecedor: cfg.nome,
        trimestres,
        totalComprado,
        totalSemTubo,
        percentualVerba: cfg.percentual,
        valorVerba,
        valorRestante,
      });
    }

    return {
      fornecedores,
      totalGeral: fornecedores.reduce((s, f) => s + f.totalComprado, 0),
      totalVerbas: fornecedores.reduce((s, f) => s + f.valorVerba, 0),
    };
  }
};
