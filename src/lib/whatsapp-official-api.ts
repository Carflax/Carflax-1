/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Cliente da API OFICIAL do WhatsApp (Meta Cloud API) no formato `WhatsappApi`
 * consumido pela tela compartilhada (WhatsappView). NÃO fala com Evolution/GO:
 *   • Envio  → backend `/api/whatsapp/send` (credenciais da Meta ficam no servidor).
 *   • Realtime → Supabase (tabela marketing_whatsapp, onde o webhook oficial grava).
 *   • Info da instância → whatsapp_official_config (número/negócio configurado).
 * As conversas e o histórico continuam vindo do Supabase via marketingService,
 * igual às outras telas — aqui só trocamos o "provider" para o oficial.
 */

import { supabase } from "./supabase";
import { marketingService } from "./marketing-service";
import { API_BASE } from "./api";

// Identidade do número oficial (público, não é segredo). Usado só no cabeçalho da
// tela. Evita consultar a tabela `whatsapp_official_config` (que não existe) — o
// token/credenciais reais ficam no backend (env), nunca no frontend.
const OFFICIAL_NUMBER = "+55 11 98966-9122";
const OFFICIAL_NAME = "Carflax Hidráulica E Elétrica";

interface FakeSocket {
  on: (event: string, cb: (payload: unknown) => void) => void;
  off: (event: string, cb: (payload: unknown) => void) => void;
  connected: boolean;
  disconnect: () => void;
}

// POST no backend que injeta as credenciais da Meta e devolve { key: { id }, status }.
async function sendOfficial(
  body: Record<string, unknown>,
): Promise<{ key?: { id?: string; remoteJid?: string; fromMe?: boolean }; status?: string }> {
  const base = API_BASE.startsWith("http") ? API_BASE : window.location.origin + API_BASE;
  const response = await fetch(`${base}/api/whatsapp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WhatsApp Oficial Error (${response.status}): ${error}`);
  }
  return response.json();
}

export const whatsappOfficialApi = {
  // Info do número oficial (a tela usa `instance.owner` como identificação).
  async getInstanceInfo(): Promise<{ instance?: { owner?: string; profilePictureUrl?: string; profileName?: string } }> {
    return {
      instance: {
        owner: OFFICIAL_NUMBER,
        profilePictureUrl: undefined,
        profileName: OFFICIAL_NAME,
      },
    };
  },

  // A Meta Cloud API não expõe foto de perfil de contatos por privacidade. Buscamos
  // só a foto salva no Supabase (marketing_clientes, quando houver). Sem fallback pra
  // Evolution/GO — descontinuados e, além disso, os servidores respondem erro.
  async getProfilePic(remoteJid: string): Promise<string | null> {
    if (!remoteJid || !remoteJid.includes("@")) return null;
    try {
      const { data } = await supabase
        .from("marketing_clientes")
        .select("foto_url")
        .eq("remote_jid", remoteJid)
        .maybeSingle();
      return data?.foto_url || null;
    } catch {
      return null;
    }
  },

  // A lista de conversas vem do Supabase (marketingService). No oficial não há
  // endpoint de "getChats" → no-op seguro.
  async getChats(): Promise<unknown[]> {
    return [];
  },

  // Presença ("digitando…") não é suportada pela Cloud API → no-op.
  async subscribePresence(_jid: string): Promise<void> {
    return Promise.resolve();
  },

  // quoted (opcional) = mensagem sendo respondida, no formato { key: { id } } que a
  // tela monta. Vira `context.message_id` na Cloud API (o balãozinho de resposta).
  async sendText(
    to: string,
    text: string,
    quoted?: { key?: { id?: string } },
  ): Promise<{ key?: { id?: string } }> {
    const contextMessageId = quoted?.key?.id;
    const res = await sendOfficial({ to, text, type: "text", ...(contextMessageId ? { contextMessageId } : {}) });
    return { key: res?.key };
  },

  // Reação (like/emoji) a uma mensagem. emoji "" remove a reação.
  async sendReaction(to: string, messageId: string, emoji: string): Promise<{ key?: { id?: string } }> {
    const res = await sendOfficial({ to, type: "reaction", messageId, emoji });
    return { key: res?.key };
  },

  // Assinatura chamada pela tela: (jid, base64, mimeType, fileName, caption, quoted).
  // A Cloud API exige um LINK público para a mídia (não aceita base64). A tela passa
  // o base64 cru, então subimos ao Supabase Storage e enviamos a URL resultante. Se
  // já vier uma URL http(s), usa direto.
  async sendDocument(
    to: string,
    media: string,
    mimeType?: string,
    fileName?: string,
    caption?: string,
    quoted?: { key?: { id?: string } },
  ): Promise<{ key?: { id?: string } }> {
    const mt = mimeType || "";
    // .webp entra como FIGURINHA (sticker); demais imagens como image.
    const isSticker = mt === "image/webp";
    const isImage = !isSticker && mt.startsWith("image/");
    const isAudio = mt.startsWith("audio/");
    const type = isSticker ? "sticker" : isImage ? "image" : isAudio ? "audio" : "document";

    let mediaUrl = media;
    if (media && !/^https?:\/\//i.test(media)) {
      const ext = (fileName?.split(".").pop() || mt.split("/")[1] || "bin").split(";")[0];
      const filename = `official_${Date.now()}.${ext}`;
      const uploaded = await marketingService.uploadMedia(media, mimeType || "application/octet-stream", filename);
      if (!uploaded) throw new Error("Falha ao subir a mídia para envio pela API Oficial.");
      mediaUrl = uploaded;
    }

    const contextMessageId = quoted?.key?.id;
    const res = await sendOfficial({
      to,
      type,
      mediaUrl,
      filename: fileName,
      // Sticker não aceita legenda na Cloud API.
      text: isSticker ? "" : caption || "",
      ...(contextMessageId ? { contextMessageId } : {}),
    });
    return { key: res?.key };
  },

  // Realtime via Supabase (marketing_whatsapp) re-emitido no MESMO formato que a
  // tela consome (messages.upsert / messages.update). É o banco, não o Evolution.
  connectWebSocket(): FakeSocket {
    const listeners = new Map<string, Set<(p: unknown) => void>>();
    const emit = (event: string, payload: unknown) => {
      listeners.get(event)?.forEach((cb) => {
        try {
          cb(payload);
        } catch {
          /* ignore */
        }
      });
    };

    const rowToEvo = (row: any) => ({
      key: { id: row.message_id, remoteJid: row.remote_jid, fromMe: row.sender === "me" },
      pushName: undefined,
      message: { conversation: row.texto || "" },
      messageTimestamp: Math.floor(new Date(row.timestamp).getTime() / 1000),
    });

    const channel = supabase
      .channel(`official_wpp_${Date.now()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "marketing_whatsapp" }, (p) => {
        emit("messages.upsert", { data: rowToEvo(p.new as any) });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "marketing_whatsapp" }, (p) => {
        const row = p.new as any;
        const status = row.status === "read" ? "READ" : row.status === "delivered" ? "DELIVERY_ACK" : row.status;
        emit("messages.update", { data: { keyId: row.message_id, status } });
      })
      .subscribe();

    return {
      on: (event, cb) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(cb);
      },
      off: (event, cb) => {
        listeners.get(event)?.delete(cb);
      },
      connected: true,
      disconnect: () => {
        supabase.removeChannel(channel);
      },
    };
  },
};
