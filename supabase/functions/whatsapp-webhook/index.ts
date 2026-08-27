// @ts-expect-error: Deno module resolution
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: npm compat
import webpush from 'npm:web-push';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:marketing@carflax.com.br';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function detectOrigin(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.includes('google')) return 'Google';
  if (lower.includes('instagram') || lower.includes('insta')) return 'Instagram';
  if (lower.includes('facebook') || lower.includes('face')) return 'Facebook';
  if (lower.includes('tiktok') || lower.includes('tik tok')) return 'TikTok';
  if (lower.includes('site') || lower.includes('website') || lower.includes('pelo site')) return 'Site';
  if (lower.includes('indicação') || lower.includes('indicacao') || lower.includes('indicado')) return 'Indicação';
  return null;
}

interface AdReplyData {
  title?: string;
  body?: string;
  sourceUrl?: string;
  sourceType?: string;
  sourceId?: string;
}

function extractAdOrigin(adReply: AdReplyData): { origem: string; campanha?: string } {
  const src = (adReply.sourceUrl || '').toLowerCase();
  const origem = src.includes('instagram')
    ? 'Instagram'
    : src.includes('facebook') || src.includes('fb.')
      ? 'Facebook'
      : 'Meta Ads';
  const campanha = (adReply.title || adReply.body || '').trim().slice(0, 120) || undefined;
  return { origem, campanha };
}

interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const payload = await req.json();

    // Suporta payload direto ou com envelope { instance, data }
    const instance = payload.instance as string | undefined;
    const expectedInstance = Deno.env.get('EVO_INSTANCE') || '';
    if (instance && expectedInstance && instance !== expectedInstance) {
      return new Response('Ignored (different instance)', { status: 200 });
    }

    const raw = payload.data ?? payload;

    // ── MESSAGES.UPDATE (ACK / delivery / read) ──────────────────────────────
    // O Evolution GO envia eventos de status com event = "messages.update".
    // Formato: { event, data: [{ keyId, status, remoteJid }] }
    //      ou: { event, data: { key: { id }, update: { status } } }
    const event = payload.event as string | undefined;
    if (event === 'messages.update' || event === 'MESSAGES_UPDATE') {
      const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        // Formato plano: { keyId, status }
        const flatId = item.keyId as string | undefined;
        const nestedKey = item.key as Record<string, unknown> | undefined;
        const nestedUpdate = item.update as Record<string, unknown> | undefined;
        const msgId = flatId || (nestedKey?.id as string | undefined);
        const rawStatus = (item.status ?? nestedUpdate?.status) as string | number | undefined;

        if (!msgId || rawStatus === undefined || rawStatus === null) continue;

        let newStatus: string | undefined;
        if (rawStatus === 2 || rawStatus === 'DELIVERY_ACK') newStatus = 'delivered';
        if (rawStatus === 3 || rawStatus === 'READ' || rawStatus === 4 || rawStatus === 'PLAYED') newStatus = 'read';
        // status 1 = SERVER_ACK (enviado ao servidor) — mapeamos como "sent"
        if (rawStatus === 1 || rawStatus === 'SERVER_ACK') newStatus = 'sent';

        if (!newStatus) continue;

        try {
          await supabase
            .from('marketing_whatsapp')
            .update({ status: newStatus })
            .eq('message_id', msgId);
        } catch (e) {
          console.error('Erro ao atualizar status da mensagem:', e);
        }
      }
      return new Response(JSON.stringify({ ok: true, event: 'messages.update' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const messages: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];

    for (const msg of messages) {
      const key = msg.key as Record<string, unknown> | undefined;
      if (!key) continue;
      if (!String(key.remoteJid ?? '').endsWith('@s.whatsapp.net')) continue;

      const remoteJid = String(key.remoteJid);
      const msgId = String(key.id);
      const fromMe = Boolean(key.fromMe);
      const senderName = String(msg.pushName || remoteJid.split('@')[0]);
      const msgContent = msg.message as Record<string, unknown> | undefined;

      // Detecta tipo de mídia
      const hasImage = !!msgContent?.imageMessage;
      const hasVideo = !!msgContent?.videoMessage;
      const hasAudio = !!msgContent?.audioMessage;
      const hasDoc = !!msgContent?.documentMessage;
      const hasSticker = !!msgContent?.stickerMessage;
      const hasLocation = !!msgContent?.locationMessage;
      const locMsg = msgContent?.locationMessage as Record<string, unknown> | undefined;
      const tipo = hasImage ? 'image' : hasVideo ? 'video' : hasAudio ? 'audio' : hasDoc ? 'document' : hasSticker ? 'sticker' : hasLocation ? 'location' : 'text';

      const text = String(
        msgContent?.conversation ||
        (msgContent?.extendedTextMessage as Record<string, unknown> | undefined)?.text ||
        (hasImage ? (msgContent?.imageMessage as Record<string, unknown>)?.caption || '' : '') ||
        (hasVideo ? (msgContent?.videoMessage as Record<string, unknown>)?.caption || '' : '') ||
        (hasDoc ? (msgContent?.documentMessage as Record<string, unknown>)?.fileName || '' : '') ||
        (hasLocation && locMsg?.degreesLatitude !== undefined
          ? `📍 lat:${locMsg.degreesLatitude} lng:${locMsg.degreesLongitude}${locMsg.name ? ` | ${locMsg.name}` : ''}`
          : '') ||
        (tipo !== 'text' ? '📎 Mídia recebida' : '')
      );

      // Persiste a mensagem no banco (upsert para evitar duplicatas)
      try {
        await supabase
          .from('marketing_whatsapp')
          .upsert({
            message_id: msgId,
            remote_jid: remoteJid,
            texto: text || (tipo !== 'text' ? '📎 Mídia recebida' : ''),
            tipo,
            sender: fromMe ? 'me' : 'contact',
            status: fromMe ? 'sent' : 'received',
            timestamp: new Date().toISOString(),
          }, { onConflict: 'message_id' });

        // Atualiza ou cria o registro do cliente
        if (!fromMe) {
          // Extrai contextInfo para detectar anúncios Click-to-WhatsApp (CTWA)
          const ctxInfo = (msgContent?.extendedTextMessage as Record<string, unknown> | undefined)?.contextInfo as Record<string, unknown> | undefined
            || msgContent?.contextInfo as Record<string, unknown> | undefined;
          const adReply = ctxInfo?.externalAdReply as AdReplyData | undefined;

          // Monta dados de origem: anúncio CTWA tem prioridade, senão tenta detectar pelo texto
          let origemData: Record<string, string> = {};
          if (adReply && (adReply.sourceUrl || adReply.title || adReply.body)) {
            const ad = extractAdOrigin(adReply);
            origemData = { origem: ad.origem, conversion_source: 'ctwa' };
            if (ad.campanha) origemData.campanha = ad.campanha;
          } else {
            const detected = detectOrigin(text);
            if (detected) origemData = { origem: detected, conversion_source: 'text' };
          }

          // Só seta origem em leads novos — não sobrescreve se já existe
          if (Object.keys(origemData).length > 0) {
            const { data: existing } = await supabase
              .from('marketing_clientes')
              .select('origem')
              .eq('remote_jid', remoteJid)
              .maybeSingle();

            if (existing?.origem) origemData = {};
          }

          await supabase
            .from('marketing_clientes')
            .upsert({
              remote_jid: remoteJid,
              push_name: senderName,
              ultima_mensagem: text || '📎 Mídia recebida',
              ultima_conversa_em: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...origemData,
            }, { onConflict: 'remote_jid', ignoreDuplicates: false });
        }
      } catch (e) {
        console.error('Erro ao salvar mensagem no banco:', e);
      }

      // Push notification apenas para mensagens recebidas
      if (fromMe) continue;

      const notifText = text || '📎 Mídia recebida';
      const notification = JSON.stringify({
        title: `💬 ${senderName}`,
        body: notifText,
        icon: '/favicon.png',
        tag: `wpp-${remoteJid}`,
        section: 'Marketing',
      });

      // Busca todas as subscrições ativas
      const { data: subscriptions, error } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth');

      if (error || !subscriptions) continue;

      // Envia push para cada assinante
      const sends = subscriptions.map((sub: PushSubscription) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notification
        ).catch(() => null) // ignora subscrições expiradas
      );

      // Salva a mídia no Storage se o base64 estiver presente
      interface EvoMsg {
        base64?: string;
        message?: {
          base64?: string;
          imageMessage?: { mimetype?: string };
          videoMessage?: { mimetype?: string };
          documentMessage?: { mimetype?: string };
          audioMessage?: { mimetype?: string };
        };
      }
      const msgParsed = msg as unknown as EvoMsg;
      const mediaBase64 = msgParsed.base64 || msgParsed.message?.base64;
      const mimetype = msgParsed.message?.imageMessage?.mimetype || msgParsed.message?.videoMessage?.mimetype || msgParsed.message?.documentMessage?.mimetype || msgParsed.message?.audioMessage?.mimetype;

      if (mediaBase64 && mimetype) {
        try {
          const ext = mimetype.split('/')[1]?.split(';')[0] || 'bin';
          const filename = `${msgId}.${ext}`;
          
          // Usa fetch para converter o base64 confiavelmente em um Blob
          const res = await fetch(`data:${mimetype};base64,${mediaBase64}`);
          const blob = await res.blob();

          // Faz o upload pro bucket
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('whatsapp-media')
            .upload(filename, blob, {
              contentType: String(mimetype),
              upsert: true
            });

          if (!uploadError && uploadData) {
            const { data: publicUrlData } = supabase.storage
              .from('whatsapp-media')
              .getPublicUrl(uploadData.path);
              
            // Aguarda 2 segundos para evitar Race Condition com o Frontend
            await new Promise(r => setTimeout(r, 2000));

            // Atualiza a tabela com a URL da mídia
            if (publicUrlData?.publicUrl) {
              await supabase
                .from('marketing_whatsapp')
                .update({ media_url: publicUrlData.publicUrl })
                .eq('message_id', msgId);
            }
          }
        } catch (e) {
          console.error("Erro ao fazer upload da mídia no webhook:", e);
        }
      }

      await Promise.all(sends);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
