import jsPDF from "jspdf";

export interface RamalRow {
  name: string;
  ramal?: string;
  department?: string;
  company?: string;
}

// Reduz o nome para as duas primeiras palavras significativas (nomes com 3+
// palavras ficavam pequenos no cartão). Pula partículas (de, da, do...).
// Ex.: "João Paulo Vendramini" → "João Paulo"; "Kelven de Melo" → "Kelven Melo".
const PARTICULAS = new Set(["de", "da", "do", "dos", "das", "e"]);
function nomeCurto(full: string): string {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");
  const primeiro = parts[0];
  const segundo = parts.slice(1).find((p) => !PARTICULAS.has(p.toLowerCase()));
  return segundo ? `${primeiro} ${segundo}` : primeiro;
}

// Layout: vários cartões IDÊNTICOS de ramais numa folha A4 (para recortar).
// Cada cartão tem cabeçalho "RAMAIS" e linhas [ramal | nome].
const COLS = 5;      // cartões por linha
const M = 8;         // margem da folha (mm)
const GAP_X = 3;     // espaço horizontal entre cartões (mm)
const GAP_Y = 4;     // espaço vertical entre cartões (mm)
const HEADER_H = 7;  // altura do cabeçalho do cartão (mm)
const ROW_H = 5;     // altura de cada linha (mm)

const W = 210;
const H = 297;

// Desenha um cartão de ramais em (x, y) com largura cw.
function drawCard(
  doc: jsPDF,
  x: number,
  y: number,
  cw: number,
  entries: { ramal: string; name: string }[]
) {
  const ramalW = cw * 0.3;
  const cardH = HEADER_H + entries.length * ROW_H;

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);

  // Borda externa
  doc.rect(x, y, cw, cardH);

  // Cabeçalho "RAMAIS"
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("RAMAIS", x + cw / 2, y + HEADER_H / 2 + 1.6, { align: "center" });
  doc.line(x, y + HEADER_H, x + cw, y + HEADER_H);

  // Linhas
  let ry = y + HEADER_H;
  for (const e of entries) {
    // Divisória vertical entre ramal e nome
    doc.line(x + ramalW, ry, x + ramalW, ry + ROW_H);

    // Ramal (centralizado, negrito)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(String(e.ramal), x + ramalW / 2, ry + ROW_H / 2 + 1.3, { align: "center" });

    // Nome (centralizado; encolhe a fonte se não couber)
    const nameArea = cw - ramalW - 2;
    let fs = 7.5;
    doc.setFont("helvetica", "bold");
    const nome = e.name.toUpperCase();
    doc.setFontSize(fs);
    while (fs > 4.5 && doc.getTextWidth(nome) > nameArea) {
      fs -= 0.5;
      doc.setFontSize(fs);
    }
    doc.text(nome, x + ramalW + (cw - ramalW) / 2, ry + ROW_H / 2 + 1.3, {
      align: "center",
      maxWidth: nameArea,
    });

    ry += ROW_H;
    // Separador horizontal entre as linhas (a borda externa fecha a última)
    if (ry < y + cardH - 0.01) doc.line(x, ry, x + cw, ry);
  }
}

/**
 * Gera uma folha A4 preenchida com cópias idênticas da lista de ramais
 * (para recortar) e abre numa nova aba. Só inclui quem tem ramal, ordenado
 * por nome.
 */
export function gerarRamaisPDF(rows: RamalRow[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const entries = rows
    .filter((r) => r.ramal && String(r.ramal).trim() !== "")
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"))
    .map((r) => ({ ramal: String(r.ramal).trim(), name: nomeCurto(r.name || "") }));

  if (entries.length === 0) {
    alert("Nenhum colaborador com ramal cadastrado.");
    return;
  }

  const contentW = W - 2 * M;
  const cw = (contentW - (COLS - 1) * GAP_X) / COLS;
  const cardH = HEADER_H + entries.length * ROW_H;

  // Quantas linhas de cartões cabem na altura da folha
  const contentH = H - 2 * M;
  const rowsThatFit = Math.max(1, Math.floor((contentH + GAP_Y) / (cardH + GAP_Y)));

  for (let r = 0; r < rowsThatFit; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = M + c * (cw + GAP_X);
      const y = M + r * (cardH + GAP_Y);
      drawCard(doc, x, y, cw, entries);
    }
  }

  const url = doc.output("bloburl");
  window.open(url, "_blank");
}
