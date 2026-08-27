import { useState, useEffect, useRef, useCallback } from "react";
import { Trash2, Pause, Play, Mic, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { webmOpusParaOgg } from "@/lib/opus-ogg";

/**
 * Gravador de áudio do compositor, no formato do WhatsApp Web.
 *
 * Enquanto grava: lixeira · ponto vermelho · tempo · onda ao vivo · pausar · enviar.
 * Pausado: lixeira · play · onda com progresso · tempo · microfone (retomar) · enviar.
 *
 * Ele substitui a linha inteira do compositor durante a gravação, em vez de
 * conviver com os outros botões — que é o que o WhatsApp faz, e evita o usuário
 * clicar em catálogo ou emoji no meio de uma gravação.
 *
 * O arquivo final sai em Ogg/Opus (ver lib/opus-ogg.ts): é o formato nativo de
 * nota de voz, e o único que a Meta entrega de fato.
 */

/** Largura da barra + espaçamento, em px — a densidade da onda. */
const PASSO_BARRA = 5;
/** Histórico guardado; o que aparece é recortado pela largura real da faixa. */
const AMOSTRAS_GUARDADAS = 600;
const INTERVALO_AMOSTRA_MS = 60;
/** Piso do pico de referência: impede o silêncio de se auto-amplificar. */
const PICO_MINIMO = 0.04;
/** Quanto o pico cai por amostra — rápido o bastante para acompanhar a fala. */
const DECAIMENTO_PICO = 0.97;

/** Formatos aceitos, na ordem: o alvo é Opus. */
const FORMATOS: { mime: string; ext: string }[] = [
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/mp4;codecs=mp4a.40.2", ext: "m4a" },
  { mime: "audio/mp4", ext: "m4a" },
];

function escolherFormato() {
  if (typeof MediaRecorder === "undefined") return null;
  return FORMATOS.find((f) => MediaRecorder.isTypeSupported(f.mime)) || null;
}

function formatarTempo(segundos: number) {
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  /** Sai do modo gravação sem enviar nada. */
  onCancelar: () => void;
  /** Recebe o arquivo pronto para envio. */
  onEnviar: (arquivo: File) => void;
  /** Erros que o usuário precisa ver (microfone bloqueado, falha ao converter). */
  onErro: (titulo: string, mensagem: string) => void;
}

export function GravadorAudio({ onCancelar, onEnviar, onErro }: Props) {
  const [pausado, setPausado] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [ondas, setOndas] = useState<number[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [tocando, setTocando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [preparando, setPreparando] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const formatoRef = useRef<{ mime: string; ext: string } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const amostraRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  const canceladoRef = useRef(false);
  const picoRef = useRef(PICO_MINIMO);
  const faixaRef = useRef<HTMLDivElement | null>(null);
  const [larguraFaixa, setLarguraFaixa] = useState(0);

  /**
   * Uma amostra da onda.
   *
   * O nível não é o RMS cru: cada microfone tem um ganho diferente, e uma
   * constante fixa deixava fala normal (RMS ~0,06) desenhando 5px — visualmente
   * igual ao silêncio, que é o que dava a "linha de pontinhos". Aqui o RMS é
   * normalizado por um pico móvel, então a onda se calibra sozinha em qualquer
   * microfone. O piso do pico evita que o silêncio, ao decair, vire onda cheia.
   */
  const amostrar = useCallback(() => {
    const an = analyserRef.current;
    if (!an) return;
    const buf = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(buf);

    let soma = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128; // 128 é o silêncio no domínio do tempo
      soma += v * v;
    }
    const rms = Math.sqrt(soma / buf.length);

    picoRef.current = Math.max(rms, picoRef.current * DECAIMENTO_PICO, PICO_MINIMO);
    // Curva suave: dá corpo às barras médias sem esmagar os picos.
    const nivel = Math.min(1, Math.pow(rms / picoRef.current, 0.7));

    setOndas((prev) => [...prev, nivel].slice(-AMOSTRAS_GUARDADAS));
  }, []);

  /** Solta microfone, timers e contexto de áudio. */
  const liberar = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (amostraRef.current) clearInterval(amostraRef.current);
    timerRef.current = null;
    amostraRef.current = null;
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  /** Junta o que já foi gravado e devolve em Ogg/Opus. */
  const montarArquivo = useCallback(async (): Promise<File | null> => {
    const formato = formatoRef.current;
    if (!formato || chunksRef.current.length === 0) return null;

    const tipo = formato.mime.split(";")[0];
    let blob = new Blob(chunksRef.current, { type: tipo });
    let ext = formato.ext;

    if (tipo === "audio/webm") {
      const ogg = await webmOpusParaOgg(blob);
      if (!ogg) return null;
      blob = ogg;
      ext = "ogg";
    }

    return new File([blob], `audio_${Date.now()}.${ext}`, { type: blob.type });
  }, []);

  // ── Início: pede o microfone e liga a análise da onda ────────────────────
  useEffect(() => {
    let cancelado = false;

    (async () => {
      const formato = escolherFormato();
      if (!formato) {
        onErro("Sem suporte", "Este navegador não permite gravar áudio. Use o + para anexar um arquivo.");
        onCancelar();
        return;
      }
      formatoRef.current = formato;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // A onda vem do AnalyserNode, não do arquivo: precisa desenhar durante a
        // gravação, quando ainda não existe arquivo nenhum.
        const ctx = new AudioContext();
        const fonte = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        fonte.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;

        const rec = new MediaRecorder(stream, { mimeType: formato.mime });
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorderRef.current = rec;
        rec.start();

        timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
        amostraRef.current = setInterval(amostrar, INTERVALO_AMOSTRA_MS);
      } catch (err) {
        console.error("[Áudio] Microfone indisponível:", err);
        onErro("Microfone bloqueado", "Libere o acesso ao microfone nas permissões do navegador.");
        onCancelar();
      }
    })();

    return () => {
      cancelado = true;
      liberar();
    };
    // Só na montagem: o gravador é criado quando a gravação começa e destruído
    // quando termina. Reagir a mudanças de callback reiniciaria a gravação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quantas barras cabem depende da largura real da faixa, que muda com o
  // tamanho da janela e com a barra lateral. Sem medir, a onda ficava com um
  // número fixo de barras encolhida no meio de um espaço bem maior.
  useEffect(() => {
    const el = faixaRef.current;
    if (!el) return;
    const medir = () => setLarguraFaixa(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Object URL da prévia: revoga ao trocar ou desmontar.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ── Ações ────────────────────────────────────────────────────────────────

  const pausar = async () => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "recording") return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (amostraRef.current) clearInterval(amostraRef.current);
    timerRef.current = null;
    amostraRef.current = null;

    // `requestData` antes de pausar libera o que está no buffer, para dar de
    // ouvir o trecho já gravado sem encerrar a sessão.
    rec.requestData();
    rec.pause();
    setPausado(true);
    setPreparando(true);

    // Um tick para o ondataavailable entregar o buffer liberado acima.
    await new Promise((r) => setTimeout(r, 60));
    const arquivo = await montarArquivo();
    setPreparando(false);
    if (arquivo) setPreviewUrl(URL.createObjectURL(arquivo));
  };

  const retomar = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "paused") return;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    playerRef.current?.pause();
    setTocando(false);
    setProgresso(0);
    rec.resume();
    setPausado(false);
    timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
    amostraRef.current = setInterval(amostrar, INTERVALO_AMOSTRA_MS);
  };

  const descartar = () => {
    canceladoRef.current = true;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    liberar();
    onCancelar();
  };

  const enviar = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    setPreparando(true);

    if (rec.state !== "inactive") {
      const parou = new Promise<void>((res) => {
        rec.onstop = () => res();
      });
      rec.stop();
      await parou;
    }
    liberar();

    const arquivo = await montarArquivo();
    setPreparando(false);
    if (!arquivo) {
      onErro("Falha na gravação", "Não foi possível preparar o áudio para envio. Tente novamente.");
      onCancelar();
      return;
    }
    onEnviar(arquivo);
  };

  const alternarPlay = () => {
    const p = playerRef.current;
    if (!p) return;
    if (tocando) {
      p.pause();
      setTocando(false);
    } else {
      p.play().then(() => setTocando(true)).catch(() => setTocando(false));
    }
  };

  // ── Onda ─────────────────────────────────────────────────────────────────
  // Mostra as últimas N barras. Durante a gravação ela corre para a esquerda;
  // pausada, vira a régua de progresso da reprodução.
  const capacidade = Math.max(24, Math.floor(larguraFaixa / PASSO_BARRA));
  const barras = ondas.slice(-capacidade);
  const preenchidas = pausado ? Math.round((progresso / 100) * barras.length) : barras.length;

  return (
    <div className="flex items-center gap-2 sm:gap-3 w-full max-w-5xl mx-auto">
      <button
        type="button"
        onClick={descartar}
        className="p-2.5 rounded-xl text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0"
        title="Descartar gravação"
        aria-label="Descartar gravação"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      {pausado && previewUrl && (
        <>
          <audio
            ref={playerRef}
            src={previewUrl}
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              if (el.duration && Number.isFinite(el.duration)) {
                setProgresso((el.currentTime / el.duration) * 100);
              }
            }}
            onEnded={() => {
              setTocando(false);
              setProgresso(0);
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={alternarPlay}
            className="p-1.5 rounded-lg text-foreground hover:bg-secondary transition-colors shrink-0"
            title={tocando ? "Pausar" : "Ouvir"}
            aria-label={tocando ? "Pausar" : "Ouvir"}
          >
            {tocando ? (
              <Pause className="w-5 h-5" fill="currentColor" />
            ) : (
              <Play className="w-5 h-5" fill="currentColor" />
            )}
          </button>
        </>
      )}

      {!pausado && (
        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
      )}

      <span className="text-xs font-black tabular-nums text-foreground w-10 shrink-0">
        {formatarTempo(segundos)}
      </span>

      {/* Onda */}
      <div
        ref={faixaRef}
        className="flex-1 flex items-center justify-start gap-[2px] h-8 overflow-hidden px-1 min-w-0"
      >
        {barras.length === 0 ? (
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            {preparando ? "Preparando..." : "Ouvindo..."}
          </span>
        ) : (
          barras.map((v, i) => (
            <span
              key={i}
              className={cn(
                "w-[3px] rounded-full transition-[height] duration-75",
                i < preenchidas ? "bg-foreground" : "bg-muted-foreground/30",
              )}
              // Mínimo de 3px para o silêncio ainda desenhar uma linha, como no
              // WhatsApp — barra de altura zero deixa buracos na onda.
              style={{ height: `${Math.max(3, v * 30)}px` }}
            />
          ))
        )}
      </div>

      <button
        type="button"
        onClick={pausado ? retomar : pausar}
        disabled={preparando}
        className={cn(
          "p-2.5 rounded-xl transition-colors shrink-0 disabled:opacity-50",
          pausado
            ? "text-rose-500 hover:bg-rose-500/10"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary",
        )}
        title={pausado ? "Continuar gravando" : "Pausar"}
        aria-label={pausado ? "Continuar gravando" : "Pausar"}
      >
        {pausado ? <Mic className="w-5 h-5" /> : <Pause className="w-5 h-5" fill="currentColor" />}
      </button>

      <button
        type="button"
        onClick={enviar}
        disabled={preparando || segundos < 1}
        className="w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all shrink-0 disabled:opacity-50 disabled:hover:scale-100"
        title="Enviar áudio"
        aria-label="Enviar áudio"
      >
        <Send className="w-5 h-5" />
      </button>
    </div>
  );
}
