import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Search,
  ArrowUpDown,
  Tag,
  ChevronUp,
  ChevronDown,
  ShoppingBag,
  Upload,
  Printer
} from "lucide-react";
import { SiShopify } from "react-icons/si";
import { cn } from "@/lib/utils";
import { TinyDropdown } from "@/components/ui/TinyDropdown";
import { TinyLoader } from "@/components/ui/TinyLoader";
import { apiDashboardProdutos, type ProductInfo } from "@/lib/api";
import { ShopifyEnvioModal, type ItemEnvio } from "./ShopifyEnvioModal";
import { EtiquetaPrecoModal, type ProdutoEtiqueta } from "./EtiquetaPrecoModal";
import {
  getShopifyCatalog,
  normalizeSku,
  type ResultadoEnvio,
  type ShopifyVariantInfo,
} from "@/lib/shopify-sync";

/** Situação do vínculo ERP ↔ loja de um produto. */
type SyncStatus = "sincronizado" | "divergente" | "fora";

const SHOPIFY_FILTROS = [
  "Shopify: Todos",
  "Sincronizados",
  "Divergentes",
  "Fora da loja",
] as const;

const SHOPIFY_ADMIN = "https://admin.shopify.com/store/gfpdzv-y0/products";

/**
 * O vínculo existe quando o SKU da variante bate com o código do item.
 * "Funcionando" exige, além do vínculo, preço igual (tolerância de 5 centavos,
 * a mesma do sinc.js) e estoque igual quando a loja gerencia estoque.
 */
function avaliarSync(
  cod: string,
  stock: number,
  price: number,
  catalogo: Map<string, ShopifyVariantInfo>,
): { status: SyncStatus; loja?: ShopifyVariantInfo } {
  const loja = catalogo.get(normalizeSku(cod));
  if (!loja) return { status: "fora" };

  const precoOk = Math.abs(loja.price - price) <= 0.05;
  const estoqueOk = !loja.gerenciaEstoque || loja.stock === Math.max(0, Math.floor(stock));

  return { status: precoOk && estoqueOk ? "sincronizado" : "divergente", loja };
}

interface SyncBadgeProps {
  status?: SyncStatus;
  loja?: ShopifyVariantInfo;
  carregando: boolean;
  erpPrice: number;
  erpStock: number;
  onEnviar: () => void;
}

/**
 * Três estados, sem texto na linha:
 * · nunca enviado  → ícone de envio (a ação disponível é criar na loja)
 * · na loja, desatualizado → logo da Shopify apagado
 * · na loja e em dia       → logo da Shopify em cor cheia
 * O porquê fica no title, sem poluir a linha.
 */
function SyncBadge({ status, loja, carregando, erpPrice, erpStock, onEnviar }: SyncBadgeProps) {
  if (carregando) {
    return <div className="h-4 w-4 bg-secondary/50 rounded mx-auto animate-pulse" />;
  }

  // Nunca foi enviado: não faz sentido mostrar o logo da loja, e sim a ação.
  if (!loja) {
    return (
      <button
        onClick={onEnviar}
        title="Não está na loja — clique para enviar como rascunho"
        className="inline-flex items-center justify-center text-muted-foreground/40 hover:text-emerald-500 transition-colors"
      >
        <Upload className="w-4 h-4" />
      </button>
    );
  }

  const sincronizado = status === "sincronizado";

  const divergencias = [
    Math.abs(loja.price - erpPrice) > 0.05
      ? `preço loja R$ ${loja.price.toFixed(2)} × ERP R$ ${erpPrice.toFixed(2)}`
      : "",
    loja.gerenciaEstoque && loja.stock !== Math.max(0, Math.floor(erpStock))
      ? `estoque loja ${loja.stock} × ERP ${Math.max(0, Math.floor(erpStock))}`
      : "",
  ].filter(Boolean).join(" · ");

  const rascunho = loja.status !== "active";

  const titulo = sincronizado
    ? `SKU ${loja.sku} sincronizado${rascunho ? " (rascunho na loja)" : ""} — abrir na Shopify`
    : `SKU ${loja.sku} desatualizado: ${divergencias} — clique para reenviar`;

  const icone = (
    <SiShopify
      className={cn(
        "w-4 h-4 transition-all",
        sincronizado
          ? "text-[#95BF47]"
          : "text-muted-foreground/30 group-hover/shopify:text-muted-foreground/60",
      )}
    />
  );

  // Em dia, o clique leva ao produto na loja; desatualizado, o clique é a ação
  // que resolve — reenviar preço e estoque.
  return sincronizado ? (
    <a
      href={`${SHOPIFY_ADMIN}/${loja.productId}`}
      target="_blank"
      rel="noreferrer"
      title={titulo}
      className="group/shopify inline-flex items-center justify-center"
    >
      {icone}
    </a>
  ) : (
    <button
      onClick={onEnviar}
      title={titulo}
      className="group/shopify inline-flex items-center justify-center"
    >
      {icone}
    </button>
  );
}

