import { useState } from "react";
import {
  MapPin,
  Briefcase,
  Clock,
  FileText,
  ChevronDown,
  Trash2,
  CalendarCheck,
  Check,
  X,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRhUrlCurriculo, type RhCandidato } from "@/lib/api";

// Cores por faixa — o mesmo semáforo que a diretora vê no topo da tela.
const FAIXA_STYLE: Record<string, { ring: string; chip: string; barra: string; rotulo: string }> = {
  verde: {
    ring: "border-emerald-500/40",
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    barra: "bg-emerald-500",
    rotulo: "Analisar primeiro",
  },
  amarelo: {
    ring: "border-amber-500/40",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-500",
    barra: "bg-amber-500",
    rotulo: "Segunda opção",
  },
  vermelho: {
    ring: "border-rose-500/30",
    chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    barra: "bg-rose-500",
    rotulo: "Baixa prioridade",
  },
  eliminado: {
    ring: "border-border",
    chip: "bg-muted text-muted-foreground",
    barra: "bg-muted-foreground/40",
    rotulo: "Eliminado",
  },
};

const STATUS_LABEL: Record<RhCandidato["status"], string> = {
  novo: "Novo",
  entrevista: "Entrevista",
  aprovado: "Aprovado",
  descartado: "Descartado",
};

interface CandidatoCardProps {
  candidato: RhCandidato;
  onStatus: (id: string, status: RhCandidato["status"]) => void;
  onExcluir: (id: string) => void;
}

export function CandidatoCard({ candidato, onStatus, onExcluir }: CandidatoCardProps) {
  const [aberto, setAberto] = useState(false);
  const [abrindoPdf, setAbrindoPdf] = useState(false);

  const faixa = candidato.faixa || "vermelho";
  const style = FAIXA_STYLE[faixa] ?? FAIXA_STYLE.vermelho;
  const pendente = candidato.score == null && !candidato.erro;

  const abrirCurriculo = async () => {
    setAbrindoPdf(true);
    try {
      const r = await apiRhUrlCurriculo(candidato.id);
      // Signed URL de 5 min — o bucket é privado, o link não sobrevive ao prazo.
      if (r.success) window.open(r.url, "_blank", "noopener,noreferrer");
    } catch {
      /* sem arquivo (currículo colado) ou link expirado */
    } finally {
      setAbrindoPdf(false);
    }
  };

  return (
    <div
      className={cn(
        "bg-card border rounded-2xl overflow-hidden shadow-xs transition-all duration-300",
        style.ring,
        candidato.status === "descartado" && "opacity-60",
      )}
    >
      <div className="flex">
        <div className={cn("w-1.5 shrink-0", style.barra)} />

        <div className="flex-1 min-w-0 p-4">
          <div className="flex items-start gap-3">
            {/* Score */}
            <div className="shrink-0 text-center">
              <div
                className={cn(
                  "w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black",
                  style.chip,
                )}
              >
                {pendente ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : candidato.erro ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <>
                    <span className="text-xl leading-none">{candidato.score}</span>
                    <span className="text-[9px] font-bold opacity-70">/100</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-black text-foreground truncate">
                    {candidato.nome || candidato.arquivo_nome || "Candidato sem nome"}
                  </h3>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mt-0.5">
                    {pendente
                      ? "Aguardando análise"
                      : candidato.erro
                        ? "Falha na análise"
                        : `${candidato.recomendacao} · ${style.rotulo}`}
                  </p>
                </div>

                <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-secondary text-muted-foreground">
                  {STATUS_LABEL[candidato.status]}
                </span>
              </div>

              {candidato.erro ? (
                <p className="text-xs font-medium text-rose-500 mt-2">{candidato.erro}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs font-bold text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {candidato.cidade
                      ? `${candidato.cidade}${candidato.uf ? `/${candidato.uf}` : ""}`
                      : "Cidade não identificada"}
                    {candidato.distancia_km != null && (
                      <span className="text-foreground"> · {candidato.distancia_km} km</span>
                    )}
                  </span>
                  {candidato.anos_experiencia != null && candidato.anos_experiencia > 0 && (
                    <span className="flex items-center gap-1">
                      <Briefcase className="w-3.5 h-3.5" />
                      {candidato.anos_experiencia} ano(s) de experiência
                    </span>
                  )}
                  {candidato.meses_ultimo_emprego != null && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {candidato.meses_ultimo_emprego === 0
                        ? "Empregado atualmente"
                        : `Último emprego há ${candidato.meses_ultimo_emprego} mês(es)`}
                    </span>
                  )}
                </div>
              )}

              {candidato.motivo && !candidato.erro && (
                <p className="text-xs font-medium text-muted-foreground mt-2 leading-relaxed">
                  {candidato.motivo}
                </p>
              )}

              {candidato.requisitos_faltantes?.length > 0 && (
                <p className="text-[11px] font-bold text-rose-500 mt-1.5">
                  Requisito não comprovado: {candidato.requisitos_faltantes.join(", ")}
                </p>
              )}
            </div>
          </div>

          {/* Ações */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-border">
            <button
              onClick={() => setAberto((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", aberto && "rotate-180")} />
              Detalhes
            </button>

            {candidato.arquivo_path && (
              <button
                onClick={abrirCurriculo}
                disabled={abrindoPdf}
                className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors disabled:opacity-50"
              >
                {abrindoPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                Currículo
              </button>
            )}

            <div className="flex-1" />

            <button
              onClick={() => onStatus(candidato.id, "entrevista")}
              className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              Entrevista
            </button>
            <button
              onClick={() => onStatus(candidato.id, "aprovado")}
              className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Aprovar
            </button>
            <button
              onClick={() => onStatus(candidato.id, "descartado")}
              className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Descartar
            </button>
            <button
              onClick={() => onExcluir(candidato.id)}
              title="Excluir candidato e currículo"
              className="p-1.5 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Detalhes: bullets da IA + de onde veio cada ponto */}
          {aberto && (
            <div className="mt-3 pt-3 border-t border-border grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">
                  Resumo do candidato
                </p>
                {candidato.destaques?.length ? (
                  <ul className="space-y-1">
                    {candidato.destaques.map((d, i) => (
                      <li key={i} className="text-xs font-medium text-foreground flex gap-2">
                        <span className="text-primary font-black">•</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground font-medium">Sem destaques extraídos.</p>
                )}

                {(candidato.email || candidato.telefone) && (
                  <div className="mt-3 space-y-0.5">
                    {candidato.email && (
                      <p className="text-xs font-bold text-muted-foreground">{candidato.email}</p>
                    )}
                    {candidato.telefone && (
                      <p className="text-xs font-bold text-muted-foreground">{candidato.telefone}</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">
                  Como a nota foi calculada
                </p>
                <div className="space-y-1.5">
                  {candidato.criterios?.itens?.map((it, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-bold text-foreground truncate">
                            {it.criterio}
                          </span>
                          <span className="text-[11px] font-black text-muted-foreground shrink-0">
                            {it.pontos}/{it.maximo}
                          </span>
                        </div>
                        <div className="h-1 bg-secondary rounded-full overflow-hidden mt-1">
                          <div
                            className={cn("h-full rounded-full", style.barra)}
                            style={{
                              width: `${it.maximo > 0 ? (it.pontos / it.maximo) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <p className="text-[10px] font-medium text-muted-foreground mt-0.5">
                          {it.detalhe}
                        </p>
                      </div>
                    </div>
                  )) || (
                    <p className="text-xs text-muted-foreground font-medium">
                      Candidato ainda não analisado.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
