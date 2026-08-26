import { GoogleGenerativeAI } from "@google/generative-ai";
import { authHeaders } from "@/lib/api";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_IA || "");

const PRODUTOS_API_URL = "/api-marketing/api/dashboard/produtos";

// ─── Cache de catálogo (persiste entre aberturas do modal) ───────────────────
let catalogoCache: ProdutoAPI[] | null = null;

export interface ProdutoAPI {
  COD_ITEM: string;
  DESCRICAO: string;
  MARCA: string;
  PRECO_VENDA: string;
  TOTAL_DISPONIVEL: string;
}

export interface Alternativa {
  cod_item: string;
  descricao: string;
  preco_unit: number;
}

export interface ItemOrcamento {
  cod_item: string;
  descricao: string;
  quantidade: number;
  preco_unit: number;
  total: number;
  encontrado: boolean;
  categoria: "hidraulica" | "eletrica" | "outros";
  confianca: number;          // 0-100
  alternativas: Alternativa[]; // sugestões quando não encontrado
}

export async function fetchProdutosAPI(): Promise<ProdutoAPI[]> {
  if (catalogoCache) return catalogoCache;
  // Catálogo com preço, estoque e fornecedor: é o endpoint mais sensível da API.
  const res = await fetch(PRODUTOS_API_URL, { headers: await authHeaders() });
  if (!res.ok) throw new Error("Falha ao buscar catálogo de produtos");
  catalogoCache = await res.json();
  return catalogoCache!;
}

export function isCatalogoCached(): boolean {
  return catalogoCache !== null;
}

export function contarItens(texto: string): number {
  return texto.split("\n").filter(l => l.trim().length > 0).length;
}

function norm(str: string): string {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ─── Levenshtein ─────────────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = tmp;
    }
  }
  return row[n];
}

// ─── Vocabulário canônico para correção de typos ──────────────────────────────
const VOCABULARIO: string[] = [
  // Hidráulica — conexões
  "joelho", "tee", "luva", "uniao", "reducao", "bucha", "adaptador",
  "flange", "niple", "plug", "cap", "cruzeta", "juncao",
  // Hidráulica — tubos / linhas
  "tubo", "cano",
  // Hidráulica — ralos / caixas
  "ralo", "sifao", "grelha",
  // Hidráulica — registros / válvulas
  "registro", "valvula", "retencao", "boia", "engate",
  // Hidráulica — cavalete / abastecimento
  "cavalete", "hidrometro", "abracadeira", "colar", "selim", "torneira",
  // Hidráulica — caixa d'água
  "caixa", "reservatorio",
  // Hidráulica — acabamento / vedação
  "adesivo", "primer", "lixa", "silicone", "estopa", "veda",
  // Hidráulica — latão / rosca
  "latao", "rosca", "macho", "femea",
  // Elétrica
  "disj", "disjuntor", "conduite", "eletroduto", "condulete",
  "interruptor", "tomada", "espelho",
  "fio", "cabo", "terminal", "conector",
  "luminaria", "lampada",
  "quadro", "distribuicao",
  "isolante",
];

// Corrige typos: para cada keyword longa que não bate exato no vocabulário,
// tenta Levenshtein e adiciona o termo correto ao conjunto
function expandirComFuzzy(keywords: Set<string>): Set<string> {
  const expanded = new Set(keywords);
  for (const kw of keywords) {
    if (kw.length < 4) continue;
    const maxDist = kw.length <= 6 ? 1 : 2;
    for (const vocab of VOCABULARIO) {
      if (kw === vocab) break;
      if (Math.abs(kw.length - vocab.length) > maxDist) continue; // otimização
      if (levenshtein(kw, vocab) <= maxDist) {
        expanded.add(vocab);
        break;
      }
    }
  }
  return expanded;
}

