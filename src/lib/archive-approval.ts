import { supabase } from "./supabase";
import { marketingService } from "./marketing-service";

/**
 * Aprovação de arquivamento de conversas do WhatsApp.
 *
 * Regra: conversa com "dívida aberta" — a última mensagem é do cliente e não
 * houve resposta, ou existem mensagens não lidas — não pode ser arquivada pelo
 * atendente. O clique vira um PEDIDO na fila do supervisor e a conversa continua
 * ativa (e continua sendo cobrada pelo escalador de SLA) até a decisão.
 *
 * Quem pode aprovar arquiva direto, mas o arquivamento fica carimbado com o autor.
 */

export interface ArchiveApprovalUser {
  id?: string;
  name?: string;
  role?: string;
  is_admin?: boolean;
  is_leader?: boolean;
}

export interface ArchiveApprovalRequest {
  id: string;
  remote_jid: string;
  cliente_nome?: string | null;
  solicitante_id?: string | null;
  solicitante_nome?: string | null;
  motivo: string;
  forma_pagamento?: string | null;
  observacao?: string | null;
  ultima_mensagem?: string | null;
  ultima_mensagem_em?: string | null;
  minutos_espera?: number | null;
  mensagens_nao_lidas: number;
  status: "pendente" | "aprovado" | "recusado" | "cancelado";
  aprovador_id?: string | null;
  aprovador_nome?: string | null;
  decisao_observacao?: string | null;
  decidido_em?: string | null;
  created_at: string;
}

export interface DebtSnapshot {
  temDebito: boolean;
  ultimaMensagem: string | null;
  ultimaMensagemEm: string | null;
  minutosEspera: number | null;
  naoLidas: number;
}

const TABELA = "marketing_arquivamento_aprovacoes";

function normalizar(texto?: string | null): string {
  return (texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

/**
 * Supervisor de vendas, gerência, diretoria e admin aprovam. Líder direto também,
 * para a fila não travar quando o João Paulo estiver de férias/afastado.
 */
export function podeAprovarArquivamento(user?: ArchiveApprovalUser | null): boolean {
  if (!user) return false;
  if (user.is_admin || user.is_leader) return true;

  const role = normalizar(user.role);
  if (
    role.includes("SUPERVISOR") ||
    role.includes("GERENTE") ||
    role.includes("DIRETOR") ||
    role === "ADMIN"
  ) {
    return true;
  }

  return normalizar(user.name).includes("JOAO PAULO");
}

/**
 * Fonte da verdade do débito: a ÚLTIMA mensagem gravada da conversa. Não usa o
 * estado da tela porque ele pode estar defasado (e seria contornável recarregando
 * a lista antes de arquivar).
 */
export async function verificarDebitoAberto(remoteJid: string): Promise<DebtSnapshot> {
  const [{ data: msgs }, { data: cliente }] = await Promise.all([
    supabase
      .from("marketing_whatsapp")
      .select("sender, texto, timestamp")
      .eq("remote_jid", remoteJid)
      .order("timestamp", { ascending: false })
      .limit(1),
    supabase
      .from("marketing_clientes")
      .select("mensagens_nao_lidas, ultima_mensagem, ultima_conversa_em")
      .eq("remote_jid", remoteJid)
      .maybeSingle(),
  ]);

  const ultima = msgs && msgs.length > 0 ? msgs[0] : null;
  const naoLidas = Number(cliente?.mensagens_nao_lidas) || 0;
  const ultimaEhDoCliente = ultima ? ultima.sender === "contact" : false;
  const temDebito = ultimaEhDoCliente || naoLidas > 0;

  const ultimaMensagemEm = ultima?.timestamp || cliente?.ultima_conversa_em || null;
  const minutosEspera = ultimaMensagemEm
    ? Math.max(0, Math.round((Date.now() - new Date(ultimaMensagemEm).getTime()) / 60000))
    : null;

  return {
    temDebito,
    ultimaMensagem: ultima?.texto || cliente?.ultima_mensagem || null,
    ultimaMensagemEm,
    minutosEspera: temDebito ? minutosEspera : null,
    naoLidas,
  };
}

/** Usuários que devem receber o pedido: o João Paulo à frente, líderes como retaguarda. */
async function buscarAprovadores(): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase
    .from("usuarios")
    .select("id, name, role, is_admin, is_leader");

  const aprovadores = (data || []).filter((u) => podeAprovarArquivamento(u));
  const supervisor = aprovadores.filter((u) => normalizar(u.name).includes("JOAO PAULO"));
  const alvo = supervisor.length > 0 ? supervisor : aprovadores;

  return alvo
    .filter((u) => u.id)
    .map((u) => ({ id: u.id as string, name: (u.name as string) || "" }));
}

/**
 * Cria o pedido de arquivamento. Se já existir um pendente para a mesma conversa,
 * o índice único devolve conflito e reaproveitamos o pedido existente — dois
 * cliques não viram duas filas.
 */
export async function solicitarAprovacaoArquivamento(payload: {
  remoteJid: string;
  clienteNome?: string;
  motivo: string;
  formaPagamento?: string;
  observacao?: string;
  solicitante?: ArchiveApprovalUser | null;
  debito: DebtSnapshot;
}): Promise<{ criado: boolean; pedido: ArchiveApprovalRequest | null }> {
  const { debito } = payload;

  const { data, error } = await supabase
    .from(TABELA)
    .insert({
      remote_jid: payload.remoteJid,
      cliente_nome: payload.clienteNome || null,
      solicitante_id: payload.solicitante?.id || null,
      solicitante_nome: payload.solicitante?.name || null,
      motivo: payload.motivo,
      forma_pagamento: payload.formaPagamento || null,
      observacao: payload.observacao || null,
      ultima_mensagem: debito.ultimaMensagem,
      ultima_mensagem_em: debito.ultimaMensagemEm,
      minutos_espera: debito.minutosEspera,
      mensagens_nao_lidas: debito.naoLidas,
    })
    .select("*")
    .single();

  // 23505 = índice único de pendente por conversa: já existe pedido na fila.
  if (error && error.code === "23505") {
    const existente = await buscarPedidoPendente(payload.remoteJid);
    return { criado: false, pedido: existente };
  }

  if (error) throw error;

  const pedido = data as ArchiveApprovalRequest;
  await notificarAprovadores(pedido);
  return { criado: true, pedido };
}

async function notificarAprovadores(pedido: ArchiveApprovalRequest) {
  try {
    const aprovadores = await buscarAprovadores();
    if (aprovadores.length === 0) return;

    const cliente = pedido.cliente_nome || pedido.remote_jid.split("@")[0];
    const espera = pedido.minutos_espera
      ? ` (cliente esperando há ${pedido.minutos_espera} min)`
      : "";

    await supabase.from("hub_notificacoes").insert(
      aprovadores.map((a) => ({
        user_id: a.id,
        titulo: "🗄️ Arquivamento aguardando aprovação",
        descricao:
          `${pedido.solicitante_nome || "Atendente"} pediu para arquivar a conversa de ${cliente}${espera}. ` +
          `Motivo: ${pedido.motivo}.`,
        tipo: "arquivamento_aprovacao",
        metadata: { pedido_id: pedido.id, remote_jid: pedido.remote_jid },
      })),
    );
  } catch (err) {
    // Notificação é acessório: o pedido já está na fila e aparece no painel.
    console.error("[ArchiveApproval] Falha ao notificar aprovadores:", err);
  }
}

export async function listarAprovacoesPendentes(): Promise<ArchiveApprovalRequest[]> {
  const { data, error } = await supabase
    .from(TABELA)
    .select("*")
    .eq("status", "pendente")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[ArchiveApproval] Erro ao listar pendentes:", error.message);
    return [];
  }
  return (data || []) as ArchiveApprovalRequest[];
}

