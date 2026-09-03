import { supabase } from "@/lib/supabase";

const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const API_BASE = "/api-marketing";
const API_CAMPAIGN = "/api-campaign";



/**
 * Cabeçalho de autenticação da API.
 *
 * Reaproveita o JWT da sessão do Supabase, que o usuário já tem por estar
 * logado no HUB — não existe um segundo login. O `getSession()` lê da memória e
 * renova o token sozinho quando está perto de expirar, então dá para chamar a
 * cada requisição sem custo de rede.
 *
 * Devolve vazio quando não há sessão (páginas públicas como a de avaliação);
 * essas rotas ficam de fora da exigência no servidor.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function get<T>(path: string, params?: Record<string, string>, base: string = API_BASE): Promise<T> {
  // Se base for um caminho relativo, usamos o origin do navegador
  const baseUrl = base.startsWith("http") ? base : window.location.origin + base;

  // CORREÇÃO: Evitar que o path com '/' resete a baseUrl
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const fullUrl = baseUrl.endsWith("/") ? `${baseUrl}${cleanPath}` : `${baseUrl}/${cleanPath}`;

  const url = new URL(fullUrl);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: await authHeaders() });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

async function post<T>(path: string, body: unknown, options?: RequestInit): Promise<T> {
  const baseUrl = API_BASE.startsWith("http") ? API_BASE : window.location.origin + API_BASE;
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const fullUrl = baseUrl.endsWith("/") ? `${baseUrl}${cleanPath}` : `${baseUrl}/${cleanPath}`;

  const res = await fetch(fullUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
    ...options,
    // `options` pode trazer headers próprios; mesclamos para o Authorization não
    // ser descartado por um spread que sobrescreve o objeto inteiro.
    ...(options?.headers
      ? { headers: { "Content-Type": "application/json", ...(await authHeaders()), ...options.headers } }
      : {}),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

/**
 * POST autenticado, para telas que precisam falar com o backend sem um wrapper
 * dedicado. Existe porque `post()` é interno: quem chamava `fetch` direto
 * esquecia o Authorization e tomava "Token de autenticação ausente" — todas as
 * rotas `/api` passam pelo verificarToken.
 */
export const apiPost = <T>(path: string, body: unknown): Promise<T> => post<T>(path, body);

// ── Vendedores & Metas ────────────────────────────────────────────────────────

export interface VendedorResumo {
  COD_VENDEDOR: string;
  NOME_VENDEDOR: string;
  META: number | string;
  FATURADO: number | string;
  EM_ABERTO: number | string;
  TOTAL: number | string;
  ATINGIMENTO_PCT?: number | string;
  FALTANTE: number | string;
  CUSTO?: number | string;
  MARGEM_REAL?: number | string;
  MARGEM_REAL_PERC?: number | string;
  TAXA_CONVERSAO_VALOR?: number | string;
  QTD_VENDAS: number | string;
  TICKET_MEDIO: number | string;
  CUSTO_EM_ABERTO?: number | string;
  QTD_ORCAMENTOS: number | string;
  ORC_FECHADOS?: number | string;
  TAXA_CONVERSAO?: number | string;
  MARGEM_PCT?: number | string;
  PRAZO_MEDIO_DIAS: number | string;
  PRAZO_MEDIO_DIAS_HOJE?: number | string;
  TOTAL_VENDIDO_HOJE: number | string;
  dias_trabalhados?: number;
  avatar?: string;
  // Só nas linhas agregadas de time (COD_VENDEDOR "TEAM:<id>"): códigos dos
  // vendedores somados. A linha do time não existe no ERP, então métricas
  // derivadas de outras fontes (ex.: perdido, na Tx Conversão) precisam
  // reagregar a partir dos membros.
  MEMBER_CODES?: string[];
}

export interface VendedoresResponse {
  mesano: string;
  dias_trabalhados: number;
  resumo: VendedorResumo[];
  detalhe?: unknown[];
  vendas_diarias?: unknown[];
  vendas_mensais?: unknown[];
}

export const apiVendedores = (mesano: string, vendedor?: string) =>
  get<VendedoresResponse>("/api/vendedores", { 
    mesano, 
    ...(vendedor ? { vendedor } : {}) 
  });

export const apiDashboardGeral = (vendedor?: string, data?: string) =>
  get<VendedorResumo[]>("/api/dashboard/geral", {
    ...(vendedor ? { vendedor } : {}),
    ...(data ? { data } : {})
  });

export interface MetaMes {
  COD_VENDEDOR: string;
  META: number | string;
}

/** Dispara no backend a geração/atualização dos comunicados de recebimento de material do dia. */
export const apiGerarComunicadoRecebimentos = () =>
  get<{ criados: number; atualizados: number; fornecedores: number }>(
    "/api/recebimentos/gerar-comunicado",
  );

/** Metas do mês por vendedor (CADMET), inclusive de quem ainda não faturou. */
export const apiDashboardMetas = (data?: string) =>
  get<MetaMes[]>("/api/dashboard/geral/metas", {
    ...(data ? { data } : {})
  });

export interface VendaDiaria {
  DIA: string;
  TOTAL_VENDIDO: number;
  FATURADO: number;
}

export const apiVendasDiarias = (vendedor?: string, data?: string) =>
  get<VendaDiaria[]>("/api/dashboard/geral/diario", {
    ...(vendedor ? { vendedor } : {}),
    ...(data ? { data } : {})
  });

// ── Metas de Campanha (Elegíveis para Sorteio) ────────────────────────────────

export interface MetaVendedor {
  MES: string;
  COD_VENDEDOR: string;
  NOME_VENDEDOR: string;
  META_VENDEDOR: string;
  FATURAMENTO: string;
  PERC_META_BATIDA: string;
  avatar?: string;
}

export interface CampanhaMetasResponse {
  mesano: string;
  resumo: MetaVendedor[];
}

export const apiCampanhaMetas = (mesano: string) =>
  get<CampanhaMetasResponse>("/api/campanha-metas", { mesano }, API_CAMPAIGN);

/** Retorna apenas vendedores com ≥ 97% da meta (regra do gestao-de-tempo) */
export const apiElegiveisParaSorteio = async (mesano: string): Promise<MetaVendedor[]> => {
  const data = await apiCampanhaMetas(mesano);
  return data.resumo.filter((v) => {
    if (parseFloat(v.PERC_META_BATIDA) < 97) return false;
    const nome = (v.NOME_VENDEDOR || "").toUpperCase().trim();
    if (/^CAIXA\b/.test(nome)) return false;
    return true;
  });
};