// ─── Detecta contexto dominante do orçamento ─────────────────────────────────
function detectarContexto(texto: string): string {
  const t = norm(texto);
  const eletrica = ["fio", "cabo", "disjuntor", "dj", "conduite", "eletroduto",
    "tomada", "interruptor", "lampada", "quadro", "luminaria", "isolante"].filter(k => t.includes(k)).length;
  const hidraulica = ["joelho", "tubo", "tee", "ralo", "sifao", "registro",
    "cano", "luva", "uniao", "valvula", "caixa", "cavalete"].filter(k => t.includes(k)).length;
  if (eletrica > hidraulica && eletrica >= 2) return "predominantemente ELÉTRICO — priorize produtos elétricos quando houver ambiguidade";
  if (hidraulica > eletrica && hidraulica >= 2) return "predominantemente HIDRÁULICO — priorize produtos hidráulicos quando houver ambiguidade";
  return "misto (hidráulico + elétrico)";
}

// ─── Dicionário de sinônimos ──────────────────────────────────────────────────
// Termos informais → substrings que aparecem no catálogo
// NOTA: os termos de busca são sempre normalizados antes da comparação
const SINONIMOS: [string, string[]][] = [
  // ── Conexões soldáveis / roscáveis ──────────────────────────────
  ["cotovelo", ["joelho"]],
  ["coto", ["joelho"]],
  ["joelho", ["joelho"]],
  ["curva", ["curva", "joelho"]],
  ["te ", ["tee"]],
  ["tee", ["tee"]],
  ["juncao", ["juncao"]],
  ["junta", ["juncao"]],
  ["reducao", ["reducao", "bucha"]],
  ["bucha", ["bucha"]],
  ["luva", ["luva"]],
  ["manga", ["luva"]],
  ["uniao", ["uniao"]],
  ["cap", ["cap", "plug", "tampa"]],
  ["tampao", ["plug", "tampa"]],
  ["tampa", ["tampa", "cap"]],
  ["plug", ["plug"]],
  ["flange", ["flange"]],
  ["niple", ["niple"]],
  ["nipple", ["niple"]],
  ["adaptador", ["adap"]],
  ["adap", ["adap"]],
  ["cruzeta", ["cruzeta"]],
  ["engate", ["engate"]],

  // ── Tubos / barras ───────────────────────────────────────────────
  ["tubo", ["tubo"]],
  ["cano", ["tubo"]],
  ["barra", ["tubo"]],
  ["tudo", ["tubo"]],
  ["br de", ["tubo"]],
  ["vara", ["tubo"]],

  // ── Séries / tipos de PVC ────────────────────────────────────────
  ["esgoto", ["eg", "esgoto", "serie normal"]],
  ["serie normal", ["eg", "serie normal"]],
  ["soldavel", ["sold"]],
  ["pressao", ["sold", "az"]],
  ["agua fria", ["sold", "az"]],
  ["azul", ["az"]],

  // ── Ralos / Sifonados ────────────────────────────────────────────
  ["ralo", ["ralo", "sif", "corpo cx"]],
  ["grelha", ["grelha", "ralo"]],
  ["sifao", ["sifao", "sif"]],
  ["sinfao", ["sifao", "sif"]],
  ["sifam", ["sifao", "sif"]],
  ["sifonado", ["sif", "corpo cx"]],
  ["caixa sifonada", ["corpo cx sif"]],
  ["caixinha", ["corpo cx"]],

  // ── Registros / válvulas ─────────────────────────────────────────
  ["registro", ["reg", "registro"]],
  ["valvula", ["valvula", "reg"]],
  ["registro esfera", ["reg esf"]],
  ["reg esfera", ["reg esf"]],
  ["registro gaveta", ["reg gav"]],
  ["reg gaveta", ["reg gav"]],
  ["registro pressao", ["base pressao", "reg pressao"]],
  ["boia", ["boia", "flutuador"]],
  ["retencao", ["retencao", "check"]],
  ["check", ["check", "retencao"]],
  ["valvula pe", ["valvula pe"]],
  ["pe", ["pe"]],

  // ── Vedação / fixação / acabamento ──────────────────────────────
  ["veda rosca", ["veda rosca"]],
  ["teflon", ["veda rosca"]],
  ["fita veda", ["veda rosca"]],
  ["vedatudo", ["vedatudo", "veda tudo"]],
  ["cola", ["adesivo"]],
  ["adesivo", ["adesivo"]],
  ["cimento", ["adesivo"]],
  ["primer", ["primer"]],
  ["lixa", ["lixa"]],
  ["esponja", ["esponja"]],
  ["estopa", ["estopa"]],
  ["silicone", ["silicone"]],
  ["veda calha", ["veda calha"]],
  ["massa", ["massa"]],

  // ── Rosca / latão / metal ────────────────────────────────────────
  ["latao", ["latao"]],
  ["rosca", ["rosc"]],
  ["roscavel", ["rosc"]],
  ["macho", ["macho"]],
  ["femea", ["femea"]],

  // ── Abastecimento / Hidrômetro / Cavalete ────────────────────────
  ["cavalete", ["cavalete"]],
  ["hidrometro", ["hidrometro"]],
  ["colar", ["colar"]],
  ["abracadeira", ["abracadeira", "colar"]],
  ["selim", ["selim", "colar de tomada"]],
  ["tomada dagua", ["tomada dagua", "tomada de"]],
  ["engate", ["engate"]],

  // ── Caixa d'água / reservatório ──────────────────────────────────
  ["caixa dagua", ["caixa"]],
  ["reservatorio", ["reservatorio", "caixa"]],
  ["torneira boia", ["torneira boia", "boia"]],
  ["torneira", ["torneira"]],

  // ── Elétrica ────────────────────────────────────────────────────────
  ["disjuntor", ["disj"]],     // catálogo usa DISJ, não DISJUNTOR
  ["dijuntor",  ["disj"]],     // typo comum
  ["dijuntro",  ["disj"]],     // typo comum
  ["disjuntro", ["disj"]],     // typo comum
  ["dj",        ["disj"]],     // abreviação
  ["fio", ["fio", "cabo"]],
  ["cabo", ["cabo", "fio"]],
  ["eletroduto", ["eletroduto", "conduite"]],
  ["conduite", ["conduite", "eletroduto"]],
  ["condulete", ["condulete"]],
  ["caixa de luz", ["caixa de luz", "caixa 4x2", "caixa 4x4"]],
  ["caixa 4x2", ["4x2"]],
  ["caixa 4x4", ["4x4"]],
  ["interruptor", ["interruptor"]],
  ["tomada eletrica", ["tomada"]],
  ["espelho", ["espelho"]],
  ["fita isolante", ["fita isolante"]],
  ["quadro", ["quadro"]],
  ["distribuicao", ["distribuicao", "quadro"]],
  ["qdl", ["quadro"]],
  ["qdc", ["quadro"]],
  ["luminaria", ["luminaria"]],
  ["lampada", ["lampada"]],
  ["conector", ["conector"]],
  ["terminal", ["terminal"]],

  // ── Marcas ────────────────────────────────────────────────────────
  ["amanco", ["amanco"]],
  ["tigre", ["tigre"]],
  ["krona", ["krona"]],
  ["plastubos", ["plastubos"]],
  ["nicoll", ["nicoll"]],
  ["fortilit", ["fortilit"]],

  // ── Complementos ─────────────────────────────────────────────────
  ["base", ["base"]],
  ["curto", ["curto"]],
  ["longo", ["longo"]],
  ["compacto", ["compacto"]],
  ["duplo", ["duplo"]],
  ["especial", ["especial"]],
];

