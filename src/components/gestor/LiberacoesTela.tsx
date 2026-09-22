import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, LogOut } from "lucide-react";
import { apiGestorEntrarCitel, apiGestorLiberar, type GestorLiberacao } from "@/lib/api";

/**
 * Liberações de pedido/orçamento travado — mesmo fluxo do app Citel Gestor.
 *
 * A liberação é gravada no ERP no nome do operador Citel, por isso pede o login
 * da Citel. O servidor devolve um token de 12h (a senha não fica no navegador);
 * guardamos só o token na sessionStorage, que some ao fechar a aba.
 */

const CHAVE_SESSAO = "gestor-citel-operador";
type Sessao = { token: string; operador: { codigo: string; nome: string } };

function lerSessao(): Sessao | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_SESSAO);
    return bruto ? (JSON.parse(bruto) as Sessao) : null;
  } catch {
    return null;
  }
}
function gravarSessao(s: Sessao | null) {
  try {
    if (s) sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
    else sessionStorage.removeItem(CHAVE_SESSAO);
  } catch {
    /* sem storage: a sessão vale só enquanto a tela estiver aberta */
  }
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const numeroCurto = (n: string) => n.replace(/^0+/, "") || n;

export function LiberacoesTela({ pendentes, onAtualizar }: { pendentes: GestorLiberacao[] | null; onAtualizar: () => Promise<void> }) {
  const [sessao, setSessao] = useState<Sessao | null>(lerSessao);
  const [liberados, setLiberados] = useState<string[]>([]);

  const sair = () => {
    gravarSessao(null);
    setSessao(null);
  };

  if (pendentes === null) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Não foi possível carregar as liberações.</p>;
  }

  const chave = (d: GestorLiberacao) => `${d.especie}-${d.numero}-${d.empresa}`;
  const lista = pendentes.filter((d) => !liberados.includes(chave(d)));

  return (
    <div className="space-y-4">
      {sessao ? (
        <div className="flex items-center justify-between rounded-xl bg-card border border-border px-4 py-3 text-[13px]">
          <span>
            Liberando como <b>{sessao.operador.nome}</b>
          </span>
          <button onClick={sair} className="flex items-center gap-1 text-muted-foreground">
            <LogOut size={14} /> Trocar
          </button>
        </div>
      ) : (
        lista.length > 0 && (
          <LoginCitel
            onEntrar={(s) => {
              gravarSessao(s);
              setSessao(s);
            }}
          />
        )
      )}

      {lista.length === 0 && (
        <div className="rounded-xl bg-card border border-border px-4 py-10 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500" size={32} />
          <p className="mt-2 text-[15px] font-semibold">Nenhuma liberação pendente</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Pedidos e orçamentos travados aparecem aqui.</p>
        </div>
      )}

      {lista.map((d) => (
        <CartaoLiberacao
          key={chave(d)}
          doc={d}
          sessao={sessao}
          onRelogar={sair}
          onLiberado={() => {
            setLiberados((l) => [...l, chave(d)]);
            onAtualizar();
          }}
        />
      ))}
    </div>
  );
}

function LoginCitel({ onEntrar }: { onEntrar: (s: Sessao) => void }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      onEntrar(await apiGestorEntrarCitel(usuario.trim(), senha));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={entrar} className="space-y-3 rounded-xl bg-card border border-border p-4">
      <div>
        <p className="text-[15px] font-bold">Login da Citel</p>
        <p className="text-[12px] text-muted-foreground">A liberação fica registrada no ERP no seu nome de operador.</p>
      </div>
      <input
        value={usuario}
        onChange={(e) => setUsuario(e.target.value)}
        placeholder="Usuário"
        autoCapitalize="none"
        autoComplete="username"
        className="w-full rounded-lg border border-border px-3 py-2.5 text-[16px] bg-transparent outline-none focus:border-blue-500"
      />
      <input
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder="Senha"
        type="password"
        autoComplete="current-password"
        className="w-full rounded-lg border border-border px-3 py-2.5 text-[16px] bg-transparent outline-none focus:border-blue-500"
      />
      {erro && <p className="text-[13px] text-red-600">{erro}</p>}
      <button
        disabled={enviando || !usuario.trim() || !senha}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {enviando && <Loader2 size={16} className="animate-spin" />} Entrar
      </button>
    </form>
  );
}

function CartaoLiberacao({
  doc,
  sessao,
  onRelogar,
  onLiberado,
}: {
  doc: GestorLiberacao;
  sessao: Sessao | null;
  onRelogar: () => void;
  onLiberado: () => void;
}) {
  const [obs, setObs] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const falta = [doc.falta_comercial && "comercial", doc.falta_financeira && "financeira"].filter(Boolean).join(" e ");

  const liberar = async () => {
    if (!sessao) return;
    setEnviando(true);
    setErro(null);
    try {
      await apiGestorLiberar(sessao.token, doc, obs.trim());
      onLiberado();
    } catch (err) {
      const e = err as Error & { relogar?: boolean };
      if (e.relogar) onRelogar();
      setErro(e.message || "Não foi possível liberar.");
      setConfirmando(false);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="rounded-xl bg-card border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold">{doc.cliente}</p>
          <p className="text-[12px] text-muted-foreground">
            {doc.especie === "PD" ? "Pedido" : "Orçamento"} {numeroCurto(doc.numero)} · Emp. {doc.empresa} · {dataCurta(doc.data)}
          </p>
          <p className="text-[12px] text-muted-foreground">Vendedor: {doc.vendedor}</p>
        </div>
        <span className="shrink-0 text-[15px] font-bold tabular-nums">{brl(doc.valor)}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(doc.motivos.length ? doc.motivos : ["Motivo não informado"]).map((m) => (
          <span key={m} className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[12px] text-amber-600 dark:text-amber-400">
            {m}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">Falta liberação {falta}.</p>

      {sessao && (
        <>
          <input
            value={obs}
            onChange={(e) => setObs(e.target.value.slice(0, 120))}
            placeholder="Observação (opcional)"
            className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-[16px] bg-transparent outline-none focus:border-blue-500"
          />
          {erro && <p className="mt-2 text-[13px] text-red-600">{erro}</p>}
          {confirmando ? (
            <div className="mt-3 flex gap-2">
              <button onClick={() => setConfirmando(false)} disabled={enviando} className="flex-1 rounded-lg border border-border py-2.5 text-[14px]">
                Cancelar
              </button>
              <button
                onClick={liberar}
                disabled={enviando}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
              >
                {enviando && <Loader2 size={16} className="animate-spin" />} Confirmar
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmando(true)} className="mt-3 w-full rounded-lg bg-blue-600 py-2.5 text-[14px] font-semibold text-white">
              Liberar
            </button>
          )}
        </>
      )}
    </section>
  );
}
