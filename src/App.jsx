import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Plus, TrendingUp, AlertTriangle, PiggyBank, CreditCard, Trash2, ChevronDown, ChevronUp, Check, X, Sparkles, Pencil, LogOut, Mail, Target, FileUp, Lock } from "lucide-react";
import { supabase } from "./supabaseClient";
import { buildDiagnostics } from "./advisor";
import { sortMonths } from "./monthOrder";

const NEW_FATURA = "__nova__";
const MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function suggestMonthLabel() {
  const now = new Date();
  return `${MONTH_SHORT[now.getMonth()]}/${now.getFullYear()}`;
}

const C = {
  bg: "#12151C", surface: "#1B1F29", surfaceAlt: "#212633", line: "#2B3140",
  gold: "#C9A24B", goldDim: "#8A7238", text: "#EDEAE1", textDim: "#9098A8",
  textFaint: "#5C6473", red: "#D9704F", redDim: "#4A2E27", green: "#7FA97A", greenDim: "#28352A",
  amber: "#D9B24F", amberDim: "#4A3E27",
};

const CATEGORIES = ["Moradia", "Alimentação", "Vestuário", "Saúde", "Veículos", "Educação", "Hobby/Pets", "Turismo/Entretenimento", "Assinaturas", "Diversos"];
const CAT_COLOR = {
  "Moradia": "#8A9BAE", "Alimentação": "#C9A24B", "Vestuário": "#B98A6B", "Saúde": "#7FA97A",
  "Veículos": "#6B8CB9", "Educação": "#A98AC9", "Hobby/Pets": "#C97A9B",
  "Turismo/Entretenimento": "#D9704F", "Assinaturas": "#5CA0A8", "Diversos": "#7C8494"
};

const RULES = [
  [/odontolog|drogaria|farmacia|clinica|laborator|hospital|saude|dental|fisioterap|dermato|nutrition|nutri|growthsupple|primeformulas|duxnutriti/i, "Saúde", "alta"],
  [/petlove|pet\s?shop|petsupermark|racao|veterinari/i, "Hobby/Pets", "alta"],
  [/alura|hubla|tera\s?trein|udemy|curso|faculdade|escola|educaç/i, "Educação", "alta"],
  [/avianca|gol\s?linhas|latam|hotel|pousada|booking|airbnb|decolar|turismo|passagem/i, "Turismo/Entretenimento", "alta"],
  [/netflix|netflify|amazon\s?prime|amazonprimebr|google\s?one|mcafee|spotify|disney|hbo|paramount|youtube\s?premium|microsoft\s?\*store|adobe/i, "Assinaturas", "alta"],
  [/99food|ifood|rappi|restaurante|lanchonete|padaria|pizzaria|burguer|bar\s|cafe|acai|sushi|churrasc|supermercado|hortifruti|sonda/i, "Alimentação", "média"],
  [/posto|estacionamento|fccpark|nowpark|pedagio|oficina|auto\s?pe(c|ç)a|pneu|ipva|dpvat|multa|combust/i, "Veículos", "alta"],
  [/sodimac|telhanorte|condominio|aluguel\s?(de\s?)?(im[oó]vel|casa|apto)|reforma|moveis\s?planejados|imobiliaria/i, "Moradia", "média"],
  [/shopee|renner|c&a|riachuelo|chilli\s?beans|zara|shein|calcado|vestuario|moda|boutique/i, "Vestuário", "média"],
  [/mercadolivre|mercado\s?pago|paypal|app\s?\*|jim\.com/i, "Diversos", "baixa"],
];

function normalizePattern(description) {
  return (description || "").trim().toUpperCase();
}

function classify(description, overrides = {}) {
  const learned = overrides[normalizePattern(description)];
  if (learned) return { category: learned, confidence: "aprendida" };
  const d = (description || "").toUpperCase();
  for (const [re, cat, conf] of RULES) if (re.test(d)) return { category: cat, confidence: conf };
  return { category: "Diversos", confidence: "baixa" };
}

function parseValue(line) {
  const matches = line.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}/g);
  if (!matches || matches.length === 0) return null;
  return parseFloat(matches[matches.length - 1].replace(/\./g, "").replace(",", "."));
}

function parseLines(raw, overrides = {}) {
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    const value = parseValue(line);
    if (value === null || value === 0) continue;
    let desc = line.replace(/-?\d{1,3}(?:\.\d{3})*,\d{2}/g, "").replace(/^\d{2}\/\d{2}\s*/, "").replace(/\d{2}\/\d{2}$/, "").trim();
    if (!desc) desc = line;
    const { category, confidence } = classify(desc, overrides);
    items.push({ id: "i" + Math.random().toString(36).slice(2), desc, value: Math.abs(value), category, autoCategory: category, confidence });
  }
  return items;
}

