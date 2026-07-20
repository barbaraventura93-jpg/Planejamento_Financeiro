// Ordenação cronológica das faturas a partir do rótulo digitado ("Jul/2026",
// "julho 2026", "07/2026", "jul/26"...). Retorna uma chave numérica (ano*12+mês)
// ou null quando o rótulo não é reconhecido.

const MONTH_INDEX = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };

export function labelToKey(label) {
  const s = (label || "").toLowerCase();
  const name = s.match(/jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez/);
  const year4 = s.match(/(?:19|20)\d{2}/);
  if (name) {
    if (year4) return +year4[0] * 12 + MONTH_INDEX[name[0]];
    const year2 = s.match(/(?:^|\D)(\d{2})(?:\D|$)/);
    if (year2) return (2000 + +year2[1]) * 12 + MONTH_INDEX[name[0]];
    return null;
  }
  const numeric = s.match(/(\d{1,2})\s*\/\s*((?:19|20)?\d{2})/);
  if (numeric && +numeric[1] >= 1 && +numeric[1] <= 12) {
    const year = numeric[2].length === 2 ? 2000 + +numeric[2] : +numeric[2];
    return year * 12 + (+numeric[1] - 1);
  }
  return null;
}

// Ordena preservando a ordem original (de cadastro) entre rótulos não reconhecidos,
// que vão para o fim da lista.
export function sortMonths(months) {
  return months
    .map((m, i) => ({ m, i, key: labelToKey(m.label) }))
    .sort((a, b) => {
      if (a.key === null && b.key === null) return a.i - b.i;
      if (a.key === null) return 1;
      if (b.key === null) return -1;
      return a.key - b.key || a.i - b.i;
    })
    .map(x => x.m);
}
