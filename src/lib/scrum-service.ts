import { supabase } from "@/lib/supabase";

export type ScrumStatus = "aberto" | "analise" | "andamento" | "resolvido";
export type ScrumPrioridade = "baixa" | "media" | "alta" | "critica";

export interface ScrumOcorrencia {
  id: string;
  titulo: string;
  setor: string;
  descricao: string;
  solucao_proposta: string | null;
  prioridade: ScrumPrioridade;
  status: ScrumStatus;
  autor_id: string | null;
  autor_nome: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  decisao: string | null;
  resposta_responsavel: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export async function listOcorrencias(): Promise<ScrumOcorrencia[]> {
  const { data, error } = await supabase
    .from("scrum_ocorrencias")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[Scrum] Erro ao listar ocorrências:", error);
    return [];
  }
  return (data || []) as ScrumOcorrencia[];
}

export async function createOcorrencia(
  payload: Partial<ScrumOcorrencia>,
): Promise<ScrumOcorrencia | null> {
  const { data, error } = await supabase
    .from("scrum_ocorrencias")
    .insert(payload)
    .select()
    .single();
  if (error) {
    console.error("[Scrum] Erro ao criar ocorrência:", error);
    throw error;
  }
  return data as ScrumOcorrencia;
}

export async function updateOcorrencia(
  id: string,
  patch: Partial<ScrumOcorrencia>,
): Promise<void> {
  const { error } = await supabase
    .from("scrum_ocorrencias")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[Scrum] Erro ao atualizar ocorrência:", error);
    throw error;
  }
}

export async function deleteOcorrencia(id: string): Promise<void> {
  const { error } = await supabase.from("scrum_ocorrencias").delete().eq("id", id);
  if (error) {
    console.error("[Scrum] Erro ao excluir ocorrência:", error);
    throw error;
  }
}