// ── Bônus Trimestral ──────────────────────────────────────────────────────────

export interface MesDetalhe {
  mesano: string;
  META_VENDEDOR: number;
  FATURAMENTO: number;
  PERC_META_BATIDA: number;
}

export interface VendedorTrimestral {
  COD_VENDEDOR: string;
  NOME_VENDEDOR: string;
  meses_detalhe: MesDetalhe[];
}

export interface TrimestralResponse {
  trimestre: string;
  meses: string[];
  trimestre_completo: boolean;
  qualificados: VendedorTrimestral[];
}

export const apiCampanhaMetasTrimestral = (mesano: string) =>
  get<TrimestralResponse>("/api/campanha-metas-trimestral", { mesano }, API_CAMPAIGN);

// ── Ranking de Campanha ───────────────────────────────────────────────────────

export interface RankingVendedor {
  COD_VENDEDOR: string;
  NOME_VENDEDOR: string;
  FATURADO: string;
  QTD_VENDAS: number;
}

export const apiCampaignRanking = async (params: {
  fornecedor?: string;
  produto?: string;
  data_ini?: string;
  data_fim?: string;
}): Promise<RankingVendedor[]> => {
  const data = await get<{ rows: RankingVendedor[] } | RankingVendedor[]>(
    "/api/campaign-ranking",
    params as Record<string, string>
  );
  return Array.isArray(data) ? data : (data as { rows?: RankingVendedor[] }).rows ?? [];
};

// ── Entregas ──────────────────────────────────────────────────────────────────

export interface EntregaResumo {
  NF: string;
  CLIENTE: string;
  ENDERECO: string;
  BAIRRO: string;
  CIDADE: string;
  CEP: string;
  DATA_ENTREGA: string;
}

export interface DetalhesEntregaResponse {
  success: boolean;
  motoristas: { COD: string; NOME: string }[];
  data: EntregaResumo | null;
}

export const apiEntregasRomaneios = () => 
  get<{ success: boolean; data: EntregaResumo[]; error?: string }>("/api/entregas/romaneios");

export const apiEntregasConcluidas = () => 
  get<{ success: boolean; data: EntregaResumo[]; error?: string }>("/api/entregas/concluidas");

export const apiEntregasDetalhes = (nf: string) => 
  get<DetalhesEntregaResponse>(`/api/entregas/detalhes/${nf}`);

export const apiMotoristas = () =>
  get<DetalhesEntregaResponse>("/api/entregas");

// ── Relatório de Romaneios ────────────────────────────────────────────────────
export interface RelatorioRomaneios {
  periodo: { inicio: string; fim: string };
  totais: {
    entregas: number;
    dias: number;
    mediaPorDia: number;
    maxPorDia: number;
    cidades: number;
    valor: number;
    peso: number;
  };
  porCidade: { cidade: string; uf: string; entregas: number; valor: number }[];
  // Bairros agrupados por cidade. Chave: `${cidade}||${uf}`.
  bairrosPorCidade: Record<string, { bairro: string; entregas: number }[]>;
  serieDiaria: { data: string; entregas: number }[];
  porDiaSemana: number[]; // 7 posições: 0=Dom ... 6=Sáb
  motoristas: {
    mediaPorDia: number;
    maxPorDia: number;
    totalMotoristas: number;
    recorde: { cod: string; nome: string; avatar?: string | null; data: string; entregas: number } | null;
    lista: {
      cod: string; nome: string; avatar?: string | null; entregas: number; dias: number; mediaDia: number; maxDia: number;
      // Enriquecidos pela camada de frota (quando há veículo vinculado ao motorista)
      km?: number; combustivel?: number; custoTotal?: number; rsPorEntrega?: number;
    }[];
  };
  frota: FrotaRelatorio;
}

export interface FrotaVeiculoMetrica {
  veiculoId: string;
  placa: string;
  modelo: string;
  km: number;
  dias: number;
  combustivel: number;
  custoDiario: number;
  pedagio: number;
  custoTotal: number;
}

export interface FrotaRelatorio {
  temCadastro: boolean;
  precoCombustivel: number;
  porVeiculo: FrotaVeiculoMetrica[];
  totais: {
    km: number;
    combustivel: number;
    custoDiario: number;
    pedagio: number;
    custoTotal: number;
    custoPorKm: number;
    custoPorEntrega: number;
  };
}

export const apiRelatorioRomaneios = (inicio: string, fim: string) =>
  get<RelatorioRomaneios>("/api/entregas/romaneios/relatorio", { inicio, fim });

// ── Frota & Custos (cadastro/config) ──────────────────────────────────────────

export interface FrotaVeiculo {
  id: string;
  placa: string;
  modelo: string | null;
  km_por_litro: number;
  custo_diario: number;
  ativo: boolean;
}

export interface FrotaCadastro {
  veiculos: FrotaVeiculo[];
  vinculos: { driver_cod: string; veiculo_id: string }[];
  precoCombustivel: number;
}

export interface VeiculoDescoberto {
  placa: string;
  odometroKm: number;
  nomeMotorista: string | null;
  dataHora: string | null;
}

export interface FrotaPosicao {
  placa: string;
  latitude: number;
  longitude: number;
  velocidade: number;
  ignicao: number;
  logradouro: string | null;
  odometroKm: number;
  dataHora: string | null;
  motorista?: string | null;
  avatar?: string | null;
  // Caminho real percorrido nos últimos minutos (para animar o carro nas ruas).
  trilha?: { lat: number; lng: number; dataHora: string }[];
}

export const apiFrotaCadastro = () =>
  get<FrotaCadastro>("/api/entregas/frota");

export const apiDescobrirVeiculos = () =>
  get<{ veiculos: VeiculoDescoberto[] }>("/api/entregas/frota/descobrir");

export const apiFrotaPosicoes = () =>
  get<{ posicoes: FrotaPosicao[] }>("/api/entregas/frota/posicoes");

export interface EntregaMapa {
  id: string;
  nf: string;
  cliente: string;
  endereco: string;
  status: string;
  motorista: string | null;
  veiculoId: string | null;
  lat: number;
  lng: number;
}

