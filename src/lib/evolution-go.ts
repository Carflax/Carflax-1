/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Evolution GO — whatsmeow-based WhatsApp API client
 * Endpoints seguem o Swagger oficial do EvolutionAPI/evolution-go.
 * Cliente de fronteira: os payloads da API externa são JSON dinâmico, então `any`
 * é intencional nos pontos de desserialização.
 */

import { marketingService } from "./marketing-service";
import { supabase } from "./supabase";
import { API_BASE } from "./api";

// Filtro do realtime GO: só emite eventos das mensagens deste vendedor (a
// instância GO grava no Supabase marcada com vendedor_id). A tela GO define isso
// antes de conectar, para não misturar com as conversas do comercial (v2).
let goRealtimeVendedorId: string | null = null;
export function setGoRealtimeVendedor(id: string | null) {
  goRealtimeVendedorId = id;
}

// Socket "falso" mínimo (EventEmitter) para o shim de realtime — expõe a mesma
// superfície (on/off/connected/disconnect) que o socket.io do Evolution v2, para
// a tela clonada funcionar sem alterações.
interface FakeSocket {
  on: (event: string, cb: (payload: unknown) => void) => void;
  off: (event: string, cb: (payload: unknown) => void) => void;
  connected: boolean;
  disconnect: () => void;
}

export interface GoSendResponse {
  id: string;
  status: string;
  timestamp?: number;
  // A tela lê `sendResp?.key?.id` para trocar o id otimista pelo id real da Meta.
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
}

export interface GoInstance {
  id?: string;
  instanceId?: string;
  instanceName?: string;
  name?: string;
  status: string;
  phone?: string;
  owner?: string;
  profilePicUrl?: string;
  connected?: boolean;
}

export interface GoMessage {
  id: string;
  remoteJid: string;
  fromMe: boolean;
  text?: string;
  type: string;
  timestamp: number;
  status?: string;
  mediaUrl?: string;
  mimetype?: string;
  filename?: string;
}

export interface GoChat {
  jid: string;
  name?: string;
  pushName?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount?: number;
  profilePicUrl?: string;
  isGroup?: boolean;
}

export interface GoGroup {
  id: string;
  name: string;
  description?: string;
  participants: { jid: string; isAdmin: boolean }[];
  inviteLink?: string;
  profilePicUrl?: string;
}

export interface GoCommunity {
  id: string;
  name: string;
  description?: string;
  linkedGroups?: string[];
}

export interface GoLabel {
  id: string;
  name: string;
  color?: number;
}

export interface GoNewsletter {
  id: string;
  name: string;
  description?: string;
  subscribers?: number;
}




// ─── Cliente direto do servidor Evolution GO (whatsmeow) ─────────────────────
// Auth por instância: header `apikey: <token da instância>`. Rotas reais do
// Swagger: /send/text, /send/media, /message/presence, /user/avatar, /user/check,
// /instance/status.
const GO_CONFIG = {
  url: import.meta.env.VITE_EVO_GO_URL as string,
  token: import.meta.env.VITE_EVO_GO_API_KEY as string,
};

