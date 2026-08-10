import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Star, Download, Check, Trophy, ScanLine, Loader2, Plus, Trash2, X, Settings, Ticket, History, Gift, ImagePlus, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type VendedorScore, type CanalScore, type AvaliacaoScan,
  fetchVendedoresCampanha, fetchScoreboard, fetchCanaisScore,
  getPremioSorteio, setPremioSorteio,
  getPremioImagem, setPremioImagem, criarCanal, removerCanal, fetchScansVendedor, removerScan,
} from "@/lib/avaliacoes";

interface UserProfile {
  id?: string;
  name: string;
  role: string;
}
import { uploadImage } from "@/lib/uploadImage";

// slug do nome do arquivo do QR
const slug = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "qr";

// Baixa o <canvas> do QR como PNG.
function baixarQR(wrap: HTMLElement | null, nome: string) {
  const canvas = wrap?.querySelector("canvas");
  if (!canvas) return;
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `qr-avaliacao-${slug(nome)}.png`;
  a.click();
}

// Botão de copiar o link da avaliação (com feedback "Copiado"). Usa a Clipboard API
// e cai num fallback via <textarea> quando ela não está disponível (http/permissão).
function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copiar}
      title="Copiar link da avaliação"
      className="px-3 py-1.5 rounded-lg border border-border text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:border-blue-500 hover:text-blue-600 transition-all flex items-center gap-1.5"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copiado" : "Copiar link"}
    </button>
  );
}

// Card do vendedor: QR (baixável) + nº de avaliações confirmadas no Google.
function VendedorCard({ score, baseUrl, rank, onHistorico }: { score: VendedorScore; baseUrl: string; rank: number; onHistorico: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const url = `${baseUrl}/avaliar?vendedor=${encodeURIComponent(score.vendedor_cod)}`;
  const medalha = rank === 0 ? "text-amber-400" : rank === 1 ? "text-slate-300" : rank === 2 ? "text-orange-400" : "";

  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center text-center relative">
      <button
        onClick={onHistorico}
        title="Ver histórico de avaliações"
        className="absolute top-3 right-3 p-1.5 rounded-md border border-border text-muted-foreground hover:border-blue-500 hover:text-blue-600 transition-colors"
      >
        <History className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-center gap-2 mb-3">
        {rank < 3 && score.confirmadas > 0 && <Trophy className={cn("w-4 h-4", medalha)} />}
        <span className="text-xs font-black text-foreground uppercase tracking-tight truncate">{score.vendedor_nome}</span>
      </div>

      <div ref={wrapRef} className="bg-white p-3 rounded-xl shadow-inner">
        <QRCodeCanvas value={url} size={132} level="M" includeMargin={false} />
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => baixarQR(wrapRef.current, score.vendedor_nome)}
          className="px-3 py-1.5 rounded-lg border border-border text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:border-blue-500 hover:text-blue-600 transition-all flex items-center gap-1.5"
        >
          <Download className="w-3 h-3" /> Baixar QR
        </button>
        <CopyLinkButton url={url} />
      </div>

      <div className="w-full mt-4 pt-4 border-t border-border/50 flex items-end justify-center gap-4">
        <div className="text-center">
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tighter leading-none">{score.confirmadas}</p>
          <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Confirmadas</span>
        </div>
        <div className="text-center">
          <p className="text-lg font-black text-muted-foreground/60 tracking-tighter leading-none">{score.scans}</p>
          <span className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-widest">Scans</span>
        </div>
      </div>
    </div>
  );
}

