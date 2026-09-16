import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { ArrowUpRight, Beer, ChevronLeft, ChevronRight, Gift, Maximize2, Minimize2, Pause, Play, QrCode, Trophy, Utensils } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";
import "./ApresentacaoTvView.css";

const CAPACIDADE = 50;
const SCENES = [
  { label: "O encontro", duration: 12, accent: "#c5f65b" },
  { label: "A experiência", duration: 11, accent: "#ffc875" },
  { label: "Os prêmios", duration: 11, accent: "#a4baff" },
  { label: "Seu lugar", duration: 12, accent: "#c5f65b" },
  { label: "Participe", duration: 20, accent: "#c5f65b" },
];

function Title({ lines }: { lines: string[] }) {
  let wordIndex = 0;
  return <h1 className="tv-title" aria-label={lines.join(" ")}>
    {lines.map((line, index) => <span className={`tv-title-line ${index === lines.length - 1 ? "tv-accent" : ""}`} key={line} aria-hidden="true">
      {line.split(" ").map((word, i) => <span className="tv-word-mask" key={`${word}-${i}`}><span className="tv-word" style={{ "--delay": `${0.22 + wordIndex++ * 0.11}s` } as CSSProperties}>{word}&nbsp;</span></span>)}
    </span>)}
  </h1>;
}