export const apiEntregasMapa = () =>
  get<{ clientes: EntregaMapa[]; totalRomaneio: number }>("/api/entregas/frota/entregas-mapa");

export const apiSalvarVeiculo = (v: Partial<FrotaVeiculo>) =>
  post<{ veiculo: FrotaVeiculo }>("/api/entregas/frota/veiculos", v);

export const apiSalvarVinculoMotorista = (driver_cod: string, veiculo_id: string | null) =>
  post<{ ok: boolean }>("/api/entregas/frota/motorista-veiculo", { driver_cod, veiculo_id }, { method: "PUT" });

export const apiSalvarPrecoCombustivel = (preco_combustivel: number) =>
  post<{ ok: boolean }>("/api/entregas/frota/config", { preco_combustivel }, { method: "PUT" });

export const apiSalvarPedagio = (veiculo_id: string, data: string, valor: number) =>
  post<{ ok: boolean }>("/api/entregas/frota/pedagio", { veiculo_id, data, valor }, { method: "PUT" });

export const apiSyncFrota = (dias?: number) =>
  post<{ ok: boolean; veiculos: number; diasGravados: number }>("/api/entregas/frota/sync", { dias });

// ── CRM ───────────────────────────────────────────────────────────────────────

export interface CrmItem {
  COD_PRODUTO: string;
  PRODUTO: string;
  QUANTIDADE: string | number;
  PRECO_UNITARIO: string | number;
  CUSTO_UNITARIO: string | number;
  MARKUP_PERCENTUAL: string | number;
  MARCA: string;
  UN: string;
  // Raw fields from legacy/database
  FDO_CODITE?: string;
  FDO_DESCRI?: string;
  FDO_QTDITE?: string | number;
  FDO_UNITAR?: string | number;
  FDO_TOTCUS?: string | number;
  FDO_UNIDAD?: string;
  FDO_CODMAR?: string;
  FDO_NUMDOC?: string;
}

export function mapCrmItem(p: Partial<CrmItem> & {
  FDO_CODITE?: string;
  FDO_DESCRI?: string;
  FDO_QTDITE?: string | number;
  FDO_UNITAR?: string | number;
  FDO_TOTCUS?: string | number;
  FDO_UNIDAD?: string;
  FDO_CODMAR?: string;
}): CrmItem {
  const qtd = parseFloat(String(p.QUANTIDADE || p.FDO_QTDITE || 0));
  const unitar = parseFloat(String(p.PRECO_UNITARIO || p.FDO_UNITAR || 0));
  const custoTotal = parseFloat(String(p.FDO_TOTCUS || (Number(p.CUSTO_UNITARIO || 0) * qtd) || 0));
  const custoUnitar = p.CUSTO_UNITARIO || (qtd > 0 ? custoTotal / qtd : 0);
  
  const mkpBackend = p.MARKUP_PERCENTUAL;
  const mkp = mkpBackend === null || mkpBackend === undefined
    ? (Number(custoUnitar) > 0 ? ((unitar / Number(custoUnitar)) - 1) * 100 : null)
    : (Number(mkpBackend) || 0);

  return {
    COD_PRODUTO: String(p.COD_PRODUTO || p.FDO_CODITE || ""),
    PRODUTO: String(p.PRODUTO || p.FDO_DESCRI || ""),
    QUANTIDADE: qtd,
    PRECO_UNITARIO: unitar,
    CUSTO_UNITARIO: custoUnitar,
    MARKUP_PERCENTUAL: mkp,
    UN: String(p.UN || p.FDO_UNIDAD || "UN"),
    MARCA: String(p.MARCA || p.FDO_CODMAR || ""),
    ...p
  } as CrmItem;
}

export interface CrmOrcamento {
  ORCAMENTO: string;
  /** Documento gerado quando o orçamento foi faturado/convertido (FGO_NUMFAT). Elo de migração entre empresas. */
  DOC_GERADO?: string | null;
  /** 1 quando o orçamento foi transferido para outro orçamento (troca de empresa): FGO_TIPFAT = 'OR'. */
  TRANSFERIDO?: number | string | null;
  PEDIDO: string;
  NOTA_FISCAL?: string | number;
  DATA_ORCAMENTO: string;
  HORA_ORCAMENTO: string;
  COD_VENDEDOR: string;
  VENDEDOR: string;
  CLIENTE: string;
  EMPRESA: string;
  VALOR_TOTAL_ORCAMENTO: string;
  MARKUP_DOC?: number | null;
  DATA_BAIXA: string;
  /** Data da venda: baixa/faturamento ou, na falta, data de entrada do pedido. Pode ser null. */
  DATA_VENDA?: string | null;
  MOTIVO_CANCELAMENTO: string;
  TELEFONE_CLIENTE?: string;
  /** Código do cliente no ERP — vínculo exato entre a conversa e o cadastro. */
  COD_CLIENTE?: string | null;
  PRODUTOS: CrmItem[];
  // Raw fields
  FDO_NUMDOC?: string;
  VENDEDOR_NOME?: string;
  CLIENTE_NOME?: string;
}

export const apiCrmOrcamentos = (params: { vendedor?: string, inicio?: string, fim?: string, documento?: string }) =>
  get<CrmOrcamento[]>("/api/crm/orcamentos", params as Record<string, string>);

export interface ClienteErp {
  encontrado: boolean;
  cliente?: {
    codigo: string; nome: string; tipo: string;
    documento?: string | null; endereco?: string | null; bairro?: string | null;
    cidade?: string | null; uf?: string | null;
    celular?: string | null; telefone?: string | null; email?: string | null;
    cod_vendedor?: string | null; ultima_compra?: string | null;
  };
  compras?: {
    pedidos: number; total: number; ultima: string | null;
    /** Pedido já fechado no ERP e ainda sem nota — não entra no faturado. */
    em_aberto_pedidos: number; em_aberto_total: number;
    /** Orçamentos da Citel nos últimos 12 meses (cancelados fora). `fechados` = já viraram pedido. */
    orcamentos_qtd?: number; orcamentos_total?: number;
    orcamentos_fechados?: number; orcamento_ultimo?: string | null;
    /** Números dos orçamentos dos últimos 12 meses (5 mais recentes). */
    orcamentos_docs?: { documento: string; valor: number; data: string | null; fechado: boolean }[];
  };
  /** Como o cliente foi identificado: 'documento' (exato) ou 'telefone'. */
  vinculo?: string | null;
  outros_cadastros?: number;
}

