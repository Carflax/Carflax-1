import { supabase } from "./supabase";

const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.8;

const ehHeic = (file: File) =>
  /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);

/**
 * Deixa a foto num formato que o navegador abre, antes de pré-visualizar ou
 * enviar. Foto do iPhone vem em HEIC, que o Chrome não decodifica: antes isso
 * estourava "Falha ao carregar imagem" e o comunicado não salvava. HEIC/HEIF é
 * convertido para JPG (heic2any, carregado só quando precisa); os demais formatos
 * passam direto.
 */
export async function prepararImagem(file: File): Promise<File> {
  if (!ehHeic(file)) return file;
  try {
    const { default: heic2any } = await import("heic2any");
    const convertido = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(convertido) ? convertido[0] : convertido;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    throw new Error("Não foi possível converter a foto do iPhone (HEIC). Salve como JPG ou PNG e tente de novo.");
  }
}

function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION && file.size <= 500_000) {
        resolve(file);
        return;
      }

      if (width > height) {
        if (width > MAX_DIMENSION) { height = Math.round(height * MAX_DIMENSION / width); width = MAX_DIMENSION; }
      } else {
        if (height > MAX_DIMENSION) { width = Math.round(width * MAX_DIMENSION / height); height = MAX_DIMENSION; }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Falha ao comprimir imagem")); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("O navegador não conseguiu abrir essa imagem. Use uma foto JPG, PNG ou WEBP."));
    };
    img.src = url;
  });
}

/**
 * @param allowAnon Permite o upload sem sessão do Supabase Auth (ex.: página pública
 * do motorista, aberta por link `?v=` sem login). Nesse caso o envio usa apenas a
 * chave anônima e depende da policy do bucket permitir INSERT anônimo.
 */
export async function uploadImage(file: File, bucket: string, skipCompression: boolean = false, allowAnon: boolean = false): Promise<string | null> {
  const { data: { session }, error: authError } = await supabase.auth.getSession();

  if (!allowAnon && (authError || !session)) {
    console.error("[Storage] Erro de autenticação:", authError);
    // Propagar erro específico para que o componente possa tratar (ex: sugerir logout)
    if (authError?.message?.includes("Refresh Token Not Found")) {
      throw new Error("Sua sessão expirou e o token de atualização não foi encontrado. Por favor, faça logout e login novamente.");
    }
    return null;
  }

  const pronta = await prepararImagem(file);
  const compressed = skipCompression ? pronta : await compressImage(pronta);
  const ext = compressed.name.split(".").pop() ?? "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  // upsert:false → INSERT puro (o path já é único, nunca sobrescreve). Com upsert:true
  // o Supabase trata como UPDATE, que exige permissão de UPDATE no RLS — o que quebra
  // o upload anônimo do motorista (que só tem policy de INSERT no bucket entregas).
  const { error } = await supabase.storage.from(bucket).upload(path, compressed, {
    upsert: false,
    contentType: compressed.type,
    cacheControl: '3600'
  });

  if (error) { 
    console.error(`[Storage] Erro upload em '${bucket}':`, error); 
    return null; 
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  let publicUrl = data.publicUrl;
  if (import.meta.env.DEV && publicUrl.includes("/supabase/storage/")) {
    const realSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://zwfvrmqffxcqurxpfewi.supabase.co";
    publicUrl = publicUrl.replace(`${window.location.origin}/supabase`, realSupabaseUrl);
  }
  console.log(`[Storage] Imagem disponível em: ${publicUrl}`);
  return publicUrl;
}
