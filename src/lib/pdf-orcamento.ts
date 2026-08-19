import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { apiCrmOrcamentos } from "./api";

// Configura o worker do PDF.js para Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface ExtractedOrcamento {
  numero: string | null;
  valor: number | null;
  cliente: string | null;
  vendedor: string | null;
  rawText: string;
}

/**
 * Converte valor em formato monetário brasileiro (ex.: "1.433,06" ou "1433.06") para number.
 */
export function parseBrlNumber(valStr: string): number {
  if (!valStr) return 0;
  // Remove R$, espaços e caracteres não numéricos exceto vírgula e ponto
  let clean = valStr.replace(/[^\d.,]/g, "").trim();
  if (!clean) return 0;

  // Se tiver vírgula e ponto (ex.: 1.433,06)
  if (clean.includes(",") && clean.includes(".")) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else if (clean.includes(",")) {
    // Se só tiver vírgula (ex.: 1433,06)
    clean = clean.replace(",", ".");
  }
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

/**
 * Lê todo o texto de um arquivo PDF no navegador usando pdfjs-dist.
 */
export async function extractTextFromPdf(fileOrBuffer: File | ArrayBuffer | Uint8Array): Promise<string> {
  try {
    let data: ArrayBuffer | Uint8Array;
    if (fileOrBuffer instanceof File) {
      data = await fileOrBuffer.arrayBuffer();
    } else {
      data = fileOrBuffer;
    }

    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDoc = await loadingTask.promise;
    let fullText = "";

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      fullText += pageText + "\n";
    }

    return fullText;
  } catch (err) {
    console.error("[PDF] Erro ao extrair texto do PDF:", err);
    return "";
  }
}

/**
 * Analisa o texto do PDF ou nome do arquivo para extrair o número e o valor do orçamento.
 */
export async function parseOrcamentoPdf(
  fileOrBuffer: File | ArrayBuffer | Uint8Array,
  fileName?: string
): Promise<ExtractedOrcamento> {
  const text = await extractTextFromPdf(fileOrBuffer);

  let numero: string | null = null;
  let valor: number | null = null;
  let cliente: string | null = null;
  let vendedor: string | null = null;

  // 1. Tentar extrair o número do orçamento
  // Padrões comuns: "Orçamento de Venda-000001023281", "Orçamento: 1023281", "OR_000001023281"
  const mNumText = text.match(/or[çc]amento(?:\s*de\s*venda)?[\s:–-]*([0-9]{4,})/i);
  if (mNumText) {
    numero = mNumText[1];
  } else if (fileName) {
    const mNumFile = fileName.match(/^OR[_-]([0-9]{4,})/i) || fileName.match(/([0-9]{6,})/);
    if (mNumFile) numero = mNumFile[1];
  }

  // 2. Tentar extrair o valor total do orçamento diretamente do texto do PDF
  // Padrões no documento Carflax:
  // "Total Geral: R$: 1.433,06", "Total Geral: 1.433,06", "Total Geral R$ 1.433,06", "Vl. Bruto: 1.433,06"
  const mTotalGeral =
    text.match(/total\s*geral[\s:–-]*r?\$?[:\s]*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+[.,][0-9]{2})/i) ||
    text.match(/vl\.?\s*bruto[\s:–-]*r?\$?[:\s]*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+[.,][0-9]{2})/i) ||
    text.match(/valor\s*total[\s:–-]*r?\$?[:\s]*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+[.,][0-9]{2})/i);

  if (mTotalGeral) {
    const parsedVal = parseBrlNumber(mTotalGeral[1]);
    if (parsedVal > 0) valor = parsedVal;
  }

  // 3. Extrair Cliente
  const mCli = text.match(/cliente[\s:–-]+([^\n\r]+?)(?=\s*(?:endereço|endereco|município|municipio|cnpj|ie|fone|dados|$))/i);
  if (mCli && mCli[1]) {
    cliente = mCli[1].trim();
  }

  // 4. Extrair Vendedor
  const mVend = text.match(/vendedor[\s:–-]+([^\n\r]+?)(?=\s*(?:válido|valido|data|condição|condicao|$))/i);
  if (mVend && mVend[1]) {
    vendedor = mVend[1].trim();
  }

  // 5. Se encontrou o número do documento, consulta o ERP para validar/enriquecer o valor
  if (numero) {
    try {
      const list = await apiCrmOrcamentos({ documento: numero });
      if (list && list.length > 0) {
        const erpTotal = list.reduce(
          (max, o) => Math.max(max, parseFloat(String(o.VALOR_TOTAL_ORCAMENTO)) || 0),
          0
        );
        if (erpTotal > 0) {
          valor = erpTotal; // Prioriza o valor oficial do ERP se disponível
        }
      }
    } catch {
      // Se a consulta ao ERP falhar, mantém o valor extraído direto do PDF
    }
  }

  return {
    numero,
    valor,
    cliente,
    vendedor,
    rawText: text,
  };
}
