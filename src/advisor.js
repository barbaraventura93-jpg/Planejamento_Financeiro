// Motor de diagnóstico: lê faturas + renda + reserva + saldo e gera o parecer do "consultor".
// Puro (sem estado, sem rede) — recebe os dados já carregados e devolve insights prontos pra UI.

const fmt = v => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = v => `${v.toFixed(0)}%`;

function normalize(desc) {
  return (desc || "").trim().toUpperCase().replace(/\s*\d{1,2}\/\d{1,2}\s*$/, "").replace(/\s+/g, " ");
}

// tone: "good" (acertando) | "warn" (atenção) | "action" (ajuste sugerido)
function insight(tone, priority, title, detail) {
  return { tone, priority, title, detail };
}

export function buildDiagnostics({ months, config }) {
  const out = [];
  if (!months || months.length === 0) {
    return [insight("action", 0, "Comece registrando uma fatura",
      "Adicione a fatura do último mês (ou cole os lançamentos) e o diagnóstico aparece aqui automaticamente.")];
  }

  const income = Number(config?.monthly_income || 0);
  const goal = Number(config?.emergency_goal || 0);
  const saved = Number(config?.emergency_saved || 0);

  const last = months[months.length - 1];
  const prevs = months.slice(0, -1);
  const avgTotal = months.reduce((a, m) => a + m.total, 0) / months.length;
  const avgInstallment = months.reduce((a, m) => a + (m.installmentsCommitted || 0), 0) / months.length;
  const installmentShare = avgTotal ? (avgInstallment / avgTotal) * 100 : 0;

  // ---------- rotativo (o erro mais caro que existe no cartão) ----------
  if (last.revolvingUsed) {
    out.push(insight("warn", 0, "Rotativo usado no último mês",
      "O rotativo do cartão é a dívida mais cara do mercado (juros acima de 400% a.a.). Prioridade máxima: quitar o valor em aberto antes de qualquer outro objetivo, inclusive antes de guardar para a reserva."));
  } else if (months.slice(-3).every(m => !m.revolvingUsed)) {
    out.push(insight("good", 1, "Sem rotativo",
      "Nenhum uso do rotativo nos últimos meses registrados — você está pagando a fatura cheia, que é a base de tudo."));
  }

  // ---------- renda e taxa de poupança ----------
  if (!income) {
    out.push(insight("action", 1, "Informe sua renda mensal",
      "Sem a renda o diagnóstico fica incompleto: é ela que define se o nível de gasto está saudável ou não."));
  } else {
    const leftover = income - avgTotal;
    const savingsRate = (leftover / income) * 100;
    const faturaShare = (avgTotal / income) * 100;

    if (savingsRate >= 20) {
      out.push(insight("good", 2, `Taxa de poupança de ${pct(savingsRate)}`,
        `Sobram em média ${fmt(leftover)}/mês depois da fatura — acima da referência de 20%. O ponto agora é garantir que essa sobra esteja de fato sendo guardada, não diluída em gastos fora do cartão.`));
    } else if (savingsRate >= 0) {
      out.push(insight("warn", 3, `Taxa de poupança de ${pct(savingsRate)}`,
        `Sobram ${fmt(leftover)}/mês, abaixo da referência de 20% da renda. Não é crítico, mas deixa pouca margem para imprevistos.`));
    } else {
      out.push(insight("warn", 1, "Fatura maior que a renda",
        `A fatura média (${fmt(avgTotal)}) supera a renda informada (${fmt(income)}). Isso significa consumo de reserva ou endividamento — é o principal ponto a atacar.`));
    }

    if (faturaShare > 50 && savingsRate >= 0) {
      out.push(insight("warn", 4, `Cartão consome ${pct(faturaShare)} da renda`,
        "Acima de 50% da renda comprometida com cartão é sinal de orçamento apertado: qualquer imprevisto força parcelamento ou rotativo."));
    }
  }

  // ---------- parcelamentos ----------
  if (installmentShare > 40) {
    out.push(insight("warn", 2, `${pct(installmentShare)} da fatura já nasce comprometida`,
      `Em média ${fmt(avgInstallment)}/mês são parcelas de compras passadas. Com quase metade da fatura pré-definida, o orçamento perde flexibilidade. Sugestão: não assumir novos parcelamentos até essa fatia cair abaixo de 30%.`));
  } else if (installmentShare > 0 && installmentShare <= 25) {
    out.push(insight("good", 4, "Parcelamentos sob controle",
      `Apenas ${pct(installmentShare)} da fatura média vem de parcelas — o grosso do gasto é decisão do mês, o que dá flexibilidade pra ajustar rápido.`));
  }

  // ---------- tendência por categoria (último mês vs média dos anteriores) ----------
  if (prevs.length >= 1) {
    const avgByCat = {};
    for (const m of prevs) {
      for (const [cat, v] of Object.entries(m.byCategory || {})) avgByCat[cat] = (avgByCat[cat] || 0) + v;
    }
    for (const cat of Object.keys(avgByCat)) avgByCat[cat] /= prevs.length;

    const spikes = [];
    const drops = [];
    const cats = new Set([...Object.keys(avgByCat), ...Object.keys(last.byCategory || {})]);
    for (const cat of cats) {
      const now = (last.byCategory || {})[cat] || 0;
      const before = avgByCat[cat] || 0;
      const diff = now - before;
      if (before >= 50 && diff > Math.max(100, before * 0.3)) spikes.push({ cat, now, before, diff });
      if (before >= 100 && -diff > Math.max(80, before * 0.25)) drops.push({ cat, now, before, diff });
    }
    spikes.sort((a, b) => b.diff - a.diff);
    drops.sort((a, b) => a.diff - b.diff);

    if (spikes.length) {
      const s = spikes[0];
      out.push(insight("warn", 3, `${s.cat} subiu ${fmt(s.diff)} no último mês`,
        `Foi de ${fmt(s.before)} (média anterior) para ${fmt(s.now)}. Vale abrir os lançamentos dessa categoria e ver se foi pontual ou um novo padrão.${spikes.length > 1 ? ` Também subiram: ${spikes.slice(1, 3).map(x => x.cat).join(", ")}.` : ""}`));
    }
    if (drops.length) {
      const d = drops[0];
      out.push(insight("good", 3, `${d.cat} caiu ${fmt(-d.diff)}`,
        `De ${fmt(d.before)} (média anterior) para ${fmt(d.now)} — redução real, sem depender de promessa. Mantendo esse nível, são ${fmt(-d.diff * 12)} a mais por ano.`));
    }
  }

  // ---------- assinaturas ----------
  const subMap = {};
  for (const m of months) {
    for (const li of m.lineItems || []) {
      if (li.category !== "Assinaturas") continue;
      const key = normalize(li.description);
      if (!subMap[key]) subMap[key] = { name: li.description, total: 0, count: 0 };
      subMap[key].total += Number(li.value);
      subMap[key].count += 1;
    }
  }
  const subs = Object.values(subMap).map(s => ({ ...s, est: s.total / s.count })).sort((a, b) => b.est - a.est);
  const subsMonthly = subs.reduce((a, s) => a + s.est, 0);
  if (subsMonthly > 0 && (subsMonthly > 150 || (income && subsMonthly / income > 0.05))) {
    out.push(insight("action", 3, `Assinaturas somam ~${fmt(subsMonthly)}/mês (${fmt(subsMonthly * 12)}/ano)`,
      `As maiores: ${subs.slice(0, 4).map(s => `${s.name} (~${fmt(s.est)})`).join(", ")}. Regra prática: cancele qualquer uma que você não usou nos últimos 30 dias — dá pra reassinar em 2 minutos se fizer falta.`));
  }

  // ---------- compras repetidas no último mês (padrão de impulso) ----------
  const merchantCount = {};
  for (const li of last.lineItems || []) {
    if (li.category === "Assinaturas") continue;
    const key = normalize(li.description);
    if (!merchantCount[key]) merchantCount[key] = { name: li.description, count: 0, total: 0 };
    merchantCount[key].count += 1;
    merchantCount[key].total += Number(li.value);
  }
  const repeated = Object.values(merchantCount).filter(x => x.count >= 4).sort((a, b) => b.total - a.total);
  if (repeated.length) {
    const r = repeated[0];
    out.push(insight("warn", 5, `${r.name}: ${r.count}× no mês (${fmt(r.total)})`,
      "Compra recorrente no mesmo lugar costuma ser hábito, não necessidade. Definir um teto semanal pra esse gasto é o ajuste de maior retorno com menor esforço."));
  }

  // ---------- gastos-formiga ----------
  const small = (last.lineItems || []).filter(li => Number(li.value) > 0 && Number(li.value) < 30);
  const smallTotal = small.reduce((a, li) => a + Number(li.value), 0);
  if (small.length >= 8 && smallTotal >= 150) {
    out.push(insight("warn", 6, `${small.length} gastos abaixo de R$ 30 somaram ${fmt(smallTotal)}`,
      "Individualmente parecem irrelevantes, mas juntos viram uma 'assinatura invisível'. Só ter consciência desse total já costuma reduzir esse padrão."));
  }

  // ---------- reserva de emergência ----------
  if (goal > 0) {
    const coverage = avgTotal > 0 ? saved / avgTotal : 0;
    if (saved >= goal) {
      out.push(insight("good", 2, "Reserva de emergência completa",
        `${fmt(saved)} guardados — meta atingida. Próximo passo natural: direcionar a sobra mensal para objetivos de mais longo prazo.`));
    } else if (coverage >= 3) {
      out.push(insight("good", 3, `Reserva cobre ~${coverage.toFixed(1)} meses de fatura`,
        `${fmt(saved)} de ${fmt(goal)} (${pct((saved / goal) * 100)}). Já é um colchão real contra imprevistos.`));
    } else if (income && income - avgTotal > 0) {
      const leftover = income - avgTotal;
      const suggestion = Math.min(leftover * 0.5, goal - saved);
      const monthsToGoal = Math.ceil((goal - saved) / suggestion);
      out.push(insight("action", 2, `Reserva em ${pct(goal ? (saved / goal) * 100 : 0)} da meta`,
        `Guardando metade da sobra média (${fmt(suggestion)}/mês), a meta de ${fmt(goal)} chega em ~${monthsToGoal} meses. Automatizar a transferência no dia do pagamento tira a decisão da força de vontade.`));
    } else {
      out.push(insight("action", 4, "Reserva ainda no começo",
        `${fmt(saved)} de ${fmt(goal)}. Antes de acelerar a reserva, o diagnóstico acima indica onde abrir espaço no orçamento.`));
    }
  }

  // ---------- saldo em conta (quando informado) ----------
  const withBalance = months.filter(m => m.bankBalance !== null && m.bankBalance !== undefined);
  if (withBalance.length >= 2) {
    const b1 = withBalance[withBalance.length - 2].bankBalance;
    const b2 = withBalance[withBalance.length - 1].bankBalance;
    const diff = b2 - b1;
    if (diff < 0 && -diff > Math.max(100, b1 * 0.1)) {
      out.push(insight("warn", 2, `Saldo em conta caiu ${fmt(-diff)}`,
        `De ${fmt(b1)} para ${fmt(b2)} entre os dois últimos meses. Se a fatura está estável, há gasto relevante acontecendo fora do cartão (Pix, débito, boletos) que vale mapear.`));
    } else if (diff > 0) {
      out.push(insight("good", 5, `Saldo em conta subiu ${fmt(diff)}`,
        `De ${fmt(b1)} para ${fmt(b2)} — o mês fechou no positivo de verdade, considerando tudo, não só o cartão.`));
    }
  }

  out.sort((a, b) => a.priority - b.priority);
  return out;
}