export async function buscarPedidoPendente(
  remoteJid: string,
): Promise<ArchiveApprovalRequest | null> {
  const { data } = await supabase
    .from(TABELA)
    .select("*")
    .eq("remote_jid", remoteJid)
    .eq("status", "pendente")
    .maybeSingle();
  return (data as ArchiveApprovalRequest) || null;
}

/**
 * O atendente respondeu o cliente: a dívida acabou e o pedido não faz mais
 * sentido na fila do supervisor. Silencioso — é uma limpeza, não uma decisão.
 */
export async function cancelarPedidoPendente(remoteJid: string): Promise<void> {
  try {
    await supabase
      .from(TABELA)
      .update({
        status: "cancelado",
        decisao_observacao: "Atendente respondeu o cliente antes da decisão.",
        decidido_em: new Date().toISOString(),
      })
      .eq("remote_jid", remoteJid)
      .eq("status", "pendente");
  } catch (err) {
    console.error("[ArchiveApproval] Falha ao cancelar pedido pendente:", err);
  }
}

/**
 * Decide o pedido. Só arquiva DEPOIS que o update do pedido dá certo — assim
 * dois aprovadores clicando junto não arquivam duas vezes, e uma falha no meio
 * nunca deixa a conversa arquivada sem registro da decisão.
 */
export async function decidirAprovacao(
  pedido: ArchiveApprovalRequest,
  aprovado: boolean,
  aprovador: ArchiveApprovalUser,
  decisaoObservacao?: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABELA)
    .update({
      status: aprovado ? "aprovado" : "recusado",
      aprovador_id: aprovador.id || null,
      aprovador_nome: aprovador.name || null,
      decisao_observacao: decisaoObservacao || null,
      decidido_em: new Date().toISOString(),
    })
    .eq("id", pedido.id)
    .eq("status", "pendente")
    .select("id");

  if (error) throw error;
  if (!data || data.length === 0) return false; // outro aprovador chegou antes

  if (aprovado) {
    await marketingService.toggleArchived(
      pedido.remote_jid,
      true,
      pedido.motivo,
      pedido.forma_pagamento || undefined,
      pedido.observacao || undefined,
      aprovador.id,
    );
  }

  await notificarSolicitante(pedido, aprovado, aprovador, decisaoObservacao);
  return true;
}

async function notificarSolicitante(
  pedido: ArchiveApprovalRequest,
  aprovado: boolean,
  aprovador: ArchiveApprovalUser,
  decisaoObservacao?: string,
) {
  if (!pedido.solicitante_id) return;
  try {
    const cliente = pedido.cliente_nome || pedido.remote_jid.split("@")[0];
    await supabase.from("hub_notificacoes").insert([
      {
        user_id: pedido.solicitante_id,
        titulo: aprovado ? "✅ Arquivamento aprovado" : "⛔ Arquivamento recusado",
        descricao: aprovado
          ? `${aprovador.name || "O supervisor"} aprovou o arquivamento da conversa de ${cliente}.`
          : `${aprovador.name || "O supervisor"} recusou o arquivamento de ${cliente} — responda o cliente.` +
            (decisaoObservacao ? ` Observação: ${decisaoObservacao}` : ""),
        tipo: "arquivamento_aprovacao",
        metadata: { pedido_id: pedido.id, remote_jid: pedido.remote_jid, aprovado },
      },
    ]);
  } catch (err) {
    console.error("[ArchiveApproval] Falha ao notificar solicitante:", err);
  }
}
