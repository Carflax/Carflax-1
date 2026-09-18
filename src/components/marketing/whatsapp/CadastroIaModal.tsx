import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Sparkles, UserPlus, X, Link2 } from "lucide-react";
import { API_BASE, authHeaders } from "@/lib/api";

// "/cad" na conversa: a IA lê as mensagens e preenche o cadastro do cliente
// para a Citel. Nada é gravado sem conferência — o vendedor revisa, corrige e
// só então clica em "Cadastrar". Se o CPF/CNPJ já existir, oferece vincular.

interface DadosCadastro {
  tipo: "PF" | "PJ";
  nome: string;
  documento: string;
  email: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  nascimento: string;
  telefoneCelular: string;
  codigoAtividade: string;
  codigoVendedor: string;
  observacao: string;
  inscricaoEstadual?: string;
}

interface Extracao {
  dados: DadosCadastro;
  avisos: string[];
  existente: { codigo: string; nome: string } | null;
  atividades: { codigo: string; descricao: string }[];
  vendedor: { codigo: string; nome: string } | null;
}

async function chamar<T>(caminho: string, body: unknown): Promise<T> {
  const base = API_BASE.startsWith("http") ? API_BASE : window.location.origin + API_BASE;
  const resp = await fetch(`${base}${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw Object.assign(new Error(json?.error || `Erro ${resp.status}`), { dados: json });
  return json as T;
}

const soDigitos = (s: string) => s.replace(/\D/g, "");

export function CadastroIaModal({
  remoteJid,
  codigoOperadorLogado,
  onClose,
  onVincular,
}: {
  remoteJid: string;
  /** Vendedor de reserva quando a conversa não tem atendente com código na Citel. */
  codigoOperadorLogado?: string;
  onClose: () => void;
  /** Liga a conversa ao cadastro (novo ou já existente). */
  onVincular: (codigo: string, nome: string) => Promise<void>;
}) {
  const [extracao, setExtracao] = useState<Extracao | null>(null);
  const [dados, setDados] = useState<DadosCadastro | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    chamar<Extracao>("/api/whatsapp/cadastro/extrair", { remoteJid })
      .then((r) => {
        if (!vivo) return;
        setExtracao(r);
        setDados({ ...r.dados, codigoVendedor: r.dados.codigoVendedor || codigoOperadorLogado || "" });
      })
      .catch((e) => vivo && setErro((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [remoteJid, codigoOperadorLogado]);

  const campo = (k: keyof DadosCadastro) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDados((d) => (d ? { ...d, [k]: e.target.value } : d));

  const cadastrar = async () => {
    if (!dados) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await chamar<{ codigo: string; nome: string }>("/api/whatsapp/cadastro/criar", { remoteJid, dados });
      await onVincular(r.codigo, r.nome);
      onClose();
    } catch (e) {
      const existente = (e as { dados?: { existente?: Extracao["existente"] } }).dados?.existente;
      if (existente && extracao) setExtracao({ ...extracao, existente });
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const vincularExistente = async () => {
    if (!extracao?.existente) return;
    setSalvando(true);
    try {
      await onVincular(extracao.existente.codigo, extracao.existente.nome);
      onClose();
    } finally {
      setSalvando(false);
    }
  };

  const pj = dados ? soDigitos(dados.documento).length === 14 : false;
  const input =
    "w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-[12px] font-semibold outline-none focus:border-primary/50";
  const rotulo = "block text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1";

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-lg max-h-full flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-black text-sm uppercase tracking-tighter text-card-foreground">Cadastro na Citel (IA)</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-lg transition-colors text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {!dados && !erro && (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Lendo a conversa e buscando o CEP...
            </div>
          )}

          {extracao?.existente && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px]">
              <p className="font-bold text-amber-600 dark:text-amber-400">
                Já existe cadastro com este documento: {extracao.existente.codigo} — {extracao.existente.nome}
              </p>
              <button
                onClick={vincularExistente}
                disabled={salvando}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white font-bold disabled:opacity-50"
              >
                <Link2 className="w-3.5 h-3.5" /> Vincular este cadastro à conversa
              </button>
            </div>
          )}

          {extracao && extracao.avisos.length > 0 && (
            <ul className="space-y-1">
              {extracao.avisos.map((a) => (
                <li key={a} className="flex gap-1.5 text-[11px] text-muted-foreground">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-px" /> {a}
                </li>
              ))}
            </ul>
          )}

          {dados && (
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-6">
                <label className={rotulo}>{pj ? "Razão social" : "Nome completo"}</label>
                <input className={input} value={dados.nome} onChange={campo("nome")} />
              </div>
              <div className="col-span-3">
                <label className={rotulo}>{pj ? "CNPJ" : "CPF"}</label>
                <input className={input} value={dados.documento} onChange={campo("documento")} />
              </div>
              <div className="col-span-3">
                <label className={rotulo}>Celular / WhatsApp</label>
                <input className={input} value={dados.telefoneCelular} onChange={campo("telefoneCelular")} />
              </div>
              <div className="col-span-6">
                <label className={rotulo}>E-mail (vazio = nfe@nfe.com.br na NF-e)</label>
                <input className={input} value={dados.email} onChange={campo("email")} />
              </div>
              <div className="col-span-2">
                <label className={rotulo}>CEP</label>
                <input className={input} value={dados.cep} onChange={campo("cep")} />
              </div>
              <div className="col-span-4">
                <label className={rotulo}>Endereço</label>
                <input className={input} value={dados.endereco} onChange={campo("endereco")} />
              </div>
              <div className="col-span-2">
                <label className={rotulo}>Número</label>
                <input className={input} value={dados.numero} onChange={campo("numero")} />
              </div>
              <div className="col-span-4">
                <label className={rotulo}>Complemento</label>
                <input className={input} value={dados.complemento} onChange={campo("complemento")} />
              </div>
              <div className="col-span-3">
                <label className={rotulo}>Bairro</label>
                <input className={input} value={dados.bairro} onChange={campo("bairro")} />
              </div>
              <div className="col-span-2">
                <label className={rotulo}>Cidade</label>
                <input className={input} value={dados.cidade} onChange={campo("cidade")} />
              </div>
              <div className="col-span-1">
                <label className={rotulo}>UF</label>
                <input className={input} value={dados.uf} onChange={campo("uf")} maxLength={2} />
              </div>
              {pj && (
                <div className="col-span-3">
                  <label className={rotulo}>Inscrição estadual</label>
                  <input className={input} value={dados.inscricaoEstadual || ""} onChange={campo("inscricaoEstadual")} />
                </div>
              )}
              <div className={pj ? "col-span-3" : "col-span-4"}>
                <label className={rotulo}>Atividade</label>
                <select className={input} value={dados.codigoAtividade} onChange={campo("codigoAtividade")}>
                  <option value="">Escolha...</option>
                  {(extracao?.atividades || []).map((a) => (
                    <option key={a.codigo} value={a.codigo}>
                      {a.codigo} — {a.descricao}
                    </option>
                  ))}
                </select>
              </div>
              <div className={pj ? "col-span-6" : "col-span-2"}>
                <label className={rotulo}>Vendedor (cód.)</label>
                <input className={input} value={dados.codigoVendedor} onChange={campo("codigoVendedor")} />
              </div>
              {dados.observacao && (
                <div className="col-span-6">
                  <label className={rotulo}>Observação</label>
                  <input className={input} value={dados.observacao} onChange={campo("observacao")} />
                </div>
              )}
            </div>
          )}

          {erro && <p className="text-[11px] font-bold text-destructive">{erro}</p>}
        </div>

        {dados && (
          <div className="p-4 border-t border-border/50 flex justify-end gap-2 shrink-0">
            <button onClick={onClose} className="px-3 py-2 rounded-xl text-[12px] font-bold text-muted-foreground hover:bg-secondary">
              Cancelar
            </button>
            <button
              onClick={cadastrar}
              disabled={salvando || !!extracao?.existente}
              title={extracao?.existente ? "Este documento já tem cadastro — use Vincular" : undefined}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[12px] font-black disabled:opacity-50"
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Cadastrar na Citel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
