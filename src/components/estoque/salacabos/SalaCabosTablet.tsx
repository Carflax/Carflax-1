import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Cable,
  CheckCircle2,
  Delete,
  Loader2,
  LogOut,
  PackagePlus,
  Ruler,
  Scissors,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EtiquetaBobina } from "./EtiquetaBobina";
import {
  EMPRESAS,
  MOTIVO_LABEL,
  fmtMetros,
  fmtPedido,
  lerNumeroBobina,
  numeroBobina,
  salaCabosApi,
  type Bobina,
  type Credencial,
  type MotivoCorte,
  type Movimento,
  type Operador,
  type PedidoCabos,
  type ProdutoMetro,
} from "./sala-cabos-api";

// Tablet fixo na sala de cabos. Fica logado numa conta do HUB; quem corta se
// identifica com o próprio PIN a cada sessão curta, e é esse nome que vai no
// registro — não o de quem separou o pedido.

const EMPRESA_KEY = "carflax-sala-cabos-empresa";
const INATIVIDADE_MS = 90_000;

type Tela =
  | { id: "inicio" }
  | { id: "corte-pedido" }
  | { id: "corte-item"; pedido: PedidoCabos }
  | { id: "corte-bobina"; pedido: PedidoCabos | null; item: PedidoCabos["itens"][number] | null }
  | { id: "corte-metros"; pedido: PedidoCabos | null; item: PedidoCabos["itens"][number] | null; bobina: Bobina }
  | { id: "nova-produto" }
  | { id: "nova-metros"; produto: ProdutoMetro }
  | { id: "medir-bobina" }
  | { id: "medir-metros"; bobina: Bobina }
  | { id: "sucesso"; titulo: string; linhas: string[]; bobina?: Bobina };

// Mesmo fallback da tela de Usuários para quem não tem foto.
const avatarSrc = (avatar: string | null, nome: string) =>
  avatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(nome)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

function lerEmpresa() {
  try { return localStorage.getItem(EMPRESA_KEY) || "001"; } catch { return "001"; }
}

// ── Peças de UI ──────────────────────────────────────────────────────────────
function Teclado({ valor, onChange, decimal = false, max = 8 }: { valor: string; onChange: (v: string) => void; decimal?: boolean; max?: number }) {
  const tecla = (t: string) => {
    if (t === "del") return onChange(valor.slice(0, -1));
    if (t === ",") {
      if (!decimal || valor.includes(",")) return;
      return onChange((valor || "0") + ",");
    }
    if (valor.length >= max) return;
    const [, dec] = valor.split(",");
    if (dec !== undefined && dec.length >= 2) return;
    onChange(valor === "0" ? t : valor + t);
  };
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-sm mx-auto">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "," : "", "0", "del"].map((t, i) =>
        t === "" ? <div key={i} /> : (
          <button
            key={i}
            onClick={() => tecla(t)}
            className="h-16 rounded-2xl bg-secondary text-2xl font-black active:scale-95 active:bg-primary/20 transition flex items-center justify-center select-none"
          >
            {t === "del" ? <Delete className="w-7 h-7" /> : t}
          </button>
        ),
      )}
    </div>
  );
}

const paraNumero = (v: string) => Number(v.replace(",", ".")) || 0;

function Cabecalho({ titulo, onVoltar }: { titulo: string; onVoltar?: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      {onVoltar && (
        <button onClick={onVoltar} className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center active:scale-95">
          <ArrowLeft className="w-6 h-6" />
        </button>
      )}
      <h2 className="text-2xl font-black tracking-tight">{titulo}</h2>
    </div>
  );
}

function BotaoPrimario({ children, onClick, disabled, loading }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full h-16 rounded-2xl bg-primary text-primary-foreground text-lg font-black disabled:opacity-40 active:scale-[0.98] transition flex items-center justify-center gap-2"
    >
      {loading && <Loader2 className="w-5 h-5 animate-spin" />}
      {children}
    </button>
  );
}

function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive p-4 text-base font-semibold">
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /> {texto}
    </div>
  );
}

