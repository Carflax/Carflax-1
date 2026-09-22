import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

const DISMISS_KEY = "carflax-pwa-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}


function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Banner discreto para instalar o Hub como app (Adicionar à Tela Inicial).
 * - Android/Desktop: usa o evento nativo `beforeinstallprompt`.
 * - iOS/Safari: não há API — mostra a instrução manual de compartilhamento.
 */
export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === "1") return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onInstalled = () => {
      setShow(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS não dispara beforeinstallprompt — mostra dica manual após um tempo.
    let iosTimer: ReturnType<typeof setTimeout> | null = null;
    if (isIOS()) {
      iosTimer = setTimeout(() => {
        setIosHint(true);
        setShow(true);
      }, 2500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setShow(false);
    setDeferred(null);
  };

  if (!show) return null;

  return (
    <div className="fixed z-[200] left-1/2 -translate-x-1/2 bottom-4 w-[calc(100%-2rem)] max-w-md px-4 py-3 rounded-2xl bg-card border border-border shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Download className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-black text-foreground uppercase tracking-tight leading-none">Instalar o Carflax Hub</p>
        {iosHint ? (
          <p className="text-[10px] font-medium text-muted-foreground mt-1 leading-snug flex items-center gap-1">
            Toque em <Share className="w-3 h-3 inline" /> e depois em <span className="font-black">“Adicionar à Tela de Início”</span>.
          </p>
        ) : (
          <p className="text-[10px] font-medium text-muted-foreground mt-1 leading-snug">Use como app, em tela cheia e com acesso rápido.</p>
        )}
      </div>
      {!iosHint && (
        <button
          onClick={install}
          className="shrink-0 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
        >
          Instalar
        </button>
      )}
      <button onClick={dismiss} className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-secondary transition-all" title="Agora não">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
