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
import { whatsappOfficialService } from "./whatsapp-official-service";
import { marketingService } from "./marketing-service";
import { API_BASE } from "./api";

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
    try {
      const cfg = await whatsappOfficialService.getConfig();
      return {
        instance: {
          owner: cfg?.phone_number || undefined,
          profilePictureUrl: undefined,
          profileName: cfg?.business_name,
        },
      };
    } catch {
      return { instance: {} };
    }
  },

  // A Cloud API não expõe foto de perfil de contatos por uma chamada simples.
  async getProfilePic(): Promise<string | null> {
    return null;
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

  async sendText(to: string, text: string): Promise<{ key?: { id?: string } }> {
    const res = await sendOfficial({ to, text, type: "text" });
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
  ): Promise<{ key?: { id?: string } }> {
    const isImage = (mimeType || "").startsWith("image/");
    const isAudio = (mimeType || "").startsWith("audio/");
    const type = isImage ? "image" : isAudio ? "audio" : "document";

    let mediaUrl = media;
    if (media && !/^https?:\/\//i.test(media)) {
      const ext = (fileName?.split(".").pop() || (mimeType || "").split("/")[1] || "bin").split(";")[0];
      const filename = `official_${Date.now()}.${ext}`;
      const uploaded = await marketingService.uploadMedia(media, mimeType || "application/octet-stream", filename);
      if (!uploaded) throw new Error("Falha ao subir a mídia para envio pela API Oficial.");
      mediaUrl = uploaded;
    }

    const res = await sendOfficial({
      to,
      type,
      mediaUrl,
      filename: fileName,
      text: caption || "",
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