export function ApresentacaoTvView() {
  const [slide, setSlide] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [scale, setScale] = useState(() => Math.min(window.innerWidth / 1600, window.innerHeight / 900));
  const scene = SCENES[slide];
  const remaining = confirmed === null ? null : Math.max(0, CAPACIDADE - confirmed);
  const conviteUrl = "https://carflax.vercel.app/convite-cliente";
  const navigate = useCallback((direction: number) => setSlide(current => (current + direction + SCENES.length) % SCENES.length), []);
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* Some TV browsers do not support the fullscreen API. */ }
  }, []);

  useEffect(() => {
    const resize = () => setScale(Math.min(window.innerWidth / 1600, window.innerHeight / 900));
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.closest("button, input, textarea, select") || event.target.isContentEditable)) return;
      if ([" ", "k", "K", "ArrowRight", "ArrowLeft", "f", "F"].includes(event.key)) event.preventDefault();
      if (event.repeat) return;
      if ([" ", "k", "K"].includes(event.key)) setPlaying(value => !value);
      if (event.key === "ArrowRight") navigate(1);
      if (event.key === "ArrowLeft") navigate(-1);
      if (event.key.toLowerCase() === "f") void toggleFullscreen();
    };
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [navigate, toggleFullscreen]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { count, error } = await supabase.from("evento_convidados").select("id", { count: "exact", head: true }).eq("status", "confirmado");
        if (active) setConfirmed(!error && count !== null ? count : null);
      } catch { if (active) setConfirmed(null); }
    };
    void load();
    const channel = supabase.channel("tv_vagas_realtime").on("postgres_changes", { event: "*", schema: "public", table: "evento_convidados" }, () => void load()).subscribe();
    const polling = window.setInterval(() => void load(), 15000);
    return () => { active = false; void supabase.removeChannel(channel); window.clearInterval(polling); };
  }, []);

  return <div className="tv-presentation" data-paused={!playing} style={{ "--accent": scene.accent, "--duration": `${scene.duration}s` } as CSSProperties}>
    <div className="tv-ambient" aria-hidden="true" />
    <div className="tv-controls" role="toolbar" aria-label="Controles da apresentação">
      <button onClick={() => navigate(-1)} aria-label="Cena anterior" title="Cena anterior (←)"><ChevronLeft /></button>
      <button onClick={() => setPlaying(value => !value)} aria-label={playing ? "Pausar" : "Reproduzir"} title="Pausar / reproduzir (Espaço)">{playing ? <Pause /> : <Play />}</button>
      <button onClick={() => navigate(1)} aria-label="Próxima cena" title="Próxima cena (→)"><ChevronRight /></button>
      <button onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"} title="Tela cheia (F)">{fullscreen ? <Minimize2 /> : <Maximize2 />}</button>
    </div>
    <div className="tv-stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
      <header className="tv-header">
        <div className="tv-brand">CARFLAX<span>CONEXÕES QUE CONSTROEM</span></div>
        <div className="tv-edition"><span className="tv-status-dot" /> FESTIVAL DOS INSTALADORES <span className="tv-edition-number">03 / EDIÇÃO</span></div>
        <div className="tv-header-date">15 OUT <span>2026</span></div>
      </header>

      <main className={`tv-scene tv-scene-${slide}`} key={slide} aria-label={scene.label}>
        <section className="tv-copy">
          <p className="tv-eyebrow tv-reveal"><span>0{slide + 1}</span> / {slide === 0 ? "QUEM FAZ ACONTECER MERECE CELEBRAR" : slide === 1 ? "UMA NOITE POR NOSSA CONTA" : slide === 2 ? "PARCERIA QUE RECOMPENSA" : slide === 3 ? "UM ENCONTRO EXCLUSIVO" : "O PRÓXIMO PASSO É SEU"}</p>
          {slide === 0 && <>
            <Title lines={["Festival dos", "instaladores."]} />
            <p className="tv-description tv-reveal">Você constrói todos os dias.<br />Essa noite, a gente celebra você.</p>
            <div className="tv-event-details tv-reveal"><div><strong>15 de outubro</strong><span>Quinta-feira · 17h30 às 20h30</span></div><div><strong>Galpão da Carflax</strong><span>Jundiaí · São Paulo</span></div></div>
            <div className="tv-note tv-reveal">Eletricistas, encanadores e instaladores da região.</div>
          </>}
          {slide === 1 && <>
            <Title lines={["Mesa farta.", "Cerveja gelada.", "Boa companhia."]} />
            <p className="tv-description tv-reveal">Três horas para brindar, encontrar parceiros<br />e aproveitar um buffet completo.</p>
            <div className="tv-benefits tv-reveal"><span><Utensils /> Jantar completo</span><span><Beer /> Espetos & cerveja</span></div>
            <div className="tv-note tv-reveal">Um presente da Carflax e dos nossos patrocinadores.</div>
          </>}
          {slide === 2 && <>
            <Title lines={["Você participa.", "A sorte", "surpreende."]} />
            <p className="tv-description tv-reveal">Kit de brindes para os convidados confirmados.<br />Sorteios de ferramentas ao longo da noite.</p>
            <div className="tv-benefits tv-reveal"><span><Gift /> Kit exclusivo</span><span><Trophy /> Prêmios ao vivo</span></div>
            <div className="tv-note tv-reveal">Seu voucher vem com um número da sorte.</div>
          </>}
          {slide === 3 && <>
            <Title lines={["Uma noite.", "50 lugares.", "O seu espera."]} />
            <p className="tv-description tv-reveal">Um encontro pensado para receber você bem.<br />Confirmações por ordem de chegada.</p>
            <div className="tv-callout tv-reveal">Fale com seu vendedor <ArrowUpRight /></div>
            <div className="tv-note tv-reveal">Garanta sua presença e receba seu voucher nominal.</div>
          </>}
          {slide === 4 && <>
            <Title lines={["Seu lugar", "nessa noite", "começa aqui."]} />
            <p className="tv-description tv-reveal">Fale com seu vendedor<br />e garanta sua presença.</p>
            <div className="tv-steps tv-reveal"><div><b>01</b><span>Aponte a câmera para o QR code</span></div><div><b>02</b><span>Confirme seus dados no celular</span></div><div><b>03</b><span>Receba seu voucher individual</span></div></div>
          </>}
        </section>

        <aside className="tv-visual">
          {slide === 0 && <div className="tv-poster-wrap"><div className="tv-poster-back" /><img className="tv-poster" src="/convite-capa.jpg" alt="Convite do Festival dos Instaladores com as marcas participantes" /><div className="tv-poster-tag"><span>VOCÊ É NOSSO CONVIDADO</span><ArrowUpRight /></div></div>}
          {slide === 1 && <div className="tv-experience"><div className="tv-orbit tv-orbit-one" /><div className="tv-orbit tv-orbit-two" /><Utensils className="tv-floating-icon tv-icon-one" /><Beer className="tv-floating-icon tv-icon-two" /><div className="tv-experience-core"><span>APROVEITE CADA MOMENTO</span><strong>100<span>%</span></strong><em>gratuito.</em><p>Jantar, bebidas e boas histórias.</p></div><div className="tv-small-label">ENTRADA VIP · CONVITE INDIVIDUAL</div></div>}
          {slide === 2 && <div className="tv-ticket-wrap"><div className="tv-ticket"><div className="tv-ticket-top"><span>CARFLAX / FESTIVAL 2026</span><Trophy /></div><div className="tv-ticket-body"><span>UMA NOITE DE POSSIBILIDADES</span><Gift /><strong>Seu número.<br />Sua sorte.</strong><p>Brindes + sorteios de ferramentas</p></div><div className="tv-ticket-stub"><span>VOUCHER INDIVIDUAL</span><div className="tv-ticket-bars" /><b>EDIÇÃO 03</b></div></div><span className="tv-ticket-caption">Prêmios entregues durante o evento</span></div>}
          {slide === 3 && <div className="tv-availability"><div className="tv-availability-top"><span className="tv-status-dot" /> {remaining === null ? "CAPACIDADE DO EVENTO" : "DISPONIBILIDADE ATUALIZADA"}</div><strong className="tv-big-number">{remaining === null ? CAPACIDADE : remaining.toString().padStart(2, "0")}</strong><h2>{remaining === null ? "lugares no total" : remaining === 0 ? "vagas esgotadas" : "vagas disponíveis"}</h2><div className="tv-seat-grid" aria-hidden="true">{Array.from({ length: CAPACIDADE }, (_, index) => <i key={index} className={confirmed !== null && index < confirmed ? "occupied" : ""} />)}</div><p>{remaining === null ? "Consulte a disponibilidade com seu vendedor." : `${Math.min(confirmed ?? 0, CAPACIDADE)} de ${CAPACIDADE} lugares confirmados`}</p></div>}
          {slide === 4 && <div className="tv-qr-panel"><div className="tv-qr-heading"><QrCode /><span>APONTE. CONFIRME. PARTICIPE.</span></div><div className="tv-qr-paper"><QRCodeSVG value={conviteUrl} size={330} level="M" marginSize={4} title="Abra o convite do Festival dos Instaladores" /></div><strong>Esperamos por você.</strong><p>15 de outubro · A partir das 17h30</p><div className="tv-qr-badge">ENTRADA GRATUITA <span>↗</span></div></div>}
        </aside>
      </main>

      <footer className="tv-footer"><div className="tv-footer-location"><span>O PONTO DE ENCONTRO DE QUEM FAZ.</span><p>Av. Américo Bruno, 125 · Ponte São João · Jundiaí</p></div><nav className="tv-chapters" aria-label="Cenas da apresentação">{SCENES.map((item, index) => <button key={item.label} onClick={() => setSlide(index)} aria-label={`Ir para ${item.label}`} aria-current={index === slide ? "step" : undefined}><span className="tv-chapter-track">{index === slide && <i key={slide} className="tv-progress" onAnimationEnd={() => { if (playing) navigate(1); }} />}{index < slide && <i className="tv-progress-complete" />}</span><span className="tv-chapter-label">0{index + 1} {item.label}</span></button>)}</nav><span className="tv-scene-counter">0{slide + 1}<span> / 05</span></span></footer>
    </div>
  </div>;
}
