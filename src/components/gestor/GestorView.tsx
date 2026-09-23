import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Bell, Boxes, LayoutGrid, LockOpen, LogOut, ShoppingCart, User, Wallet } from "lucide-react";
import { apiDashboardGeral, apiDashboardMetas, apiGestorLiberacoes, apiGestorPaineis, apiResponderGestorLiberacao, type GestorLiberacao, type GestorPaineis, type VendedorResumo } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { buildPerdidoMap } from "@/lib/perdido-map";
import { montarTotalETimes, type OrgUser } from "@/lib/times-diretoria";
import { VendedorMiniCard } from "@/components/dashboard/Geral/RightPanelComponents";
import type { UserProfile } from "@/App";
import { assinarPush } from "@/lib/push-subscription";
import { LiberacoesTela } from "./LiberacoesTela";
import { PaineisTela } from "./PaineisTela";
import "./gestor.css";

type Aba = "inicio" | "compras" | "estoque" | "cobrancas";

/**
 * Gestor — tela de celular para a diretoria (/gestor, sem a barra lateral do HUB).
 *
 * Só o que os diretores usam: as liberações de pedido (como no app Citel
 * Gestor) e os cards "Total Geral e Times" do Dashboard Geral — montados pela
 * mesma função e desenhados pelo mesmo componente, para os números baterem com
 * o HUB.
 */

// /api/dashboard/geral tem cache no servidor: atualizar a cada 2 min não gera
// consulta nova no ERP a cada abertura.
const INTERVALO_MS = 2 * 60 * 1000;
// Liberação é o que o diretor espera ver na hora; a consulta é pequena (poucas
// linhas), então roda mais vezes que a dos cards.
const INTERVALO_LIBERACOES_MS = 30 * 1000;

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function carregarCards() {
  const hoje = hojeISO();
  const [response, orgRes, metas, perdidoMap] = await Promise.all([
    apiDashboardGeral(undefined, hoje),
    supabase.from("usuarios").select("id, operator_code, name, role, responsavel_id, is_leader"),
    apiDashboardMetas(hoje).catch(() => [] as { COD_VENDEDOR: string; META: number | string }[]),
    buildPerdidoMap(`${hoje.slice(0, 8)}01`, hoje).catch(() => null),
  ]);
  const metaMap = new Map<string, number>(
    (metas || []).map((mt) => [String(mt.COD_VENDEDOR).trim(), parseFloat(String(mt.META)) || 0]),
  );
  const { mediaRow, teamTotals } = montarTotalETimes(response || [], (orgRes.data || []) as OrgUser[], metaMap);
  // Sem meta não há ritmo nem atingimento: igual ao painel, time sem meta não entra.
  const times = teamTotals.filter((t) => Number(t.META) > 0);
  return { cards: [...(mediaRow ? [mediaRow] : []), ...times], perdidoMap };
}