export interface ClienteErpBusca {
  codigo: string;
  nome: string;
  documento?: string | null;
  cidade?: string | null;
  uf?: string | null;
  telefone?: string | null;
  ultima_compra?: string | null;
}

/**
 * Busca cadastros do ERP por nome, CNPJ/CPF ou código. Serve para amarrar a
 * conversa ao cliente na mão quando o telefone não casa — comprador pessoa
 * física com o cadastro no CNPJ da empresa, por exemplo.
 */
export const apiBuscarClientesErp = (q: string) =>
  get<ClienteErpBusca[]>("/api/crm/cliente-por-telefone/buscar", { q });

export interface SyncLeadErp {
  /** Valor do orçamento encontrado na Citel dentro da janela do lead, ou null. */
  orcamento: number | null;
  /** Total dos pedidos encontrados, ou null. */
  venda: number | null;
  /** false quando a conversa ainda não tem cadastro do ERP amarrado. */
  vinculado: boolean;
}

/** Puxa orçamento e venda desta conversa do ERP na hora, sem esperar a varredura. */
export const apiSincronizarLeadErp = (jid: string) =>
  post<SyncLeadErp>("/api/crm/cliente-por-telefone/sincronizar", { jid });

/**
 * Cadastro no ERP da conversa. Manda o remote_jid porque o vínculo gravado
 * (vindo do número do orçamento) tem precedência sobre o telefone — o cadastro
 * na Citel muitas vezes usa outro número.
 */
export const apiClientePorTelefone = (jid: string) =>
  get<ClienteErp>("/api/crm/cliente-por-telefone", { jid });

export const apiCrmOrcamentoItens = (documento: string, empresa?: string) =>
  get<CrmItem[]>(`/api/crm/orcamentos/${encodeURIComponent(documento)}/itens`, empresa ? { empresa } : {});

export interface FaturamentoResumo {
  QTD_VENDAS: number;
  TOTAL_VENDIDO: number;
  /**
   * Pedidos já vendidos aguardando faturamento (FATGOR sem NF). É um retrato do
   * estado atual — vem 0 quando o período filtrado não alcança hoje.
   */
  EM_ABERTO: number;
}

export const apiCrmFaturamento = (params: { vendedor?: string, inicio?: string, fim?: string }) =>
  get<FaturamentoResumo>("/api/crm/orcamentos/faturamento", params as Record<string, string>);

export interface MotivoPerda {
  codigo: string;
  descricao: string;
}

/** Motivos de perda cadastrados no ERP (CADCOC, tipo 00001) — mesma lista da tela do Citel. */
export const apiCrmMotivosPerda = () =>
  get<MotivoPerda[]>("/api/crm/orcamentos/motivos-perda");

export const apiCrmStatus = (body: unknown) => post("/api/crm/status", body);

export const apiCrmAlugueisClientes = () =>
  get<{ value: string; label: string }[]>("/api/crm/alugueis/clientes");

export const apiCreatePaymentPreference = (rentalData: unknown) =>
  post<{ id: string; init_point: string; sandbox_init_point: string }>("/api/payments/preference", { rentalData });

// ── Pix (Integração Direta) ──────────────────────────────────────────────────

export interface PixResponse {
  txidPix: string;
  empresaPix: string;
  status: string;
  textoQrCode: string;
  valor: number;
  chavePix: string;
  codigoBanco: string;
  nomeBanco: string;
  nomeEmpresaPix: string;
  cnpjEmpresaPix: string;
}

export const apiGeraPix = async (data: { codigoCliente: string; solicitacaoPagador: string; valor: number }): Promise<PixResponse> => {
  const payload = {
    codigoCliente: data.codigoCliente,
    solicitacaoPagador: data.solicitacaoPagador,
    valor: parseFloat(data.valor.toFixed(2))
  };
  const baseUrl = API_BASE.startsWith("http") ? API_BASE : window.location.origin + API_BASE;
  const res = await fetch(`${baseUrl}/api/pix/gera_cobranca_pix`, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errorBody = await res.text();
    console.error("Erro API Pix (Body):", errorBody);
    throw new Error(`Erro ao gerar Pix: ${errorBody}`);
  }
  return res.json();
};