// Pré-normaliza termos do dicionário (resolve bug de acentos nos termos de busca)
const SINONIMOS_NORM: [string, string[]][] = SINONIMOS.map(([t, s]) => [norm(t), s]);

// ─── Dicas de autocomplete ────────────────────────────────────────────────────
export const HINTS_MEDIDAS: Record<string, { titulo: string; medidas: string[] }> = {
  joelho:      { titulo: "Joelho / Cotovelo 90°", medidas: ["20mm", "25mm", "32mm", "40mm", "50mm", "60mm", "75mm", "100mm"] },
  cotovelo:    { titulo: "Joelho / Cotovelo 90°", medidas: ["20mm", "25mm", "32mm", "40mm", "50mm", "60mm", "75mm", "100mm"] },
  coto:        { titulo: "Joelho 90°",            medidas: ["20mm", "25mm", "32mm", "40mm", "50mm", "60mm", "75mm", "100mm"] },
  curva:       { titulo: "Curva / Joelho",        medidas: ["20mm", "25mm", "32mm", "40mm", "50mm", "60mm", "75mm", "100mm"] },
  tee:         { titulo: "Tee / T",               medidas: ["20mm", "25mm", "32mm", "40mm", "50mm", "60mm", "75mm", "100mm"] },
  te:          { titulo: "Tee / T",               medidas: ["20mm", "25mm", "32mm", "40mm", "50mm", "60mm", "75mm", "100mm"] },
  tubo:        { titulo: "Tubo / Cano",           medidas: ["20mm", "25mm", "32mm", "40mm", "50mm", "60mm", "75mm", "100mm", "150mm"] },
  cano:        { titulo: "Cano / Tubo",           medidas: ["20mm", "25mm", "32mm", "40mm", "50mm", "60mm", "75mm", "100mm"] },
  luva:        { titulo: "Luva / Manga",          medidas: ["20mm", "25mm", "32mm", "40mm", "50mm", "60mm"] },
  uniao:       { titulo: "União",                 medidas: ["20mm", "25mm", "32mm", "40mm", "50mm"] },
  reducao:     { titulo: "Redução",               medidas: ["25x20", "32x25", "40x25", "40x32", "50x32", "50x40", "60x50", "75x50", "75x60", "100x75"] },
  bucha:       { titulo: "Bucha de Redução",      medidas: ["25x20", "32x25", "40x25", "50x32", "50x40", "60x50", "75x60", "100x75"] },
  adaptador:   { titulo: "Adaptador",             medidas: ['1/2"', '3/4"', '1"', '1.1/4"', '1.1/2"', '2"'] },
  adap:        { titulo: "Adaptador",             medidas: ['1/2"', '3/4"', '1"', '1.1/4"', '1.1/2"', '2"'] },
  registro:    { titulo: "Registro",              medidas: ['1/2"', '3/4"', '1"', '1.1/4"', '1.1/2"', '2"'] },
  engate:      { titulo: "Engate",                medidas: ['1/2"', '3/4"', '1"'] },
  niple:       { titulo: "Niple",                 medidas: ['1/2"', '3/4"', '1"', '1.1/4"', '1.1/2"', '2"'] },
  nipple:      { titulo: "Niple",                 medidas: ['1/2"', '3/4"', '1"', '1.1/4"', '1.1/2"', '2"'] },
  ralo:        { titulo: "Ralo",                  medidas: ["100x100", "150x150", "100x50", "150x100"] },
  sifao:       { titulo: "Sifão",                 medidas: ["40mm", "50mm"] },
  caixa:       { titulo: "Caixa d'água",          medidas: ["500L", "1000L", "2000L", "5000L"] },
  torneira:    { titulo: "Torneira",              medidas: ['1/2"', '3/4"'] },
  fio:         { titulo: "Fio / Cabo",            medidas: ["1.5mm²", "2.5mm²", "4mm²", "6mm²", "10mm²", "16mm²"] },
  cabo:        { titulo: "Cabo Elétrico",         medidas: ["1.5mm²", "2.5mm²", "4mm²", "6mm²", "10mm²", "16mm²"] },
  disjuntor:   { titulo: "Disjuntor",             medidas: ["10A", "16A", "20A", "25A", "32A", "40A", "50A", "63A"] },
  dj:          { titulo: "Disjuntor",             medidas: ["10A", "16A", "20A", "25A", "32A", "40A", "50A", "63A"] },
  conduite:    { titulo: "Conduite / Eletroduto", medidas: ["20mm", "25mm", "32mm", "40mm", "50mm"] },
  eletroduto:  { titulo: "Eletroduto",            medidas: ["20mm", "25mm", "32mm", "40mm", "50mm"] },
  abracadeira: { titulo: "Abraçadeira / Colar",   medidas: ["20mm", "25mm", "32mm", "40mm", "50mm", "60mm", "75mm", "100mm"] },
  cavalete:    { titulo: "Cavalete",              medidas: ['1/2"', '3/4"', '1"'] },
  flange:      { titulo: "Flange",                medidas: ["20mm", "25mm", "32mm", "40mm", "50mm", "60mm", "75mm", "100mm"] },
  plug:        { titulo: "Plug / Tampão",         medidas: ['1/2"', '3/4"', '1"', '1.1/4"', '1.1/2"', '2"'] },
  cap:         { titulo: "Cap / Tampa",           medidas: ["20mm", "25mm", "32mm", "40mm", "50mm", "60mm", "75mm", "100mm"] },
};