export function GestorView({ userProfile, onLogout }: { userProfile: UserProfile | null; onLogout: () => void }) {
  const [cards, setCards] = useState<VendedorResumo[] | null>(null);
  const [perdidoMap, setPerdidoMap] = useState<Map<string, number> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [liberacoes, setLiberacoes] = useState<GestorLiberacao[] | null>(null);
  const [liberacoesSomenteLeitura, setLiberacoesSomenteLeitura] = useState(true);
  // `?liberacoes=1` vem do toque na notificação de liberação: abre direto na lista.
  const [telaLiberacoes, setTelaLiberacoes] = useState(() => new URLSearchParams(window.location.search).has("liberacoes"));
  const [menuAberto, setMenuAberto] = useState(false);
  const [aba, setAba] = useState<Aba>("inicio");
  const [paineis, setPaineis] = useState<GestorPaineis | null>(null);
  const [permissao, setPermissao] = useState<NotificationPermission>(() =>
    "Notification" in window ? Notification.permission : "denied",
  );
  const userId = userProfile?.id;

  // Painéis (Compras/Estoque/Cobranças) carregam na 1ª vez que uma aba é aberta —
  // a consulta é pesada e nem todo diretor abre os gráficos.
  useEffect(() => {
    if (aba !== "inicio" && !paineis) apiGestorPaineis().then(setPaineis).catch(() => {});
  }, [aba, paineis]);

  // Push do aviso de liberação. Com permissão já dada, (re)assina em silêncio;
  // sem ela, o sininho abaixo pede — o iPhone só aceita o pedido após um toque.
  useEffect(() => {
    if (userId && permissao === "granted") assinarPush(userId).catch(() => {});
  }, [userId, permissao]);

  const ativarAvisos = async () => {
    try {
      setPermissao(await Notification.requestPermission());
    } catch {
      /* navegador sem suporte */
    }
  };

  // Tirar o `?liberacoes=1` da URL: senão um recarregar abriria as liberações de novo.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);


  const carregarLiberacoes = useCallback(async () => {
    try {
      const resposta = await apiGestorLiberacoes();
      setLiberacoes(resposta.pendentes);
      setLiberacoesSomenteLeitura(resposta.somenteLeitura);
    } catch {
      setLiberacoes(null);
    }
  }, []);

  const carregar = useCallback(async () => {
    carregarLiberacoes();
    try {
      const r = await carregarCards();
      setCards(r.cards);
      setPerdidoMap(r.perdidoMap);
      setErro(null);
    } catch {
      setErro("Não foi possível carregar os números.");
    }
  }, [carregarLiberacoes]);

  useEffect(() => {
    document.title = "Carflax Gestor";
    const inicial = window.setTimeout(carregar, 0);
    const id = window.setInterval(carregar, INTERVALO_MS);
    // As liberações são o que não pode atrasar: consulta própria, mais frequente
    // que a dos cards, e uma atualização sempre que o app volta para a frente.
    const idLib = window.setInterval(carregarLiberacoes, INTERVALO_LIBERACOES_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") carregarLiberacoes();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearTimeout(inicial);
      window.clearInterval(id);
      window.clearInterval(idLib);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [carregar, carregarLiberacoes]);

  // Toque na notificação com o Gestor já aberto: o service worker só foca a
  // janela e avisa por mensagem.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const aoReceber = (e: MessageEvent) => {
      if (e.data?.type === "carflax-abrir-url" && String(e.data.url || "").includes("liberacoes")) {
        setTelaLiberacoes(true);
        carregarLiberacoes();
      }
      // Chegou o push de uma liberação nova com o app aberto: atualiza na hora.
      if (e.data?.type === "carflax-push-recebido" && String(e.data.url || "").includes("liberacoes")) {
        carregarLiberacoes();
      }
    };
    navigator.serviceWorker.addEventListener("message", aoReceber);
    return () => navigator.serviceWorker.removeEventListener("message", aoReceber);
  }, [carregarLiberacoes]);

  const [liberacaoSelecionada, setLiberacaoSelecionada] = useState<GestorLiberacao | null>(null);

  const abrirLiberacao = (liberacao: GestorLiberacao) => {
    window.history.pushState({ gestor: "liberacao" }, "");
    setLiberacaoSelecionada(liberacao);
    window.scrollTo(0, 0);
  };

  const responderLiberacao = async (liberacao: GestorLiberacao, acao: "liberar" | "negar", justificativa?: string) => {
    await apiResponderGestorLiberacao(liberacao.numero, acao, justificativa);
    setLiberacaoSelecionada(null);
    await carregarLiberacoes();
  };

  // Voltar do detalhe retorna à lista; voltar da lista retorna ao painel.
  useEffect(() => {
    if (!telaLiberacoes) return;
    window.history.pushState({ gestor: "liberacoes" }, "");
    const voltar = (event: PopStateEvent) => {
      setLiberacaoSelecionada(null);
      setTelaLiberacoes(event.state?.gestor === "liberacoes");
    };
    window.addEventListener("popstate", voltar);
    return () => window.removeEventListener("popstate", voltar);
  }, [telaLiberacoes]);

  const primeiroNome = (userProfile?.name || "").split(" ")[0] || "gestor";
  const pendentes = liberacoes?.length ?? 0;

  if (telaLiberacoes) {
    return (
      <Pagina>
        <header className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-2 bg-background/95 px-2 py-3 backdrop-blur">
          <button onClick={() => window.history.back()} className="flex h-10 w-10 items-center justify-center rounded-full text-blue-500 active:bg-muted" aria-label="Voltar">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-[18px] font-bold">{liberacaoSelecionada ? "Detalhes da liberação" : "Liberações pendentes"}</h1>
        </header>
        <LiberacoesTela pendentes={liberacoes} selecionada={liberacaoSelecionada} onSelecionar={abrirLiberacao} onResponder={responderLiberacao} somenteLeitura={liberacoesSomenteLeitura} />
      </Pagina>
    );
  }

  return (
    <Pagina expandir>
      <header className="mb-3 flex shrink-0 items-center justify-between gap-3 py-2 sm:py-3">
        {/* Foto + nome; tocar na foto abre o menu (HUB / Sair). */}
        <div className="relative flex min-w-0 items-center gap-3">
          <button onClick={() => setMenuAberto((v) => !v)} className="shrink-0 rounded-full" aria-label="Menu">
            {userProfile?.avatar ? (
              <img src={userProfile.avatar} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-blue-500/60" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/15 text-blue-500 ring-2 ring-blue-500/60">
                <User size={22} />
              </span>
            )}
          </button>
          <div className="min-w-0 leading-tight">
            <p className="text-[13px] text-muted-foreground">Olá,</p>
            <p className="truncate text-[17px] font-bold">{primeiroNome}!</p>
          </div>
          {menuAberto && (
            <div className="absolute left-0 top-14 z-20 w-48 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <a href="/" className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted">
                <LayoutGrid size={16} /> Abrir o HUB
              </a>
              <button onClick={onLogout} className="flex w-full items-center gap-2 px-4 py-3 text-sm text-red-500 hover:bg-muted">
                <LogOut size={16} /> Sair
              </button>
            </div>
          )}
        </div>

        {/* Liberações: botão redondo; o selo vermelho mostra quantas estão pendentes. */}
        <button
          onClick={() => {
            setTelaLiberacoes(true);
            window.scrollTo(0, 0);
          }}
          className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${
            pendentes > 0 ? "border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400" : "border-border bg-muted text-muted-foreground"
          }`}
          aria-label={`Liberações (${pendentes})`}
        >
          <LockOpen size={22} />
          {pendentes > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
              {pendentes}
            </span>
          )}
        </button>
      </header>

      {aba === "inicio" ? (
        <>
          {permissao === "default" && (
            <button
              onClick={ativarAvisos}
              className="mb-3 flex w-full shrink-0 items-center gap-3 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-left"
            >
              <Bell size={20} className="shrink-0 text-blue-500" />
              <span className="flex-1 text-[13px]">Receber aviso no celular quando um pedido precisar de liberação</span>
              <span className="shrink-0 text-[13px] font-semibold text-blue-500">Ativar</span>
            </button>
          )}

          {erro && (
            <div className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
              {erro}
              <button onClick={carregar} className="mt-2 block w-full font-medium text-blue-500">
                Tentar de novo
              </button>
            </div>
          )}
          {!cards && !erro && (
            <div className="min-h-0 flex-1 animate-pulse rounded-2xl bg-muted" aria-label="Carregando indicadores" />
          )}
          {cards && <IndicadoresVendas cards={cards} perdidoMap={perdidoMap} />}
        </>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <PaineisTela aba={aba} dados={paineis} />
        </div>
      )}

      <BottomNav aba={aba} onAba={setAba} />
    </Pagina>
  );
}

const ABAS: { id: Aba; rotulo: string; Icone: typeof LayoutGrid }[] = [
  { id: "inicio", rotulo: "Início", Icone: LayoutGrid },
  { id: "cobrancas", rotulo: "Cobranças", Icone: Wallet },
  { id: "compras", rotulo: "Compras", Icone: ShoppingCart },
  { id: "estoque", rotulo: "Estoque", Icone: Boxes },
];

function BottomNav({ aba, onAba }: { aba: Aba; onAba: (a: Aba) => void }) {
  return (
    <nav className="mt-2 flex shrink-0 items-stretch gap-1 border-t border-border pt-2">
      {ABAS.map(({ id, rotulo, Icone }) => {
        const ativo = aba === id;
        return (
          <button
            key={id}
            onClick={() => onAba(id)}
            aria-current={ativo ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors ${
              ativo ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
            }`}
          >
            <Icone size={22} strokeWidth={ativo ? 2.4 : 1.8} />
            {rotulo}
          </button>
        );
      })}
    </nav>
  );
}

