// Fonte única das preferências de notificação.
//
// O banco (`usuarios.notification_prefs`) é a verdade: é o que segue o usuário
// entre navegadores e máquinas. O localStorage fica só como cache, para os
// gates que rodam antes do perfil terminar de carregar — antes disso os gates
// liam o cache PRIMEIRO, então em um navegador novo (cache vazio) tudo voltava
// pro default ligado e disparava alerta que o usuário já tinha desligado.

export type NotifPrefs = Record<string, Record<string, boolean>>;

export interface NotifProfile {
  notification_prefs?: NotifPrefs | null;
}

export const NOTIF_CACHE_KEY = "carflax_notif_prefs";

/** Cache local — só vale quando o banco ainda não respondeu. */
export function readCachedPrefs(): NotifPrefs | null {
  try {
    const raw = localStorage.getItem(NOTIF_CACHE_KEY);
    return raw ? (JSON.parse(raw) as NotifPrefs) : null;
  } catch {
    return null;
  }
}

export function writeCachedPrefs(prefs: NotifPrefs): void {
  try {
    localStorage.setItem(NOTIF_CACHE_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

/** Valor de um toggle: banco > cache local > default do módulo. */
export function getNotifPref(
  profile: NotifProfile | null | undefined,
  section: string,
  key: string,
  fallback: boolean,
): boolean {
  const fromDb = profile?.notification_prefs?.[section]?.[key];
  if (typeof fromDb === "boolean") return fromDb;

  const fromCache = readCachedPrefs()?.[section]?.[key];
  if (typeof fromCache === "boolean") return fromCache;

  return fallback;
}

/** Seção inteira de toggles, com a mesma precedência. */
export function getNotifSection(
  profile: NotifProfile | null | undefined,
  section: string,
): Record<string, boolean> {
  const fromDb = profile?.notification_prefs?.[section];
  if (fromDb && typeof fromDb === "object") return fromDb;
  return readCachedPrefs()?.[section] ?? {};
}