export const apiCancelaPix = async (codigoEmpresa: string, txIdPix: string): Promise<string> => {
  const baseUrl = API_BASE.startsWith("http") ? API_BASE : window.location.origin + API_BASE;
  const url = `${baseUrl}/api/pix/cancelar_cobranca_pix?codigoEmpresa=${codigoEmpresa}&txIdPix=${txIdPix}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { "accept": "application/json" }
  });
  if (!res.ok) throw new Error("Erro ao cancelar Pix");
  return res.text();
};

// ── Outros ────────────────────────────────────────────────────────────────────

export interface ProductInfo {
  COD_ITEM: string;
  DESCRICAO: string;
  MARCA: string;
  PRECO_VENDA: number | string;
  TOTAL_DISPONIVEL: number | string;
  ULT_ALT: string;
  TOTAL_VENDIDO?: number | string;
  VALOR_CREDITO?: number | string;
  VALOR_DEBITO?: string;
  MEDIA?: number | string;
  COD_FORNECEDOR?: string;
  FORNECEDOR?: string | null;
}

export const apiDashboardProdutos = (codigo?: string) =>
  get<ProductInfo[]>("/api/dashboard/produtos", {
    ...(codigo ? { codigo } : {})
  });

export interface ProdutoFornecedor {
  COD_ITEM: string;
  DESCRICAO: string;
  MARCA: string;
  COD_FORNECEDOR: string;
  FORNECEDOR: string | null;
}

export const apiProdutosFornecedores = (marca?: string) =>
  get<ProdutoFornecedor[]>("/api/dashboard/produtos/fornecedores", {
    ...(marca && marca !== "Todas as Marcas" ? { marca } : {}),
  });

export const apiFornecedores = () => get("/api/fornecedores");
export const apiProdutos = () => get("/api/produtos");
export const apiClientes = () => get("/api/clientes");
export const apiRegisterCliente = (body: unknown) => post("/api/clientes", body);
export interface SqlResponse {
  success: boolean;
  data?: unknown[];
  error?: string;
}

export const apiAdminSQL = (query: string, signal?: AbortSignal) => 
  post<SqlResponse>("/api/admin/sql", { query, secret: "carflax_admin_2026" }, { signal });
export const apiAdminSchema = () => get<{ success: boolean, dbName: string, tables: { name: string, type: string }[] }>("/api/admin/sql/schema");
export const apiHealth = () => get<{ status: string }>("/api/health");

// ── Ads (Google + Meta) ──────────────────────────────────────────────────────
export interface AdsCampaign {
  campaign: string;
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number;
  conversions: number;
}
export interface AdsPlatform {
  campaigns: AdsCampaign[];
  total: number;
  totalClicks: number;
  totalImpressions: number;
  totalConversions: number;
  error?: string;
}
export interface AdsDailySpend {
  date: string;
  google: number;
  meta: number;
  total: number;
}
export interface CustoFixo {
  id: string;
  descricao: string;
  categoria: string;
  valorMensal: number;
  inicio: string;
  fim: string | null;
  observacao?: string | null;
  /** valor rateado por dias dentro do período consultado */
  valorPeriodo: number;
}
export interface CustosFixosPeriodo {
  itens: CustoFixo[];
  total: number;
  error?: string;
}
export interface AdsSpendResponse {
  success: boolean;
  period: { start: string; end: string };
  daily: AdsDailySpend[];
  meta: AdsPlatform;
  google: AdsPlatform;
  /** apenas mídia (Meta + Google) */
  totalSpend: number;
  /** mídia + custos fixos — o que saiu do caixa */
  totalInvestido?: number;
  custosFixos?: CustosFixosPeriodo;
}
export const apiAdsSpend = (start: string, end: string) =>
  get<AdsSpendResponse>("/api/marketing/ads/spend", { start, end });

export const apiAdsSendReport = (body: { phone: string; image: string; caption?: string }) =>
  post<{ success: boolean; message: string }>("/api/marketing/ads/send-report", body);

export interface RentabilidadeCanal {
  canal: string;
  vendas: number;
  faturamento: number;
  pago: boolean;
}
export interface RentabilidadeResponse {
  success: boolean;
  period: { start: string; end: string };
  empresa: { faturado: number; custo: number; impostos: number; margem: number; margemPct: number };
  investimento: { midia: number; fixos: number; total: number };
  atribuido: {
    vendas: number;
    faturamentoTotal: number;
    faturamentoPago: number;
    semOrigem: { vendas: number; faturamento: number };
    comAnuncio: { vendas: number; faturamento: number };
    /** % do faturamento atribuído que tem origem conhecida */
    cobertura: number;
    porCanal: RentabilidadeCanal[];
  };
  trafego: {
    /** Lucro estimado sobre todas as vendas do CRM de marketing */
    lucro: number;
    faturamento: number;
    retornoReal: number;
    roas: number;
    faturamentoParaEmpatar: number;
    /** Recorte só dos canais pagos identificados */
    somentePago: {
      faturamento: number;
      lucro: number;
      retornoReal: number;
      roas: number;
    };
  };
  lucroAtribuido: number;
  /** % do lucro da empresa consumido pelo investimento em marketing */
  pesoNoLucro: number;
  aviso: string;
}

export const apiRentabilidade = (start: string, end: string, midia: number) =>
  get<RentabilidadeResponse>("/api/marketing/ads/rentabilidade", {
    start,
    end,
    midia: String(midia),
  });

export const apiCustosFixos = (start: string, end: string) =>
  get<{ success: boolean } & CustosFixosPeriodo>("/api/marketing/ads/custos-fixos", { start, end });

export const apiSalvarCustoFixo = (body: {
  id?: string;
  descricao: string;
  categoria?: string;
  valor_mensal: number;
  inicio: string;
  fim?: string | null;
  observacao?: string | null;
}) => post<{ success: boolean; custo: unknown }>("/api/marketing/ads/custos-fixos", body);

export const apiExcluirCustoFixo = async (id: string) => {
  const baseUrl = API_BASE.startsWith("http") ? API_BASE : window.location.origin + API_BASE;
  const res = await fetch(`${baseUrl}/api/marketing/ads/custos-fixos/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<{ success: boolean }>;
};

export interface LinkPreviewResponse {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
}

// Busca metadados Open Graph de um link (via backend, contornando CORS).
export const apiGetLinkPreview = (url: string) =>
  get<LinkPreviewResponse>("/api/whatsapp/link-preview", { url });

// ── Secullum Ponto Web (Integração Externa) ──────────────────────────────────
// Swagger: https://pontowebintegracaoexterna.secullum.com.br/docs/index.html

export interface SecullumTotalizadores {
  totalHorasTrabalhadas: string;
  totalHorasExtras: string;
  totalHorasFaltas: string;
  totalHorasAtrasos: string;
  totalDiasTrabalhados: number;
  totalFaltasDias: number;
}

export interface SecullumResponse {
  funcionarioNome: string;
  funcionarioCpf: string;
  totalizadores: SecullumTotalizadores;
}

const SECULLUM_AUTH_BASE = isLocal ? "/secullum-auth" : "https://autenticador.secullum.com.br";
const SECULLUM_API_BASE = isLocal ? "/secullum-api" : "https://pontowebintegracaoexterna.secullum.com.br";

/**
 * Autentica no Secullum e retorna o Bearer Token.
 */
export const loginSecullum = async (usuario: string, senha: string): Promise<string> => {
  const url = `${SECULLUM_AUTH_BASE}/Token`;
  const body = new URLSearchParams();
  body.append("grant_type", "password");
  body.append("username", usuario);
  body.append("password", senha);
  body.append("client_id", "3");

  const res = await fetch(url, {
    method: "POST",
    headers: { 
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body: body.toString()
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error("Erro Login Secullum:", errorBody);
    throw new Error("Erro na autenticação Secullum");
  }
  const data = await res.json();
  return data.access_token;
};

/** 
 * Busca totais de assiduidade no Secullum para um período.
 */
export const apiSecullumTotais = async (params: {
  dataInicial: string;
  dataFinal: string;
  funcionarioCpf?: string;
  token: string;
  idBanco: string;
}): Promise<SecullumResponse[]> => {
  const url = `${SECULLUM_API_BASE}/IntegracaoExterna/Calcular/SomenteTotais`;
  
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Authorization": `Bearer ${params.token}`,
      "secullumidbancoselecionado": params.idBanco,
      "Accept-Language": "pt-BR",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      dataInicial: params.dataInicial,
      dataFinal: params.dataFinal,
      ...(params.funcionarioCpf ? { funcionarioCpf: params.funcionarioCpf } : {})
    })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`Erro API Totais (${res.status}):`, errorBody);
    throw new Error(`Secullum API ${res.status}`);
  }
  return res.json();
};