async function fetchGo<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${GO_CONFIG.url}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': GO_CONFIG.token,
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Evolution GO Error (${response.status}): ${error}`);
  }
  return response.json();
}

// ─── Envio via API Oficial (Meta) pelo backend ───────────────────────────────
// O servidor GO de ENVIO foi desativado (POST /send/text → 405). O envio agora
// passa pelo backend `/api/whatsapp/send`, que injeta as credenciais da Meta
// server-side e devolve { key: { id }, status } no formato que a tela consome.
async function sendViaOfficial(
  body: Record<string, unknown>,
): Promise<{ key?: { id?: string; remoteJid?: string; fromMe?: boolean }; status?: string }> {
  const base = API_BASE.startsWith('http') ? API_BASE : window.location.origin + API_BASE;
  const response = await fetch(`${base}/api/whatsapp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WhatsApp Oficial Error (${response.status}): ${error}`);
  }
  return response.json();
}

function toSendResponse(res: { key?: { id?: string }; status?: string }): GoSendResponse {
  return { id: res?.key?.id || `msg_${Date.now()}`, status: res?.status || 'sent', key: res?.key };
}

export const evolutionGoApi = {
  // ─── INSTANCE ────────────────────────────────────────────────────────────────

  async getAllInstances(): Promise<GoInstance[]> {
    return [{ status: "open", name: "API Oficial", phone: "API Oficial", connected: true }];
  },

  async getInstance(_instanceId: string): Promise<GoInstance> {
    return { status: "open", name: "API Oficial", phone: "API Oficial", connected: true };
  },

  async createInstance(_name: string): Promise<GoInstance> {
    return { status: "open", name: "API Oficial", phone: "API Oficial", connected: true };
  },

  async connectInstance(_options?: any): Promise<unknown> {
    return Promise.resolve({ status: "open" });
  },

  async getQr(): Promise<Record<string, unknown>> {
    return {};
  },

  async getStatus(): Promise<Record<string, unknown>> {
    return { LoggedIn: true, loggedIn: true, name: "API Oficial", Name: "API Oficial" };
  },

  async getContacts(): Promise<Record<string, unknown>[]> {
    return [];
  },

  async getMessages(jid: string, limit = 40, vendedorId?: string): Promise<GoMessage[]> {
    try {
      const dbMsgs = await marketingService.getMessagesByJid(jid, limit, undefined, undefined, vendedorId);
      return dbMsgs.map(m => ({
        id: m.message_id,
        remoteJid: m.remote_jid,
        fromMe: m.sender === "me",
        text: m.texto,
        type: m.tipo || "text",
        timestamp: Math.floor(new Date(m.timestamp).getTime() / 1000),
        status: m.status,
        mediaUrl: m.media_url,
      }));
    } catch (e) {
      console.error("[EvoGO] Error fetching messages from Supabase:", e);
      return [];
    }
  },

  async requestPairCode(_phone: string, _name?: string, _vendedorId?: string): Promise<{ code: string }> {
    return { code: "" };
  },

  async disconnectInstance(): Promise<void> {
    return Promise.resolve();
  },

  async logoutInstance(): Promise<void> {
    return Promise.resolve();
  },

  async deleteInstance(_instanceId: string): Promise<void> {
    return Promise.resolve();
  },

  async deleteInstanceByName(_name: string): Promise<void> {
    return Promise.resolve();
  },

  async forceReconnect(_instanceId: string): Promise<void> {
    return Promise.resolve();
  },

  async setProxy(_instanceId: string, _proxy: any): Promise<void> {
    return Promise.resolve();
  },

  async deleteProxy(_instanceId: string): Promise<void> {
    return Promise.resolve();
  },

  // ─── MESSAGES ────────────────────────────────────────────────────────────────

  async sendText(to: string, text: string): Promise<GoSendResponse> {
    const res = await sendViaOfficial({ to, text, type: 'text' });
    return toSendResponse(res);
  },

  async sendImage(to: string, url: string, caption?: string): Promise<GoSendResponse> {
    const res = await sendViaOfficial({ to, type: 'image', mediaUrl: url, text: caption || '' });
    return toSendResponse(res);
  },

  async sendDocument(to: string, url: string, filename: string, caption?: string): Promise<GoSendResponse> {
    const res = await sendViaOfficial({ to, type: 'document', mediaUrl: url, filename, text: caption || '' });
    return toSendResponse(res);
  },

  async sendAudio(to: string, url: string): Promise<GoSendResponse> {
    const res = await sendViaOfficial({ to, type: 'audio', mediaUrl: url });
    return toSendResponse(res);
  },

  // Presença ("digitando…"/gravando). state: composing | recording | paused
  async setPresence(number: string, state: 'composing' | 'recording' | 'paused'): Promise<void> {
    try {
      await fetchGo('/message/presence', {
        method: 'POST',
        body: JSON.stringify({ number, state, isAudio: state === 'recording' }),
      });
    } catch { /* não crítico */ }
  },

  // Foto de perfil de um contato.
  async getProfilePic(number: string): Promise<string | null> {
    try {
      const res = await fetchGo<any>('/user/avatar', {
        method: 'POST',
        body: JSON.stringify({ number, preview: false }),
      });
      return res?.data?.URL || res?.data?.url || res?.URL || res?.url || null;
    } catch {
      return null;
    }
  },

  // Verifica quais números existem no WhatsApp.
  async checkNumber(numbers: string[]): Promise<Array<{ JID: string; IsInWhatsapp: boolean }>> {
    try {
      const res = await fetchGo<any>('/user/check', {
        method: 'POST',
        body: JSON.stringify({ number: numbers }),
      });
      return res?.data?.Users || [];
    } catch {
      return [];
    }
  },

  // Status/infra da instância conectada.
  async getInstanceStatus(): Promise<any> {
    try {
      return await fetchGo('/instance/status');
    } catch {
      return null;
    }
  },

  // ─── Drop-in do Evolution v2 (mesmas assinaturas usadas pela tela) ───────────

  // A lista de conversas da tela vem do Supabase; getChats no v2 é só um sync de
  // nomes em segundo plano. No GO não há endpoint equivalente → no-op seguro.
  async getChats(): Promise<unknown[]> {
    return [];
  },

  // Infra da instância no formato que a tela espera ({ instance: { owner, ... } }).
  // Usa /instance/status (autentica com o token da instância). O /instance/all é
  // endpoint ADMIN e rejeita o token da instância (401). /instance/status não traz
  // o jid/owner — o avatar da própria instância é cosmético e é apenas pulado.
  async getInstanceInfo(): Promise<{ instance?: { owner?: string; profilePictureUrl?: string; profileName?: string } }> {
    try {
      const st = await fetchGo<any>('/instance/status');
      return { instance: { owner: undefined, profilePictureUrl: undefined, profileName: st?.data?.Name } };
    } catch {
      return { instance: {} };
    }
  },

  // No v2 "subscribe" abre o canal de presença do contato. No GO a presença chega
  // via webhook → não precisa assinar. No-op para manter a interface.
  async subscribePresence(_remoteJid: string): Promise<void> {
    return Promise.resolve();
  },

  // Shim de realtime: em vez do socket.io do Evolution, escuta o realtime do
  // Supabase na marketing_whatsapp (onde o webhook do GO já grava) e re-emite os
  // eventos no MESMO formato que a tela consome (messages.upsert / messages.update).
  connectWebSocket(): FakeSocket {
    const listeners = new Map<string, Set<(p: unknown) => void>>();
    const emit = (event: string, payload: unknown) => {
      listeners.get(event)?.forEach((cb) => { try { cb(payload); } catch { /* ignore */ } });
    };

    const rowToEvo = (row: any) => {
      const caption = row.texto || '';
      const tipo = row.tipo || 'text';
      let message: Record<string, unknown>;
      switch (tipo) {
        case 'image':
          message = { imageMessage: { caption, mimetype: 'image/jpeg' } };
          break;
        case 'sticker':
          message = { stickerMessage: { mimetype: 'image/webp' } };
          break;
        case 'video':
          message = { videoMessage: { caption, mimetype: 'video/mp4' } };
          break;
        case 'audio':
          message = { audioMessage: { mimetype: 'audio/ogg' } };
          break;
        case 'document':
          message = { documentMessage: { fileName: caption, mimetype: 'application/octet-stream' } };
          break;
        default:
          message = { conversation: caption };
      }
      return {
        key: { id: row.message_id, remoteJid: row.remote_jid, fromMe: row.sender === 'me' },
        pushName: undefined,
        message,
        messageTimestamp: Math.floor(new Date(row.timestamp).getTime() / 1000),
        __resolvedMediaUrl: row.media_url || undefined,
      };
    };
    const passaFiltro = (row: any) =>
      !goRealtimeVendedorId || row?.vendedor_id === goRealtimeVendedorId;

    const channel = supabase
      .channel(`go_wpp_${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'marketing_whatsapp' }, (p) => {
        const row = p.new as any;
        if (!passaFiltro(row)) return;
        emit('messages.upsert', { data: rowToEvo(row) });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'marketing_whatsapp' }, (p) => {
        const row = p.new as any;
        if (!passaFiltro(row)) return;
        const status = row.status === 'read' ? 'READ' : row.status === 'delivered' ? 'DELIVERY_ACK' : row.status;
        emit('messages.update', { data: { keyId: row.message_id, status } });
      })
      .subscribe();

    // Canal SEPARADO para presença ("escrevendo…"): o backend retransmite o
    // CHAT_PRESENCE do GO por broadcast no canal fixo "go-presence". O nome do
    // canal precisa bater exatamente para o broadcast chegar.
    const presenceChannel = supabase
      .channel('go-presence')
      .on('broadcast', { event: 'presence' }, ({ payload }) => {
        // payload é o `data` cru do presence.update ({ id, presences: {...} }) —
        // a tela parseia esse formato nativamente.
        if (!payload) return;
        emit('presence.update', { data: payload });
      })
      .subscribe();

    return {
      on: (event, cb) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(cb);
      },
      off: (event, cb) => { listeners.get(event)?.delete(cb); },
      connected: true,
      disconnect: () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(presenceChannel);
      },
    };
  },

  // ─── CHAT ────────────────────────────────────────────────────────────────────

  async archiveChat(_jid: string): Promise<void> {
    return Promise.resolve();
  },

  async unarchiveChat(_jid: string): Promise<void> {
    return Promise.resolve();
  },

  async muteChat(_jid: string, _duration?: number): Promise<void> {
    return Promise.resolve();
  },

  async unmuteChat(_jid: string): Promise<void> {
    return Promise.resolve();
  },

  async pinChat(_jid: string): Promise<void> {
    return Promise.resolve();
  },

  async unpinChat(_jid: string): Promise<void> {
    return Promise.resolve();
  },

  async requestHistorySync(_jid: string): Promise<void> {
    return Promise.resolve();
  },

  // ─── GROUP ───────────────────────────────────────────────────────────────────

  async getGroups(): Promise<GoGroup[]> {
    return [];
  },

  async getMyGroups(): Promise<GoGroup[]> {
    return [];
  },

  async createGroup(_name: string, _participants: string[]): Promise<GoGroup> {
    return { id: "", name: "", participants: [] };
  },

  async getGroupInfo(_groupId: string): Promise<GoGroup> {
    return { id: "", name: "", participants: [] };
  },

  async getGroupInviteLink(_groupId: string): Promise<{ link: string }> {
    return { link: "" };
  },

  async joinGroup(_inviteLink: string): Promise<void> {
    return Promise.resolve();
  },

  async leaveGroup(_groupId: string): Promise<void> {
    return Promise.resolve();
  },

  async setGroupName(_groupId: string, _name: string): Promise<void> {
    return Promise.resolve();
  },

  async setGroupDescription(_groupId: string, _description: string): Promise<void> {
    return Promise.resolve();
  },

  // ─── COMMUNITY ─────────────────────────────────────────────────────────────

  async createCommunity(_name: string, _groups: string[]): Promise<GoCommunity> {
    return { id: "", name: "" };
  },

  async addGroupToCommunity(_communityId: string, _groupId: string): Promise<void> {
    return Promise.resolve();
  },

  async removeGroupFromCommunity(_communityId: string, _groupId: string): Promise<void> {
    return Promise.resolve();
  },

  // ─── LABEL ─────────────────────────────────────────────────────────────────

  async getLabels(): Promise<GoLabel[]> {
    return [];
  },

  async addLabel(_jid: string, _labelId: string): Promise<void> {
    return Promise.resolve();
  },

  async removeLabel(_jid: string, _labelId: string): Promise<void> {
    return Promise.resolve();
  },

  // ─── NEWSLETTER ────────────────────────────────────────────────────────────

  async getNewsletters(): Promise<GoNewsletter[]> {
    return [];
  },

  async createNewsletter(_name: string, _description?: string): Promise<GoNewsletter> {
    return { id: "", name: "" };
  },

  // ─── CALL ────────────────────────────────────────────────────────────────────

  async rejectCall(_callId: string, _from: string): Promise<void> {
    return Promise.resolve();
  },
};
