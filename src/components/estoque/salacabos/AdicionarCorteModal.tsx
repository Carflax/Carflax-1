import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, LogOut, Scissors, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EMPRESAS,
  ErroApi,
  fmtMetros,
  fmtPedido,
  salaCabosApi,
  type OperadorCitel,
  type PedidoCabos,
} from "./sala-cabos-api";

// Corte lançado por quem está na sala de cabos: entra com usuário e senha da
// Citel (validados no servidor), digita o pedido e os metros. O login fica
// guardado na aba do navegador até sair ou vencer (12h), para não pedir senha
// a cada corte — e o corte vai sempre no nome de quem entrou.

const SESSAO_KEY = "carflax-cabos-operador";

interface Sessao { token: string; operador: OperadorCitel }

function lerSessao(): Sessao | null {
  try {
    const raw = sessionStorage.getItem(SESSAO_KEY);
    return raw ? (JSON.parse(raw) as Sessao) : null;
  } catch {
    return null;
  }
}

function salvarSessao(s: Sessao | null) {
  try {
    if (s) sessionStorage.setItem(SESSAO_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSAO_KEY);
  } catch { /* sem storage: pede login de novo */ }
}

const campo = "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30";

export function AdicionarCorteModal({ onClose, onRegistrado }: { onClose: () => void; onRegistrado: () => void }) {
  const [sessao, setSessao] = useState<Sessao | null>(lerSessao);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Login
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");

  // Corte
  const [numero, setNumero] = useState("");
  const [pedidos, setPedidos] = useState<PedidoCabos[] | null>(null);
  const [empresa, setEmpresa] = useState("");
  const [codProduto, setCodProduto] = useState("");
  const [metros, setMetros] = useState("");
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const sair = () => {
    salvarSessao(null);
    setSessao(null);
    setUsuario("");
    setSenha("");
  };

  const entrar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      const s = await salaCabosApi.entrar(usuario.trim(), senha);
      salvarSessao(s);
      setSessao(s);
      setSenha("");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const pedidoSelecionado = pedidos?.find((p) => p.empresa === empresa) || null;
  const itemSelecionado = pedidoSelecionado?.itens.find((i) => i.cod_produto === codProduto) || null;

  const escolherItem = (p: PedidoCabos, cod: string) => {
    setEmpresa(p.empresa);
    setCodProduto(cod);
    const item = p.itens.find((i) => i.cod_produto === cod);
    const falta = item ? Math.max(item.qtd - item.registrado, 0) : 0;
    setMetros(falta > 0 ? String(falta).replace(".", ",") : "");
  };

  const buscarPedido = async () => {
    if (!numero) return;
    setOcupado(true);
    setErro(null);
    setSucesso(null);
    setPedidos(null);
    setCodProduto("");
    setMetros("");
    try {
      const lista = await salaCabosApi.pedido(numero);
      setPedidos(lista);
      // Um pedido com um cabo só: já deixa escolhido.
      if (lista.length === 1 && lista[0].itens.length === 1) escolherItem(lista[0], lista[0].itens[0].cod_produto);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const registrar = async () => {
    if (!sessao || !pedidoSelecionado || !itemSelecionado) return;
    const m = Number(metros.replace(",", "."));
    if (!(m > 0)) { setErro("Informe os metros cortados."); return; }
    setOcupado(true);
    setErro(null);
    try {
      await salaCabosApi.registrarCorte({
        token: sessao.token,
        empresa: pedidoSelecionado.empresa,
        pedido: pedidoSelecionado.pedido,
        cod_produto: itemSelecionado.cod_produto,
        metros: m,
      });
      setSucesso(`Corte registrado: ${fmtMetros(m)} de ${itemSelecionado.descricao} no pedido ${fmtPedido(pedidoSelecionado.pedido)}.`);
      onRegistrado();

      // Mantém o pedido aberto: pedido com mais de um cabo não obriga a digitar
      // o número de novo. Recarrega o "já registrado" e já seleciona o próximo
      // cabo que ainda falta; se não faltar nenhum, só limpa a seleção.
      const atualizados = await salaCabosApi.pedido(pedidoSelecionado.pedido).catch(() => null);
      if (atualizados) {
        setPedidos(atualizados);
        const proximo = atualizados
          .flatMap((p) => p.itens.map((i) => ({ p, i })))
          .find(({ p, i }) => p.empresa === pedidoSelecionado.empresa && i.qtd - i.registrado > 0);
        if (proximo) escolherItem(proximo.p, proximo.i.cod_produto);
        else { setCodProduto(""); setMetros(""); }
      } else {
        setCodProduto("");
        setMetros("");
      }
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) {
        sair();
        setErro("Sessão expirada. Entre de novo com usuário e senha da Citel.");
      } else {
        setErro((e as Error).message);
      }
    } finally {
      setOcupado(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Scissors className="w-5 h-5" /></div>
            <div>
              <p className="text-sm font-black uppercase tracking-tight">Adicionar corte</p>
              {sessao && <p className="text-[11px] text-muted-foreground">Cortando como <b className="text-foreground">{sessao.operador.nome}</b></p>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {sessao && (
              <button onClick={sair} title="Trocar usuário" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary text-xs font-bold text-muted-foreground">
                <LogOut className="w-3.5 h-3.5" /> Sair
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {!sessao ? (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); entrar(); }}>
              <p className="text-xs text-muted-foreground">Entre com o seu código e senha da Citel, os mesmos do Coletor. O corte fica registrado no seu nome.</p>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Usuário</span>
                <input autoFocus inputMode="numeric" placeholder="Ex.: 001" value={usuario} onChange={(e) => setUsuario(e.target.value.replace(/\D/g, ""))} className={campo} autoComplete="off" />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Senha</span>
                <input type="password" inputMode="numeric" value={senha} onChange={(e) => setSenha(e.target.value.replace(/\D/g, ""))} className={campo} autoComplete="off" />
              </label>
              {erro && <p className="text-xs font-semibold text-destructive">{erro}</p>}
              <button type="submit" disabled={ocupado || !usuario.trim() || !senha} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                {ocupado && <Loader2 className="w-4 h-4 animate-spin" />} Entrar
              </button>
            </form>
          ) : (
            <>
              {sucesso && <p className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold p-3">{sucesso}</p>}

              <form className="space-y-1" onSubmit={(e) => { e.preventDefault(); buscarPedido(); }}>
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Número do pedido</span>
                <div className="flex gap-2">
                  <input
                    autoFocus
                    inputMode="numeric"
                    value={numero}
                    onChange={(e) => { setNumero(e.target.value.replace(/\D/g, "")); setPedidos(null); setCodProduto(""); }}
                    className={campo}
                  />
                  <button type="submit" disabled={ocupado || !numero} className="px-4 rounded-xl border border-border bg-background hover:bg-secondary text-sm font-bold disabled:opacity-40">
                    {ocupado && !pedidos ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
                  </button>
                </div>
              </form>

              {pedidos && pedidos.map((p) => (
                <div key={p.empresa} className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <b className="text-foreground">{p.cliente || "—"}</b> · {EMPRESAS[p.empresa] ?? p.empresa}{p.status ? ` · ${p.status}` : ""}
                  </p>
                  {p.itens.map((i) => {
                    const ativo = empresa === p.empresa && codProduto === i.cod_produto;
                    return (
                      <button
                        key={i.cod_produto}
                        type="button"
                        onClick={() => escolherItem(p, i.cod_produto)}
                        className={cn("w-full text-left rounded-xl border p-3 transition-colors", ativo ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/40")}
                      >
                        <p className="text-sm font-semibold leading-tight">{i.descricao}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Pedido pede {fmtMetros(i.qtd)}{i.registrado > 0 && ` · já registrado ${fmtMetros(i.registrado)}`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              ))}

              {itemSelecionado && (
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); registrar(); }}>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Metros cortados</span>
                    <input
                      inputMode="decimal"
                      value={metros}
                      onChange={(e) => setMetros(e.target.value.replace(/[^\d,.]/g, ""))}
                      className={cn(campo, "text-lg font-black")}
                    />
                  </label>
                  <button type="submit" disabled={ocupado || !metros} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                    {ocupado && <Loader2 className="w-4 h-4 animate-spin" />} Registrar corte
                  </button>
                </form>
              )}

              {erro && <p className="text-xs font-semibold text-destructive">{erro}</p>}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
