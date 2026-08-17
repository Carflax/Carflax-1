import { useCallback, useEffect, useMemo, useState } from "react";
import {
  UserSearch,
  Plus,
  UploadCloud,
  Sparkles,
  RefreshCw,
  Download,
  Pencil,
  Trash2,
  Search,
  Loader2,
  Inbox,
} from "lucide-react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import {
  apiRhVagas,
  apiRhCandidatos,
  apiRhAnalisar,
  apiRhStatusCandidato,
  apiRhExcluirCandidato,
  apiRhExcluirVaga,
  type RhVaga,
  type RhCandidato,
  type RhFaixa,
} from "@/lib/api";
import { CandidatoCard } from "./CandidatoCard";
import { VagaModal } from "./VagaModal";
import { UploadModal } from "./UploadModal";

interface UserProfile {
  id?: string;
  name: string;
  email?: string;
  role: string;
}

type FiltroFaixa = "todos" | RhFaixa | "pendentes";

const FAIXAS: { chave: FiltroFaixa; rotulo: string; cor: string }[] = [
  { chave: "todos", rotulo: "Todos", cor: "bg-secondary text-foreground" },
  { chave: "verde", rotulo: "🟢 80–100", cor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { chave: "amarelo", rotulo: "🟡 60–79", cor: "bg-amber-500/15 text-amber-600 dark:text-amber-500" },
  { chave: "vermelho", rotulo: "🔴 0–59", cor: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  { chave: "eliminado", rotulo: "Eliminados", cor: "bg-muted text-muted-foreground" },
  { chave: "pendentes", rotulo: "Sem análise", cor: "bg-primary/10 text-primary" },
];

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-xs">
      <div className={cn("w-2 h-2 rounded-full mb-2", accent)} />
      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-black tracking-tight text-foreground mt-0.5">{value}</p>
      {hint && <p className="text-[11px] font-bold text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

export function TriagemView({ userProfile }: { userProfile?: UserProfile | null }) {
  const [vagas, setVagas] = useState<RhVaga[]>([]);
  const [vagaId, setVagaId] = useState<string>("");
  const [candidatos, setCandidatos] = useState<RhCandidato[]>([]);
  const [loading, setLoading] = useState(true);
  const [analisando, setAnalisando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [filtro, setFiltro] = useState<FiltroFaixa>("todos");
  const [busca, setBusca] = useState("");
  const [ocultarDescartados, setOcultarDescartados] = useState(true);

  const [vagaModal, setVagaModal] = useState<{ aberta: boolean; vaga: RhVaga | null }>({
    aberta: false,
    vaga: null,
  });
  const [uploadAberto, setUploadAberto] = useState(false);

  const vagaAtual = useMemo(() => vagas.find((v) => v.id === vagaId) || null, [vagas, vagaId]);

  const carregarVagas = useCallback(async (selecionar?: string) => {
    const r = await apiRhVagas();
    if (!r.success) throw new Error("Falha ao carregar vagas.");
    setVagas(r.vagas);
    setVagaId((atual) => selecionar || atual || r.vagas[0]?.id || "");
    return r.vagas;
  }, []);

  const carregarCandidatos = useCallback(async (id: string) => {
    if (!id) {
      setCandidatos([]);
      return;
    }
    const r = await apiRhCandidatos(id);
    if (!r.success) throw new Error("Falha ao carregar candidatos.");
    setCandidatos(r.candidatos);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErro(null);
      try {
        await carregarVagas();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao carregar a triagem.");
      } finally {
        setLoading(false);
      }
    })();
  }, [carregarVagas]);

  useEffect(() => {
    (async () => {
      try {
        await carregarCandidatos(vagaId);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao carregar candidatos.");
      }
    })();
  }, [vagaId, carregarCandidatos]);

  const pendentes = useMemo(
    () => candidatos.filter((c) => c.score == null && !c.erro).length,
    [candidatos],
  );

  const kpis = useMemo(() => {
    const conta = (f: RhFaixa) => candidatos.filter((c) => c.faixa === f).length;
    return {
      total: candidatos.length,
      verde: conta("verde"),
      amarelo: conta("amarelo"),
      vermelho: conta("vermelho"),
      eliminado: conta("eliminado"),
    };
  }, [candidatos]);

  const analisar = async (reanalisar = false) => {
    if (!vagaId) return;
    setAnalisando(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await apiRhAnalisar({ vaga_id: vagaId, reanalisar });
      await carregarCandidatos(vagaId);
      await carregarVagas(vagaId);
      if (r.falhas > 0) {
        setAviso(`${r.analisados} analisado(s), ${r.falhas} com falha — veja o card de cada um.`);
      } else if (r.analisados === 0) {
        setAviso("Nenhum currículo pendente de análise.");
      } else {
        setAviso(`${r.analisados} currículo(s) analisado(s).`);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao analisar currículos.");
    } finally {
      setAnalisando(false);
    }
  };

  const mudarStatus = async (id: string, status: RhCandidato["status"]) => {
    // Otimista: a lista é longa e esperar o round-trip trava a triagem em lote.
    setCandidatos((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
    try {
      await apiRhStatusCandidato(id, status);
    } catch {
      await carregarCandidatos(vagaId);
    }
  };

  const excluirCandidato = async (id: string) => {
    if (!window.confirm("Excluir este candidato e o currículo enviado?")) return;
    setCandidatos((cs) => cs.filter((c) => c.id !== id));
    try {
      await apiRhExcluirCandidato(id);
      await carregarVagas(vagaId);
    } catch {
      await carregarCandidatos(vagaId);
    }
  };

  const excluirVaga = async () => {
    if (!vagaAtual) return;
    if (
      !window.confirm(
        `Excluir a vaga "${vagaAtual.titulo}" e todos os ${kpis.total} candidato(s) dela?`,
      )
    )
      return;
    try {
      await apiRhExcluirVaga(vagaAtual.id);
      const restantes = await carregarVagas("");
      setVagaId(restantes.filter((v) => v.id !== vagaAtual.id)[0]?.id || "");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao excluir a vaga.");
    }
  };

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return candidatos
      .filter((c) => {
        if (ocultarDescartados && c.status === "descartado") return false;
        if (filtro === "pendentes") return c.score == null;
        if (filtro !== "todos" && c.faixa !== filtro) return false;
        if (!termo) return true;
        return [c.nome, c.cidade, c.arquivo_nome, c.email]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(termo));
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [candidatos, filtro, busca, ocultarDescartados]);

  const exportar = () => {
    const linhas = candidatos.map((c) => ({
      Score: c.score ?? "",
      Faixa: c.faixa ?? "pendente",
      Recomendação: c.recomendacao ?? "",
      Nome: c.nome ?? "",
      Cidade: c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ""}` : "",
      "Distância (km)": c.distancia_km ?? "",
      "Anos de experiência": c.anos_experiencia ?? "",
      "Experiência na função": c.experiencia_funcao ? "Sim" : "Não",
      "Segmento da vaga": c.segmento_match ? "Sim" : "Não",
      "Último emprego (meses)": c.meses_ultimo_emprego ?? "",
      Email: c.email ?? "",
      Telefone: c.telefone ?? "",
      Status: c.status,
      Motivo: c.motivo ?? "",
      Arquivo: c.arquivo_nome ?? "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Triagem");
    XLSX.writeFile(wb, `triagem-${(vagaAtual?.titulo || "vaga").replace(/\W+/g, "-")}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 pt-4 h-full overflow-y-auto scrollbar-hide space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-foreground flex items-center gap-2.5">
            <span className="w-1.5 h-6 bg-primary rounded-full" />
            <UserSearch className="w-6 h-6 text-primary" />
            Triagem de Currículos
          </h1>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">
            IA + distância real · o ranking antes de abrir o primeiro PDF
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={vagaId}
            onChange={(e) => setVagaId(e.target.value)}
            className="bg-card border border-border rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider text-foreground outline-none focus:border-primary min-w-[180px]"
          >
            {vagas.length === 0 && <option value="">Nenhuma vaga cadastrada</option>}
            {vagas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.titulo} ({v.resumo?.total ?? 0})
              </option>
            ))}
          </select>

          <button
            onClick={() => setVagaModal({ aberta: true, vaga: null })}
            className="h-10 px-3 border border-border rounded-xl bg-card hover:bg-secondary text-xs font-black uppercase tracking-wider text-muted-foreground transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Vaga
          </button>

          {vagaAtual && (
            <>
              <button
                onClick={() => setVagaModal({ aberta: true, vaga: vagaAtual })}
                title="Editar vaga e pesos"
                className="w-10 h-10 border border-border rounded-xl bg-card hover:bg-secondary text-muted-foreground transition-colors flex items-center justify-center"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={excluirVaga}
                title="Excluir vaga"
                className="w-10 h-10 border border-border rounded-xl bg-card hover:bg-rose-500/10 hover:text-rose-500 text-muted-foreground transition-colors flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => setUploadAberto(true)}
                className="h-10 px-4 rounded-xl bg-card border border-border hover:bg-secondary text-xs font-black uppercase tracking-wider text-foreground transition-colors flex items-center gap-2"
              >
                <UploadCloud className="w-4 h-4 text-primary" />
                Importar
              </button>

              <button
                onClick={() => analisar(false)}
                disabled={analisando}
                className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
              >
                {analisando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Analisar {pendentes > 0 ? `(${pendentes})` : ""}
              </button>

              <button
                onClick={() => analisar(true)}
                disabled={analisando}
                title="Reanalisar todos (use após mudar os pesos da vaga)"
                className="w-10 h-10 border border-border rounded-xl bg-card hover:bg-secondary text-muted-foreground transition-colors flex items-center justify-center disabled:opacity-50"
              >
                <RefreshCw className={cn("w-4 h-4", analisando && "animate-spin")} />
              </button>

              <button
                onClick={exportar}
                title="Exportar para Excel"
                className="w-10 h-10 border border-border rounded-xl bg-card hover:bg-secondary text-muted-foreground transition-colors flex items-center justify-center"
              >
                <Download className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {erro && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">
          <p className="text-xs font-bold text-rose-500">{erro}</p>
        </div>
      )}
      {aviso && (
        <div className="bg-primary/10 border border-primary/30 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs font-bold text-primary">{aviso}</p>
          <button
            onClick={() => setAviso(null)}
            className="text-[10px] font-black uppercase tracking-wider text-primary/70 hover:text-primary"
          >
            ok
          </button>
        </div>
      )}

      {!vagaAtual ? (
        <div className="bg-card border border-border rounded-3xl p-12 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <UserSearch className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-black uppercase tracking-tight text-foreground">
            Comece criando uma vaga
          </h2>
          <p className="text-sm font-medium text-muted-foreground max-w-md mx-auto mt-2">
            A vaga guarda os requisitos, o segmento e os pesos da pontuação. Depois é só jogar os
            currículos dentro e deixar a IA ranquear.
          </p>
          <button
            onClick={() => setVagaModal({ aberta: true, vaga: null })}
            className="mt-5 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider hover:opacity-90 transition-opacity inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova vaga
          </button>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard label="Currículos" value={kpis.total} accent="bg-primary" hint={`${pendentes} sem análise`} />
            <KpiCard label="Analisar primeiro" value={kpis.verde} accent="bg-emerald-500" hint="Score 80–100" />
            <KpiCard label="Segunda opção" value={kpis.amarelo} accent="bg-amber-500" hint="Score 60–79" />
            <KpiCard label="Baixa prioridade" value={kpis.vermelho} accent="bg-rose-500" hint="Score 0–59" />
            <KpiCard
              label="Eliminados"
              value={kpis.eliminado}
              accent="bg-muted-foreground"
              hint={`Fora de ${vagaAtual.criterios?.corte_km ?? 40} km ou sem requisito`}
            />
          </div>

          {/* Filtros */}
          <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
            <div className="flex flex-wrap gap-1.5">
              {FAIXAS.map((f) => (
                <button
                  key={f.chave}
                  onClick={() => setFiltro(f.chave)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all",
                    filtro === f.chave
                      ? "ring-2 ring-primary/40 " + f.cor
                      : "bg-card border border-border text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {f.rotulo}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={ocultarDescartados}
                  onChange={(e) => setOcultarDescartados(e.target.checked)}
                  className="accent-primary"
                />
                Ocultar descartados
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar candidato ou cidade…"
                  className="bg-card border border-border rounded-xl pl-9 pr-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary w-full md:w-64"
                />
              </div>
            </div>
          </div>

          {/* Lista */}
          {visiveis.length === 0 ? (
            <div className="bg-card border border-border rounded-3xl p-12 text-center">
              <Inbox className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-black uppercase tracking-tight text-foreground">
                {candidatos.length === 0
                  ? "Nenhum currículo importado nesta vaga"
                  : "Nenhum candidato nesse filtro"}
              </p>
              {candidatos.length === 0 && (
                <button
                  onClick={() => setUploadAberto(true)}
                  className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider hover:opacity-90 transition-opacity inline-flex items-center gap-2"
                >
                  <UploadCloud className="w-4 h-4" />
                  Importar currículos
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5 pb-6">
              {visiveis.map((c) => (
                <CandidatoCard
                  key={c.id}
                  candidato={c}
                  onStatus={mudarStatus}
                  onExcluir={excluirCandidato}
                />
              ))}
            </div>
          )}
        </>
      )}

      {vagaModal.aberta && (
        <VagaModal
          vaga={vagaModal.vaga}
          criadoPor={userProfile?.name}
          onClose={() => setVagaModal({ aberta: false, vaga: null })}
          onSalvo={async (v) => {
            setVagaModal({ aberta: false, vaga: null });
            await carregarVagas(v.id);
          }}
        />
      )}

      {uploadAberto && vagaAtual && (
        <UploadModal
          vagaId={vagaAtual.id}
          vagaTitulo={vagaAtual.titulo}
          onClose={() => setUploadAberto(false)}
          onImportado={async () => {
            await carregarCandidatos(vagaAtual.id);
            await carregarVagas(vagaAtual.id);
          }}
        />
      )}
    </div>
  );
}