export { API_BASE };

// ── Campanha Amanco ───────────────────────────────────────────────────────────

export interface AmancoVendedor {
  COD_VENDEDOR: string;
  NOME_VENDEDOR: string;
  TOTAL_FATURADO: number;
}

export interface AmancoCliente {
  COD_CLIENTE: string;
  CLIENTE: string;
  TOTAL_FATURADO: number;
}

export interface AmancoRankingResponse {
  rankingVendedores: AmancoVendedor[];
  rankingClientes: AmancoCliente[];
}

export const apiAmancoRanking = () =>
  get<AmancoRankingResponse>("/api/crm/campanhas/amanco-ranking");

// ── Análise FRV (Inteligência Comercial da Carteira) ─────────────────────────
export interface FrvSeriePonto {
  mes: string; // 'YYYY-MM'
  valor: number;
  custo: number;
  pedidos: number;
}

export interface FrvCliente {
  cliente_id: string;
  nome_cliente: string;
  cod_vendedor: string;
  nome_vendedor: string;
  empresa: string;
  primeira_compra: string | null;
  ultima_compra: string | null;
  recencia_dias: number;
  frequencia: number;
  valor_total: number;
  custo_total: number;
  margem_total: number;
  margem_pct: number;
  ticket_medio: number;
  intervalo_medio_dias: number | null;
  serie: FrvSeriePonto[];
}

export interface FrvResponse {
  gerado_em: string;
  janela_meses: number;
  janela_inicio: string;
  vendedores: { cod: string; nome: string }[];
  empresas: string[];
  clientes: FrvCliente[];
}

export const apiAnaliseFrv = (meses?: number) =>
  get<FrvResponse>(`/api/crm/clientes-frv${meses ? `?meses=${meses}` : ""}`);

// ── Carteira de Vendedores (mês atual) ───────────────────────────────────────
export interface CarteiraCliente {
  cliente_id: string;
  nome_cliente: string;
  cod_vendedor: string;
  nome_vendedor: string;
  empresa: string;
  ultima_compra: string | null;
  pedidos_mes: number;
  valor_mes: number;
  margem_mes: number;
  telefone_cliente?: string | null;
  orc_total?: number; // orçamentos do mês
  orc_fechados?: number; // orçamentos convertidos em pedido
  orc_valor_total?: number; // R$ orçado
  orc_valor_fechado?: number; // R$ convertido
  cod_vendedor_ultima_venda?: string;
  nome_vendedor_ultima_venda?: string;
  pessoa_fisica?: boolean; // true = PF (nascimento faz sentido); false = PJ
  data_nascimento?: string | null; // 'YYYY-MM-DD' ou null
  celular?: string | null; // WhatsApp cadastrado ou null
}

export interface CarteiraResponse {
  gerado_em: string;
  mes: string; // 'YYYY-MM'
  clientes: CarteiraCliente[];
  vendedores?: { cod: string; nome: string }[];
}

export const apiCarteira = () => get<CarteiraResponse>("/api/crm/carteira");

export interface TransferirClienteResponse {
  ok: boolean;
  cliente_id: string;
  codigo_vendedor: string;
}

// Transfere um cliente para outro vendedor (PATCH parcial no ERP)
export const apiTransferirCliente = (clienteId: string, codigoVendedor: string) =>
  post<TransferirClienteResponse>("/api/crm/carteira/transferir", { clienteId, codigoVendedor });

export interface AtualizarCadastroResponse {
  ok: boolean;
  cliente_id: string;
  data_nascimento: string | null;
  celular: string | null;
}

// Completa dados de cadastro faltantes (nascimento/WhatsApp) — PATCH parcial no ERP
export const apiAtualizarCadastroCliente = (
  clienteId: string,
  dados: { dataNascimento?: string | null; telefoneCelular?: string | null }
) => post<AtualizarCadastroResponse>("/api/crm/carteira/atualizar-cadastro", { clienteId, ...dados });

// ── Mix de Produtos por Cliente (por marca) ──────────────────────────────────
export type MixMarcaStatus = "perdida" | "nova" | "caindo" | "crescendo" | "estavel";

export interface MixMarca {
  marca: string;
  valor_atual: number; // últimos 12m
  valor_anterior: number; // 12m anteriores
  margem_atual: number;
  pedidos_atual: number;
  ultima_compra: string | null;
  variacao_pct: number;
  status: MixMarcaStatus;
}

export interface MixClienteResponse {
  cliente_id: string;
  gerado_em: string;
  janela_corte: string;
  marcas: MixMarca[];
}

export const apiMixCliente = (clienteId: string) =>
  get<MixClienteResponse>(`/api/crm/mix-cliente?cliente=${encodeURIComponent(clienteId)}`);

// ── Histórico / Timeline Comercial do Cliente ────────────────────────────────
export type HistoricoEventoTipo = "entrada" | "auge" | "queda" | "crescimento" | "marca_perdida" | "parou";

export interface HistoricoAno {
  ano: number;
  valor: number;
  margem: number;
  pedidos: number;
  marcas: number;
}

export interface HistoricoEvento {
  ano: number;
  tipo: HistoricoEventoTipo;
  titulo: string;
  detalhe: string;
}

export interface HistoricoClienteResponse {
  cliente_id: string;
  gerado_em: string;
  anos: HistoricoAno[];
  eventos: HistoricoEvento[];
}

export const apiHistoricoCliente = (clienteId: string) =>
  get<HistoricoClienteResponse>(`/api/crm/historico-cliente?cliente=${encodeURIComponent(clienteId)}`);

// ── Produtos comprados por Cliente (top 20, últimos 6 meses) ────────────────
export interface ProdutoCliente {
  codigo: string;
  descricao: string;
  marca: string;
  qtd_total: number;
  valor_total: number;
  pedidos: number;
  ultima_compra: string | null;
}

export interface ProdutosClienteResponse {
  cliente_id: string;
  gerado_em: string;
  periodo_inicio: string;
  produtos: ProdutoCliente[];
}

export const apiProdutosCliente = (clienteId: string) =>
  get<ProdutosClienteResponse>(`/api/crm/produtos-cliente?cliente=${encodeURIComponent(clienteId)}`);