function toCSV(months) {
  const rows = [["Mês", "Total", "Comprometido em parcelas", "Rotativo", "Categoria", "Descrição", "Valor"]];
  for (const m of months) {
    if (m.lineItems && m.lineItems.length) {
      for (const li of m.lineItems) {
        rows.push([m.label, m.total, m.installmentsCommitted || 0, m.revolvingUsed ? "sim" : "não", li.category, li.description, li.value]);
      }
    } else {
      rows.push([m.label, m.total, m.installmentsCommitted || 0, m.revolvingUsed ? "sim" : "não", "", "", ""]);
    }
  }
  return rows.map(r => r.map(v => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(";")).join("\n");
}

function downloadCSV(months) {
  const csv = "﻿" + toCSV(months);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mesa-financeiro-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const IDEAS = [
  { t: "Fixo x variável", d: "Separar o que se repete todo mês no mesmo valor (assinaturas, parcelas) do que varia mostra quanto do orçamento é realmente flexível." },
  { t: "Cronograma de quitação dos parcelamentos", d: "Ver a data em que cada parcelamento termina mostra quando o fluxo de caixa 'libera' sozinho." },
  { t: "Limite de crédito utilizado por cartão", d: "Acompanhar isso evita concentrar tudo num cartão só." },
  { t: "Patrimônio líquido (net worth)", d: "Juntar investimentos (Mesa) + reserva + dívidas parceladas num só número dá visão do progresso real." },
  { t: "Alerta de reincidência", d: "Sinalizar quando um lojista/categoria volta a aparecer toda semana ajuda a notar padrões de compra por impulso." },
];

function currency(v) { return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

// ---------------- Auth gate ----------------
function AuthScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function sendLink() {
    setError("");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif" }}>
      <div style={{ maxWidth: 340, width: "100%", padding: 24, textAlign: "center" }}>
        <div className="sans" style={{ fontSize: 11, letterSpacing: "0.18em", color: C.gold, textTransform: "uppercase", marginBottom: 10 }}>Mesa · Financeiro</div>
        <h1 style={{ fontSize: 24, fontWeight: 400, marginBottom: 20 }}>Entrar</h1>
        {sent ? (
          <p className="sans" style={{ fontSize: 13.5, color: C.textDim, lineHeight: 1.6 }}>
            Link enviado para <strong style={{ color: C.gold }}>{email}</strong>. Abra no celular e ele já te loga aqui.
          </p>
        ) : (
          <>
            <input type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)}
              className="sans" style={{ width: "100%", background: C.surface, border: `1px solid ${C.line}`, color: C.text, padding: "10px 12px", borderRadius: 6, fontSize: 14, marginBottom: 12 }} />
            <button onClick={sendLink} className="sans" style={{ width: "100%", background: C.gold, color: C.bg, border: "none", padding: "10px 16px", borderRadius: 6, fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Mail size={15} /> Enviar link de acesso
            </button>
            {error && <p className="sans" style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------- Main app ----------------
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [months, setMonths] = useState([]);
  const [config, setConfig] = useState({ monthly_income: 0, emergency_goal: 30000, emergency_saved: 0 });
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importRaw, setImportRaw] = useState("");
  const [reviewItems, setReviewItems] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfPendingFile, setPdfPendingFile] = useState(null); // PDF protegido aguardando senha
  const [pdfPassword, setPdfPassword] = useState("");
  const [pdfError, setPdfError] = useState("");
  const pdfInputRef = useRef(null);
  const [importTargetMonth, setImportTargetMonth] = useState("");
  const [importNewLabel, setImportNewLabel] = useState("");
  const [form, setForm] = useState({ label: "", total: "", installmentsCommitted: "", bankBalance: "", revolvingUsed: false, notes: "", byCategory: Object.fromEntries(CATEGORIES.map(c => [c, ""])) });
  const [overrides, setOverrides] = useState({});
  const [errorMsg, setErrorMsg] = useState("");
  const [incomeInput, setIncomeInput] = useState("");

  function reportError(context, error) {
    if (!error) return;
    console.error(context, error);
    setErrorMsg(`${context}: ${error.message || "erro desconhecido"}`);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadData = useCallback(async (userId) => {
    const { data: faturas, error: faturasErr } = await supabase.from("faturas").select("*, lancamentos(*)").eq("user_id", userId).order("created_at");
    if (faturasErr) reportError("Erro ao carregar faturas", faturasErr);
    const { data: cfg, error: cfgErr } = await supabase.from("financeiro_config").select("*").eq("user_id", userId).maybeSingle();
    if (cfgErr) reportError("Erro ao carregar configuração", cfgErr);
    const { data: overrideRows, error: overridesErr } = await supabase.from("categoria_overrides").select("*").eq("user_id", userId);
    if (overridesErr) reportError("Erro ao carregar correções aprendidas", overridesErr);
    if (faturas) {
      setMonths(sortMonths(faturas.map(f => {
        const byCategory = {};
        (f.lancamentos || []).forEach(l => { byCategory[l.category] = (byCategory[l.category] || 0) + Number(l.value); });
        return { id: f.id, label: f.label, total: Number(f.total), installmentsCommitted: Number(f.installments_committed || 0), bankBalance: f.bank_balance === null || f.bank_balance === undefined ? null : Number(f.bank_balance), revolvingUsed: f.revolving_used, notes: f.notes, byCategory, lineItems: f.lancamentos || [] };
      })));
    }
    if (cfg) { setConfig(cfg); setIncomeInput(String(cfg.monthly_income ?? "")); }
    if (overrideRows) setOverrides(Object.fromEntries(overrideRows.map(r => [r.pattern, r.category])));
  }, []);

  useEffect(() => {
    if (session === null || session === undefined) return;
    loadData(session.user.id);
  }, [session, loadData]);

  const activeCats = useMemo(() => CATEGORIES.filter(c => months.some(m => (m.byCategory || {})[c] > 0)), [months]);
  const chartData = useMemo(() => months.map(m => {
    const row = { name: m.label.split(" ")[0], Parcelado: Math.round(m.installmentsCommitted || 0) };
    let catSum = 0;
    for (const c of activeCats) {
      const v = Math.round((m.byCategory || {})[c] || 0);
      if (v > 0) { row[c] = v; catSum += v; }
    }
    const rest = Math.round(m.total) - catSum;
    if (rest > 0) row["Não classificado"] = rest;
    return row;
  }), [months, activeCats]);
  const avgTotal = useMemo(() => months.length ? months.reduce((a, m) => a + m.total, 0) / months.length : 0, [months]);
  const avgInstallment = useMemo(() => months.length ? months.reduce((a, m) => a + (m.installmentsCommitted || 0), 0) / months.length : 0, [months]);
  const progress = config.emergency_goal ? Math.min(100, (config.emergency_saved / config.emergency_goal) * 100) : 0;
  const leftover = (config.monthly_income || 0) - avgTotal;
  const savingsRate = config.monthly_income ? (leftover / config.monthly_income) * 100 : null;

  const diagnostics = useMemo(() => buildDiagnostics({ months, config }), [months, config]);

  const subscriptions = useMemo(() => {
    const byPattern = {};
    for (const m of months) {
      for (const li of m.lineItems || []) {
        if (li.category !== "Assinaturas") continue;
        const key = normalizePattern(li.description);
        if (!byPattern[key]) byPattern[key] = { name: li.description, total: 0, count: 0 };
        byPattern[key].total += Number(li.value);
        byPattern[key].count += 1;
      }
    }
    return Object.values(byPattern)
      .map(s => ({ name: s.name, est: s.total / s.count }))
      .sort((a, b) => b.est - a.est);
  }, [months]);

  async function saveConfig(patch) {
    const next = { ...config, ...patch };
    setConfig(next);
    const { error } = await supabase.from("financeiro_config").upsert({ user_id: session.user.id, ...next });
    reportError("Erro ao salvar configuração", error);
  }

  // debounce: só grava a renda no Supabase depois que o usuário para de digitar
  useEffect(() => {
    if (session === null || session === undefined) return;
    const parsed = parseFloat(incomeInput) || 0;
    if (parsed === (config.monthly_income || 0)) return;
    const t = setTimeout(() => { saveConfig({ monthly_income: parsed }); }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeInput]);

  async function upsertOverride(pattern, category) {
    if (!pattern) return;
    setOverrides(prev => ({ ...prev, [pattern]: category }));
    const { error } = await supabase.from("categoria_overrides").upsert({ user_id: session.user.id, pattern, category }, { onConflict: "user_id,pattern" });
    reportError("Erro ao salvar correção de categoria", error);
  }

  async function addMonth() {
    if (!form.label || !form.total || !session) return;
    const payload = {
      user_id: session.user.id, label: form.label, total: parseFloat(form.total),
      installments_committed: parseFloat(form.installmentsCommitted || 0), revolving_used: form.revolvingUsed, notes: form.notes,
    };
    if (form.bankBalance !== "") payload.bank_balance = parseFloat(form.bankBalance);
    const { data, error } = await supabase.from("faturas").insert(payload).select().single();
    if (error || !data) { reportError("Erro ao salvar fatura", error); return; }
    const catRows = Object.entries(form.byCategory).filter(([, v]) => v).map(([cat, v]) => ({
      fatura_id: data.id, user_id: session.user.id, description: "Ajuste manual", value: parseFloat(v), category: cat, confidence: "manual",
    }));
    if (catRows.length) {
      const { error: catErr } = await supabase.from("lancamentos").insert(catRows);
      reportError("Erro ao salvar categorias da fatura", catErr);
    }
    setForm({ label: "", total: "", installmentsCommitted: "", bankBalance: "", revolvingUsed: false, notes: "", byCategory: Object.fromEntries(CATEGORIES.map(c => [c, ""])) });
    setShowForm(false);
    loadData(session.user.id);
  }

  async function removeMonth(id) {
    const { error } = await supabase.from("faturas").delete().eq("id", id);
    if (error) { reportError("Erro ao remover fatura", error); return; }
    setMonths(prev => prev.filter(m => m.id !== id));
  }

  async function removeLineItem(lineItemId) {
    const { error } = await supabase.from("lancamentos").delete().eq("id", lineItemId);
    if (error) { reportError("Erro ao remover lançamento", error); return; }
    loadData(session.user.id);
  }

  async function updateLineItemCategory(lineItem, category) {
    const { error } = await supabase.from("lancamentos").update({ category }).eq("id", lineItem.id);
    if (error) { reportError("Erro ao atualizar categoria do lançamento", error); return; }
    await upsertOverride(normalizePattern(lineItem.description), category);
    loadData(session.user.id);
  }

  function startReview(items) {
    setReviewItems(items);
    setImportNewLabel(suggestMonthLabel());
    // padrão: criar fatura nova (o caso típico é importar a fatura que acabou de chegar)
    setImportTargetMonth(NEW_FATURA);
  }

  function runClassification() {
    const items = parseLines(importRaw, overrides);
    if (items.length) startReview(items);
  }

  async function processPdf(file, password) {
    setPdfBusy(true);
    setPdfError("");
    let pdf;
    try {
      // import dinâmico: o pdf.js (~400 KB) só é baixado quando o recurso é usado
      pdf = await import("./pdfImport");
      const buffer = await file.arrayBuffer(); // relido a cada tentativa: o worker do pdf.js consome o buffer
      const text = await pdf.extractPdfText(buffer, password);
      const items = parseLines(pdf.dropSummaryLines(text), overrides);
      if (!items.length) {
        setPdfError("Não encontrei lançamentos nesse PDF. Se for uma fatura escaneada (imagem), o texto não é extraível — nesse caso, cole os lançamentos manualmente.");
        return;
      }
      setPdfPendingFile(null);
      setPdfPassword("");
      startReview(items);
    } catch (err) {
      if (pdf && err.message === pdf.PDF_PASSWORD_NEEDED) { setPdfPendingFile(file); return; }
      if (pdf && err.message === pdf.PDF_PASSWORD_WRONG) { setPdfPendingFile(file); setPdfError("Senha incorreta — tente de novo (bancos costumam usar os primeiros dígitos do CPF)."); return; }
      console.error("Erro ao ler PDF", err);
      setPdfError("Não consegui ler esse PDF. Você ainda pode colar os lançamentos manualmente.");
    } finally {
      setPdfBusy(false);
    }
  }

  function handlePdfSelected(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
    if (file) processPdf(file, "");
  }

  function updateReviewCategory(id, category) {
    setReviewItems(prev => prev.map(it => it.id === id ? { ...it, category } : it));
  }

  function removeReviewItem(id) {
    setReviewItems(prev => {
      const next = prev.filter(it => it.id !== id);
      return next.length ? next : null;
    });
  }

  const reviewSum = useMemo(() => (reviewItems || []).reduce((a, it) => a + it.value, 0), [reviewItems]);
  const canConfirmImport = !!reviewItems && (importTargetMonth === NEW_FATURA ? importNewLabel.trim() !== "" : importTargetMonth !== "");

  async function confirmImport() {
    if (!reviewItems || !session || !canConfirmImport) return;
    let targetId = importTargetMonth;
    if (targetId === NEW_FATURA) {
      const { data, error } = await supabase.from("faturas").insert({
        user_id: session.user.id, label: importNewLabel.trim(), total: reviewSum,
      }).select().single();
      if (error || !data) { reportError("Erro ao criar a fatura", error); return; }
      targetId = data.id;
    }
    const rows = reviewItems.map(it => ({
      fatura_id: targetId, user_id: session.user.id, description: it.desc, value: it.value, category: it.category, confidence: it.confidence,
    }));
    const { error } = await supabase.from("lancamentos").insert(rows);
    if (error) { reportError("Erro ao importar lançamentos", error); return; }
    const corrections = reviewItems.filter(it => it.category !== it.autoCategory);
    for (const it of corrections) await upsertOverride(normalizePattern(it.desc), it.category);
    setReviewItems(null);
    setImportRaw("");
    setShowImport(false);
    loadData(session.user.id);
  }

  if (session === undefined) return <div style={{ minHeight: "100vh", background: C.bg }} />;
  if (session === null) return <AuthScreen />;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Georgia', 'Iowan Old Style', serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        .sans { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
        .num { font-variant-numeric: tabular-nums; }
        input[type=text], input[type=number], textarea, select {
          background: ${C.bg}; border: 1px solid ${C.line}; color: ${C.text};
          padding: 8px 10px; border-radius: 4px; font-family: inherit; font-size: 14px; width: 100%;
        }
        textarea { font-family: 'SF Mono', Consolas, monospace; font-size: 12.5px; min-height: 120px; resize: vertical; }
        input:focus, textarea:focus, select:focus { outline: 1px solid ${C.gold}; border-color: ${C.gold}; }
        button:focus-visible { outline: 2px solid ${C.gold}; outline-offset: 2px; }
      `}</style>

      <header style={{ borderBottom: `1px solid ${C.line}`, padding: "24px 20px 20px" }}>
        <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="sans" style={{ fontSize: 11, letterSpacing: "0.18em", color: C.gold, textTransform: "uppercase", marginBottom: 6 }}>Mesa · Módulo Financeiro</div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 400 }}>Painel de Faturas</h1>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="sans" style={{ background: "none", border: `1px solid ${C.line}`, color: C.textDim, padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            <LogOut size={13} /> Sair
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: "0 auto", padding: "28px 20px 60px" }}>

        {errorMsg && (
          <div className="sans" style={{ background: C.redDim, border: `1px solid ${C.red}`, borderRadius: 6, padding: "12px 14px", marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 10 }}>
              <AlertTriangle size={16} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: C.text }}>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg("")} aria-label="Fechar aviso" style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}><X size={15} color={C.textDim} /></button>
          </div>
        )}

        <SectionTitle>Diagnóstico do consultor</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          {diagnostics.map((d, i) => <AdvisorItem key={i} d={d} />)}
        </div>

        <SectionTitle>Renda e taxa de poupança</SectionTitle>
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, padding: 18, marginBottom: 28 }}>
          <div className="sans" style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, color: C.textDim }}>
              Renda líquida mensal
              <input type="number" value={incomeInput} onChange={e => setIncomeInput(e.target.value)} placeholder="0,00" style={{ marginTop: 6, maxWidth: 220 }} />
            </label>
          </div>
          {config.monthly_income > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <MiniStat label="Sobra média/mês" value={currency(leftover)} tone={leftover >= 0 ? "good" : "bad"} />
              <MiniStat label="Taxa de poupança" value={`${savingsRate.toFixed(0)}%`} tone={savingsRate >= 20 ? "good" : savingsRate >= 0 ? "neutral" : "bad"} />
              <MiniStat label="Fatura consome" value={`${((avgTotal / config.monthly_income) * 100).toFixed(0)}% da renda`} tone={avgTotal / config.monthly_income > 0.5 ? "bad" : "neutral"} />
            </div>
          ) : (
            <div className="sans" style={{ fontSize: 12.5, color: C.textFaint, fontStyle: "italic" }}>Informe a renda pra ver sua taxa de poupança real.</div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 28 }}>
          <SummaryCard label="Média mensal (fatura total)" value={currency(avgTotal)} icon={<CreditCard size={16} color={C.textDim} />} />
          <SummaryCard label="Média parcelado/comprometido" value={currency(avgInstallment)} icon={<TrendingUp size={16} color={C.textDim} />} />
          <SummaryCard label="Meses registrados" value={String(months.length)} icon={<Check size={16} color={C.textDim} />} />
        </div>

        <SectionTitle>Evolução das faturas</SectionTitle>
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, padding: "18px 12px 8px", marginBottom: 28 }}>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: C.textDim, fontSize: 12 }} axisLine={{ stroke: C.line }} tickLine={false} />
              <YAxis tick={{ fill: C.textDim, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 12.5 }} labelStyle={{ color: C.text }} formatter={(v) => currency(v)} />
              <Legend wrapperStyle={{ fontSize: 11, color: C.textDim }} />
              {activeCats.map(cat => <Bar key={cat} dataKey={cat} stackId="cat" fill={CAT_COLOR[cat]} />)}
              <Bar dataKey="Não classificado" stackId="cat" fill={C.textFaint} />
              <Line type="monotone" dataKey="Parcelado" stroke={C.amber} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: C.amber }} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="sans" style={{ fontSize: 11.5, color: C.textFaint, padding: "0 6px 10px" }}>
            Barras empilhadas por categoria (cinza = parte da fatura sem lançamentos classificados) · linha tracejada = parcelamento comprometido.
          </div>
        </div>

        <SectionTitle>Classificar lançamentos</SectionTitle>
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, padding: 18, marginBottom: 28 }}>
          {!showImport && !reviewItems && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <button onClick={() => setShowImport(true)} className="sans" style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: `1px dashed ${C.goldDim}`, color: C.gold, padding: "12px 16px", borderRadius: 6, cursor: "pointer", fontSize: 14, justifyContent: "center" }}>
                  <Sparkles size={16} /> Colar lançamentos da fatura
                </button>
                <button onClick={() => pdfInputRef.current && pdfInputRef.current.click()} disabled={pdfBusy} className="sans" style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: `1px dashed ${C.goldDim}`, color: C.gold, padding: "12px 16px", borderRadius: 6, cursor: pdfBusy ? "wait" : "pointer", fontSize: 14, justifyContent: "center", opacity: pdfBusy ? 0.6 : 1 }}>
                  <FileUp size={16} /> {pdfBusy ? "Lendo PDF..." : "Enviar PDF da fatura"}
                </button>
                <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf" onChange={handlePdfSelected} style={{ display: "none" }} />
              </div>
              {pdfPendingFile && (
                <div className="sans" style={{ marginTop: 12, background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 6, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8 }}>
                    <Lock size={14} color={C.gold} /> Este PDF é protegido por senha ({pdfPendingFile.name}). A senha é usada só aqui no seu navegador.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input type="password" value={pdfPassword} onChange={e => setPdfPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && pdfPassword) processPdf(pdfPendingFile, pdfPassword); }} placeholder="Senha do PDF" style={{ maxWidth: 200 }} />
                    <button onClick={() => processPdf(pdfPendingFile, pdfPassword)} disabled={pdfBusy || !pdfPassword} className="sans" style={{ background: C.gold, color: C.bg, border: "none", padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Abrir</button>
                    <button onClick={() => { setPdfPendingFile(null); setPdfPassword(""); setPdfError(""); }} className="sans" style={{ background: "none", border: `1px solid ${C.line}`, color: C.textDim, padding: "8px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
                  </div>
                </div>
              )}
              {pdfError && <div className="sans" style={{ marginTop: 10, fontSize: 12.5, color: C.red }}>{pdfError}</div>}
              <div className="sans" style={{ marginTop: 10, fontSize: 11.5, color: C.textFaint }}>
                O PDF é lido inteiramente no seu navegador — nenhum dado sai do seu dispositivo.
              </div>
            </div>
          )}
          {showImport && !reviewItems && (
            <div>
              <textarea value={importRaw} onChange={e => setImportRaw(e.target.value)} placeholder="Cole aqui os lançamentos..." />
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button onClick={runClassification} className="sans" style={{ background: C.gold, color: C.bg, border: "none", padding: "9px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Classificar</button>
                <button onClick={() => { setShowImport(false); setImportRaw(""); }} className="sans" style={{ background: "none", border: `1px solid ${C.line}`, color: C.textDim, padding: "9px 16px", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              </div>
            </div>
          )}
          {reviewItems && (
            <div>
              <div className="sans" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ fontSize: 12.5, color: C.textDim }}>
                  {reviewItems.length} lançamentos · {reviewItems.filter(i => i.confidence === "baixa").length} com confiança baixa (revise).
                </span>
                <span className="num" style={{ fontSize: 14, color: C.gold }}>Soma: {currency(reviewSum)}</span>
              </div>
              <div style={{ maxHeight: 340, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 6 }}>
                {reviewItems.map(it => (
                  <div key={it.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "center", padding: "8px 10px", borderBottom: `1px solid ${C.line}` }} className="sans">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.desc}</div>
                      <div className="num" style={{ fontSize: 11, color: C.textFaint }}>{currency(it.value)}</div>
                    </div>
                    <ConfidenceBadge level={it.confidence} />
                    <select value={it.category} onChange={e => updateReviewCategory(it.id, e.target.value)} style={{ fontSize: 12, padding: "5px 6px", color: CAT_COLOR[it.category] }}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button onClick={() => removeReviewItem(it.id)} aria-label={`Descartar ${it.desc}`} title="Descartar este lançamento" style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                      <X size={13} color={C.textFaint} />
                    </button>
                  </div>
                ))}
              </div>
              <label className="sans" style={{ fontSize: 12.5, color: C.textDim, display: "block", marginTop: 14 }}>
                Destino dos lançamentos:
                <select value={importTargetMonth} onChange={e => setImportTargetMonth(e.target.value)} style={{ marginTop: 6 }}>
                  <option value={NEW_FATURA}>➕ Criar nova fatura</option>
                  {months.map(m => <option key={m.id} value={m.id}>Somar à fatura {m.label}</option>)}
                </select>
              </label>
              {importTargetMonth === NEW_FATURA ? (
                <div className="sans" style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 12.5, color: C.textDim, display: "block" }}>
                    Mês da nova fatura
                    <input type="text" value={importNewLabel} onChange={e => setImportNewLabel(e.target.value)} placeholder="ex: Jul/2026" style={{ marginTop: 6, maxWidth: 200 }} />
                  </label>
                  <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 6 }}>
                    A fatura será criada com total de {currency(reviewSum)} — confira se bate com o valor do PDF antes de confirmar.
                  </div>
                </div>
              ) : (
                (() => {
                  const target = months.find(m => m.id === importTargetMonth);
                  return target ? (
                    <div className="sans" style={{ fontSize: 11.5, color: C.textFaint, marginTop: 8 }}>
                      A fatura {target.label} está registrada com total de {currency(target.total)}; estes lançamentos somam {currency(reviewSum)} (o total registrado não muda — eles entram como detalhamento).
                    </div>
                  ) : null;
                })()
              )}
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
                <button onClick={confirmImport} disabled={!canConfirmImport} className="sans" style={{ background: C.gold, color: C.bg, border: "none", padding: "9px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: canConfirmImport ? "pointer" : "not-allowed", opacity: canConfirmImport ? 1 : 0.45 }}>Confirmar e somar</button>
                <button onClick={() => { setReviewItems(null); setImportRaw(""); setShowImport(false); }} className="sans" style={{ background: "none", border: `1px solid ${C.line}`, color: C.textDim, padding: "9px 16px", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>Descartar</button>
                {!canConfirmImport && <span className="sans" style={{ fontSize: 11.5, color: C.amber }}>Preencha o mês da nova fatura (ou escolha uma existente) pra habilitar.</span>}
              </div>
            </div>
          )}
        </div>

        <SectionTitle>Reserva de emergência</SectionTitle>
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, padding: 18, marginBottom: 28 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }} className="sans">
            <PiggyBank size={18} color={C.gold} />
            <label style={{ fontSize: 13, color: C.textDim }}>Meta
              <input type="number" value={config.emergency_goal || ""} onChange={e => saveConfig({ emergency_goal: parseFloat(e.target.value) || 0 })} style={{ width: 110, marginLeft: 8, display: "inline-block" }} />
            </label>
            <label style={{ fontSize: 13, color: C.textDim }}>Guardado até agora
              <input type="number" value={config.emergency_saved || ""} onChange={e => saveConfig({ emergency_saved: parseFloat(e.target.value) || 0 })} style={{ width: 110, marginLeft: 8, display: "inline-block" }} />
            </label>
          </div>
          <div style={{ height: 10, background: C.bg, borderRadius: 5, overflow: "hidden", border: `1px solid ${C.line}` }}>
            <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg, ${C.goldDim}, ${C.gold})` }} />
          </div>
          <div className="sans num" style={{ fontSize: 12.5, color: C.textDim, marginTop: 8 }}>{currency(config.emergency_saved)} de {currency(config.emergency_goal)} · {progress.toFixed(0)}%</div>
        </div>

        <SectionTitle>Assinaturas identificadas</SectionTitle>
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, padding: 4, marginBottom: 28 }}>
          {subscriptions.length === 0 && (
            <div className="sans" style={{ padding: "12px 14px", fontSize: 12.5, color: C.textFaint, fontStyle: "italic" }}>
              Nenhuma assinatura identificada ainda — lançamentos classificados como "Assinaturas" aparecem aqui.
            </div>
          )}
          {subscriptions.map((s, i) => (
            <div key={s.name} className="sans" style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: i < subscriptions.length - 1 ? `1px solid ${C.line}` : "none", fontSize: 13.5 }}>
              <span>{s.name}</span><span className="num" style={{ color: C.textDim }}>~{currency(s.est)}/mês</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 12px" }}>
          <span style={{ fontSize: 15, color: C.gold, letterSpacing: "0.02em" }}>Faturas registradas</span>
          {months.length > 0 && (
            <button onClick={() => downloadCSV(months)} className="sans" style={{ background: "none", border: `1px solid ${C.line}`, color: C.textDim, padding: "5px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
              Exportar CSV
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {months.slice().reverse().map(m => (
            <MonthCard key={m.id} m={m} expanded={expanded === m.id} onToggle={() => setExpanded(expanded === m.id ? null : m.id)}
              onRemove={() => removeMonth(m.id)} onRemoveLineItem={removeLineItem} onUpdateLineItemCategory={updateLineItemCategory} />
          ))}
          {months.length === 0 && <div className="sans" style={{ color: C.textFaint, fontSize: 13, fontStyle: "italic" }}>Nenhuma fatura ainda — adicione a primeira abaixo.</div>}
        </div>

        {!showForm ? (
          <button onClick={() => setShowForm(true)} className="sans" style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: `1px dashed ${C.goldDim}`, color: C.gold, padding: "12px 16px", borderRadius: 6, cursor: "pointer", fontSize: 14, width: "100%", justifyContent: "center", marginBottom: 28 }}>
            <Plus size={16} /> Adicionar fatura do mês manualmente
          </button>
        ) : (
          <div style={{ background: C.surfaceAlt, border: `1px solid ${C.goldDim}`, borderRadius: 8, padding: 18, marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 400 }}>Nova fatura</h3>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color={C.textDim} /></button>
            </div>
            <div className="sans" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <Field label="Mês (ex: Jul/2026)"><input type="text" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} /></Field>
              <Field label="Total da fatura (R$)"><input type="number" value={form.total} onChange={e => setForm(f => ({ ...f, total: e.target.value }))} /></Field>
              <Field label="Comprometido em parcelas (R$)"><input type="number" value={form.installmentsCommitted} onChange={e => setForm(f => ({ ...f, installmentsCommitted: e.target.value }))} /></Field>
              <Field label="Saldo em conta no fim do mês (R$)"><input type="number" value={form.bankBalance} onChange={e => setForm(f => ({ ...f, bankBalance: e.target.value }))} /></Field>
              <Field label="Caiu no rotativo?">
                <select value={form.revolvingUsed ? "sim" : "nao"} onChange={e => setForm(f => ({ ...f, revolvingUsed: e.target.value === "sim" }))}>
                  <option value="nao">Não</option><option value="sim">Sim</option>
                </select>
              </Field>
            </div>
            <div className="sans" style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>Por categoria (opcional)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 14 }}>
              {CATEGORIES.map(cat => (
                <Field key={cat} label={cat} small><input type="number" value={form.byCategory[cat]} onChange={e => setForm(f => ({ ...f, byCategory: { ...f.byCategory, [cat]: e.target.value } }))} /></Field>
              ))}
            </div>
            <Field label="Notas"><input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></Field>
            <button onClick={addMonth} className="sans" style={{ marginTop: 14, background: C.gold, color: C.bg, border: "none", padding: "10px 20px", borderRadius: 6, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Salvar fatura</button>
          </div>
        )}

        <SectionTitle>O que mais ajudaria o planejamento</SectionTitle>
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
          {IDEAS.map((idea, i) => (
            <div key={i} className="sans" style={{ padding: "12px 16px", borderBottom: i < IDEAS.length - 1 ? `1px solid ${C.line}` : "none" }}>
              <div style={{ fontSize: 13.5, color: C.gold, marginBottom: 3 }}>{idea.t}</div>
              <div style={{ fontSize: 12.5, color: C.textDim, lineHeight: 1.5 }}>{idea.d}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

const ADVISOR_TONE = {
  good: { color: C.green, bg: C.greenDim, label: "Acertando", Icon: Check },
  warn: { color: C.amber, bg: C.amberDim, label: "Atenção", Icon: AlertTriangle },
  action: { color: C.gold, bg: C.surfaceAlt, label: "Ajuste sugerido", Icon: Target },
};

function AdvisorItem({ d }) {
  const t = ADVISOR_TONE[d.tone] || ADVISOR_TONE.action;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderLeft: `3px solid ${t.color}`, borderRadius: 6, padding: "13px 16px", display: "flex", gap: 12 }}>
      <t.Icon size={16} color={t.color} style={{ flexShrink: 0, marginTop: 2 }} />
      <div className="sans" style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
          <span style={{ fontSize: 13.5, color: C.text }}>{d.title}</span>
          <span style={{ fontSize: 10, background: t.bg, color: t.color, padding: "2px 7px", borderRadius: 10, whiteSpace: "nowrap" }}>{t.label}</span>
        </div>
        <div style={{ fontSize: 12.5, color: C.textDim, lineHeight: 1.55 }}>{d.detail}</div>
      </div>
    </div>
  );
}

function ConfidenceBadge({ level }) {
  const map = { alta: { bg: C.greenDim, fg: C.green, label: "alta" }, "média": { bg: C.amberDim, fg: C.amber, label: "média" }, baixa: { bg: C.redDim, fg: C.red, label: "revisar" }, manual: { bg: C.surfaceAlt, fg: C.textDim, label: "manual" }, aprendida: { bg: C.greenDim, fg: C.green, label: "aprendida" } };
  const s = map[level] || map.baixa;
  return <span className="sans" style={{ fontSize: 10, background: s.bg, color: s.fg, padding: "3px 7px", borderRadius: 10, whiteSpace: "nowrap" }}>{s.label}</span>;
}

function MiniStat({ label, value, tone }) {
  const toneColor = tone === "good" ? C.green : tone === "bad" ? C.red : C.amber;
  return (
    <div style={{ background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 12px" }}>
      <div className="sans" style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>{label}</div>
      <div className="num" style={{ fontSize: 16, color: toneColor }}>{value}</div>
    </div>
  );
}

function SummaryCard({ label, value, icon }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, padding: "14px 16px" }}>
      <div className="sans" style={{ display: "flex", alignItems: "center", gap: 6, color: C.textDim, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{icon} {label}</div>
      <div className="num" style={{ fontSize: 20, color: C.text }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 12px" }}>
      <span style={{ fontSize: 15, color: C.gold, letterSpacing: "0.02em" }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: C.line }} />
    </div>
  );
}

function Field({ label, children, small }) {
  return (
    <label className="sans" style={{ display: "block", fontSize: small ? 11 : 12, color: C.textDim }}>{label}<div style={{ marginTop: 4 }}>{children}</div></label>
  );
}

function MonthCard({ m, expanded, onToggle, onRemove, onRemoveLineItem, onUpdateLineItemCategory }) {
  const catEntries = Object.entries(m.byCategory || {});
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [showItems, setShowItems] = useState(false);

  function handleRemoveClick(e) {
    e.stopPropagation();
    if (!confirmingRemove) { setConfirmingRemove(true); return; }
    setConfirmingRemove(false);
    onRemove();
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
      <div onClick={onToggle} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15 }}>{m.label}</span>
          {m.revolvingUsed && <span className="sans" style={{ fontSize: 10.5, background: C.redDim, color: C.red, padding: "2px 7px", borderRadius: 10 }}>rotativo</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="num sans" style={{ fontSize: 15, color: C.gold }}>{currency(m.total)}</span>
          {expanded ? <ChevronUp size={16} color={C.textDim} /> : <ChevronDown size={16} color={C.textDim} />}
        </div>
      </div>
      {expanded && (
        <div className="sans" style={{ padding: "0 16px 16px", fontSize: 13, color: C.textDim, lineHeight: 1.7 }}>
          {m.installmentsCommitted > 0 && <div>Comprometido em parcelas: <span className="num" style={{ color: C.text }}>{currency(m.installmentsCommitted)}</span> ({((m.installmentsCommitted / m.total) * 100).toFixed(0)}% da fatura)</div>}
          {m.bankBalance !== null && m.bankBalance !== undefined && <div>Saldo em conta no fim do mês: <span className="num" style={{ color: C.text }}>{currency(m.bankBalance)}</span></div>}
          {catEntries.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {catEntries.map(([cat, v]) => (
                <div key={cat} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ color: CAT_COLOR[cat] || C.textDim }}>{cat}</span><span className="num">{currency(v)}</span>
                </div>
              ))}
            </div>
          )}
          {m.lineItems && m.lineItems.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button onClick={(e) => { e.stopPropagation(); setShowItems(s => !s); }} className="sans" style={{ background: "none", border: "none", color: C.textFaint, fontSize: 11.5, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
                <Pencil size={11} /> {m.lineItems.length} lançamentos classificados {showItems ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {showItems && (
                <div style={{ marginTop: 8, border: `1px solid ${C.line}`, borderRadius: 6, overflow: "hidden" }}>
                  {m.lineItems.map(li => (
                    <div key={li.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", padding: "7px 10px", borderBottom: `1px solid ${C.line}` }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text }}>{li.description}</div>
                        <div className="num" style={{ fontSize: 10.5, color: C.textFaint }}>{currency(li.value)}</div>
                      </div>
                      <select value={li.category} onChange={e => onUpdateLineItemCategory(li, e.target.value)} onClick={e => e.stopPropagation()} style={{ fontSize: 11.5, padding: "4px 5px", color: CAT_COLOR[li.category] }}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button onClick={(e) => { e.stopPropagation(); onRemoveLineItem(li.id); }} aria-label={`Remover lançamento ${li.description}`} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                        <Trash2 size={12} color={C.textFaint} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {m.notes && <div style={{ marginTop: 10, fontStyle: "italic", color: C.textFaint }}>{m.notes}</div>}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={handleRemoveClick} className="sans" style={{ background: confirmingRemove ? C.redDim : "none", border: `1px solid ${confirmingRemove ? C.red : C.line}`, color: confirmingRemove ? C.red : C.textFaint, padding: "5px 10px", borderRadius: 5, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
              <Trash2 size={12} /> {confirmingRemove ? "Confirmar remoção da fatura?" : "Remover"}
            </button>
            {confirmingRemove && (
              <button onClick={(e) => { e.stopPropagation(); setConfirmingRemove(false); }} className="sans" style={{ background: "none", border: `1px solid ${C.line}`, color: C.textDim, padding: "5px 10px", borderRadius: 5, fontSize: 11.5, cursor: "pointer" }}>
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
