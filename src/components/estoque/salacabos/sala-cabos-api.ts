import { authHeaders } from "@/lib/api";
import { supabase } from "@/lib/supabase";

// Estoque › Cabos: cortes de cabo (tabela coletor_cortes_cabo — o nome ficou da
// versão que registrava pelo Coletor), lançados na própria tela por quem está na
// sala, com login da Citel validado em db/src/handlers/HUB/Estoque/salaCabosHandler.js.

const BASE = "/api-marketing/api/estoque/sala-cabos";

export const EMPRESAS: Record<string, string> = { "001": "Carflax", "002": "Zelex", "003": "JCM" };

export interface CorteCabo {
  id: string;
  empresa: string;
  pedido: string;
  cliente: string | null;
  cod_produto: string;
  descricao: string;
  metros: number;
  /** De onde saiu: bobina ou picado. Null nos cortes anteriores à escolha. */
  origem: "bobina" | "picado" | null;
  cortado_por_codigo: string | null;
  cortado_por_nome: string;
  registrado_por_codigo: string | null;
  registrado_por_nome: string | null;
  created_at: string;
}

export interface OperadorCitel {
  codigo: string;
  nome: string;
}

/** Última contagem do cabo, com os metros cortados depois dela. */
export interface InventarioCabo {
  id: string;
  cod_produto: string;
  descricao: string;
  metros_bobina: number;
  metros_picado: number;
  saldo_erp_na_contagem: number | null;
  contado_por_nome: string;
  observacao: string | null;
  contado_em: string;
  cortado_desde: number;
  cortado_bobina_desde: number;
  cortado_picado_desde: number;
  /** Contagem menos o que saiu de cada um depois dela. */
  saldo_bobina: number;
  saldo_picado: number;
}

export interface InventarioLinha extends InventarioCabo {
  saldo_erp: number;
  disponivel_erp: number;
}

export interface ProdutoCabo {
  codigo: string;
  descricao: string;
  saldo_erp: number;
  disponivel_erp: number;
  inventario: InventarioCabo | null;
}

export interface PedidoCabos {
  empresa: string;
  pedido: string;
  cliente: string | null;
  status: string | null;
  itens: { cod_produto: string; descricao: string; qtd: number; registrado: number; inventario: InventarioCabo | null }[];
}

export const fmtMetros = (v: number) =>
  `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m`;

export const fmtPedido = (p?: string | null) => (p ? p.replace(/^0+/, "") || "0" : "—");

export class ErroApi extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(window.location.origin + BASE + path, {
    method,
    headers: { ...(await authHeaders()), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErroApi((data as { error?: string }).error || `Erro ${res.status}`, res.status);
  return data as T;
}

export const salaCabosApi = {
  // Todas as empresas juntas: a sala de cabos é uma só.
  cortes: async (f: { inicio: string; fim: string }) => {
    const { data, error } = await supabase
      .from("coletor_cortes_cabo")
      .select("*")
      .gte("created_at", `${f.inicio}T00:00:00-03:00`)
      .lte("created_at", `${f.fim}T23:59:59-03:00`)
      .order("created_at", { ascending: false })
      .limit(3000);
    if (error) throw new Error(error.message);
    return (data as CorteCabo[]) || [];
  },
  entrar: (usuario: string, senha: string) =>
    request<{ token: string; operador: OperadorCitel }>("POST", "/entrar", { usuario, senha }),
  pedido: (numero: string) =>
    request<PedidoCabos[]>("GET", `/pedido/${encodeURIComponent(numero.replace(/\D/g, ""))}`),
  registrarCorte: (body: { token: string; empresa: string; pedido: string; cod_produto: string; metros: number; origem: "bobina" | "picado" }) =>
    request<CorteCabo>("POST", "/cortes", body),
  produtos: (q: string) => request<ProdutoCabo[]>("GET", `/produtos?q=${encodeURIComponent(q)}`),
  inventario: () => request<InventarioLinha[]>("GET", "/inventario"),
  registrarInventario: (body: { cod_produto: string; metros_bobina: number; metros_picado: number; observacao?: string }) =>
    request<unknown>("POST", "/inventario", body),
};