// ── Expedição: Separação e Conferência ───────────────────────────────────────
export interface ExpedicaoItem {
  pedido: string;
  empresa: string;
  cod_cliente: string;
  cliente: string;
  operador: string;
  qtd_sku: number;
  hora_inicio: string | null;
  hora_fim: string | null;
  tempo_seg: number | null;
}

export interface ExpedicaoOperador {
  operador: string;
  qtd: number;
  media_seg: number;
}

export interface ExpedicaoEvolucao {
  dia: string;
  qtd: number;
  media_seg: number;
}

export interface ExpedicaoLocal {
  local: string;
  qtd: number;
  media_seg: number;
}

export interface ExpedicaoResponse {
  gerado_em: string;
  etapa: "separacao" | "conferencia";
  media_hoje_seg: number;
  total_hoje: number;
  media_mes_seg: number;
  total_mes: number;
  por_operador: ExpedicaoOperador[];
  por_local: ExpedicaoLocal[];
  evolucao: ExpedicaoEvolucao[];
  lista: ExpedicaoItem[];
}

export const apiSeparacao = () => get<ExpedicaoResponse>("/api/estoque/separacao");
export const apiConferencia = () => get<ExpedicaoResponse>("/api/estoque/conferencia");

export interface RetiradaPedido {
  pedido: string;
  empresa: string;
  cod_cliente: string;
  cliente: string;
  qtd_sku: number;
  data_conferencia?: string;
  hora_conferencia?: string;
}

export const apiRetiradaPedidos = () => get<RetiradaPedido[]>("/api/estoque/retirada/pedidos");

// ── Compras ──────────────────────────────────────────────────────────────────
// Usa a base padrão (/api-marketing → marketing-carflax), igual ao resto do api.ts.
export interface FornecedorLeadTime {
  cod_fornecedor: string;
  fornecedor: string;
  pedidos: number;
  media_dias: number;
  desvio_dias?: number;
  confiabilidade?: "ALTA" | "MEDIA" | "BAIXA";
  min_dias: number;
  max_dias: number;
  ultima_entrada: string | null;
}
export interface LeadTimeResponse { success: boolean; meses: number; data: FornecedorLeadTime[]; }
export const apiComprasLeadTime = (meses = 6, minPedidos = 2) =>
  get<LeadTimeResponse>("/api/compras/lead-time-fornecedores", { meses: String(meses), minPedidos: String(minPedidos) });

export interface VendaGrande {
  data: string;
  documento: string;
  cod_item: string;
  item: string;
  marca: string;
  cliente: string;
  vendedor: string;
  qtd: number;
  valor: number;
  media_item: number;
  ratio: number;
  estoque_atual: number | null;
}
export interface VendasGrandesResponse { success: boolean; parametros: { dias: number; fator: number; piso: number }; data: VendaGrande[]; }
export const apiComprasVendasGrandes = (opts?: { dias?: number; fator?: number; piso?: number }) =>
  get<VendasGrandesResponse>("/api/compras/vendas-grandes", {
    dias: String(opts?.dias ?? 30),
    fator: String(opts?.fator ?? 5),
    piso: String(opts?.piso ?? 10),
  });

// Motor de reposição (demand-driven): ROP, estoque de segurança estatístico,
// cobertura, ABC/XYZ, em trânsito e quantidade sugerida por SKU.
export type ReposicaoStatus = "RUPTURA" | "ABAIXO_ROP" | "EXCESSO" | "OK";
export interface ReposicaoItem {
  cod: string;
  produto: string;
  marca: string;
  linha: string;
  cod_fornecedor: string;
  fornecedor: string;
  d_dia: number;
  d_forecast: number;
  fator_sazonal: number;
  semanas_venda: number;
  receita: number;
  custo: number;
  saldo: number;
  em_transito: number;
  posicao: number;
  lead_time: number;
  lead_time_desvio: number;
  lead_time_estimado: boolean;
  estoque_seguranca: number;
  rop: number;
  cobertura_dias: number | null;
  sugerido: number;
  valor_sugerido: number;
  valor_estoque: number;
  cv: number;
  xyz: "X" | "Y" | "Z";
  irregular: boolean;
  abc: "A" | "B" | "C";
  status: ReposicaoStatus;
}
export interface ReposicaoResumo {
  skus: number; ruptura: number; abaixo_rop: number; excesso: number; ok: number;
  irregulares: number; valor_comprar: number; valor_parado: number;
}
export interface ReposicaoResponse {
  success: boolean;
  computing?: boolean;
  resumo: ReposicaoResumo | null;
  data: ReposicaoItem[];
  parametros?: { dias: number; nivel: number; limiteExcesso: number; z?: number };
  cache?: { hit: boolean; idade_s?: number };
}
export const apiComprasReposicao = (opts?: { dias?: number; nivel?: number; limiteExcesso?: number }) =>
  get<ReposicaoResponse>("/api/compras/reposicao", {
    dias: String(opts?.dias ?? 90),
    nivel: String(opts?.nivel ?? 95),
    limiteExcesso: String(opts?.limiteExcesso ?? 90),
  });

// ── Automação: campanha de avaliação no Google (Evolution API) ────────────────
export interface AvaliacaoCampanhaConfig {
  id: number;
  status: "idle" | "running" | "paused";
  review_url: string;
  templates: string[];
  daily_cap: number;
  min_gap_seconds: number;
  max_gap_seconds: number;
  hora_inicio: number;
  hora_fim: number;
  dias_semana: number[];
  reask_days: number;
  sent_today: number;
  last_sent_date?: string | null;
  last_sent_at?: string | null;
}
export interface AvaliacaoCampanhaEnvio {
  nome: string | null;
  remote_jid: string;
  status: string;
  sent_at: string | null;
  error: string | null;
}
export interface AvaliacaoCampanhaStatus {
  success: boolean;
  campanha: AvaliacaoCampanhaConfig;
  contadores: { pending: number; sent: number; failed: number };
  recentes: AvaliacaoCampanhaEnvio[];
}

export const apiAvaliacaoStatus = () =>
  get<AvaliacaoCampanhaStatus>("/api/avaliacao-campanha/status");

export const apiAvaliacaoSaveConfig = (cfg: Partial<AvaliacaoCampanhaConfig>) =>
  post<{ success: boolean }>("/api/avaliacao-campanha/config", cfg);

