// Servidor de impressão local (etiquetas-main/server.js → ServidorImpressao.exe),
// rodando no mesmo PC que abre o HUB. Imprime sem a janela do Windows: o
// navegador não consegue, então o HUB manda os dados e o servidor gera o PDF e
// envia para a impressora.
//
// Tem que ser http://localhost: o HUB é https e o navegador só deixa chamar http
// quando é a própria máquina (o servidor responde ao aviso de rede privada do
// Chrome com Access-Control-Allow-Private-Network).

const URL_KEY = "carflax-impressao-local-url";
const IMPRESSORA_KEY = "carflax-impressao-etiqueta-preco";
export const URL_PADRAO = "http://localhost:3001";

export interface EtiquetaPrecoItem {
  cod: string;
  desc: string;
  debit: number;
  credit: number;
  quantidade: number;
}

export interface ImpressoraLocal {
  name: string;
  default: boolean;
}

const ler = (chave: string) => { try { return localStorage.getItem(chave); } catch { return null; } };
const gravar = (chave: string, valor: string) => { try { if (valor) localStorage.setItem(chave, valor); else localStorage.removeItem(chave); } catch { /* sem storage */ } };

export const urlServidorLocal = () => (ler(URL_KEY) || URL_PADRAO).replace(/\/+$/, "");
export const definirUrlServidorLocal = (url: string) => gravar(URL_KEY, url.trim() === URL_PADRAO ? "" : url.trim());

/** Impressora escolhida para a etiqueta de preço; vazio = padrão do Windows. */
export const impressoraEtiquetaPreco = () => ler(IMPRESSORA_KEY) || "";
export const definirImpressoraEtiquetaPreco = (nome: string) => gravar(IMPRESSORA_KEY, nome);

const SEM_SERVIDOR =
  "Servidor de impressão não respondeu. Abra o ServidorImpressao.exe neste computador e tente de novo.";

async function chamar<T>(caminho: string, init?: RequestInit, timeoutMs = 60000): Promise<T> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), timeoutMs);
  let resposta: Response;
  try {
    resposta = await fetch(`${urlServidorLocal()}${caminho}`, { ...init, signal: controle.signal });
  } catch {
    throw new Error(SEM_SERVIDOR);
  } finally {
    clearTimeout(timer);
  }
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok || (dados as { success?: boolean }).success === false) {
    const msg = (dados as { message?: string }).message;
    // Servidor antigo, sem a rota de etiqueta de preço.
    if (resposta.status === 404) throw new Error("Servidor de impressão desatualizado: instale a versão nova do ServidorImpressao.exe.");
    throw new Error(msg || `Erro ${resposta.status} no servidor de impressão.`);
  }
  return dados as T;
}

export async function listarImpressorasLocais(): Promise<ImpressoraLocal[]> {
  const r = await chamar<{ data: ImpressoraLocal[] }>("/impressoras", undefined, 5000);
  return r.data || [];
}

export async function imprimirEtiquetasPreco(itens: EtiquetaPrecoItem[]) {
  return chamar<{ etiquetas: number; paginas: number; impressora: string | null }>("/imprimir-preco", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itens, impressora: impressoraEtiquetaPreco() || undefined }),
  });
}
