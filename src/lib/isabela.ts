// Isabela, atendente virtual do WhatsApp (API oficial). Quem responde é o backend
// (db/src/lib/isabela); o HUB só configura e acompanha pelo Supabase.

import { supabase } from "@/lib/supabase";
import { apiPost } from "@/lib/api";

export interface IsabelaConfig {
  ativo: boolean;
  modo: "teste" | "todos";
  numeros_teste: string[];
  informacoes_loja: string;
  instrucoes_extras: string;
  /** Vendedores que recebem as conversas transferidas (vai para quem tem menos abertas). */
  vendedores_ids: string[];
  atualizado_por: string | null;
  updated_at: string;
}

export type IsabelaStatus = "ativa" | "transferida" | "assumida" | "pausada";

export interface IsabelaConversa {
  remote_jid: string;
  status: IsabelaStatus;
  iniciada_em: string;
  transferida_em: string | null;
  motivo_transferencia: string | null;
  transferida_para: string | null;
  resumo: string | null;
  respostas: number;
  ultimo_erro: string | null;
}

export async function carregarConfigIsabela(): Promise<IsabelaConfig> {
  const { data, error } = await supabase
    .from("isabela_config")
    .select("ativo, modo, numeros_teste, informacoes_loja, instrucoes_extras, vendedores_ids, atualizado_por, updated_at")
    .eq("id", 1)
    .single();
  if (error) throw new Error(`Não foi possível carregar a Isabela: ${error.message}`);
  return data as IsabelaConfig;
}

export async function salvarConfigIsabela(config: Omit<IsabelaConfig, "atualizado_por" | "updated_at">, autor: string | null) {
  const { error } = await supabase
    .from("isabela_config")
    .update({ ...config, atualizado_por: autor, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(`Não foi possível salvar: ${error.message}`);
}

export interface VendedorWhatsapp {
  id: string;
  name: string;
  avatar: string | null;
}

/** Mesmo critério da lista de atendentes do WhatsApp: permissão "Whatsapp API" ou admin/gerente/diretor. */
export async function listarVendedoresWhatsapp(): Promise<VendedorWhatsapp[]> {
  const { data, error } = await supabase.from("usuarios").select("id, name, avatar, permissions, is_admin, role").order("name");
  if (error) throw new Error(error.message);
  return (data || [])
    .filter((u) => {
      if (u.is_admin) return true;
      const role = String(u.role || "").toUpperCase();
      if (role === "ADMIN" || role.includes("GERENTE") || role.includes("DIRETOR")) return true;
      return Array.isArray(u.permissions) && u.permissions.includes("Whatsapp API");
    })
    .map((u) => ({ id: String(u.id), name: u.name, avatar: u.avatar ?? null }));
}

export async function carregarConversaIsabela(remoteJid: string): Promise<IsabelaConversa | null> {
  const { data } = await supabase
    .from("isabela_conversas")
    .select("remote_jid, status, iniciada_em, transferida_em, motivo_transferencia, transferida_para, resumo, respostas, ultimo_erro")
    .eq("remote_jid", remoteJid)
    .maybeSingle();
  return (data as IsabelaConversa | null) ?? null;
}

/**
 * Coloca a Isabela na conversa (ou reativa). Vai pelo backend, e não direto no
 * Supabase, para ela já responder a mensagem do cliente que estiver esperando.
 */
export async function ativarIsabela(remoteJid: string) {
  const r = await apiPost<{ success: boolean; message?: string }>("/api/whatsapp/isabela/ativar", { remoteJid });
  if (!r?.success) throw new Error(r?.message || "Falha ao ativar a Isabela");
}

/** Pausar tira a Isabela da conversa; reativar recomeça a contagem de "vendedor respondeu" a partir de agora. */
export async function mudarStatusIsabela(remoteJid: string, status: "pausada" | "ativa") {
  if (status === "ativa") return ativarIsabela(remoteJid);
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("isabela_conversas")
    .upsert(
      { remote_jid: remoteJid, status, updated_at: agora, ...(status === "ativa" ? { iniciada_em: agora } : {}) },
      { onConflict: "remote_jid" },
    );
  if (error) throw new Error(error.message);
}

// ─── Aprendizado com as conversas dos vendedores ─────────────────────────────

export interface IsabelaAprendizado {
  id: string;
  status: "processando" | "rascunho" | "aprovado" | "descartado" | "erro";
  conteudo: string | null;
  conversas_venda: number;
  conversas_sem_venda: number;
  erro: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  created_at: string;
  updated_at: string;
}

const CAMPOS_APRENDIZADO =
  "id, status, conteudo, conversas_venda, conversas_sem_venda, erro, aprovado_por, aprovado_em, created_at, updated_at";

/** Guia em uso (aprovado mais recente) e a última análise ainda não resolvida. */
export async function carregarAprendizados(): Promise<{ aprovado: IsabelaAprendizado | null; pendente: IsabelaAprendizado | null }> {
  const [aprovado, pendente] = await Promise.all([
    supabase.from("isabela_aprendizados").select(CAMPOS_APRENDIZADO).eq("status", "aprovado")
      .order("aprovado_em", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("isabela_aprendizados").select(CAMPOS_APRENDIZADO).in("status", ["processando", "rascunho", "erro"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (aprovado.error) throw new Error(aprovado.error.message);
  if (pendente.error) throw new Error(pendente.error.message);
  return { aprovado: aprovado.data as IsabelaAprendizado | null, pendente: pendente.data as IsabelaAprendizado | null };
}

/** Dispara a análise no backend (roda em segundo plano, 1–3 min). */
export async function analisarConversasIsabela(autor: string | null) {
  return apiPost<{ success: boolean; id: string; jaEmAndamento: boolean }>("/api/whatsapp/isabela/aprender", { autor });
}

export async function aprovarAprendizado(id: string, conteudo: string, autor: string | null) {
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("isabela_aprendizados")
    .update({ status: "aprovado", conteudo: conteudo.trim(), aprovado_por: autor, aprovado_em: agora, updated_at: agora })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function descartarAprendizado(id: string) {
  const { error } = await supabase
    .from("isabela_aprendizados")
    .update({ status: "descartado", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