// ── Tela ─────────────────────────────────────────────────────────────────────
export function SalaCabosTablet() {
  const [empresa, setEmpresa] = useState(lerEmpresa);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [carregandoOps, setCarregandoOps] = useState(true);
  const [escolhido, setEscolhido] = useState<Operador | null>(null);
  const [pin, setPin] = useState("");
  const [cred, setCred] = useState<(Credencial & { nome: string }) | null>(null);
  const [tela, setTela] = useState<Tela>({ id: "inicio" });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ultimoToque = useRef(Date.now());

  // Estado dos passos
  const [campo, setCampo] = useState("");
  const [motivo, setMotivo] = useState<MotivoCorte>("pedido");
  const [observacao, setObservacao] = useState("");
  const [bobinas, setBobinas] = useState<Bobina[]>([]);
  const [produtos, setProdutos] = useState<ProdutoMetro[]>([]);
  const [etiqueta, setEtiqueta] = useState<Bobina | null>(null);
  const [confirmarExcesso, setConfirmarExcesso] = useState(false);

  useEffect(() => {
    salaCabosApi.operadores()
      .then(setOperadores)
      .catch(() => setErro("Não foi possível carregar os operadores."))
      .finally(() => setCarregandoOps(false));
  }, []);

  const sair = useCallback(() => {
    setCred(null);
    setEscolhido(null);
    setPin("");
    setTela({ id: "inicio" });
    setErro(null);
  }, []);

  // Sai sozinho depois de um tempo parado: o próximo a usar não corta no nome de outro.
  useEffect(() => {
    if (!cred) return;
    const marcar = () => { ultimoToque.current = Date.now(); };
    window.addEventListener("pointerdown", marcar);
    window.addEventListener("keydown", marcar);
    const timer = setInterval(() => {
      if (Date.now() - ultimoToque.current > INATIVIDADE_MS) sair();
    }, 5000);
    return () => {
      window.removeEventListener("pointerdown", marcar);
      window.removeEventListener("keydown", marcar);
      clearInterval(timer);
    };
  }, [cred, sair]);

  const ir = (t: Tela) => {
    setErro(null);
    setCampo("");
    setConfirmarExcesso(false);
    setTela(t);
  };

  const trocarEmpresa = (e: string) => {
    setEmpresa(e);
    try { localStorage.setItem(EMPRESA_KEY, e); } catch { /* sem storage */ }
  };

  const executar = async (fn: () => Promise<void>) => {
    setOcupado(true);
    setErro(null);
    try {
      await fn();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setOcupado(false);
    }
  };

  // ── Login por PIN ──
  const confirmarPin = () => executar(async () => {
    if (!escolhido) return;
    const c = { operador_id: escolhido.id, pin };
    const r = await salaCabosApi.entrar(c);
    setCred({ ...c, nome: r.operador.nome });
    ultimoToque.current = Date.now();
    setPin("");
    setTela({ id: "inicio" });
  }).finally(() => setPin(""));

  const buscarBobinas = (produto: string) => executar(async () => {
    setBobinas(await salaCabosApi.bobinas({ empresa, produto }));
  });

  const buscarBobinaPorNumero = async (texto: string): Promise<Bobina | null> => {
    const numero = lerNumeroBobina(texto);
    if (!numero) { setErro("Digite o número da bobina."); return null; }
    const lista = await salaCabosApi.bobinas({ empresa, numero: String(numero), status: "todas" });
    const b = lista[0];
    if (!b) { setErro(`${numeroBobina(numero)} não existe em ${EMPRESAS[empresa]}.`); return null; }
    if (b.status !== "ativa") { setErro(`${numeroBobina(numero)} já foi finalizada.`); return null; }
    return b;
  };

  // Busca de produto com debounce na tela de bobina nova / corte sem pedido
  const [busca, setBusca] = useState("");
  useEffect(() => {
    const t = busca.trim();
    const timer = setTimeout(() => {
      if (t.length < 2) { setProdutos([]); return; }
      salaCabosApi.produtos(t, empresa).then(setProdutos).catch(() => setProdutos([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [busca, empresa]);

  // ── Não identificado: escolher operador + PIN ──
  if (!cred) {
    return (
      <Moldura empresa={empresa} onEmpresa={trocarEmpresa}>
        {!escolhido ? (
          <>
            <h2 className="text-3xl font-black tracking-tight text-center">Quem vai cortar?</h2>
            <p className="text-center text-muted-foreground mt-1 mb-8">Toque no seu nome e digite o seu PIN.</p>
            {carregandoOps ? (
              <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
            ) : operadores.length === 0 ? (
              <p className="text-center text-muted-foreground">Nenhum operador cadastrado. Peça ao gestor para cadastrar em Estoque › Sala de Cabos.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {operadores.map((o) => (
                  <button key={o.id} onClick={() => { setEscolhido(o); setErro(null); }} className="rounded-3xl bg-card border border-border p-5 flex flex-col items-center gap-3 active:scale-95 transition">
                    <img src={avatarSrc(o.avatar, o.nome)} alt="" className="w-20 h-20 rounded-2xl object-cover bg-secondary" />
                    <span className="text-base font-black text-center leading-tight">{o.nome}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-6"><Erro texto={erro} /></div>
          </>
        ) : (
          <div className="max-w-sm mx-auto space-y-6">
            <Cabecalho titulo={escolhido.nome} onVoltar={() => { setEscolhido(null); setPin(""); setErro(null); }} />
            <div className="flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={cn("w-5 h-5 rounded-full border-2 border-primary", pin.length > i && "bg-primary")} />
              ))}
              {pin.length > 4 && <span className="text-primary font-black">+{pin.length - 4}</span>}
            </div>
            <Teclado valor={pin} onChange={(v) => { setPin(v); setErro(null); }} max={6} />
            <Erro texto={erro} />
            <BotaoPrimario onClick={confirmarPin} disabled={pin.length < 4} loading={ocupado}>Entrar</BotaoPrimario>
          </div>
        )}
      </Moldura>
    );
  }

  // ── Identificado ──
  return (
    <Moldura empresa={empresa} onEmpresa={trocarEmpresa} operador={cred.nome} onSair={sair}>
      {tela.id === "inicio" && (
        <div className="grid gap-4 max-w-2xl mx-auto">
          <BotaoAcao icon={Scissors} titulo="Cortar cabo" descricao="Registrar metros cortados de uma bobina" destaque onClick={() => { setMotivo("pedido"); setObservacao(""); ir({ id: "corte-pedido" }); }} />
          <BotaoAcao icon={PackagePlus} titulo="Cadastrar bobina" descricao="Bobina nova ou contagem inicial — gera a etiqueta" onClick={() => { setBusca(""); ir({ id: "nova-produto" }); }} />
          <BotaoAcao icon={Ruler} titulo="Medir bobina" descricao="Corrigir o saldo com a metragem real" onClick={() => { setObservacao(""); ir({ id: "medir-bobina" }); }} />
        </div>
      )}

      {/* ── Corte: pedido ── */}
      {tela.id === "corte-pedido" && (
        <div className="max-w-sm mx-auto space-y-5">
          <Cabecalho titulo="Número do pedido" onVoltar={() => ir({ id: "inicio" })} />
          <div className="h-16 rounded-2xl border-2 border-primary/40 bg-card flex items-center justify-center text-4xl font-black tabular-nums">{campo || <span className="text-muted-foreground/40">—</span>}</div>
          <Teclado valor={campo} onChange={(v) => { setCampo(v); setErro(null); }} max={12} />
          <Erro texto={erro} />
          <BotaoPrimario
            disabled={!campo}
            loading={ocupado}
            onClick={() => executar(async () => {
              const p = await salaCabosApi.pedido(campo, empresa);
              ir({ id: "corte-item", pedido: p });
            })}
          >
            Buscar pedido
          </BotaoPrimario>
          <button onClick={() => { setMotivo("amostra"); setBusca(""); setBobinas([]); ir({ id: "corte-bobina", pedido: null, item: null }); }} className="w-full h-14 rounded-2xl border border-border text-base font-bold text-muted-foreground">
            Corte sem pedido (amostra, perda, ponta…)
          </button>
        </div>
      )}

      {/* ── Corte: item do pedido ── */}
      {tela.id === "corte-item" && (
        <div className="max-w-2xl mx-auto space-y-4">
          <Cabecalho titulo={`Pedido ${fmtPedido(tela.pedido.pedido)}`} onVoltar={() => ir({ id: "corte-pedido" })} />
          <p className="text-muted-foreground -mt-4">{tela.pedido.cliente} · {tela.pedido.status}</p>
          <p className="text-lg font-bold">Qual cabo você cortou?</p>
          {tela.pedido.itens.map((i) => {
            const completo = i.cortado >= i.qtd;
            return (
              <button
                key={i.cod_produto}
                onClick={() => { setBobinas([]); buscarBobinas(i.cod_produto); ir({ id: "corte-bobina", pedido: tela.pedido, item: i }); }}
                className={cn("w-full text-left rounded-2xl border p-5 active:scale-[0.99] transition", completo ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card")}
              >
                <p className="text-lg font-black leading-tight">{i.descricao}</p>
                <div className="flex items-center justify-between mt-2 text-base">
                  <span className="text-muted-foreground">Cód. {i.cod_produto}</span>
                  <span className={cn("font-black tabular-nums", completo ? "text-emerald-600" : "text-primary")}>
                    {fmtMetros(i.cortado)} de {fmtMetros(i.qtd)} {completo && "✓"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Corte: bobina ── */}
      {tela.id === "corte-bobina" && (
        <div className="max-w-2xl mx-auto space-y-4">
          <Cabecalho titulo="De qual bobina?" onVoltar={() => ir(tela.pedido ? { id: "corte-item", pedido: tela.pedido } : { id: "corte-pedido" })} />
          {tela.item && <p className="text-muted-foreground -mt-4 text-base">{tela.item.descricao}</p>}

          <NumeroBobinaInput
            ocupado={ocupado}
            onBuscar={(texto) => executar(async () => {
              const b = await buscarBobinaPorNumero(texto);
              if (!b) return;
              if (tela.item && b.cod_produto !== tela.item.cod_produto) {
                setErro(`${numeroBobina(b.numero)} é de outro cabo: ${b.descricao}.`);
                return;
              }
              ir({ id: "corte-metros", pedido: tela.pedido, item: tela.item, bobina: b });
            })}
          />

          {!tela.item && (
            <div className="relative">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ou procure o cabo pelo nome" className="w-full h-14 pl-12 pr-4 rounded-2xl border border-border bg-card text-lg outline-none focus:ring-2 focus:ring-primary/30" />
              {produtos.length > 0 && (
                <div className="mt-2 rounded-2xl border border-border bg-card divide-y divide-border max-h-64 overflow-y-auto">
                  {produtos.map((p) => (
                    <button key={p.codigo} onClick={() => { setProdutos([]); setBusca(p.descricao); buscarBobinas(p.codigo); }} className="w-full text-left px-4 py-3 text-base font-semibold active:bg-secondary">
                      {p.descricao}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {ocupado && <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
          {bobinas.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-3">
              {bobinas.map((b) => (
                <button key={b.id} onClick={() => ir({ id: "corte-metros", pedido: tela.pedido, item: tela.item, bobina: b })} className="rounded-2xl border border-border bg-card p-5 text-left active:scale-[0.98] transition">
                  <p className="text-2xl font-black">{numeroBobina(b.numero)}</p>
                  <p className="text-lg font-bold text-primary tabular-nums">{fmtMetros(b.saldo)}</p>
                  <p className="text-sm text-muted-foreground">
                    {b.saldo === b.metragem_inicial ? "Inteira" : `Aberta · entrou com ${fmtMetros(b.metragem_inicial)}`}
                  </p>
                </button>
              ))}
            </div>
          )}
          {tela.item && !ocupado && bobinas.length === 0 && (
            <p className="text-center text-muted-foreground py-4">Nenhuma bobina ativa desse cabo. Cadastre a bobina antes de registrar o corte.</p>
          )}
          <Erro texto={erro} />
        </div>
      )}

      {/* ── Corte: metros ── */}
      {tela.id === "corte-metros" && (() => {
        const falta = tela.item ? Math.max(tela.item.qtd - tela.item.cortado, 0) : null;
        const metros = paraNumero(campo);
        const excede = falta != null && metros > falta;
        const semPedido = !tela.pedido;
        return (
          <div className="max-w-sm mx-auto space-y-5">
            <Cabecalho titulo="Quantos metros?" onVoltar={() => ir({ id: "corte-bobina", pedido: tela.pedido, item: tela.item })} />
            <div className="rounded-2xl bg-secondary/60 p-4 -mt-2">
              <p className="font-black">{numeroBobina(tela.bobina.numero)} · saldo {fmtMetros(tela.bobina.saldo)}</p>
              <p className="text-sm text-muted-foreground leading-tight">{tela.bobina.descricao}</p>
              {falta != null && <p className="text-sm font-bold text-primary mt-1">Falta cortar para o pedido: {fmtMetros(falta)}</p>}
            </div>
            <div className="h-16 rounded-2xl border-2 border-primary/40 bg-card flex items-center justify-center text-4xl font-black tabular-nums">
              {campo || <span className="text-muted-foreground/40">0</span>}<span className="text-xl ml-2 text-muted-foreground">m</span>
            </div>
            <p className="text-center text-sm text-muted-foreground -mt-3">Digite o que marcou no metreador.</p>
            <Teclado valor={campo} onChange={(v) => { setCampo(v); setErro(null); setConfirmarExcesso(false); }} decimal />

            {semPedido && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(["amostra", "perda", "ponta", "uso_interno"] as MotivoCorte[]).map((m) => (
                    <button key={m} onClick={() => setMotivo(m)} className={cn("h-12 rounded-xl border text-base font-bold", motivo === m ? "border-primary bg-primary/10 text-primary" : "border-border")}>
                      {MOTIVO_LABEL[m]}
                    </button>
                  ))}
                </div>
                <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Explique (ex.: amostra para o cliente X)" className="w-full h-14 px-4 rounded-2xl border border-border bg-card text-base outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            )}

            {excede && confirmarExcesso && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-base font-semibold text-amber-700 dark:text-amber-400">
                O pedido pede {fmtMetros(falta!)} e você vai registrar {fmtMetros(metros)}. Toque em confirmar de novo se está certo.
              </div>
            )}
            <Erro texto={erro} />
            <BotaoPrimario
              disabled={!(metros > 0) || (semPedido && !observacao.trim())}
              loading={ocupado}
              onClick={() => {
                if (excede && !confirmarExcesso) { setConfirmarExcesso(true); return; }
                executar(async () => {
                  const mov: Movimento = await salaCabosApi.cortar(cred, {
                    bobina_id: tela.bobina.id,
                    metros,
                    motivo: semPedido ? motivo : "pedido",
                    pedido: tela.pedido?.pedido,
                    pedido_empresa: tela.pedido?.empresa,
                    observacao: semPedido ? observacao : undefined,
                  });
                  setTela({
                    id: "sucesso",
                    titulo: "Corte registrado",
                    linhas: [
                      `${numeroBobina(tela.bobina.numero)}: ${fmtMetros(mov.saldo_antes)} → ${fmtMetros(mov.saldo_depois)}`,
                      tela.pedido ? `Pedido ${fmtPedido(tela.pedido.pedido)} · ${fmtMetros(metros)}` : `${MOTIVO_LABEL[motivo]} · ${fmtMetros(metros)}`,
                      mov.saldo_depois === 0 ? "Bobina zerada e finalizada." : "",
                    ].filter(Boolean),
                  });
                });
              }}
            >
              Confirmar corte
            </BotaoPrimario>
          </div>
        );
      })()}

      {/* ── Bobina nova: produto ── */}
      {tela.id === "nova-produto" && (
        <div className="max-w-2xl mx-auto space-y-4">
          <Cabecalho titulo="Qual cabo?" onVoltar={() => ir({ id: "inicio" })} />
          <div className="relative">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: flex 2,5 preto cobrecom" className="w-full h-16 pl-12 pr-4 rounded-2xl border border-border bg-card text-xl outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <p className="text-sm text-muted-foreground">Aparecem só os produtos vendidos a metro no ERP.</p>
          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            {produtos.map((p) => (
              <button key={p.codigo} onClick={() => ir({ id: "nova-metros", produto: p })} className="w-full text-left px-5 py-4 active:bg-secondary">
                <p className="text-lg font-bold leading-tight">{p.descricao}</p>
                <p className="text-sm text-muted-foreground">Cód. {p.codigo} · no ERP: {fmtMetros(p.saldo_erp)}</p>
              </button>
            ))}
            {busca.trim().length >= 2 && produtos.length === 0 && <p className="px-5 py-4 text-muted-foreground">Nenhum produto encontrado.</p>}
          </div>
        </div>
      )}

      {/* ── Bobina nova: metragem ── */}
      {tela.id === "nova-metros" && (
        <div className="max-w-sm mx-auto space-y-5">
          <Cabecalho titulo="Metragem da bobina" onVoltar={() => ir({ id: "nova-produto" })} />
          <p className="text-muted-foreground -mt-4 text-base">{tela.produto.descricao}</p>
          <div className="h-16 rounded-2xl border-2 border-primary/40 bg-card flex items-center justify-center text-4xl font-black tabular-nums">
            {campo || <span className="text-muted-foreground/40">0</span>}<span className="text-xl ml-2 text-muted-foreground">m</span>
          </div>
          <p className="text-center text-sm text-muted-foreground -mt-3">Bobina fechada: o que está na embalagem. Aberta: meça o que sobrou.</p>
          <Teclado valor={campo} onChange={(v) => { setCampo(v); setErro(null); }} decimal />
          <Erro texto={erro} />
          <BotaoPrimario
            disabled={!(paraNumero(campo) > 0)}
            loading={ocupado}
            onClick={() => executar(async () => {
              const b = await salaCabosApi.cadastrarBobina(cred, { empresa, cod_produto: tela.produto.codigo, metragem: paraNumero(campo) });
              setTela({ id: "sucesso", titulo: `Bobina ${numeroBobina(b.numero)}`, linhas: [b.descricao, `Saldo: ${fmtMetros(b.saldo)}`, "Escreva ou cole a etiqueta com esse número na bobina."], bobina: b });
            })}
          >
            Cadastrar
          </BotaoPrimario>
        </div>
      )}

      {/* ── Medir: bobina ── */}
      {tela.id === "medir-bobina" && (
        <div className="max-w-sm mx-auto space-y-5">
          <Cabecalho titulo="Qual bobina?" onVoltar={() => ir({ id: "inicio" })} />
          <NumeroBobinaInput
            ocupado={ocupado}
            onBuscar={(texto) => executar(async () => {
              const b = await buscarBobinaPorNumero(texto);
              if (b) ir({ id: "medir-metros", bobina: b });
            })}
          />
          <Erro texto={erro} />
        </div>
      )}

      {/* ── Medir: saldo real ── */}
      {tela.id === "medir-metros" && (
        <div className="max-w-sm mx-auto space-y-5">
          <Cabecalho titulo="Metragem medida" onVoltar={() => ir({ id: "medir-bobina" })} />
          <div className="rounded-2xl bg-secondary/60 p-4 -mt-2">
            <p className="font-black">{numeroBobina(tela.bobina.numero)} · sistema diz {fmtMetros(tela.bobina.saldo)}</p>
            <p className="text-sm text-muted-foreground leading-tight">{tela.bobina.descricao}</p>
          </div>
          <div className="h-16 rounded-2xl border-2 border-primary/40 bg-card flex items-center justify-center text-4xl font-black tabular-nums">
            {campo || <span className="text-muted-foreground/40">0</span>}<span className="text-xl ml-2 text-muted-foreground">m</span>
          </div>
          <Teclado valor={campo} onChange={(v) => { setCampo(v); setErro(null); }} decimal />
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Motivo (ex.: contagem semanal)" className="w-full h-14 px-4 rounded-2xl border border-border bg-card text-base outline-none focus:ring-2 focus:ring-primary/30" />
          <Erro texto={erro} />
          <BotaoPrimario
            disabled={campo === "" || !observacao.trim()}
            loading={ocupado}
            onClick={() => executar(async () => {
              const mov = await salaCabosApi.ajustar(cred, { bobina_id: tela.bobina.id, saldo_real: paraNumero(campo), observacao });
              const dif = mov.saldo_depois - mov.saldo_antes;
              setTela({
                id: "sucesso",
                titulo: "Saldo corrigido",
                linhas: [
                  `${numeroBobina(tela.bobina.numero)}: ${fmtMetros(mov.saldo_antes)} → ${fmtMetros(mov.saldo_depois)}`,
                  dif === 0 ? "Bateu com o sistema." : `Diferença de ${fmtMetros(Math.abs(dif))} ${dif < 0 ? "a menos" : "a mais"}.`,
                ],
              });
            })}
          >
            Salvar medição
          </BotaoPrimario>
        </div>
      )}

      {tela.id === "sucesso" && (
        <div className="max-w-md mx-auto text-center space-y-6 pt-6">
          <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto" />
          <h2 className="text-3xl font-black">{tela.titulo}</h2>
          <div className="space-y-1">
            {tela.linhas.map((l) => <p key={l} className="text-lg">{l}</p>)}
          </div>
          {tela.bobina && (
            <button onClick={() => setEtiqueta(tela.bobina!)} className="w-full h-14 rounded-2xl border border-border text-base font-bold">Imprimir etiqueta</button>
          )}
          <BotaoPrimario onClick={() => ir({ id: "inicio" })}>Concluir</BotaoPrimario>
          <button onClick={sair} className="text-muted-foreground font-bold">Sair ({cred.nome})</button>
        </div>
      )}

      {etiqueta && <EtiquetaBobina bobinas={[etiqueta]} onClose={() => setEtiqueta(null)} />}
    </Moldura>
  );
}

function NumeroBobinaInput({ onBuscar, ocupado }: { onBuscar: (texto: string) => void; ocupado: boolean }) {
  const [texto, setTexto] = useState("");
  return (
    <div className="space-y-3">
      <p className="text-base text-muted-foreground">Digite o número da etiqueta ou leia o QR com o leitor.</p>
      <div className="flex gap-2">
        <div className="h-16 flex-1 rounded-2xl border-2 border-primary/40 bg-card flex items-center px-4 text-3xl font-black tabular-nums">
          <span className="text-muted-foreground/60 text-xl mr-2">BOB-</span>
          <input
            autoFocus
            inputMode="none"
            value={texto}
            onChange={(e) => setTexto(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter" && texto) onBuscar(texto); }}
            className="bg-transparent outline-none w-full"
          />
        </div>
      </div>
      <Teclado valor={texto} onChange={setTexto} max={7} />
      <BotaoPrimario disabled={!texto} loading={ocupado} onClick={() => onBuscar(texto)}>Continuar</BotaoPrimario>
    </div>
  );
}

function BotaoAcao({ icon: Icon, titulo, descricao, onClick, destaque }: { icon: typeof Scissors; titulo: string; descricao: string; onClick: () => void; destaque?: boolean }) {
  return (
    <button onClick={onClick} className={cn("rounded-3xl p-6 flex items-center gap-5 text-left active:scale-[0.99] transition border", destaque ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border")}>
      <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center shrink-0", destaque ? "bg-white/15" : "bg-primary/10 text-primary")}>
        <Icon className="w-8 h-8" />
      </div>
      <div>
        <p className="text-2xl font-black">{titulo}</p>
        <p className={cn("text-base", destaque ? "text-primary-foreground/80" : "text-muted-foreground")}>{descricao}</p>
      </div>
    </button>
  );
}

function Moldura({ children, empresa, onEmpresa, operador, onSair }: { children: React.ReactNode; empresa: string; onEmpresa: (e: string) => void; operador?: string; onSair?: () => void }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-8 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Cable className="w-6 h-6" /></div>
          <div>
            <p className="text-lg font-black leading-none">Sala de Cabos</p>
            {operador ? (
              <select value={empresa} disabled className="bg-transparent text-sm text-muted-foreground appearance-none">
                <option value={empresa}>{EMPRESAS[empresa] ?? empresa}</option>
              </select>
            ) : (
              <select value={empresa} onChange={(e) => onEmpresa(e.target.value)} className="bg-transparent text-sm text-muted-foreground outline-none">
                {Object.entries(EMPRESAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
          </div>
        </div>
        {operador && onSair && (
          <button onClick={onSair} className="flex items-center gap-2 h-12 px-4 rounded-2xl bg-secondary font-bold">
            <span className="max-w-[160px] truncate">{operador}</span>
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </header>
      <main className="flex-1 px-4 sm:px-8 py-6 sm:py-8">{children}</main>
    </div>
  );
}
