import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, Tag, Loader2, FileSpreadsheet, Factory } from "lucide-react";
import { cn } from "@/lib/utils";
import { TinyDropdown } from "@/components/ui/TinyDropdown";
import { apiProdutosFornecedores, type ProdutoFornecedor } from "@/lib/api";

const PAGINA = 100;

interface Props {
  brands: string[];
  marcaInicial?: string;
  onClose: () => void;
}

export function FornecedoresModal({ brands, marcaInicial, onClose }: Props) {
  const [marca, setMarca] = useState(marcaInicial || "Todas as Marcas");
  const [linhas, setLinhas] = useState<ProdutoFornecedor[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [visiveis, setVisiveis] = useState(PAGINA);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      setErro(null);
      try {
        const dados = await apiProdutosFornecedores(marca);
        if (!cancelado) {
          setLinhas(dados.filter((l) => l.COD_ITEM !== "99999"));
          setVisiveis(PAGINA);
        }
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Falha ao carregar fornecedores.");
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    // A troca de marca refaz a consulta no servidor; ignora resposta antiga que
    // chegue atrasada e sobrescreva a nova.
    return () => {
      cancelado = true;
    };
  }, [marca]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return linhas;
    const palavras = termo.split(/\s+/).filter(Boolean);
    return linhas.filter((l) =>
      palavras.every(
        (p) =>
          l.DESCRICAO?.toLowerCase().includes(p) ||
          l.COD_ITEM?.toLowerCase().includes(p) ||
          l.COD_FORNECEDOR?.toLowerCase().includes(p) ||
          l.FORNECEDOR?.toLowerCase().includes(p),
      ),
    );
  }, [linhas, busca]);

  // Quantos fornecedores distintos aparecem no recorte atual — é o número que
  // denuncia marca espalhada em vários cadastros de fornecedor.
  const fornecedoresDistintos = useMemo(
    () => new Set(filtradas.map((l) => l.COD_FORNECEDOR)).size,
    [filtradas],
  );

  const exportarCsv = () => {
    const cab = ["Código", "Descrição", "Marca", "Cód. Fornecedor", "Fornecedor"];
    const esc = (v: string | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      cab.join(";"),
      ...filtradas.map((l) =>
        [l.COD_ITEM, l.DESCRICAO, l.MARCA, l.COD_FORNECEDOR, l.FORNECEDOR].map(esc).join(";"),
      ),
    ].join("\n");

    // BOM para o Excel abrir os acentos corretamente
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fornecedores-${marca.replace(/\W+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-card border border-border rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border bg-gradient-to-r from-blue-600/10 via-blue-600/5 to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
              <Factory className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black uppercase tracking-tight text-foreground">
                Fornecedor por produto
              </h2>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5 truncate">
                {loading
                  ? "Carregando…"
                  : `${filtradas.length.toLocaleString("pt-BR")} produtos · ${fornecedoresDistintos} fornecedor(es)`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-border">
          <TinyDropdown
            value={marca}
            options={brands}
            onChange={setMarca}
            icon={Tag}
            variant="blue"
            placeholder="Todas as Marcas"
          />

          <div className="flex-1 min-w-[200px] relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setVisiveis(PAGINA);
              }}
              placeholder="Filtrar por código, descrição ou fornecedor…"
              className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-2.5 text-[11px] font-bold text-foreground outline-none focus:border-blue-600/50 transition-all placeholder:text-muted-foreground/30"
            />
          </div>

          <button
            onClick={exportarCsv}
            disabled={loading || filtradas.length === 0}
            title="Exportar lista para CSV"
            className="flex items-center justify-center p-2.5 bg-card border border-border rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all group shrink-0 disabled:opacity-40"
          >
            <FileSpreadsheet className="w-4 h-4 group-hover:text-emerald-500 transition-colors" />
          </button>
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2.5">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-xs font-bold text-muted-foreground">
                Consultando o cadastro de produtos…
              </span>
            </div>
          ) : erro ? (
            <div className="py-20 text-center">
              <p className="text-xs font-bold text-rose-500">{erro}</p>
            </div>
          ) : filtradas.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Nenhum produto encontrado
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border">
                  {["Código", "Descrição", "Marca", "Cód. Fornecedor", "Fornecedor"].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        "px-6 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground",
                        i === 0 || i === 3 ? "text-left w-[130px]" : "text-left",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.slice(0, visiveis).map((l) => (
                  <tr
                    key={l.COD_ITEM}
                    className="border-b border-border/50 hover:bg-secondary/40 transition-colors"
                  >
                    <td className="px-6 py-2.5 text-[11px] font-bold text-muted-foreground tabular-nums">
                      {l.COD_ITEM}
                    </td>
                    <td className="px-6 py-2.5 text-[11px] font-bold text-foreground">
                      {l.DESCRICAO}
                    </td>
                    <td className="px-6 py-2.5">
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md bg-blue-500/10 text-blue-500">
                        {l.MARCA}
                      </span>
                    </td>
                    <td className="px-6 py-2.5 text-[11px] font-black text-foreground tabular-nums">
                      {l.COD_FORNECEDOR}
                    </td>
                    <td className="px-6 py-2.5 text-[11px] font-bold text-muted-foreground">
                      {l.FORNECEDOR || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && filtradas.length > visiveis && (
            <div className="flex justify-center py-4">
              <button
                onClick={() => setVisiveis((v) => v + PAGINA)}
                className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/70 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
              >
                Carregar mais ({(filtradas.length - visiveis).toLocaleString("pt-BR")} restantes)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