// Card do canal avulso (ex.: cupom da NF): QR próprio + nº de avaliações.
function CanalCard({ canal, baseUrl, onRemove }: { canal: CanalScore; baseUrl: string; onRemove: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const url = `${baseUrl}/avaliar?canal=${encodeURIComponent(canal.id)}`;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center text-center relative">
      <button onClick={onRemove} className="absolute top-3 right-3 p-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors" title="Remover canal">
        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-rose-500" />
      </button>
      <div className="flex items-center gap-2 mb-3">
        <Ticket className="w-4 h-4 text-blue-500" />
        <span className="text-xs font-black text-foreground uppercase tracking-tight truncate">{canal.nome}</span>
      </div>

      <div ref={wrapRef} className="bg-white p-3 rounded-xl shadow-inner">
        <QRCodeCanvas value={url} size={132} level="M" includeMargin={false} />
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => baixarQR(wrapRef.current, canal.nome)}
          className="px-3 py-1.5 rounded-lg border border-border text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:border-blue-500 hover:text-blue-600 transition-all flex items-center gap-1.5"
        >
          <Download className="w-3 h-3" /> Baixar QR
        </button>
        <CopyLinkButton url={url} />
      </div>

      <div className="w-full mt-4 pt-4 border-t border-border/50">
        <p className="text-2xl font-black text-blue-600 dark:text-blue-400 tracking-tighter leading-none">{canal.scans}</p>
        <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Avaliações por este QR</span>
      </div>
    </div>
  );
}

