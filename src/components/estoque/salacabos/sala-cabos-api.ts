import { authHeaders } from "@/lib/api";

// Sala de Cabos: saldo por bobina + registro de cada corte.
// Backend: db/src/handlers/HUB/Estoque/salaCabosHandler.js

const BASE = "/api-marketing/api/estoque/sala-cabos";

export const EMPRESAS: Record<string, string> = { "001": "Carflax", "002": "Zelex", "003": "JCM" };

export interface Operador {
  id: string;
  nome: string;
  ativo: boolean;
  usuario_id: string | null;
  avatar: string | null;
}

export interface ProdutoMetro {
  codigo: string;
  descricao: string;
  saldo_erp: number;
}

export interface Bobina {
  id: string;
  numero: number;
  empresa: string;
  cod_produto: string;
  descricao: string;
  metragem_inicial: number;
  saldo: number;
  status: "ativa" | "finalizada";
  observacao: string | null;
  criado_por_nome: string | null;
  finalizada_em: string | null;
  created_at: string;
}

export type MotivoCorte = "pedido" | "amostra" | "perda" | "ponta" | "uso_interno";

export interface Movimento {
  id: string;
  bobina_id: string;
  tipo: "entrada" | "corte" | "ajuste";
  metros: number;
  saldo_antes: number;
  saldo_depois: number;
  motivo: MotivoCorte | "contagem" | "entrada";
  pedido: string | null;
  pedido_empresa: string | null;
  observacao: string | null;
  operador_id: string | null;
  operador_nome: string;
  estornado_em: string | null;
  estornado_por: string | null;
  estorno_motivo: string | null;
  created_at: string;
  bobina_numero?: number;
  cod_produto?: string;
  descricao?: string;
}

export interface PedidoCabos {
  pedido: string;
  empresa: string;
  cliente: string | null;
  status: string | null;
  data: string | null;
  itens: { cod_produto: string; descricao: string; qtd: number; cortado: number }[];
}

export interface Divergencia {
  cod_produto: string;
  descricao: string;
  bobinas: number;
  saldo_bobinas: number;
  saldo_erp: number;
  diferenca: number;
}

export interface Pendencias {
  inicio_controle: string | null;
  desde?: string;
  pedidos: {
    pedido: string;
    data: string | null;
    cliente: string | null;
    status: string | null;
    itens: { cod_produto: string; descricao: string; qtd: number; cortado: number; falta: number }[];
  }[];
}

export interface Credencial {
  operador_id: string;
  pin: string;
}

export const MOTIVO_LABEL: Record<string, string> = {
  pedido: "Pedido",
  amostra: "Amostra",
  perda: "Perda / defeito",
  ponta: "Ponta / sobra",
  uso_interno: "Uso interno",
  contagem: "Medição",
  entrada: "Entrada",
};

export const numeroBobina = (n: number) => `BOB-${String(n).padStart(5, "0")}`;

/** Aceita "BOB-00012", "12" ou o que um leitor de código de barras mandar. */
export const lerNumeroBobina = (texto: string) => Number(String(texto).replace(/\D/g, "")) || 0;

export const fmtMetros = (v: number) =>
  `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m`;

export const fmtPedido = (p?: string | null) => (p ? p.replace(/^0+/, "") || "0" : "—");

async function request<T>(method: "GET" | "POST", path: string, opts: { query?: Record<string, string | undefined>; body?: unknown } = {}): Promise<T> {
  const url = new URL(window.location.origin + BASE + path);
  Object.entries(opts.query || {}).forEach(([k, v]) => { if (v !== undefined && v !== "") url.searchParams.set(k, v); });
  const res = await fetch(url.toString(), {
    method,
    headers: { ...(await authHeaders()), ...(opts.body ? { "Content-Type": "application/json" } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Erro ${res.status}`);
  return data as T;
}

export const salaCabosApi = {
  operadores: (todos = false) => request<Operador[]>("GET", "/operadores", { query: { todos: todos ? "1" : undefined } }),
  salvarOperador: (body: { id?: string; nome?: string; usuario_id?: string | null; pin?: string; ativo?: boolean }) =>
    request<{ ok: true; id?: string }>("POST", "/operadores", { body }),
  entrar: (c: Credencial) => request<{ ok: true; operador: { id: string; nome: string } }>("POST", "/entrar", { body: c }),
  produtos: (q: string, empresa: string) => request<ProdutoMetro[]>("GET", "/produtos", { query: { q, empresa } }),
  bobinas: (query: { empresa: string; status?: string; numero?: string; produto?: string }) =>
    request<Bobina[]>("GET", "/bobinas", { query }),
  cadastrarBobina: (c: Credencial, body: { empresa: string; cod_produto: string; metragem: number; observacao?: string }) =>
    request<Bobina>("POST", "/bobinas", { body: { ...c, ...body } }),
  pedido: (numero: string, empresa: string) =>
    request<PedidoCabos>("GET", `/pedido/${encodeURIComponent(numero)}`, { query: { empresa } }),
  cortar: (c: Credencial, body: { bobina_id: string; metros: number; motivo: MotivoCorte; pedido?: string; pedido_empresa?: string; observacao?: string }) =>
    request<Movimento>("POST", "/cortes", { body: { ...c, ...body } }),
  ajustar: (c: Credencial, body: { bobina_id: string; saldo_real: number; observacao: string }) =>
    request<Movimento>("POST", "/ajustes", { body: { ...c, ...body } }),
  estornar: (id: string, motivo: string) => request<Movimento>("POST", `/movimentos/${id}/estornar`, { body: { motivo } }),
  movimentos: (query: { empresa: string; inicio?: string; fim?: string; operador?: string; pedido?: string; bobina?: string; tipo?: string; limite?: string }) =>
    request<Movimento[]>("GET", "/movimentos", { query }),
  divergencias: (empresa: string) => request<Divergencia[]>("GET", "/divergencias", { query: { empresa } }),
  pendencias: (empresa: string, dias: number) => request<Pendencias>("GET", "/pendencias", { query: { empresa, dias: String(dias) } }),
};