interface Product {
  cod: string;
  desc: string;
  stock: number;
  sales: number;
  media: number;
  debit: number;
  credit: number;
  brand: string;
  location: string;
  codFornecedor: string;
  fornecedor: string;
}

export function ProdutosView() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterBrand, setFilterBrand] = useState("Todas as Marcas");
  const [filterStock, setFilterStock] = useState("TODOS");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Product; direction: 'asc' | 'desc' } | null>({ key: 'cod', direction: 'asc' });
  const [filterShopify, setFilterShopify] = useState<string>(SHOPIFY_FILTROS[0]);
  const [shopifyMap, setShopifyMap] = useState<Map<string, ShopifyVariantInfo>>(new Map());
  const [shopifyLoading, setShopifyLoading] = useState(true);
  const [envio, setEnvio] = useState<ItemEnvio[] | null>(null);
  const [etiquetas, setEtiquetas] = useState<{ inicial: ProdutoEtiqueta | null } | null>(null);

  const requestSort = (key: keyof Product) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
    setVisibleCount(50);
  };

  /**
   * Busca os produtos no ERP. `silencioso` evita o esqueleto de carregamento nas
   * atualizações automáticas — a tabela só troca de conteúdo quando a resposta chega.
   */
  const carregarProdutos = useCallback(async (silencioso = false) => {
      try {
        if (!silencioso) setLoading(true);
        const response = await apiDashboardProdutos();

        if (response && response.length > 0) {
          const mapped = response.map((p: ProductInfo) => {
            const precoVenda = typeof p.PRECO_VENDA === 'string' ? parseFloat(p.PRECO_VENDA) : Number(p.PRECO_VENDA || 0);
            return {
              cod: p.COD_ITEM,
              desc: p.DESCRICAO,
              stock: typeof p.TOTAL_DISPONIVEL === 'string' ? parseFloat(p.TOTAL_DISPONIVEL) : Number(p.TOTAL_DISPONIVEL || 0),
              sales: typeof p.TOTAL_VENDIDO === 'string' ? parseFloat(p.TOTAL_VENDIDO) : Number(p.TOTAL_VENDIDO || 0),
              media: typeof p.MEDIA === 'string' ? parseFloat(p.MEDIA) : Number(p.MEDIA || 0),
              debit: precoVenda,
              // 4,67% sobre o à vista: é o fator do ERP (ITE_PREUVE/ITE_PREVE1 na
              // maioria dos itens) e o que sai na etiqueta da loja (359,90 → 376,71).
              credit: Math.round(precoVenda * 1.0467 * 100) / 100,
              brand: p.MARCA || "GERAL",
              location: "---",
              codFornecedor: p.COD_FORNECEDOR || "",
              fornecedor: p.FORNECEDOR || ""
            };
          }).filter((p) => p.cod !== "99999")
            .sort((a, b) => Number(a.cod) - Number(b.cod));
          setProducts(mapped);
        }
      } catch (error) {
        console.error("[Products] Erro ao carregar:", error);
      } finally {
        if (!silencioso) setLoading(false);
      }
  }, []);

  const carregarShopify = useCallback(async (force = false, silencioso = false) => {
    if (!silencioso) setShopifyLoading(true);
    try {
      setShopifyMap(await getShopifyCatalog(force));
    } catch (error) {
      console.error("[Products] Erro ao carregar catálogo Shopify:", error);
    } finally {
      if (!silencioso) setShopifyLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarProdutos();
    carregarShopify();
  }, [carregarProdutos, carregarShopify]);

  /**
   * O ERP é MySQL consultado por API — não há realtime. Para que uma alteração
   * feita no ERP apareça aqui sem F5: recarrega ao voltar para a aba e a cada
   * 60s enquanto a tela estiver visível. O catálogo da Shopify vem do cache e
   * só é refeito no botão de atualizar.
   */
  useEffect(() => {
    const recarregar = () => {
      if (document.visibilityState !== "visible") return;
      carregarProdutos(true);
    };

    window.addEventListener("focus", recarregar);
    document.addEventListener("visibilitychange", recarregar);
    const timer = window.setInterval(recarregar, 60_000);

    return () => {
      window.removeEventListener("focus", recarregar);
      document.removeEventListener("visibilitychange", recarregar);
      window.clearInterval(timer);
    };
  }, [carregarProdutos]);

  /**
   * Depois de enviar, a resposta da própria Shopify já diz como a variante ficou.
   * Aplicar isso no mapa local troca o ícone na hora — reler o catálogo inteiro
   * não resolvia porque a listagem demora alguns segundos para devolver o produto
   * recém-criado, e o ícone só mudava no F5 seguinte.
   */
  const aplicarResultadoEnvio = useCallback((resultados: ResultadoEnvio[]) => {
    const novas = resultados.filter((r) => r.ok && r.variante).map((r) => r.variante!);
    if (novas.length === 0) return;
    setShopifyMap((atual) => {
      const proximo = new Map(atual);
      for (const v of novas) proximo.set(normalizeSku(v.sku), v);
      return proximo;
    });
  }, []);

  const brands = useMemo(() => ["Todas as Marcas", ...Array.from(new Set(products.map(p => p.brand))).sort()], [products]);

  /** Status de cada produto por código — recalculado quando a loja ou o ERP muda. */
  const syncPorCod = useMemo(() => {
    const m = new Map<string, { status: SyncStatus; loja?: ShopifyVariantInfo }>();
    for (const p of products) {
      m.set(p.cod, avaliarSync(p.cod, p.stock, p.debit, shopifyMap));
    }
    return m;
  }, [products, shopifyMap]);

  const totaisShopify = useMemo(() => {
    let sincronizado = 0, divergente = 0, fora = 0;
    for (const s of syncPorCod.values()) {
      if (s.status === "sincronizado") sincronizado++;
      else if (s.status === "divergente") divergente++;
      else fora++;
    }
    return { sincronizado, divergente, fora };
  }, [syncPorCod]);

  const [visibleCount, setVisibleCount] = useState(50);

  const filteredProducts = useMemo(() => {
    const filtered = products.filter(p => {
      const searchLower = searchTerm.trim().toLowerCase();
      const words = searchLower.split(/\s+/).filter(Boolean);
      
      const matchesSearch = words.length === 0 || 
        words.every(word => p.desc.toLowerCase().includes(word)) || 
        p.cod.toLowerCase().includes(searchLower);

      const matchesBrand = filterBrand === "Todas as Marcas" || p.brand === filterBrand;
      const matchesStock = filterStock === "TODOS" ||
        (filterStock === "COM ESTOQUE" && p.stock > 0) ||
        (filterStock === "SEM ESTOQUE" && p.stock <= 0);

      const status = syncPorCod.get(p.cod)?.status;
      const matchesShopify =
        filterShopify === SHOPIFY_FILTROS[0] ||
        (filterShopify === "Sincronizados" && status === "sincronizado") ||
        (filterShopify === "Divergentes" && status === "divergente") ||
        (filterShopify === "Fora da loja" && status === "fora");

      return matchesSearch && matchesBrand && matchesStock && matchesShopify;
    });

    if (sortConfig !== null) {
      filtered.sort((a, b) => {
        const key = sortConfig.key;
        const dir = sortConfig.direction;
        
        if (key === 'cod') {
          return dir === 'asc' ? Number(a.cod) - Number(b.cod) : Number(b.cod) - Number(a.cod);
        }
        
        const valA = a[key];
        const valB = b[key];

        if (typeof valA === 'number' && typeof valB === 'number') {
          return dir === 'asc' ? valA - valB : valB - valA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        if (strA < strB) return dir === 'asc' ? -1 : 1;
        if (strA > strB) return dir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [products, searchTerm, filterBrand, filterStock, filterShopify, syncPorCod, sortConfig]);

  const visibleProducts = filteredProducts.slice(0, visibleCount);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      if (visibleCount < filteredProducts.length) {
        setVisibleCount(prev => prev + 50);
      }
    }
  };

  const montarItem = (p: Product): ItemEnvio => ({
    produto: { cod: p.cod, desc: p.desc, brand: p.brand, price: p.debit, stock: p.stock },
    existente: syncPorCod.get(p.cod)?.loja,
  });


  return (
    <div className="flex-1 flex flex-col gap-4 pt-4 pb-6 px-3 sm:px-6 overflow-hidden h-full max-h-screen bg-background">
      {/* TINY TOOLBAR */}
      <div className="flex flex-col gap-3 shrink-0">
        
        {/* SEARCH & FILTERS */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[200px] relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder="Pesquisar por código ou descrição..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setVisibleCount(50); // Reset count on search
              }}
              className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 text-[11px] font-bold text-foreground outline-none focus:border-blue-600/50 transition-all placeholder:text-muted-foreground/30 shadow-sm"
            />
          </div>

          <TinyDropdown
            value={filterBrand}
            options={brands}
            onChange={(val) => {
              setFilterBrand(val);
              setVisibleCount(50); // Reset count on brand filter
            }}
            icon={Tag}
            variant="blue"
            placeholder="Todas as Marcas"
          />

          <div className="flex bg-card rounded-xl border border-border p-1 shadow-sm">
            {["TODOS", "COM ESTOQUE", "SEM ESTOQUE"].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setFilterStock(s);
                  setVisibleCount(50); // Reset count on stock filter
                }}
                className={cn(
                  "px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all border",
                  filterStock === s
                    ? "bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-600/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 border-transparent"
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <TinyDropdown
            value={filterShopify}
            options={[...SHOPIFY_FILTROS]}
            onChange={(val) => {
              setFilterShopify(val);
              setVisibleCount(50);
            }}
            icon={ShoppingBag}
            variant="blue"
            placeholder="Shopify: Todos"
          />

          <button
            onClick={() => setEtiquetas({ inicial: null })}
            title="Imprimir etiquetas de preço"
            className="flex items-center justify-center p-2.5 bg-card border border-border rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all shadow-sm group shrink-0"
          >
            <Printer className="w-4 h-4 text-muted-foreground group-hover:text-blue-500 transition-colors" />
          </button>
        </div>

        {/* RESUMO DO VÍNCULO COM A LOJA */}
        {!shopifyLoading && products.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {totaisShopify.sincronizado} sincronizados
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {totaisShopify.divergente} divergentes
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              {totaisShopify.fora} fora da loja
            </span>
          </div>
        )}
      </div>

      {/* PRODUCTS TABLE CONTAINER */}
      <div className="flex-1 bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col relative">
        <div
          className="flex-1 overflow-auto scrollbar-hide"
          onScroll={handleScroll}
        >
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead className="sticky top-0 z-10 bg-secondary/50 backdrop-blur-md border-b border-border">
              <tr>
                {[
                  { id: "cod", label: "CÓDIGO", align: "left" },
                  { id: "desc", label: "DESCRIÇÃO", align: "left" },
                  { id: "brand", label: "MARCA", align: "center" },
                  { id: "codFornecedor", label: "CÓD. FORN.", align: "center" },
                  { id: "stock", label: "ESTOQUE", align: "right" },
                  { id: "media", label: "MÉDIA 3M", align: "right" },
                  { id: "debit", label: "DÉBITO", align: "right" },
                ].map((col) => (
                  <th
                    key={col.id}
                    onClick={() => requestSort(col.id as keyof Product)}
                    className={cn(
                       "py-2.5 px-3 sm:px-6 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-secondary/60 transition-colors",
                       col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                    )}
                  >
                    <div className={cn("flex items-center gap-1.5", col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start")}>
                      <span className="truncate">{col.label}</span>
                      <div className="shrink-0">
                        {sortConfig?.key === col.id ? (
                          sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-20 group-hover:opacity-40 transition-opacity" />
                        )}
                      </div>
                    </div>
                  </th>
                ))}
                {/* Sem ordenação: o status vem da loja, não é um campo do produto. */}
                <th className="py-2.5 px-3 sm:px-6 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-center">
                  Shopify
                </th>
                <th className="py-2.5 px-2 w-10" aria-label="Etiqueta" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="animate-pulse">
                    <td className="py-4 px-3 sm:px-6"><div className="h-2 w-10 bg-secondary rounded" /></td>
                    <td className="py-4 px-3 sm:px-6"><div className="h-2 w-full max-w-[250px] bg-secondary rounded" /></td>
                    <td className="py-4 px-3 sm:px-6"><div className="h-5 w-16 bg-secondary/50 rounded-lg mx-auto" /></td>
                    <td className="py-4 px-3 sm:px-6"><div className="h-2 w-14 bg-secondary rounded mx-auto" /></td>
                    <td className="py-4 px-3 sm:px-6 text-right"><div className="h-2 w-12 bg-secondary rounded ml-auto" /></td>
                    <td className="py-4 px-3 sm:px-6 text-right"><div className="h-2 w-12 bg-secondary rounded ml-auto" /></td>
                    <td className="py-4 px-3 sm:px-6 text-right"><div className="h-2 w-16 bg-secondary/50 rounded ml-auto" /></td>
                    <td className="py-4 px-3 sm:px-6"><div className="h-5 w-20 bg-secondary/50 rounded-lg mx-auto" /></td>
                    <td className="py-4 px-2" />
                  </tr>
                ))
              ) : (
                <>
                  {visibleProducts.map((p: Product, i) => (
                    <tr key={i} className="hover:bg-secondary/20 transition-colors group">
                      <td className="py-3 px-3 sm:px-6 text-[10px] font-bold text-muted-foreground">{p.cod}</td>
                      <td className="py-3 px-3 sm:px-6">
                        <span className="text-[11px] font-black text-foreground uppercase tracking-tight line-clamp-1">{p.desc}</span>
                      </td>
                      <td className="py-3 px-3 sm:px-6 text-center">
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 uppercase tracking-tight">
                          {p.brand}
                        </span>
                      </td>
                      <td className="py-3 px-3 sm:px-6 text-center">
                        {/* Nome do fornecedor no hover: o código sozinho não diz nada,
                            mas alargar a tabela com mais uma coluna de texto sim. */}
                        <span
                          title={p.fornecedor || undefined}
                          className="text-[10px] font-bold text-muted-foreground tabular-nums"
                        >
                          {p.codFornecedor || "—"}
                        </span>
                      </td>
                      <td className="py-3 px-3 sm:px-6 text-right">
                        <span className={cn(
                          "text-[11px] font-black tracking-tighter",
                          p.stock > 10 ? "text-foreground" : p.stock > 0 ? "text-amber-500" : "text-rose-500"
                        )}>
                          {p.stock.toFixed(3)}
                        </span>
                      </td>
                      <td className="py-3 px-3 sm:px-6 text-right">
                        <span className="text-[11px] font-black text-blue-600 dark:text-blue-400 tracking-tighter tabular-nums">
                          {p.media.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="py-3 px-3 sm:px-6 text-right">
                        <span className="text-[11px] font-black text-emerald-500 dark:text-emerald-400 tracking-tighter">
                          R$ {p.debit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="py-3 px-3 sm:px-6 text-center">
                        <SyncBadge
                          status={syncPorCod.get(p.cod)?.status}
                          loja={syncPorCod.get(p.cod)?.loja}
                          carregando={shopifyLoading}
                          erpPrice={p.debit}
                          erpStock={p.stock}
                          onEnviar={() => setEnvio([montarItem(p)])}
                        />
                      </td>
                      <td className="py-3 px-2 text-center">
                        <button
                          onClick={() => setEtiquetas({ inicial: { cod: p.cod, desc: p.desc, debit: p.debit, credit: p.credit } })}
                          title="Imprimir etiqueta de preço"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  
                  {visibleCount < filteredProducts.length && (
                    <tr>
                      <td colSpan={9} className="py-6">
                        <div className="flex justify-center w-full">
                          <TinyLoader size="sm" />
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {etiquetas && (
        <EtiquetaPrecoModal
          produtos={products}
          filtrados={filteredProducts}
          inicial={etiquetas.inicial}
          onClose={() => setEtiquetas(null)}
        />
      )}

      {envio && (
        <ShopifyEnvioModal
          itens={envio}
          onClose={() => setEnvio(null)}
          onConcluido={aplicarResultadoEnvio}
        />
      )}
    </div>
  );
}
