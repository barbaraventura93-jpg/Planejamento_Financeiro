// Extração de texto de faturas em PDF, 100% no navegador (nada é enviado a servidor).
// Reconstrói as linhas agrupando os fragmentos de texto pela coordenada vertical da página
// e respeitando o espaçamento horizontal real (para não espalhar letras nem grudar colunas).

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

const Y_TOLERANCE = 2.5; // fragmentos até essa distância vertical contam como a mesma linha

export const PDF_PASSWORD_NEEDED = "PDF_PASSWORD_NEEDED";
export const PDF_PASSWORD_WRONG = "PDF_PASSWORD_WRONG";

// Linhas de resumo/rodapé/cabeçalho da fatura que têm valor em reais mas NÃO são compras —
// descartadas antes da classificação para não entrarem como lançamentos.
// Ancoradas no início da linha (tolerando uma data como "10/07" ou "10/07/2026" na frente),
// porque esses rótulos abrem a linha; um nome de loja quase nunca começa com essas palavras.
const SUMMARY_TERMS = [
  // Totais e subtotais (o "valor total da fatura" e os totais por seção)
  "totais?\\b",
  "total\\s+(?:desta|dessa|da|de|dos|das|do|a\\s+pagar|geral|nacional|internacional|pago|parcelad|em\\s+aberto|anterior)",
  "sub-?total",
  "valor\\s+(?:total|desta\\s+fatura|da\\s+fatura|a\\s+pagar)",
  // Pagamento mínimo / pagamentos recebidos
  "pagamento\\s+(?:m[ií]nimo|recebido|efetuado|realizado|anterior|em\\s+d[eé]bito)",
  "valor\\s+m[ií]nimo",
  "pag(?:amen)?to\\s+m[ií]nimo",
  "pgto\\b",
  // Saldos
  "saldo\\b",
  // Limites e crédito disponível
  "limite\\b",
  "cr[eé]dito\\s+(?:dispon[ií]vel|rotativo|total|de\\b|em\\s+d[eé]bito)",
  "cr[eé]dito\\s+de\\b",
  "rotativo\\b",
  // Datas de referência da fatura
  "vencimento\\b",
  "fechamento\\b",
  "melhor\\s+dia",
  "data\\s+(?:de\\s+)?vencimento",
  // Encargos financeiros
  "encargos?\\b",
  "juros\\b",
  "iof\\b",
  "multa\\b",
  "mora\\b",
  "cet\\b",
  // Parcelamento/financiamento da própria fatura (não é uma compra nova)
  "parcelamento\\s+d[ao]\\s+fatura",
  "financiamento\\b",
  "refinanciamento\\b",
  // Estornos/ajustes de pagamento (créditos, não cobranças)
  "estorno\\s+de\\s+pagamento",
  // Cabeçalhos de seção que às vezes trazem um subtotal na mesma linha
  "compras\\s+(?:nacionais|internacionais|parceladas)",
  "lan[cç]amentos\\s+(?:nacionais|internacionais|anteriores)",
  "demais\\s+lan[cç]amentos",
];

const SUMMARY_LINE = new RegExp(
  "^\\s*(?:r\\$\\s*)?(?:\\d{2}\\/\\d{2}(?:\\/\\d{2,4})?\\s+)?(?:" + SUMMARY_TERMS.join("|") + ")",
  "i"
);

export function dropSummaryLines(text) {
  return text.split("\n").filter(l => !SUMMARY_LINE.test(l.trim())).join("\n");
}

// Junta os fragmentos de uma linha respeitando o espaço real entre eles: fragmentos colados
// (pedaços da mesma palavra que o pdf.js quebrou) ficam juntos; onde há um vão horizontal
// de verdade, entra um espaço. Isso evita tanto "M E R C A D O" quanto colunas grudadas.
function joinRow(parts) {
  parts.sort((a, b) => a.x - b.x);
  let line = "";
  let prevRight = null;
  for (const pt of parts) {
    if (prevRight !== null) {
      const ref = Math.max(pt.h || 0, 4);
      const gap = pt.x - prevRight;
      // vão maior que ~1/4 da altura da fonte = separação intencional entre palavras/colunas
      if (gap > ref * 0.25) line += " ";
    }
    line += pt.str;
    // largura pode faltar em alguns PDFs; estima pelo tamanho do texto para não grudar tudo
    const w = pt.w || (pt.str.length * (pt.h || 6) * 0.5);
    prevRight = pt.x + w;
  }
  return line.replace(/\s+/g, " ").trim();
}

export async function extractPdfText(arrayBuffer, password) {
  // useSystemFonts evita depender dos arquivos de fontes padrão do pdf.js
  // (desnecessários pra extração de texto — só renderização visual precisa deles)
  const task = getDocument({ data: arrayBuffer, password: password || undefined, useSystemFonts: true });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    if (err && err.name === "PasswordException") {
      throw new Error(password ? PDF_PASSWORD_WRONG : PDF_PASSWORD_NEEDED);
    }
    throw err;
  }
  try {
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const rows = [];
      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue; // ignora fragmentos vazios/só espaço
        const x = item.transform[4];
        const y = item.transform[5];
        let row = rows.find(r => Math.abs(r.y - y) <= Y_TOLERANCE);
        if (!row) { row = { y, parts: [] }; rows.push(row); }
        row.parts.push({ x, str: item.str, w: item.width, h: item.height });
      }
      rows.sort((a, b) => b.y - a.y); // topo da página primeiro
      for (const row of rows) {
        const line = joinRow(row.parts);
        if (line) pages.push(line);
      }
    }
    return pages.join("\n");
  } finally {
    task.destroy();
  }
}
