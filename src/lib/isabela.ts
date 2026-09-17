// Isabela, atendente virtual do WhatsApp (API oficial). Quem responde é o backend
// (db/src/lib/isabela); o HUB só configura e acompanha pelo Supabase.

import { supabase } from "@/lib/supabase";

export interface IsabelaConfig {
  ativo: boolean;
  modo: "teste" | "todos";
  numeros_teste: string[];
  informacoes_loja: string;
  instrucoes_extras: string;
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
  resumo: string | null;
  respostas: number;
  ultimo_erro: string | null;
}

export async function carregarConfigIsabela(): Promise<IsabelaConfig> {
  const { data, error } = await supabase
    .from("isabela_config")
    .select("ativo, modo, numeros_teste, informacoes_loja, instrucoes_extras, atualizado_por, updated_at")
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

export async function carregarConversaIsabela(remoteJid: string): Promise<IsabelaConversa | null> {
  const { data } = await supabase
    .from("isabela_conversas")
    .select("remote_jid, status, iniciada_em, transferida_em, motivo_transferencia, resumo, respostas, ultimo_erro")
    .eq("remote_jid", remoteJid)
    .maybeSingle();
  return (data as IsabelaConversa | null) ?? null;
}

/** Pausar tira a Isabela da conversa; reativar recomeça a contagem de "vendedor respondeu" a partir de agora. */
export async function mudarStatusIsabela(remoteJid: string, status: "pausada" | "ativa") {
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("isabela_conversas")
    .upsert(
      { remote_jid: remoteJid, status, updated_at: agora, ...(status === "ativa" ? { iniciada_em: agora } : {}) },
      { onConflict: "remote_jid" },
    );
  if (error) throw new Error(error.message);
}
