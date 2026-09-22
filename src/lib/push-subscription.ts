import { supabase } from "@/lib/supabase";

/**
 * Assina o Web Push deste navegador e grava em `push_subscriptions`, ligado ao
 * usuário. Chamado pelo HUB e pelo Gestor (/gestor), que roda fora do HUB e
 * precisa do push para o aviso de liberação. Supõe permissão já concedida.
 */
export async function assinarPush(userId: string): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission !== "granted") return;

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
  // Sem chave VAPID configurada: notificações push ficam desativadas (silencioso).
  if (!vapidKey) return;

  const padding = "=".repeat((4 - (vapidKey.length % 4)) % 4);
  const base64 = (vapidKey + padding).replace(/-/g, "+").replace(/_/g, "/");
  const applicationServerKey = new Uint8Array([...atob(base64)].map((c) => c.charCodeAt(0)));

  let sub = await reg.pushManager.getSubscription();

  // Assinatura fica amarrada à chave VAPID usada no momento de assinar. Se a
  // chave do servidor mudou, a antiga não recebe mais nada — e como o código
  // só assinava quando não havia nenhuma, essas pessoas ficavam órfãs para
  // sempre. Aqui a assinatura de chave diferente é descartada e refeita.
  if (sub) {
    const atual = new Uint8Array(sub.options.applicationServerKey ?? new ArrayBuffer(0));
    const mesmaChave =
      atual.length === applicationServerKey.length && atual.every((b, i) => b === applicationServerKey[i]);
    if (!mesmaChave) {
      try {
        await sub.unsubscribe();
      } catch {
        /* segue e assina de novo */
      }
      sub = null;
    }
  }

  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  }

  const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };

  // Salva/atualiza a subscrição no Supabase vinculada ao usuário.
  // As assinaturas antigas (de chave anterior) NÃO são apagadas aqui: o mesmo
  // usuário costuma ter celular e computador, e apagar "as outras deste
  // usuário" derrubaria o outro aparelho. Quem limpa é o envio no servidor,
  // que remove a linha quando o serviço de push a recusa em definitivo.
  await supabase.from("push_subscriptions").upsert(
    { user_id: userId, endpoint: subJson.endpoint, p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
    { onConflict: "endpoint" },
  );
}