export const apiAvaliacaoBuild = () =>
  post<{ success: boolean; elegiveis: number; inseridos: number; pending: number }>(
    "/api/avaliacao-campanha/build",
    {},
  );

export const apiAvaliacaoControl = (action: "start" | "pause" | "stop") =>
  post<{ success: boolean; status: string }>("/api/avaliacao-campanha/control", { action });

// ── Automação: campanhas de envio genéricas por tipo (ex.: café da manhã) ─────
export interface CampanhaEnvioConfig {
  tipo: string;
  nome: string;
  publico: string;
  status: "idle" | "running" | "paused";
  templates: string[];
  data_evento?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  daily_cap: number;
  min_gap_seconds: number;
  max_gap_seconds: number;
  hora_inicio: number;
  hora_fim: number;
  dias_semana: number[];
  reask_days: number;
  sent_today: number;
  last_sent_at?: string | null;
}
export interface CampanhaEnvioStatus {
  success: boolean;
  campanha: CampanhaEnvioConfig;
  contadores: { pending: number; sent: number; failed: number };
  recentes: AvaliacaoCampanhaEnvio[];
}

export const apiCampanhaStatus = (tipo: string) =>
  get<CampanhaEnvioStatus>(`/api/campanhas/${tipo}/status`);

export const apiCampanhaSaveConfig = (tipo: string, cfg: Partial<CampanhaEnvioConfig>) =>
  post<{ success: boolean }>(`/api/campanhas/${tipo}/config`, cfg);

export const apiCampanhaBuild = (tipo: string) =>
  post<{ success: boolean; elegiveis: number; inseridos: number; pending: number }>(
    `/api/campanhas/${tipo}/build`,
    {},
  );

export const apiCampanhaControl = (tipo: string, action: "start" | "pause" | "stop") =>
  post<{ success: boolean; status: string }>(`/api/campanhas/${tipo}/control`, { action });

export const apiCampanhaTest = (tipo: string, phone: string) =>
  post<{ success: boolean; phone?: string; warning?: string | null; error?: string }>(`/api/campanhas/${tipo}/test`, { phone });

// ── RH · Triagem de Currículos ────────────────────────────────────────────────

export interface RhCriterios {
  peso_distancia: number;
  peso_experiencia_funcao: number;
  peso_segmento: number;
  peso_tempo_experiencia: number;
  peso_experiencia_recente: number;
  anos_experiencia_ideal: number;
  meses_recente: number;
  faixa_excelente_km: number;
  faixa_aceitavel_km: number;
  faixa_baixa_km: number;
  corte_km: number;
}

export interface RhVagaResumo {
  total: number;
  verde: number;
  amarelo: number;
  vermelho: number;
  eliminado: number;
}

export interface RhVaga {
  id: string;
  titulo: string;
  descricao?: string | null;
  local_texto: string;
  lat: number;
  lng: number;
  requisitos_obrigatorios: string[];
  segmentos: string[];
  palavras_funcao: string[];
  criterios: RhCriterios;
  status: string;
  criado_por?: string | null;
  created_at: string;
  resumo?: RhVagaResumo;
}

export interface RhCriterioItem {
  criterio: string;
  detalhe: string;
  pontos: number;
  maximo: number;
}

export type RhFaixa = "verde" | "amarelo" | "vermelho" | "eliminado";

export interface RhCandidato {
  id: string;
  vaga_id: string;
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  cidade?: string | null;
  uf?: string | null;
  endereco_texto?: string | null;
  lat?: number | null;
  lng?: number | null;
  distancia_km?: number | null;
  arquivo_path?: string | null;
  arquivo_nome?: string | null;
  fonte: string;
  score?: number | null;
  faixa?: RhFaixa | null;
  recomendacao?: string | null;
  motivo?: string | null;
  destaques: string[];
  criterios?: { itens: RhCriterioItem[]; pesos: RhCriterios } | null;
  anos_experiencia?: number | null;
  experiencia_funcao?: boolean | null;
  segmento_match?: boolean | null;
  meses_ultimo_emprego?: number | null;
  requisitos_faltantes: string[];
  status: "novo" | "entrevista" | "aprovado" | "descartado";
  erro?: string | null;
  analisado_em?: string | null;
  created_at: string;
}

const rhDelete = async (path: string) => {
  const baseUrl = API_BASE.startsWith("http") ? API_BASE : window.location.origin + API_BASE;
  const res = await fetch(`${baseUrl}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<{ success: boolean }>;
};

export const apiRhVagas = () =>
  get<{ success: boolean; vagas: RhVaga[] }>("/api/rh/triagem/vagas");

export const apiRhSalvarVaga = (vaga: Partial<RhVaga> & { titulo: string }) =>
  post<{ success: boolean; vaga: RhVaga }>("/api/rh/triagem/vagas", vaga);

export const apiRhExcluirVaga = (id: string) => rhDelete(`/api/rh/triagem/vagas/${id}`);

export const apiRhCandidatos = (vagaId: string) =>
  get<{ success: boolean; candidatos: RhCandidato[] }>("/api/rh/triagem/candidatos", {
    vaga_id: vagaId,
  });

export const apiRhImportar = (body: {
  vaga_id: string;
  arquivos?: { path: string; nome: string }[];
  textos?: { nome: string; texto: string }[];
}) =>
  post<{
    success: boolean;
    importados: number;
    candidatos: RhCandidato[];
    erros: { arquivo: string; erro: string }[];
  }>("/api/rh/triagem/importar", body);

export const apiRhAnalisar = (body: { vaga_id: string; ids?: string[]; reanalisar?: boolean }) =>
  post<{
    success: boolean;
    analisados: number;
    falhas: number;
    erros?: { id: string; nome: string; erro: string }[];
    candidatos: RhCandidato[];
  }>("/api/rh/triagem/analisar", body);

export const apiRhStatusCandidato = (id: string, status: RhCandidato["status"]) =>
  post<{ success: boolean; candidato: RhCandidato }>("/api/rh/triagem/candidatos/status", {
    id,
    status,
  });

export const apiRhExcluirCandidato = (id: string) => rhDelete(`/api/rh/triagem/candidatos/${id}`);

export const apiRhUrlCurriculo = (id: string) =>
  get<{ success: boolean; url: string }>(`/api/rh/triagem/curriculo/${id}`);
