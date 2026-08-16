import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart, Line, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import {
  LayoutDashboard, BookOpen, TrendingUp, Bell, Target, Settings,
  Plus, ArrowUpRight, ArrowDownRight, AlertTriangle, CheckCircle2,
  PiggyBank, Trash2, X, Upload, Download, RotateCcw, Smartphone,
  Sparkles, Check, Search, Filter, Pencil, Copy, FileCheck2, CalendarDays
} from "lucide-react";

// ---------- design tokens ----------
const INK = "#16261F";
const PAPER = "#FAF8F2";
const LINE = "#DED7C4";
const EMERALD = "#1F6F5C";
const EMERALD_SOFT = "#E4EEE9";
const RUST = "#B3452E";
const RUST_SOFT = "#F5E4DE";
const GOLD = "#B98A2E";
const GOLD_SOFT = "#F3E9D3";
const SLATE = "#6B7268";

const CATEGORIES = [
  "Groceries", "Rent", "Utilities", "Transport", "Dining",
  "Entertainment", "Healthcare", "Shopping", "Other"
];

const CAT_COLORS = {
  Groceries: "#1F6F5C", Rent: "#16261F", Utilities: "#5C7A6B",
  Transport: "#B98A2E", Dining: "#B3452E", Entertainment: "#8C6B9E",
  Healthcare: "#3E7CA6", Shopping: "#C77B4B", Other: "#9B9587"
};

const PAY_MODES = ["UPI", "Card", "Cash", "Bank Transfer"];

const DEFAULT_BUDGETS = {
  Groceries: 8000, Rent: 18000, Utilities: 3000, Transport: 3500,
  Dining: 2800, Entertainment: 2000, Healthcare: 1500, Shopping: 4000, Other: 1500
};