// Histórico de avaliações (scans) de um vendedor.
function HistoricoModal({ cod, nome, podeExcluir, onChanged, onClose }: { cod: string; nome: string; podeExcluir: boolean; onChanged: () => void; onClose: () => void }) {
  const [scans, setScans] = useState<AvaliacaoScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [excluindo, setExcluindo] = useState<string | null>(null);

  useEffect(() => {
    fetchScansVendedor(cod).then(setScans).catch(() => setScans([])).finally(() => setLoading(false));
  }, [cod]);

  const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  const excluir = async (s: AvaliacaoScan) => {
    if (!confirm(`Excluir esta avaliação de "${s.cliente_nome || "Cliente não identificado"}"? Essa ação não pode ser desfeita.`)) return;
    setExcluindo(s.id);
    try {
      await removerScan(s.id);
      setScans(prev => prev.filter(x => x.id !== s.id));
      onChanged(); // atualiza a contagem no card do vendedor
    } catch (e) {
      alert("Falha ao excluir: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExcluindo(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg z-10 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="border-b border-border px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-500" />
            <div>
              <h3 className="text-sm font-black text-foreground uppercase tracking-tight leading-none">{nome}</h3>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{scans.length} avaliações</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-blue-500 animate-spin" /></div>
          ) : scans.length === 0 ? (
            <div className="py-10 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Nenhuma avaliação ainda</div>
          ) : (
            <div className="space-y-2">
              {scans.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-3 bg-secondary/30 border border-border/50 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-foreground truncate">{s.cliente_nome || "Cliente não identificado"}</p>
                    {s.cliente_telefone && <p className="text-[10px] font-bold text-muted-foreground">{s.cliente_telefone}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{fmt(s.created_at)}</span>
                    {podeExcluir && (
                      <button
                        onClick={() => excluir(s)}
                        disabled={excluindo === s.id}
                        title="Excluir avaliação"
                        className="p-1.5 rounded-md border border-border text-muted-foreground hover:border-rose-500 hover:text-rose-500 transition-colors disabled:opacity-40"
                      >
                        {excluindo === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AvaliacoesView({ userProfile }: { userProfile?: UserProfile | null }) {
  // Exclusão de avaliação é restrita ao Danilo Oliveira.
  const podeExcluir = (userProfile?.name || "").trim().toLowerCase() === "danilo oliveira";
  const [scores, setScores] = useState<VendedorScore[]>([]);
  const [canais, setCanais] = useState<CanalScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [premio, setPremio] = useState("");
  const [premioDraft, setPremioDraft] = useState("");
  const [premioImg, setPremioImg] = useState("");
  const [premioImgDraft, setPremioImgDraft] = useState("");
  const [enviandoImg, setEnviandoImg] = useState(false);
  const [salvandoUrl, setSalvandoUrl] = useState(false);
  const [urlSalva, setUrlSalva] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const [novoCanal, setNovoCanal] = useState("");
  const [criandoCanal, setCriandoCanal] = useState(false);

  // Vendedor cujo histórico está aberto.
  const [historico, setHistorico] = useState<{ cod: string; nome: string } | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [sellers, prm, prmImg, cns] = await Promise.all([
        fetchVendedoresCampanha(), getPremioSorteio(), getPremioImagem(), fetchCanaisScore(),
      ]);
      setPremio(prm); setPremioDraft(prm);
      setPremioImg(prmImg); setPremioImgDraft(prmImg);
      setScores(await fetchScoreboard(sellers));
      setCanais(cns);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarConfig = async () => {
    setSalvandoUrl(true);
    setErro(null);
    try {
      await Promise.all([setPremioSorteio(premioDraft), setPremioImagem(premioImgDraft)]);
      setPremio(premioDraft.trim());
      setPremioImg(premioImgDraft.trim());
      setUrlSalva(true);
      setTimeout(() => setUrlSalva(false), 2000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvandoUrl(false);
    }
  };

  // Foto do prêmio: pula compressão para preservar o PNG (transparência do produto).
  const enviarFotoPremio = async (file: File) => {
    if (!file.type.startsWith("image/")) { setErro("Selecione uma imagem (PNG ou JPG)."); return; }
    if (file.size > 4_000_000) { setErro("Imagem muito grande (máx. 4 MB)."); return; }
    setEnviandoImg(true);
    setErro(null);
    try {
      const url = await uploadImage(file, "campanhas", true);
      if (!url) { setErro("Falha ao enviar a imagem. Tente novamente."); return; }
      setPremioImgDraft(url);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviandoImg(false);
    }
  };

  const adicionarCanal = async () => {
    const nome = novoCanal.trim();
    if (!nome) return;
    setCriandoCanal(true);
    setErro(null);
    try {
      await criarCanal(nome);
      setNovoCanal("");
      await carregar();
    } catch (e) {
      console.error("[adicionarCanal] Falha:", e);
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCriandoCanal(false);
    }
  };

  const excluirCanal = async (c: CanalScore) => {
    if (!confirm(`Remover o canal "${c.nome}"? Os ${c.scans} scans registrados são mantidos, mas o QR para de contar.`)) return;
    try { await removerCanal(c.id); carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  };

  const confirmadasTotal = scores.reduce((a, s) => a + s.confirmadas, 0);
  const scansVendedores = scores.reduce((a, s) => a + s.scans, 0);
  const scansCanais = canais.reduce((a, c) => a + c.scans, 0);
  const lider = scores.find(s => s.confirmadas > 0);

  return (
    <div className="flex-1 p-6 lg:p-8 bg-background h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
            <Star className="w-4 h-4 text-blue-600 dark:text-blue-400 fill-current" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter leading-none">Avaliações Google</h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Pontuação por avaliações confirmadas no Google</p>
          </div>
        </div>
        <button
          onClick={() => { setPremioDraft(premio); setPremioImgDraft(premioImg); setConfigOpen(true); }}
          title="Configurar prêmio do sorteio"
          className="shrink-0 p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Prêmio do sorteio */}
      <div className="mt-5 bg-gradient-to-r from-blue-600/10 to-transparent border border-blue-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
        {premioImg ? (
          <img src={premioImg} alt={premio || "Prêmio"} className="w-12 h-12 rounded-lg object-contain bg-white/70 dark:bg-white/10 border border-border shrink-0" />
        ) : (
          <Gift className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
        )}
        <div className="min-w-0">
          <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">Prêmio do sorteio</span>
          {premio ? (
            <span className="text-sm font-black text-foreground">{premio}</span>
          ) : (
            <button onClick={() => { setPremioDraft(""); setPremioImgDraft(premioImg); setConfigOpen(true); }} className="text-xs font-black text-blue-600 dark:text-blue-400 underline">
              Definir prêmio
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
        <div className="bg-card border border-border rounded-xl p-4">
          <Star className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-2 fill-current" />
          <p className="text-xl font-black text-foreground tracking-tighter">{confirmadasTotal}</p>
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Confirmadas no Google</span>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <ScanLine className="w-4 h-4 text-muted-foreground mb-2" />
          <p className="text-xl font-black text-foreground tracking-tighter">{scansVendedores}</p>
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">QRs escaneados</span>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <Ticket className="w-4 h-4 text-muted-foreground mb-2" />
          <p className="text-xl font-black text-foreground tracking-tighter">{scansCanais}</p>
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Via cupons / canais</span>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <Trophy className="w-4 h-4 text-amber-500 mb-2" />
          <p className="text-xl font-black text-foreground tracking-tighter truncate">{lider ? lider.vendedor_nome.split(" ")[0] : "—"}</p>
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Líder atual</span>
        </div>
      </div>

      {erro && (
        <div className="mt-5 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 rounded-xl px-4 py-3">
          <span className="text-xs font-bold text-rose-700 dark:text-rose-300">{erro}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* Vendedores */}
          <div className="mt-8">
            <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-3">Vendedores</div>
            {scores.length === 0 ? (
              <div className="bg-card border border-border rounded-xl py-12 text-center">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Nenhum vendedor na campanha</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {scores.map((s, i) => <VendedorCard key={s.vendedor_cod} score={s} baseUrl={baseUrl} rank={i} onHistorico={() => setHistorico({ cod: s.vendedor_cod, nome: s.vendedor_nome })} />)}
              </div>
            )}
          </div>

          {/* Canais / Cupons */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Cupons &amp; canais avulsos</div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-end gap-3 mb-4">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Novo cupom / canal</label>
                <input
                  value={novoCanal}
                  onChange={e => setNovoCanal(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") adicionarCanal(); }}
                  placeholder="Ex.: Cupom Nota Fiscal"
                  className="w-full px-3 py-2 text-xs font-bold bg-background border border-border rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={adicionarCanal}
                disabled={criandoCanal || !novoCanal.trim()}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {criandoCanal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Criar QR
              </button>
            </div>

            {canais.length === 0 ? (
              <div className="bg-card border border-border rounded-xl py-10 text-center">
                <Ticket className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-40" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Nenhum cupom criado — o QR da NF entra aqui</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {canais.map(c => <CanalCard key={c.id} canal={c} baseUrl={baseUrl} onRemove={() => excluirCanal(c)} />)}
              </div>
            )}
          </div>
        </>
      )}

      {/* Config do prêmio do sorteio */}
      {configOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfigOpen(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="border-b border-border px-5 py-4 flex items-center justify-between">
              <h3 className="text-sm font-black text-foreground uppercase tracking-tight flex items-center gap-2">
                <Gift className="w-4 h-4 text-blue-500" /> Prêmio do sorteio
              </h3>
              <button onClick={() => setConfigOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                  <Gift className="w-3 h-3" /> Nome do prêmio
                </label>
                <p className="text-[10px] font-bold text-muted-foreground/80 leading-relaxed mb-2">
                  O que o cliente concorre ao participar. Aparece na campanha e na tela do cliente.
                </p>
                <input
                  value={premioDraft}
                  onChange={(e) => setPremioDraft(e.target.value)}
                  placeholder="Ex.: Kit de ferramentas profissional"
                  className="w-full px-3 py-2 text-xs font-bold bg-background border border-border rounded-lg focus:outline-none focus:border-blue-500"
                />

                {/* Foto do prêmio (PNG) */}
                <div className="flex items-center gap-3 mt-3">
                  <div className="w-16 h-16 rounded-lg border border-border bg-white/70 dark:bg-white/5 flex items-center justify-center overflow-hidden shrink-0">
                    {premioImgDraft ? (
                      <img src={premioImgDraft} alt="Prêmio" className="w-full h-full object-contain" />
                    ) : (
                      <ImagePlus className="w-5 h-5 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={imgInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarFotoPremio(f); e.target.value = ""; }}
                    />
                    <button
                      onClick={() => imgInputRef.current?.click()}
                      disabled={enviandoImg}
                      className="px-3 py-2 rounded-lg border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40 flex items-center gap-1.5"
                    >
                      {enviandoImg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                      {premioImgDraft ? "Trocar foto" : "Enviar foto (PNG)"}
                    </button>
                    {premioImgDraft && (
                      <button
                        onClick={() => setPremioImgDraft("")}
                        className="px-3 py-2 rounded-lg border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-rose-500 hover:border-rose-500/50 transition-colors"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={salvarConfig}
                  disabled={salvandoUrl || (premioDraft.trim() === premio.trim() && premioImgDraft.trim() === premioImg.trim())}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                >
                  {urlSalva ? <Check className="w-3.5 h-3.5" /> : salvandoUrl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {urlSalva ? "Salvo" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {historico && (
        <HistoricoModal
          cod={historico.cod}
          nome={historico.nome}
          podeExcluir={podeExcluir}
          onChanged={carregar}
          onClose={() => setHistorico(null)}
        />
      )}
    </div>
  );
}
