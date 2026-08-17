import { supabase } from "./supabase";

/**
 * Sobe um currículo para o bucket privado `curriculos` e devolve o PATH interno
 * (não a URL): o bucket não é público — currículo é dado pessoal — então quem
 * precisa abrir o arquivo pede uma signed URL ao backend.
 */
export async function uploadCurriculo(file: File): Promise<{ path: string; nome: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sessão expirada. Faça login novamente para enviar currículos.");

  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const seguro = file.name.replace(/[^\w.-]+/g, "_").slice(-60);
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}-${seguro}`;

  const { error } = await supabase.storage.from("curriculos").upload(path, file, {
    upsert: false,
    contentType: file.type || (ext === "pdf" ? "application/pdf" : undefined),
    cacheControl: "3600",
  });

  if (error) throw new Error(`Falha ao enviar "${file.name}": ${error.message}`);
  return { path, nome: file.name };
}