// ─── Pré-filtragem do catálogo ────────────────────────────────────────────────
function filtrarCatalogo(texto: string, produtos: ProdutoAPI[]): ProdutoAPI[] {
  const linhas = texto.split("\n").filter(l => l.trim());
  const keywords = new Set<string>();

  for (const linha of linhas) {
    const n = norm(linha);
    const stopwords = new Set(["de", "do", "da", "em", "por", "com", "para", "um", "uma", "o", "a"]);
    const words = n.split(/[\s,°"]+/).filter(w => w.length > 2 && !stopwords.has(w));
    words.forEach(w => keywords.add(w));

    // Dimensões e números
    const dims: string[] = n.match(/\d+[x/]\d+|\d+\s*mm/g) || [];
    dims.forEach(d => keywords.add(d.replace(/\s*mm/, "").replace("x", "")));
    const nums: string[] = n.match(/\b\d{2,3}\b/g) || [];
    nums.forEach(d => keywords.add(d));

    // Sinônimos — usando termos pré-normalizados
    for (const [termo, sinonimos] of SINONIMOS_NORM) {
      if (n.includes(termo)) sinonimos.forEach(s => keywords.add(s));
    }
  }

  // Expande com fuzzy correction (corrige typos como "dijuntor" → "disjuntor")
  const keywordArr = [...expandirComFuzzy(keywords)];

  // Correspondência exata (substring)
  const exactSet = new Set(
    produtos.filter(p => {
      const desc = norm(p.DESCRICAO);
      return keywordArr.some(kw => desc.includes(kw));
    })
  );

  // Fuzzy por palavra do catálogo para keywords que não tiveram match exato
  const unmatchedLong = keywordArr.filter(
    kw => kw.length >= 5 && ![...exactSet].some(p => norm(p.DESCRICAO).includes(kw))
  );

  if (unmatchedLong.length > 0) {
    for (const p of produtos) {
      if (exactSet.has(p)) continue;
      const descWords = norm(p.DESCRICAO).split(/\s+/);
      if (unmatchedLong.some(kw => descWords.some(w => w.length >= 4 && levenshtein(kw, w) <= 2))) {
        exactSet.add(p);
      }
    }
  }

  const result = [...exactSet];
  return result.length > 0 ? result.slice(0, 400) : produtos.slice(0, 300);
}

// ─── Match principal ──────────────────────────────────────────────────────────
export async function matchOrcamentoComIA(
  texto: string,
  produtos: ProdutoAPI[],
  onProgress?: (encontrados: number, total: number, descricaoAtual: string) => void
): Promise<ItemOrcamento[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const produtosFiltrados = filtrarCatalogo(texto, produtos);
  const contexto = detectarContexto(texto);

  const catalogo = produtosFiltrados.map(p => ({
    cod: p.COD_ITEM,
    desc: p.DESCRICAO,
    preco: parseFloat(p.PRECO_VENDA) || 0,
  }));

  const totalItens = contarItens(texto);

  const linhasNumeradas = texto
    .split("\n")
    .filter(l => l.trim().length > 0)
    .map((l, i) => `${i + 1}. ${l.trim()}`)
    .join("\n");

  const prompt = `Você é um assistente de orçamentos da distribuidora Carflax (materiais hidráulicos e elétricos).

CONTEXTO DO ORÇAMENTO: ${contexto}

Lista de itens do usuário (RESPEITE ESTA ORDEM NA RESPOSTA):
"""
${linhasNumeradas}
"""

Catálogo disponível (cod, desc, preco):
${JSON.stringify(catalogo)}

EQUIVALÊNCIAS DE BITOLA (polegadas → mm PVC soldável):
1/2"=20mm | 3/4"=25mm | 1"=32mm | 1.1/4"=40mm | 1.1/2"=50mm | 2"=60mm | 3"=75/85mm | 4"=100/110mm

EQUIVALÊNCIAS DE TERMOS (hidráulica):
- cotovelo/coto/curva 90° → JOELHO | 45° → JOELHO 45
- T/tê → TEE | tubo/cano/barra/vara → TUBO | junção/junta → JUNCAO
- redução/bucha → REDUCAO ou BUCHA RED | luva/manga → LUVA | união → UNIAO
- adap curto → ADAP SOLD CURTO | adap longo → ADAP SOLD LONGO
- ralo sifonado/caixinha → CORPO CX SIF | sifão → SIFAO
- registro esfera plástico → REG ESF SOLD COMPACTO PVC
- registro de pressão/base → BASE PRESSAO | registro gaveta → REG GAV
- válvula retenção/check → VALVULA RETENCAO | torneira boia → TORNEIRA BOIA
- cola/adesivo/cimento PVC → ADESIVO PVC | primer → PRIMER PVC
- veda rosca/teflon/fita veda → VEDA ROSCA | lixa → LIXA FERRO
- niple/nipple → NIPLE ROSCAVEL ou NIPLE LATAO
- abraçadeira/selim → ABRACADEIRA ou COLAR | cavalete → CAVALETE
- cotovelo azul com rosca → JOELHO AZ C/ BUCHA DE LATAO
- T azul com rosca → TEE AZ C/ BUCHA DE LATAO
- plug/cap/tampão → PLUG ROSCAVEL | engate → ENGATE

EQUIVALÊNCIAS (elétrica):
- ATENÇÃO: no catálogo, DISJUNTOR aparece abreviado como "DISJ" (ex: "DISJ UNIPOLAR 20A", "DISJ BIP 20A", "DISJ TRIP 20A")
- dijuntor/disjuntor/DJ/dj → buscar produtos com "DISJ" + amperagem (ex: "dijuntor 20" = "DISJ" + "20A")
- unipolar = 1 polo | bipolar/bip = 2 polos | trifásico/trip = 3 polos (padrão unipolar quando não especificado)
- fio/cabo → FIO ou CABO | conduite/eletroduto → CONDUITE ou ELETRODUTO
- caixa de luz/4x2 → CAIXA LUZ | fita isolante → FITA ISOLANTE
- quadro distribuição/QDL/QDC → QUADRO ou QDL ou QDC (buscar no catálogo)

CATEGORIA: classifique cada item como "hidraulica", "eletrica" ou "outros".

CONFIANÇA: indique 0-100 sobre a certeza do match:
- 90-100: match exato ou equivalência conhecida
- 70-89: match provável com pequena interpretação
- 40-69: match incerto, item genérico ou ambíguo
- 0-39: não encontrado ou muito duvidoso

REGRAS:
1. Quantidade não especificada → use 1
2. Responda na MESMA ORDEM dos itens numerados
3. Se não encontrar (encontrado: false): descricao = nome limpo do produto sem quantidade, confianca: 0, alternativas: até 2 produtos similares do catálogo
4. Se encontrar (encontrado: true): alternativas: []
5. Retorne APENAS JSON válido, sem markdown

Formato exato:
[{"cod_item":"","descricao":"","quantidade":1,"preco_unit":0,"total":0,"encontrado":true,"categoria":"hidraulica","confianca":95,"alternativas":[]}]`;

  const stream = await model.generateContentStream({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } } as never,
  });

  let fullText = "";
  let ultimaDescricao = "";

  for await (const chunk of stream.stream) {
    fullText += chunk.text();
    const encontrados = (fullText.match(/"cod_item"/g) || []).length;
    const allDescs = [...fullText.matchAll(/"descricao"\s*:\s*"([^"]+)"/g)];
    if (allDescs.length > 0) ultimaDescricao = allDescs[allDescs.length - 1][1];
    onProgress?.(encontrados, totalItens, ultimaDescricao);
  }

  const raw = fullText.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(raw);
}