const STORAGE_KEY = "incoaudit-phase1-data";
const BACKUP_VERSION = 1;

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", { month: "short" });
}
function fmt(n) {
  return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ---------- merchant -> category inference ----------
const MERCHANT_RULES = [
  { kw: ["swiggy", "zomato", "dominos", "domino's", "kfc", "mcdonald", "starbucks", "cafe", "pizza", "biryani"], cat: "Dining" },
  { kw: ["uber", "ola", "rapido", "irctc", "petrol", "fuel", "metro", "fastag"], cat: "Transport" },
  { kw: ["bigbasket", "big bazaar", "dmart", "grocery", "reliance fresh", "more supermarket", "instamart", "blinkit", "zepto"], cat: "Groceries" },
  { kw: ["amazon", "flipkart", "myntra", "ajio", "meesho"], cat: "Shopping" },
  { kw: ["netflix", "hotstar", "spotify", "prime video", "bookmyshow", "pvr", "inox"], cat: "Entertainment" },
  { kw: ["electricity", "bescom", "water board", "broadband", "airtel", "jio", "vodafone", "gas agency"], cat: "Utilities" },
  { kw: ["apollo", "pharmacy", "hospital", "clinic", "medplus", "1mg"], cat: "Healthcare" },
  { kw: ["landlord", "rent", "housing"], cat: "Rent" },
];
function inferCategory(merchant) {
  const m = String(merchant || "").toLowerCase();
  for (const rule of MERCHANT_RULES) {
    if (rule.kw.some(k => m.includes(k))) return rule.cat;
  }
  return "Other";
}

function linearForecast(values) {
  const n = values.length;
  if (n < 2) return values[0] || 0;
  const xs = values.map((_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (values[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const next = slope * n + intercept;
  return Math.max(0, next);
}

function normalizeTransaction(t) {
  if (!t || typeof t !== "object") return null;
  const amount = Number(t.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const type = t.type === "income" ? "income" : "expense";
  const date = typeof t.date === "string" && t.date ? t.date : new Date().toISOString().slice(0, 10);
  const category = type === "income" ? (t.category || "Salary") : (CATEGORIES.includes(t.category) ? t.category : "Other");

  return {
    id: String(t.id || uid()),
    type,
    amount,
    category,
    date,
    mode: PAY_MODES.includes(t.mode) ? t.mode : "UPI",
    note: String(t.note || "")
  };
}

function normalizeGoals(goals) {
  if (!Array.isArray(goals)) return [];
  return goals.map(g => ({
    id: String(g?.id || uid()),
    name: String(g?.name || "Savings Goal"),
    target: Math.max(0, Number(g?.target) || 0),
    saved: Math.max(0, Number(g?.saved) || 0)
  })).filter(g => g.name && g.target > 0);
}

function normalizeBudgets(budgets) {
  const source = budgets && typeof budgets === "object" ? budgets : {};
  return CATEGORIES.reduce((acc, cat) => {
    const value = Number(source[cat]);
    acc[cat] = Number.isFinite(value) && value >= 0 ? value : DEFAULT_BUDGETS[cat];
    return acc;
  }, {});
}

function loadStoredData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      txns: Array.isArray(parsed.txns) ? parsed.txns.map(normalizeTransaction).filter(Boolean) : [],
      budgets: normalizeBudgets(parsed.budgets),
      goals: normalizeGoals(parsed.goals)
    };
  } catch {
    return null;
  }
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- app ----------
export default function IncoAudit() {
  const stored = useMemo(() => loadStoredData(), []);
  const [tab, setTab] = useState("dashboard");
  const [txns, setTxns] = useState(() => stored?.txns || []);
  const [budgets, setBudgets] = useState(() => stored?.budgets || DEFAULT_BUDGETS);
  const [goals, setGoals] = useState(() => stored?.goals || []);
  const [showAdd, setShowAdd] = useState(false);
  const [showGoal, setShowGoal] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [notice, setNotice] = useState("");
  const [pendingImport, setPendingImport] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ txns, budgets, goals }));
    } catch {
      setNotice("Could not save data to local storage.");
    }
  }, [txns, budgets, goals]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const months = useMemo(() => {
    const set = new Set(txns.map(t => monthKey(new Date(t.date))));
    return Array.from(set).sort();
  }, [txns]);

  const currentMonth = months[months.length - 1];

  const byMonthCategory = useMemo(() => {
    const map = {};
    txns.filter(t => t.type === "expense").forEach(t => {
      const mk = monthKey(new Date(t.date));
      map[mk] = map[mk] || {};
      map[mk][t.category] = (map[mk][t.category] || 0) + t.amount;
    });
    return map;
  }, [txns]);

  const monthlySeries = useMemo(() => months.map(mk => {
    const cats = byMonthCategory[mk] || {};
    const spend = Object.values(cats).reduce((a, b) => a + b, 0);
    const income = txns
      .filter(t => t.type === "income" && monthKey(new Date(t.date)) === mk)
      .reduce((a, b) => a + b.amount, 0);
    return { month: monthLabel(mk), key: mk, spend, income, net: income - spend };
  }), [months, byMonthCategory, txns]);

  const currentCats = byMonthCategory[currentMonth] || {};
  const currentSpend = Object.values(currentCats).reduce((a, b) => a + b, 0);
  const currentIncome = txns
    .filter(t => t.type === "income" && monthKey(new Date(t.date)) === currentMonth)
    .reduce((a, b) => a + b.amount, 0);
  const totalSaved = goals.reduce((a, g) => a + g.saved, 0);

  const pieData = CATEGORIES.map(c => ({ name: c, value: currentCats[c] || 0 })).filter(d => d.value > 0);

  const predictions = useMemo(() => {
    return CATEGORIES.map(cat => {
      const series = months.map(mk => (byMonthCategory[mk] || {})[cat] || 0);
      const next = linearForecast(series);
      const last = series[series.length - 1] || 0;
      const delta = last === 0 ? 0 : ((next - last) / last) * 100;
      return { category: cat, last, next, delta };
    }).sort((a, b) => b.next - a.next);
  }, [months, byMonthCategory]);

  const alerts = useMemo(() => {
    return CATEGORIES.map(cat => {
      const spent = currentCats[cat] || 0;
      const limit = budgets[cat] || 0;
      const pct = limit === 0 ? 0 : (spent / limit) * 100;
      let level = "ok";
      if (pct >= 100) level = "over";
      else if (pct >= 80) level = "risk";
      return { category: cat, spent, limit, pct, level };
    }).filter(a => a.limit > 0);
  }, [currentCats, budgets]);

  const riskAlerts = alerts.filter(a => a.level !== "ok").sort((a, b) => b.pct - a.pct);

  function addTxn(t) {
    setTxns(prev => [{ ...t, id: uid() }, ...prev]);
    setShowAdd(false);
    setNotice("Transaction saved locally.");
  }

  function importBackup(backup, options = {}) {
    const imported = Array.isArray(backup.transactions)
      ? backup.transactions.map(normalizeTransaction).filter(Boolean)
      : [];

    if (!Array.isArray(backup.transactions)) {
      throw new Error("Backup does not contain a valid transactions array.");
    }

    const importedBudgets = backup.budgets ? normalizeBudgets(backup.budgets) : budgets;
    const importedGoals = Array.isArray(backup.goals) ? normalizeGoals(backup.goals) : goals;

    let finalTransactions = imported;
    if (options.excludeDuplicates) {
      const seen = new Set();
      finalTransactions = imported.filter(t => {
        const key = transactionFingerprint(t);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // Backup import remains a REPLACE operation.
    setTxns(finalTransactions);
    setBudgets(importedBudgets);
    setGoals(importedGoals);
    setPendingImport(null);
    setShowBackup(false);
    setNotice(`${finalTransactions.length} transactions restored from backup.`);
  }

  function handleBackupFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const review = validateBackup(parsed);
        setPendingImport({
          ...review,
          fileName: file.name,
          raw: parsed,
          excludeDuplicates: review.duplicateCount > 0
        });
        setShowBackup(false);
      } catch (error) {
        setNotice(`Import failed: ${error.message || "Invalid JSON backup."}`);
      }
    };
    reader.onerror = () => setNotice("Could not read the backup file.");
    reader.readAsText(file);
  }

  function confirmPendingImport() {
    if (!pendingImport) return;
    try {
      importBackup(pendingImport.raw, {
        excludeDuplicates: pendingImport.excludeDuplicates
      });
    } catch (error) {
      setNotice(`Import failed: ${error.message || "Could not import backup."}`);
    }
  }

  function exportBackup() {
    const backup = {
      version: BACKUP_VERSION,
      app: "IncoAudit",
      exportedAt: new Date().toISOString(),
      transactions: txns,
      budgets,
      goals
    };
    downloadJson(
      `incoaudit-backup-${new Date().toISOString().slice(0, 10)}.json`,
      backup
    );
    setNotice("Backup exported.");
  }

  function clearLocalData() {
    const confirmed = window.confirm(
      "Clear all locally stored transactions, budgets and goals? This cannot be undone unless you have a backup."
    );
    if (!confirmed) return;

    setTxns([]);
    setBudgets(DEFAULT_BUDGETS);
    setGoals([]);
    localStorage.removeItem(STORAGE_KEY);
    setNotice("Local data cleared.");
  }

  function updateTxn(updated) {
    setTxns(prev => prev.map(t => t.id === updated.id ? updated : t));
    setNotice("Transaction updated locally.");
  }

  function removeTxn(id) {
    setTxns(prev => prev.filter(t => t.id !== id));
    setNotice("Transaction deleted.");
  }

  function addGoalFn(g) {
    setGoals(prev => [...prev, { ...g, id: uid() }]);
    setShowGoal(false);
    setNotice("Goal saved locally.");
  }

  function contributeGoal(id, amt) {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, saved: g.saved + amt } : g));
  }

  function removeGoal(id) {
    setGoals(prev => prev.filter(g => g.id !== id));
  }

  function updateBudget(cat, val) {
    setBudgets(prev => ({ ...prev, [cat]: val }));
  }

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "ledger", label: "Ledger", icon: BookOpen },
    { id: "predictions", label: "Predictions", icon: TrendingUp },
    { id: "alerts", label: "Alerts", icon: Bell },
    { id: "goals", label: "Goals", icon: Target },
    { id: "settings", label: "Budgets", icon: Settings },
  ];

  return (
    <div style={{
      fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui",
      background: PAPER, color: INK, minHeight: "100%", display: "flex",
      width: "100%"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .sf-mono { font-family: 'IBM Plex Mono', monospace; }
        .sf-display { font-family: 'Fraunces', serif; }
        .sf-navbtn { transition: background .15s ease, color .15s ease; }
        .sf-navbtn:hover { background: ${EMERALD_SOFT}; }
        .sf-card { background: #fff; border: 1px solid ${LINE}; border-radius: 10px; }
        .sf-btn { cursor:pointer; border:none; font-family:inherit; }
        .sf-input { border:1px solid ${LINE}; border-radius:6px; padding:8px 10px; font-family:inherit; font-size:13px; width:100%; box-sizing:border-box; background:#fff; color:${INK}; }
        .sf-input:focus { outline:2px solid ${EMERALD}; outline-offset:1px; }
        ::-webkit-scrollbar { width:8px; height:8px; }
        ::-webkit-scrollbar-thumb { background:${LINE}; border-radius:4px; }
      `}</style>

      <div style={{
        width: 210, borderRight: `1px solid ${LINE}`, padding: "22px 14px",
        display: "flex", flexDirection: "column", gap: 4, flexShrink: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px 20px" }}>
          <img src="/incoaudit-icon.svg" alt="IncoAudit" width={30} height={30} style={{ borderRadius: 7, flexShrink: 0 }} />
          <div>
            <div className="sf-display" style={{ fontSize: 15, fontWeight: 600, lineHeight: 1 }}>IncoAudit</div>
            <div style={{ fontSize: 9, letterSpacing: "0.12em", color: SLATE, textTransform: "uppercase" }}>Verified Money Tracking</div>
          </div>
        </div>
        {NAV.map(n => {
          const Icon = n.icon;
          const active = tab === n.id;
          return (
            <button key={n.id} className="sf-navbtn sf-btn" onClick={() => setTab(n.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 10px",
                borderRadius: 7, background: active ? EMERALD_SOFT : "transparent",
                color: active ? EMERALD : INK, fontSize: 13.5, fontWeight: active ? 600 : 500,
                textAlign: "left"
              }}>
              <Icon size={15} />
              {n.label}
              {n.id === "alerts" && riskAlerts.length > 0 && (
                <span style={{
                  marginLeft: "auto", background: RUST, color: "#fff", fontSize: 10,
                  borderRadius: 20, padding: "1px 6px", fontFamily: "'IBM Plex Mono', monospace"
                }}>{riskAlerts.length}</span>
              )}
            </button>
          );
        })}
        <div style={{ marginTop: "auto", padding: "10px 8px", fontSize: 10.5, color: SLATE, lineHeight: 1.5 }}>
          IncoAudit · local data
        </div>
      </div>

      <div style={{ flex: 1, padding: "26px 32px", minWidth: 0 }}>
        {notice && (
          <div style={{
            position: "fixed", right: 24, top: 20, zIndex: 100,
            background: INK, color: PAPER, padding: "10px 14px", borderRadius: 8,
            fontSize: 12.5, boxShadow: "0 8px 30px rgba(0,0,0,.12)"
          }}>
            {notice}
          </div>
        )}

        {tab === "dashboard" && (
          <Dashboard {...{ currentIncome, currentSpend, totalSaved, monthlySeries, pieData, riskAlerts, txns, setShowAdd }} />
        )}
        {tab === "ledger" && (
          <Ledger {...{ txns, setShowAdd, removeTxn, setShowBackup, updateTxn }} />
        )}
        {tab === "predictions" && <Predictions predictions={predictions} monthlySeries={monthlySeries} />}
        {tab === "alerts" && <Alerts alerts={alerts} />}
        {tab === "goals" && <Goals {...{ goals, setShowGoal, contributeGoal, removeGoal }} />}
        {tab === "settings" && (
          <BudgetSettings
            budgets={budgets}
            updateBudget={updateBudget}
            onImport={() => setShowBackup(true)}
            onExport={exportBackup}
            onClear={clearLocalData}
          />
        )}
      </div>

      {showAdd && <AddTxnModal onClose={() => setShowAdd(false)} onAdd={addTxn} />}
      {showGoal && <AddGoalModal onClose={() => setShowGoal(false)} onAdd={addGoalFn} />}
      {showBackup && (
        <BackupModal
          onClose={() => setShowBackup(false)}
          onImport={() => fileInputRef.current?.click()}
          onExport={exportBackup}
        />
      )}
      {pendingImport && (
        <ImportReviewModal
          review={pendingImport}
          onChange={setPendingImport}
          onClose={() => setPendingImport(null)}
          onConfirm={confirmPendingImport}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleBackupFile}
        style={{ display: "none" }}
      />
    </div>
  );
}

function SectionTitle({ eyebrow, title, action }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
      <div>
        <div style={{ fontSize: 10.5, letterSpacing: "0.14em", color: SLATE, textTransform: "uppercase", marginBottom: 4 }}>{eyebrow}</div>
        <div className="sf-display" style={{ fontSize: 24, fontWeight: 600 }}>{title}</div>
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, sub, tone }) {
  const color = tone === "up" ? EMERALD : tone === "down" ? RUST : INK;
  return (
    <div className="sf-card" style={{ padding: "16px 18px", flex: 1 }}>
      <div style={{ fontSize: 11, color: SLATE, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div className="sf-mono" style={{ fontSize: 22, fontWeight: 600, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: SLATE, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Dashboard({ currentIncome, currentSpend, totalSaved, monthlySeries, pieData, riskAlerts, txns, setShowAdd }) {
  const net = currentIncome - currentSpend;
  const recent = txns.slice(0, 6);
  return (
    <div>
      <SectionTitle eyebrow="Overview · This month" title="Dashboard"
        action={<button className="sf-btn" onClick={() => setShowAdd(true)} style={{
          display: "flex", alignItems: "center", gap: 6, background: INK, color: PAPER,
          padding: "9px 14px", borderRadius: 7, fontSize: 13, fontWeight: 500
        }}><Plus size={14} /> Log transaction</button>} />

      <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
        <StatCard label="Income" value={fmt(currentIncome)} tone="up" />
        <StatCard label="Spend" value={fmt(currentSpend)} tone="down" />
        <StatCard label="Net cashflow" value={fmt(net)} tone={net >= 0 ? "up" : "down"} sub={net >= 0 ? "positive" : "over income"} />
        <StatCard label="Total saved" value={fmt(totalSaved)} sub="across goals" />
      </div>

      {txns.length === 0 ? (
        <div className="sf-card" style={{ padding: 28, marginBottom: 20, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 7 }}>Your ledger is empty</div>
          <div style={{ fontSize: 12.5, color: SLATE, lineHeight: 1.6 }}>
            Import a transaction backup to populate IncoAudit, or log a transaction manually.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
          <div className="sf-card" style={{ flex: 1.4, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Cashflow trend</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlySeries}>
                <CartesianGrid stroke={LINE} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: SLATE }} axisLine={{ stroke: LINE }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} width={50} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${LINE}` }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="income" stroke={EMERALD} strokeWidth={2} dot={false} name="Income" />
                <Line type="monotone" dataKey="spend" stroke={RUST} strokeWidth={2} dot={false} name="Spend" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="sf-card" style={{ flex: 1, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Category split</div>
            {pieData.length === 0 ? (
              <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: SLATE, fontSize: 12 }}>
                No expense data for the current month.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={78} paddingAngle={2}>
                    {pieData.map((d, i) => <Cell key={i} fill={CAT_COLORS[d.name]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${LINE}` }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 14 }}>
        <div className="sf-card" style={{ flex: 1.4, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Recent ledger entries</div>
          {recent.length === 0
            ? <div style={{ fontSize: 12.5, color: SLATE }}>No transactions yet.</div>
            : recent.map(t => <LedgerRow key={t.id} t={t} />)}
        </div>
        <div className="sf-card" style={{ flex: 1, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <Bell size={14} /> Alerts needing attention
          </div>
          {riskAlerts.length === 0 && <div style={{ fontSize: 12.5, color: SLATE }}>All categories within budget.</div>}
          {riskAlerts.slice(0, 5).map(a => (
            <div key={a.category} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${LINE}`, fontSize: 12.5 }}>
              <span>{a.category}</span>
              <span className="sf-mono" style={{ color: a.level === "over" ? RUST : GOLD, fontWeight: 600 }}>{Math.round(a.pct)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LedgerRow({ t, onDelete, onEdit }) {
  const isIncome = t.type === "income";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${LINE}` }}>
      <div style={{
        width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
        background: isIncome ? EMERALD_SOFT : (CAT_COLORS[t.category] || SLATE) + "22",
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        {isIncome ? <ArrowUpRight size={13} color={EMERALD} /> : <ArrowDownRight size={13} color={CAT_COLORS[t.category] || SLATE} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{isIncome ? (t.note || "Income") : t.category}</div>
        <div style={{ fontSize: 10.5, color: SLATE }}>{t.date} · {t.mode}{t.note && !isIncome ? " · " + t.note : ""}</div>
      </div>
      <div className="sf-mono" style={{ fontSize: 13, fontWeight: 600, color: isIncome ? EMERALD : INK }}>
        {isIncome ? "+" : "−"}{fmt(t.amount)}
      </div>
      {onEdit && (
        <button className="sf-btn" onClick={onEdit} title="Edit transaction" style={{ background: "none", color: SLATE, padding: 4 }}>
          <Pencil size={13} />
        </button>
      )}
      {onDelete && (
        <button className="sf-btn" onClick={() => onDelete(t.id)} title="Delete transaction" style={{ background: "none", color: SLATE, padding: 4 }}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function Ledger({ txns, setShowAdd, removeTxn, setShowBackup, updateTxn }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [mode, setMode] = useState("All");
  const [type, setType] = useState("All");
  const [month, setMonth] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState(null);

  const months = useMemo(() => {
    return Array.from(new Set(txns.map(t => String(t.date || "").slice(0, 7))))
      .filter(Boolean)
      .sort()
      .reverse();
  }, [txns]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return txns.filter(t => {
      const haystack = `${t.category || ""} ${t.note || ""} ${t.mode || ""} ${t.date || ""}`.toLowerCase();
      return (!q || haystack.includes(q))
        && (category === "All" || t.category === category)
        && (mode === "All" || t.mode === mode)
        && (type === "All" || t.type === type)
        && (month === "All" || String(t.date || "").startsWith(month));
    });
  }, [txns, query, category, mode, type, month]);

  function clearFilters() {
    setQuery("");
    setCategory("All");
    setMode("All");
    setType("All");
    setMonth("All");
  }

  return (
    <div>
      <SectionTitle
        eyebrow={`${filtered.length} shown · ${txns.length} total`}
        title="Digital Ledger"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button className="sf-btn" onClick={() => setShowBackup(true)} style={{
              display: "flex", alignItems: "center", gap: 6, background: EMERALD_SOFT, color: EMERALD,
              padding: "9px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600
            }}><Upload size={14} /> Import backup</button>
            <button className="sf-btn" onClick={() => setShowAdd(true)} style={{
              display: "flex", alignItems: "center", gap: 6, background: INK, color: PAPER,
              padding: "9px 14px", borderRadius: 7, fontSize: 13, fontWeight: 500
            }}><Plus size={14} /> Log transaction</button>
          </div>
        }
      />

      <div className="sf-card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} color={SLATE} style={{ position: "absolute", left: 10, top: 10 }} />
            <input
              className="sf-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search category, merchant/note, date or payment mode..."
              style={{ paddingLeft: 30 }}
            />
          </div>
          <button className="sf-btn" onClick={() => setShowFilters(v => !v)} style={{
            display: "flex", alignItems: "center", gap: 6, background: showFilters ? EMERALD_SOFT : "#F2F0E9",
            color: showFilters ? EMERALD : INK, padding: "8px 11px", borderRadius: 6, fontSize: 12, fontWeight: 600
          }}><Filter size={14} /> Filters</button>
        </div>

        {showFilters && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 10 }}>
            <select className="sf-input" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="All">All categories</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <select className="sf-input" value={mode} onChange={e => setMode(e.target.value)}>
              <option value="All">All payment modes</option>
              {PAY_MODES.map(m => <option key={m}>{m}</option>)}
            </select>
            <select className="sf-input" value={type} onChange={e => setType(e.target.value)}>
              <option value="All">Income + expense</option>
              <option value="expense">Expenses</option>
              <option value="income">Income</option>
            </select>
            <select className="sf-input" value={month} onChange={e => setMonth(e.target.value)}>
              <option value="All">All months</option>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)} {m.slice(0, 4)}</option>)}
            </select>
            <button className="sf-btn" onClick={clearFilters} style={{
              gridColumn: "1 / -1", justifySelf: "start", background: "none", color: SLATE,
              padding: "4px 0", fontSize: 11.5
            }}>Clear filters</button>
          </div>
        )}
      </div>

      <div className="sf-card" style={{ padding: 18, maxHeight: 560, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 28, textAlign: "center", color: SLATE, fontSize: 12.5 }}>
            {txns.length === 0 ? "No transactions loaded. Import a backup file to restore transactions." : "No transactions match your filters."}
          </div>
        ) : (
          filtered.slice(0, 500).map(t => (
            <LedgerRow
              key={t.id}
              t={t}
              onDelete={removeTxn}
              onEdit={() => setEditing(t)}
            />
          ))
        )}
        {filtered.length > 500 && (
          <div style={{ marginTop: 10, color: SLATE, fontSize: 11 }}>Showing first 500 matching entries.</div>
        )}
      </div>

      {editing && (
        <EditTxnModal
          txn={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => { updateTxn(updated); setEditing(null); }}
        />
      )}
    </div>
  );
}

function Predictions({ predictions }) {
  const totalNext = predictions.reduce((a, p) => a + p.next, 0);
  const totalLast = predictions.reduce((a, p) => a + p.last, 0);
  return (
    <div>
      <SectionTitle eyebrow="Predictive Analytics Engine" title="Next Month Forecast" />
      <div className="sf-card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 24, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: SLATE, textTransform: "uppercase" }}>Last month spend</div>
            <div className="sf-mono" style={{ fontSize: 20, fontWeight: 600 }}>{fmt(totalLast)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: SLATE, textTransform: "uppercase" }}>Projected next month</div>
            <div className="sf-mono" style={{ fontSize: 20, fontWeight: 600, color: totalNext > totalLast ? RUST : EMERALD }}>{fmt(totalNext)}</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={predictions}>
            <CartesianGrid stroke={LINE} vertical={false} />
            <XAxis dataKey="category" tick={{ fontSize: 10, fill: SLATE }} axisLine={{ stroke: LINE }} tickLine={false} angle={-20} textAnchor="end" height={55} />
            <YAxis tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} width={50} />
            <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${LINE}` }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="last" fill={LINE} name="Last month" radius={[4, 4, 0, 0]} />
            <Bar dataKey="next" fill={EMERALD} name="Predicted" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="sf-card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: EMERALD_SOFT, textAlign: "left" }}>
              <th style={{ padding: "10px 16px" }}>Category</th>
              <th style={{ padding: "10px 16px" }}>Last month</th>
              <th style={{ padding: "10px 16px" }}>Predicted next</th>
              <th style={{ padding: "10px 16px" }}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {predictions.map(p => (
              <tr key={p.category} style={{ borderTop: `1px solid ${LINE}` }}>
                <td style={{ padding: "9px 16px", fontWeight: 500 }}>{p.category}</td>
                <td className="sf-mono" style={{ padding: "9px 16px" }}>{fmt(p.last)}</td>
                <td className="sf-mono" style={{ padding: "9px 16px", fontWeight: 600 }}>{fmt(p.next)}</td>
                <td style={{ padding: "9px 16px" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    color: p.delta > 3 ? RUST : p.delta < -3 ? EMERALD : SLATE, fontWeight: 600
                  }}>
                    {p.delta > 3 ? <ArrowUpRight size={12} /> : p.delta < -3 ? <ArrowDownRight size={12} /> : null}
                    {p.delta > 0 ? "+" : ""}{p.delta.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: SLATE, marginTop: 10, lineHeight: 1.6 }}>
        Forecast uses a least-squares trend line over your logged monthly history per category.
      </div>
    </div>
  );
}

function Alerts({ alerts }) {
  const sorted = [...alerts].sort((a, b) => b.pct - a.pct);
  return (
    <div>
      <SectionTitle eyebrow="Smart Alert Verification" title="Budget Alerts" />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map(a => {
          const over = a.level === "over";
          const risk = a.level === "risk";
          const color = over ? RUST : risk ? GOLD : EMERALD;
          const bg = over ? RUST_SOFT : risk ? GOLD_SOFT : EMERALD_SOFT;
          return (
            <div key={a.category} className="sf-card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%", background: bg, display: "flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0
              }}>
                {over || risk ? <AlertTriangle size={16} color={color} /> : <CheckCircle2 size={16} color={color} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{a.category}</span>
                  <span className="sf-mono" style={{ fontSize: 12.5, color }}>{fmt(a.spent)} / {fmt(a.limit)}</span>
                </div>
                <div style={{ height: 6, background: LINE, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, a.pct)}%`, background: color }} />
                </div>
              </div>
              <div style={{ fontSize: 11, color, fontWeight: 600, width: 78, textAlign: "right" }}>
                {over ? "OVER BUDGET" : risk ? "NEARING LIMIT" : "ON TRACK"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Goals({ goals, setShowGoal, contributeGoal, removeGoal }) {
  return (
    <div>
      <SectionTitle eyebrow="Savings & Milestones" title="Goals"
        action={<button className="sf-btn" onClick={() => setShowGoal(true)} style={{
          display: "flex", alignItems: "center", gap: 6, background: INK, color: PAPER,
          padding: "9px 14px", borderRadius: 7, fontSize: 13, fontWeight: 500
        }}><Plus size={14} /> New goal</button>} />
      {goals.length === 0 ? (
        <div className="sf-card" style={{ padding: 28, textAlign: "center", color: SLATE, fontSize: 12.5 }}>
          No savings goals yet. Create one to start tracking progress.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {goals.map(g => {
            const pct = Math.min(100, (g.saved / g.target) * 100);
            const done = pct >= 100;
            return (
              <div key={g.id} className="sf-card" style={{ padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%", background: GOLD_SOFT,
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}><PiggyBank size={15} color={GOLD} /></div>
                    <div style={{ fontSize: 14.5, fontWeight: 600 }}>{g.name}</div>
                  </div>
                  <button className="sf-btn" onClick={() => removeGoal(g.id)} style={{ background: "none", color: SLATE, padding: 4 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="sf-mono" style={{ fontSize: 12.5, marginBottom: 6, color: SLATE }}>
                  {fmt(g.saved)} of {fmt(g.target)} {done && "· complete"}
                </div>
                <div style={{ height: 8, background: LINE, borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: done ? EMERALD : GOLD }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="sf-btn" onClick={() => contributeGoal(g.id, 1000)} style={{
                    fontSize: 12, background: EMERALD_SOFT, color: EMERALD, padding: "6px 10px", borderRadius: 6, fontWeight: 500
                  }}>+ ₹1,000</button>
                  <button className="sf-btn" onClick={() => contributeGoal(g.id, 5000)} style={{
                    fontSize: 12, background: EMERALD_SOFT, color: EMERALD, padding: "6px 10px", borderRadius: 6, fontWeight: 500
                  }}>+ ₹5,000</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BudgetSettings({ budgets, updateBudget, onImport, onExport, onClear }) {
  return (
    <div>
      <SectionTitle eyebrow="User & Budget Onboarding" title="Category Budgets" />
      <div className="sf-card" style={{ padding: 18 }}>
        {CATEGORIES.map(cat => (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: CAT_COLORS[cat] }} />
            <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{cat}</div>
            <div className="sf-mono" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              ₹<input type="number" value={budgets[cat]} onChange={e => updateBudget(cat, Number(e.target.value))}
                className="sf-input" style={{ width: 100 }} />
            </div>
          </div>
        ))}
      </div>

      <div className="sf-card" style={{ padding: 18, marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Local data & backups</div>
        <div style={{ fontSize: 11.5, color: SLATE, lineHeight: 1.5, marginBottom: 14 }}>
          Transactions, budgets and goals are saved in this browser. Backup files let you move or restore your data.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button className="sf-btn" onClick={onImport} style={{
            display: "flex", alignItems: "center", gap: 6, background: EMERALD_SOFT, color: EMERALD,
            padding: "9px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600
          }}><Upload size={14} /> Import backup</button>
          <button className="sf-btn" onClick={onExport} style={{
            display: "flex", alignItems: "center", gap: 6, background: INK, color: PAPER,
            padding: "9px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 500
          }}><Download size={14} /> Export backup</button>
          <button className="sf-btn" onClick={onClear} style={{
            display: "flex", alignItems: "center", gap: 6, background: RUST_SOFT, color: RUST,
            padding: "9px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600
          }}><RotateCcw size={14} /> Clear local data</button>
        </div>
      </div>
    </div>
  );
}

function BackupModal({ onClose, onImport, onExport }) {
  return (
    <ModalShell title="Transaction backup" onClose={onClose}>
      <div style={{ fontSize: 12, color: SLATE, marginBottom: 14, lineHeight: 1.6 }}>
        Importing a backup <b>replaces</b> the current local data. This means only the transactions contained in the uploaded backup will appear in the ledger.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <button className="sf-btn" onClick={onImport} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          background: EMERALD, color: "#fff", padding: "10px 12px", borderRadius: 7,
          fontSize: 13, fontWeight: 600
        }}><Upload size={14} /> Choose backup JSON</button>

        <button className="sf-btn" onClick={onExport} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          background: INK, color: PAPER, padding: "10px 12px", borderRadius: 7,
          fontSize: 13, fontWeight: 500
        }}><Download size={14} /> Export current backup</button>
      </div>

      <div style={{ marginTop: 14, padding: 10, background: GOLD_SOFT, borderRadius: 7, fontSize: 11, color: INK, lineHeight: 1.5 }}>
        Backup format: JSON · version {BACKUP_VERSION}
      </div>
    </ModalShell>
  );
}


function transactionFingerprint(t) {
  return [
    t.type || "",
    Number(t.amount) || 0,
    t.category || "",
    t.date || "",
    t.mode || "",
    String(t.note || "").trim().toLowerCase()
  ].join("|");
}

function validateBackup(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The file is not a valid JSON object.");
  }
  if (!Array.isArray(parsed.transactions)) {
    throw new Error("This file is missing the transactions array.");
  }
  if (parsed.app && parsed.app !== "IncoAudit") {
    throw new Error("This backup belongs to a different application.");
  }

  const rawTransactions = parsed.transactions;
  const normalized = rawTransactions.map(normalizeTransaction);
  const validTransactions = normalized.filter(Boolean);
  const invalidCount = normalized.length - validTransactions.length;

  const seen = new Set();
  let duplicateCount = 0;
  validTransactions.forEach(t => {
    const key = transactionFingerprint(t);
    if (seen.has(key)) duplicateCount += 1;
    else seen.add(key);
  });

  return {
    raw: parsed,
    transactions: validTransactions,
    validCount: validTransactions.length,
    invalidCount,
    duplicateCount,
    budgetCount: parsed.budgets && typeof parsed.budgets === "object" ? CATEGORIES.filter(c => Number(parsed.budgets[c]) >= 0).length : 0,
    goalCount: Array.isArray(parsed.goals) ? parsed.goals.length : 0
  };
}

function EditTxnModal({ txn, onClose, onSave }) {
  const [type, setType] = useState(txn.type || "expense");
  const [amount, setAmount] = useState(String(txn.amount ?? ""));
  const [category, setCategory] = useState(txn.category || CATEGORIES[0]);
  const [mode, setMode] = useState(txn.mode || PAY_MODES[0]);
  const [note, setNote] = useState(txn.note || "");
  const [date, setDate] = useState(txn.date || "");

  function submit() {
    const n = Number(amount);
    if (!n || n <= 0 || !date) return;
    onSave({
      ...txn,
      type,
      amount: n,
      category: type === "income" ? "Salary" : category,
      mode,
      note,
      date
    });
  }

  return (
    <ModalShell title="Edit transaction" onClose={onClose}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["expense", "income"].map(t => (
          <button key={t} className="sf-btn" onClick={() => setType(t)} style={{
            flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 12.5, fontWeight: 600,
            background: type === t ? INK : "#F2F0E9", color: type === t ? PAPER : INK
          }}>{t === "expense" ? "Expense" : "Income"}</button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ fontSize: 11.5, color: SLATE }}>Amount (₹)
          <input className="sf-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        {type === "expense" && (
          <label style={{ fontSize: 11.5, color: SLATE }}>Category
            <select className="sf-input" value={category} onChange={e => setCategory(e.target.value)} style={{ marginTop: 4 }}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
        )}
        <label style={{ fontSize: 11.5, color: SLATE }}>Payment mode
          <select className="sf-input" value={mode} onChange={e => setMode(e.target.value)} style={{ marginTop: 4 }}>
            {PAY_MODES.map(m => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 11.5, color: SLATE }}>Date
          <input className="sf-input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 11.5, color: SLATE }}>Note / merchant
          <input className="sf-input" value={note} onChange={e => setNote(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        <button className="sf-btn" onClick={submit} style={{
          background: EMERALD, color: "#fff", padding: "10px 0", borderRadius: 7,
          fontSize: 13.5, fontWeight: 600, marginTop: 4
        }}>Save changes</button>
      </div>
    </ModalShell>
  );
}

function ImportReviewModal({ review, onChange, onClose, onConfirm }) {
  const duplicateExcluded = review.excludeDuplicates;
  const finalCount = review.validCount - (duplicateExcluded ? review.duplicateCount : 0);

  return (
    <ModalShell title="Review backup before import" onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <FileCheck2 size={18} color={EMERALD} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Backup validated</div>
          <div style={{ fontSize: 10.5, color: SLATE, overflow: "hidden", textOverflow: "ellipsis" }}>{review.fileName}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <ReviewStat label="Valid transactions" value={review.validCount} />
        <ReviewStat label="Duplicates" value={review.duplicateCount} tone={review.duplicateCount ? "warn" : "ok"} />
        <ReviewStat label="Invalid rows" value={review.invalidCount} tone={review.invalidCount ? "warn" : "ok"} />
        <ReviewStat label="Final import" value={finalCount} tone="ok" />
      </div>

      {review.duplicateCount > 0 && (
        <label style={{
          display: "flex", alignItems: "flex-start", gap: 8, padding: 10, background: GOLD_SOFT,
          borderRadius: 7, fontSize: 11.5, lineHeight: 1.45, marginBottom: 12, cursor: "pointer"
        }}>
          <input
            type="checkbox"
            checked={duplicateExcluded}
            onChange={e => onChange({ ...review, excludeDuplicates: e.target.checked })}
            style={{ marginTop: 2 }}
          />
          <span><b>Exclude duplicate rows</b><br />Keep the first copy of each identical transaction.</span>
        </label>
      )}

      <div style={{ fontSize: 11.5, color: SLATE, lineHeight: 1.5, marginBottom: 14 }}>
        Importing will <b>replace</b> the current local transactions with this reviewed backup.
        {review.budgetCount > 0 && ` ${review.budgetCount} budget categories were found.`}
        {review.goalCount > 0 && ` ${review.goalCount} savings goals were found.`}
      </div>

      <button className="sf-btn" onClick={onConfirm} style={{
        width: "100%", background: EMERALD, color: "#fff", padding: "10px 12px",
        borderRadius: 7, fontSize: 13.5, fontWeight: 600
      }}>
        Import {finalCount} transactions
      </button>
    </ModalShell>
  );
}

function ReviewStat({ label, value, tone }) {
  const color = tone === "warn" ? RUST : tone === "ok" ? EMERALD : INK;
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 7, padding: "9px 10px", background: "#fff" }}>
      <div style={{ fontSize: 10, color: SLATE, marginBottom: 3 }}>{label}</div>
      <div className="sf-mono" style={{ fontSize: 16, fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(22,38,31,0.35)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 50
    }} onClick={onClose}>
      <div className="sf-card" style={{ width: 380, padding: 22 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
          <button className="sf-btn" onClick={onClose} style={{ background: "none", color: SLATE }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddTxnModal({ onClose, onAdd }) {
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [mode, setMode] = useState(PAY_MODES[0]);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  function submit() {
    if (!amount || Number(amount) <= 0) return;
    onAdd({
      type, amount: Number(amount), category: type === "income" ? "Salary" : category,
      mode, note, date
    });
  }

  return (
    <ModalShell title="Log transaction" onClose={onClose}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["expense", "income"].map(t => (
          <button key={t} className="sf-btn" onClick={() => setType(t)} style={{
            flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 12.5, fontWeight: 600,
            background: type === t ? INK : "#F2F0E9", color: type === t ? PAPER : INK
          }}>{t === "expense" ? "Expense" : "Income"}</button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ fontSize: 11.5, color: SLATE }}>Amount (₹)
          <input className="sf-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        {type === "expense" && (
          <label style={{ fontSize: 11.5, color: SLATE }}>Category
            <select className="sf-input" value={category} onChange={e => setCategory(e.target.value)} style={{ marginTop: 4 }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        <label style={{ fontSize: 11.5, color: SLATE }}>Payment mode
          <select className="sf-input" value={mode} onChange={e => setMode(e.target.value)} style={{ marginTop: 4 }}>
            {PAY_MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 11.5, color: SLATE }}>Date
          <input className="sf-input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 11.5, color: SLATE }}>Note (optional)
          <input className="sf-input" value={note} onChange={e => setNote(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        <button className="sf-btn" onClick={submit} style={{
          background: EMERALD, color: "#fff", padding: "10px 0", borderRadius: 7, fontSize: 13.5, fontWeight: 600, marginTop: 4
        }}>Add entry</button>
      </div>
    </ModalShell>
  );
}

function AddGoalModal({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("");

  function submit() {
    if (!name || !target) return;
    onAdd({ name, target: Number(target), saved: Number(saved) || 0 });
  }

  return (
    <ModalShell title="New savings goal" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ fontSize: 11.5, color: SLATE }}>Goal name
          <input className="sf-input" value={name} onChange={e => setName(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 11.5, color: SLATE }}>Target amount (₹)
          <input className="sf-input" type="number" value={target} onChange={e => setTarget(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 11.5, color: SLATE }}>Already saved (₹)
          <input className="sf-input" type="number" value={saved} onChange={e => setSaved(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        <button className="sf-btn" onClick={submit} style={{
          background: GOLD, color: "#fff", padding: "10px 0", borderRadius: 7, fontSize: 13.5, fontWeight: 600, marginTop: 4
        }}>Create goal</button>
      </div>
    </ModalShell>
  );
}
