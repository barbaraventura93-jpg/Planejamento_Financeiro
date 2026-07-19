// Extração de texto de faturas em PDF, 100% no navegador (nada é enviado a servidor).
// Reconstrói as linhas agrupando os fragmentos de texto pela coordenada vertical da página.

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

const Y_TOLERANCE = 2.5; // fragmentos até essa distância vertical contam como a mesma linha

export const PDF_PASSWORD_NEEDED = "PDF_PASSWORD_NEEDED";
export const PDF_PASSWORD_WRONG = "PDF_PASSWORD_WRONG";

// Linhas de resumo/rodapé da fatura que não são compras — descartadas antes da classificação.
const SUMMARY_LINE = /^(total|subtotal|saldo|limite|encargos|juros|iof\b|multa|valor\s+m[ií]nimo|vencimento|pagamento\s+(recebido|efetuado|em\s+d[eé]bito)|cr[eé]dito\s+de|estorno\s+de\s+pagamento)/i;

export function dropSummaryLines(text) {
  return text.split("\n").filter(l => !SUMMARY_LINE.test(l.trim())).join("\n");
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
        const str = (item.str || "").trim();
        if (!str) continue;
        const x = item.transform[4];
        const y = item.transform[5];
        let row = rows.find(r => Math.abs(r.y - y) <= Y_TOLERANCE);
        if (!row) { row = { y, parts: [] }; rows.push(row); }
        row.parts.push({ x, str });
      }
      rows.sort((a, b) => b.y - a.y); // topo da página primeiro
      for (const row of rows) {
        row.parts.sort((a, b) => a.x - b.x);
        pages.push(row.parts.map(pt => pt.str).join(" "));
      }
    }
    return pages.join("\n");
  } finally {
    task.destroy();
  }
}