// Cada resumo ocupa a largura disponível; o deslize troca de time sem mover a página.
function IndicadoresVendas({ cards, perdidoMap }: { cards: VendedorResumo[]; perdidoMap: Map<string, number> | null }) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Indicadores de vendas">
      <div className="gestor-card-container min-h-0 min-w-0 w-full flex-1" role="region" aria-label="Total geral e times. Deslize para ver os próximos cards." tabIndex={0}>
        {cards.map((card, index) => (
          <div className="gestor-card-slide" key={card.COD_VENDEDOR} role="group" aria-roledescription="slide" aria-label={`${index + 1} de ${cards.length}`}>
            <VendedorMiniCard row={card} perdidoMap={perdidoMap} layout="gestor" />
          </div>
        ))}
      </div>
    </section>
  );
}

function Pagina({ children, expandir = false }: { children: ReactNode; expandir?: boolean }) {
  // Tela cheia (cards): altura exata da janela e nada rola. Sem isso o conteúdo
  // passava alguns pixels por causa das margens de segurança do iPhone e a tela
  // balançava para cima e para baixo. A classe no <body> mata o arrasto elástico,
  // que acontece mesmo sem conteúdo sobrando. Nas liberações a lista rola normal.
  useEffect(() => {
    if (!expandir) return;
    document.body.classList.add("gestor-sem-rolagem");
    return () => document.body.classList.remove("gestor-sem-rolagem");
  }, [expandir]);

  return (
    <div className={expandir ? "h-dvh max-w-full overflow-x-clip overflow-y-hidden bg-background text-foreground" : "min-h-dvh max-w-full overflow-x-clip bg-background text-foreground"}>
      <div className={expandir
        ? "flex h-full w-full min-w-0 max-w-full flex-col overflow-hidden px-3 pb-[max(env(safe-area-inset-bottom),8px)] pt-[max(env(safe-area-inset-top),12px)] sm:px-6 lg:px-8"
        : "mx-auto max-w-[720px] px-4 pb-10 pt-[max(env(safe-area-inset-top),16px)]"
      }>{children}</div>
    </div>
  );
}
