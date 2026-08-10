import { useEffect, useRef, useState } from "react";
import { Star, Loader2, AlertCircle } from "lucide-react";
import {
  resolverVendedor, registrarScan, atualizarScanCliente, getGoogleReviewUrl,
  getPremioSorteio, getPremioImagem,
} from "@/lib/avaliacoes";

// Página pública (sem login) aberta por QR. Duas origens:
//   /avaliar?vendedor=COD  → atendimento de um vendedor (mostra nome)
//   /avaliar?canal=ID      → canal avulso, ex. cupom da NF
// O cliente PRECISA informar nome e telefone (para o sorteio e captação do lead)
// antes de ir ao Google — o botão fica travado até preencher os dois campos.
export function AvaliarPublicView() {
  const [vendedorNome, setVendedorNome] = useState<string | null>(null);
  const [reviewUrl, setReviewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [indo, setIndo] = useState(false);

  // Formata dígitos como (DD) 9XXXX-XXXX ou (DD) XXXX-XXXX
  const formatarTelefone = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 11);
    if (digits.length === 0) return "";
    if (digits.length <= 2)  return `(${digits}`;
    if (digits.length <= 6)  return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
    return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  };

  const handleTelefone = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTelefone(formatarTelefone(e.target.value));
  };

  const [premio, setPremio] = useState("");
  const [premioImg, setPremioImg] = useState("");

  const params = new URLSearchParams(window.location.search);
  const cod = params.get("vendedor")?.trim() || "";
  const canalId = params.get("canal")?.trim() || "";

  // Um scan por abertura de página; guardamos o id para enriquecer no envio.
  const scanIdRef = useRef<string | null>(null);
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;

    (async () => {
      if (!cod && !canalId) { setErro("Link inválido."); setLoading(false); return; }
      try {
        const [url, vNome, prm, prmImg] = await Promise.all([
          getGoogleReviewUrl(),
          cod ? resolverVendedor(cod).then(r => r.nome) : Promise.resolve(null),
          getPremioSorteio(),
          getPremioImagem(),
        ]);
        setReviewUrl(url);
        setVendedorNome(vNome);
        setPremio(prm);
        setPremioImg(prmImg);
        // Scan já no load — conta mesmo se o cliente não preencher nada.
        scanIdRef.current = await registrarScan(cod ? { vendedor_cod: cod, vendedor_nome: vNome } : { canal_id: canalId });
      } catch {
        setErro("Não foi possível carregar. Tente novamente.");
      } finally {
        setLoading(false);
      }
    })();
  }, [cod, canalId]);

  // Require: nome (>=2 letras) e telefone (>=10 dígitos) obrigatórios para avançar.
  const telDigits = telefone.replace(/\D/g, "");
  const nomeOk = nome.trim().length >= 2;
  const telOk = telDigits.length >= 10;
  const formOk = nomeOk && telOk;

  const irParaGoogle = async () => {
    if (!formOk) return;
    setIndo(true);
    // Enriquece o MESMO scan com os dados do cliente (não cria outro).
    if (scanIdRef.current && (nome.trim() || telefone.trim())) {
      await atualizarScanCliente(scanIdRef.current, nome.trim() || null, telefone.trim() || null);
    }
    // Agenda syncs no backend (1.5min, 3min, 5min) para verificar se o cliente
    // completou a avaliação no Google. Usa keepalive para sobreviver à navegação.
    try {
      fetch("/api-marketing/api/avaliacao-campanha/sync-after-scan", {
        method: "POST",
        keepalive: true,
      });
    } catch {}
    if (reviewUrl) {
      window.location.replace(reviewUrl);
    } else {
      setErro("A campanha ainda não configurou o link de avaliação do Google.");
      setIndo(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-black p-6">
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-3xl backdrop-blur-xl shadow-2xl p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-600/40">
          <Star className="w-8 h-8 text-white fill-current" />
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            <span className="text-[11px] font-bold text-white/50 uppercase tracking-widest">Carregando...</span>
          </div>
        ) : erro ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <AlertCircle className="w-8 h-8 text-rose-400" />
            <p className="text-sm font-bold text-white/80">{erro}</p>
          </div>
        ) : (
          <>
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-1">Sua opinião vale muito</p>
            <h1 className="text-xl font-black text-white tracking-tight mb-1">Avalie a Carflax no Google</h1>
            {vendedorNome && (
              <p className="text-[12px] font-bold text-white/60 mb-1">
                Atendimento de <span className="text-white">{vendedorNome}</span>
              </p>
            )}
            <p className="text-[11px] font-bold text-blue-300/80 mb-4">Preencha seus dados para avaliar e concorrer ao sorteio 🎁</p>

            {premio && (
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-3 mb-6 text-left">
                {premioImg && (
                  <img src={premioImg} alt={premio} className="w-14 h-14 rounded-lg object-contain bg-white/80 shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="text-[8px] font-black text-blue-300/70 uppercase tracking-widest block">Concorra a</span>
                  <span className="text-sm font-black text-white leading-tight">{premio}</span>
                </div>
              </div>
            )}

            <div className="space-y-3 text-left mb-6">
              <div>
                <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-1 ml-1">Seu nome <span className="text-rose-400">*</span></label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Como você se chama"
                  className="w-full px-4 py-3 text-sm font-bold bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/25 outline-none focus:border-blue-500/60"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-1 ml-1">Telefone / WhatsApp <span className="text-rose-400">*</span></label>
                <input
                  value={telefone}
                  onChange={handleTelefone}
                  inputMode="tel"
                  placeholder="(11) 9...."
                  className="w-full px-4 py-3 text-sm font-bold bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/25 outline-none focus:border-blue-500/60"
                />
              </div>
            </div>

            <button
              onClick={irParaGoogle}
              disabled={indo || !formOk}
              className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {indo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4 fill-current" />}
              Avaliar no Google
            </button>
            {!formOk ? (
              <p className="text-[10px] font-bold text-amber-300/80 mt-3 leading-relaxed">
                Preencha seu nome e telefone para liberar a avaliação.
              </p>
            ) : (
              <p className="text-[9px] font-bold text-white/30 mt-4 leading-relaxed">
                Você será levado à página de avaliações do Google. Leva menos de um minuto. 💙
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
