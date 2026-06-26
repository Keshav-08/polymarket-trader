"use client";

import { useEffect, useState } from "react";
import {
  Zap, Plus, Trash2, Pause, Play, ArrowLeft,
  AlertTriangle, CheckCircle, TrendingUp, BarChart2, ChevronDown, ChevronUp
} from "lucide-react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Rule {
  id: number;
  name: string;
  keyword: string;
  condition: "above" | "below";
  threshold: number;
  action: "buy" | "sell";
  ticker: string;
  quantity: number;
  max_quantity: number | null;
  use_dynamic_sizing: boolean;
  active: boolean;
  triggered_count: number;
  last_triggered: string | null;
  created_at: string | null;
  notes: string | null;
  exit_condition: string | null;
  exit_threshold: number | null;
  take_profit_pct: number | null;
  stop_loss_pct: number | null;
  in_position: boolean;
  entry_price: number | null;
  entry_date: string | null;
  actual_quantity: number | null;
}

interface TriggerLog {
  id: number;
  rule_name: string;
  market_question: string;
  probability: number;
  shift: number | null;
  action: string;
  ticker: string;
  quantity: number;
  sized_quantity: number | null;
  triggered_at: string;
  executed: boolean;
  log_type: string;
}

interface RuleTrade {
  entry_price: number;
  exit_price: number | null;
  qty: number;
  pnl: number | null;
  entry_time: string | null;
  exit_time: string | null;
  open?: boolean;
}

interface RulePerformance {
  rule_id: number;
  rule_name: string;
  ticker: string;
  active: boolean;
  in_position: boolean;
  total_pnl: number;
  trade_count: number;
  open_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_pnl: number;
  trades: RuleTrade[];
}

const EXAMPLE_RULES = [
  { keyword: "Fed", condition: "above", threshold: 60, action: "buy", ticker: "TLT", label: "Fed rate cut → buy bonds" },
  { keyword: "recession", condition: "above", threshold: 50, action: "sell", ticker: "SPY", label: "Recession risk → sell S&P" },
  { keyword: "tariff", condition: "above", threshold: 65, action: "sell", ticker: "AAPL", label: "Tariff risk → sell Apple" },
];

const EXIT_CONDITIONS = [
  { value: "", label: "No exit rule (hold forever)" },
  { value: "prob_below", label: "Exit when probability drops below X%" },
  { value: "prob_above", label: "Exit when probability rises above X%" },
  { value: "take_profit", label: "Take profit at X% gain" },
  { value: "stop_loss", label: "Stop loss at X% loss" },
];

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<TriggerLog[]>([]);
  const [performance, setPerformance] = useState<RulePerformance[]>([]);
  const [expandedRule, setExpandedRule] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    keyword: "",
    condition: "above",
    threshold: "60",
    action: "buy",
    ticker: "",
    quantity: "1",
    max_quantity: "5",
    use_dynamic_sizing: false,
    notes: "",
    exit_condition: "",
    exit_threshold: "40",
    take_profit_pct: "5",
    stop_loss_pct: "3",
  });

  async function fetchRules() {
    try {
      const [rRes, lRes, pRes] = await Promise.all([
        fetch(`${API}/api/rules`),
        fetch(`${API}/api/rules/logs?limit=20`),
        fetch(`${API}/api/rules/performance`),
      ]);
      if (rRes.ok) setRules((await rRes.json()).rules);
      if (lRes.ok) setLogs((await lRes.json()).logs);
      if (pRes.ok) setPerformance((await pRes.json()).performance);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { fetchRules(); }, []);

  function fillExample(ex: typeof EXAMPLE_RULES[0]) {
    setForm(f => ({
      ...f,
      name: ex.label,
      keyword: ex.keyword,
      condition: ex.condition,
      threshold: String(ex.threshold),
      action: ex.action,
      ticker: ex.ticker,
    }));
  }

  async function handleSubmit() {
    if (!form.name || !form.keyword || !form.ticker) {
      setError("Name, keyword, and ticker are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: any = {
        name: form.name,
        keyword: form.keyword,
        condition: form.condition,
        threshold: parseFloat(form.threshold),
        action: form.action,
        ticker: form.ticker.toUpperCase(),
        quantity: parseFloat(form.quantity),
        notes: form.notes || null,
        exit_condition: form.exit_condition || null,
        use_dynamic_sizing: form.use_dynamic_sizing,
        max_quantity: form.use_dynamic_sizing ? parseFloat(form.max_quantity) : null,
      };

      if (form.exit_condition === "prob_below" || form.exit_condition === "prob_above") {
        body.exit_threshold = parseFloat(form.exit_threshold);
      } else if (form.exit_condition === "take_profit") {
        body.take_profit_pct = parseFloat(form.take_profit_pct);
      } else if (form.exit_condition === "stop_loss") {
        body.stop_loss_pct = parseFloat(form.stop_loss_pct);
      }

      const r = await fetch(`${API}/api/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      setSuccess("Rule created!");
      setForm({
        name: "", keyword: "", condition: "above", threshold: "60",
        action: "buy", ticker: "", quantity: "1", max_quantity: "5",
        use_dynamic_sizing: false, notes: "", exit_condition: "",
        exit_threshold: "40", take_profit_pct: "5", stop_loss_pct: "3",
      });
      setTimeout(() => setSuccess(null), 3000);
      fetchRules();
    } catch (e: any) {
      setError(e.message || "Failed to create rule");
    } finally { setSaving(false); }
  }

  async function deleteRule(id: number) {
    await fetch(`${API}/api/rules/${id}`, { method: "DELETE" });
    fetchRules();
  }

  async function toggleRule(id: number) {
    await fetch(`${API}/api/rules/${id}/toggle`, { method: "PATCH" });
    fetchRules();
  }

  function exitLabel(rule: Rule) {
    if (!rule.exit_condition) return "No exit rule";
    if (rule.exit_condition === "prob_below") return `Exit if prob < ${rule.exit_threshold}%`;
    if (rule.exit_condition === "prob_above") return `Exit if prob > ${rule.exit_threshold}%`;
    if (rule.exit_condition === "take_profit") return `Take profit at +${rule.take_profit_pct}%`;
    if (rule.exit_condition === "stop_loss") return `Stop loss at -${rule.stop_loss_pct}%`;
    return "";
  }

  function previewSize(prob: number) {
    const min = parseFloat(form.quantity) || 1;
    const max = parseFloat(form.max_quantity) || min;
    const threshold = parseFloat(form.threshold) || 60;
    if (prob <= threshold) return min.toFixed(2);
    const confidence = (prob - threshold) / (100 - threshold);
    return Math.round((min + (max - min) * confidence) * 100) / 100;
  }

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <header className="border-b border-[#30363D] px-6 py-4 sticky top-0 bg-[#0D1117]/95 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#00C48C] rounded-lg flex items-center justify-center">
              <Zap size={16} className="text-black" />
            </div>
            <div>
              <h1 className="text-white font-semibold text-sm">Polymarket Trader</h1>
              <p className="text-[#8B949E] text-xs">Strategy Rules</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/history" className="text-[#8B949E] hover:text-white text-xs transition-colors border border-[#30363D] hover:border-[#00C48C] px-3 py-1.5 rounded-lg">History</Link>
            <Link href="/" className="flex items-center gap-1.5 text-[#8B949E] hover:text-white text-sm transition-colors">
              <ArrowLeft size={14} />
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-1">Strategy Rules</h2>
          <p className="text-[#8B949E] text-sm">Define entry, exit, and position sizing for automated trades</p>
        </div>

        {/* Rule Performance Panel */}
        {performance.length > 0 && (
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 mb-6">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <BarChart2 size={16} className="text-[#00C48C]" />
              Rule Performance
              <span className="text-xs text-[#8B949E] font-normal ml-1">realized P&L per rule</span>
            </h3>
            <div className="space-y-2">
              {performance.map((p) => (
                <div key={p.rule_id} className="bg-[#0D1117] border border-[#30363D] rounded-lg overflow-hidden">
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#161B22] transition-colors"
                    onClick={() => setExpandedRule(expandedRule === p.rule_id ? null : p.rule_id)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#30363D] text-[#8B949E]">
                        {p.ticker}
                      </span>
                      <span className="text-white text-sm font-medium truncate">{p.rule_name}</span>
                      {p.in_position && (
                        <span className="text-xs text-[#00C48C] bg-[#00C48C]/10 px-2 py-0.5 rounded shrink-0">
                          open
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className={`text-sm font-bold font-mono ${p.total_pnl >= 0 ? "text-[#00C48C]" : "text-red-400"}`}>
                          {p.total_pnl >= 0 ? "+" : ""}${p.total_pnl.toFixed(2)}
                        </div>
                        <div className="text-xs text-[#8B949E]">
                          {p.trade_count} closed · {p.win_rate}% win
                          {p.open_trades > 0 && ` · ${p.open_trades} open`}
                        </div>
                      </div>
                      {expandedRule === p.rule_id
                        ? <ChevronUp size={14} className="text-[#8B949E]" />
                        : <ChevronDown size={14} className="text-[#8B949E]" />
                      }
                    </div>
                  </div>

                  {expandedRule === p.rule_id && (
                    <div className="border-t border-[#30363D] px-4 py-3">
                      {p.trades.length === 0 ? (
                        <p className="text-[#8B949E] text-xs text-center py-2">No closed trades yet</p>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-5 gap-2 text-xs text-[#8B949E] font-mono mb-1 px-1">
                            <span>Entry</span>
                            <span>Exit</span>
                            <span>Qty</span>
                            <span>P&L</span>
                            <span>Date</span>
                          </div>
                          {p.trades.map((t, i) => (
                            <div key={i} className={`grid grid-cols-5 gap-2 text-xs font-mono px-1 py-1.5 rounded ${
                              t.open ? "bg-yellow-500/5 border border-yellow-500/20" : "bg-[#161B22]"
                            }`}>
                              <span className="text-white">${t.entry_price.toFixed(2)}</span>
                              <span className="text-[#8B949E]">
                                {t.exit_price ? `$${t.exit_price.toFixed(2)}` : "open"}
                              </span>
                              <span className="text-[#8B949E]">{t.qty}</span>
                              <span className={
                                t.pnl === null ? "text-yellow-400" :
                                t.pnl >= 0 ? "text-[#00C48C]" : "text-red-400"
                              }>
                                {t.pnl === null ? "—" : `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}`}
                              </span>
                              <span className="text-[#8B949E]">
                                {t.entry_time ? new Date(t.entry_time).toLocaleDateString() : "—"}
                              </span>
                            </div>
                          ))}
                          <div className="border-t border-[#30363D] mt-2 pt-2 grid grid-cols-3 gap-4 text-xs">
                            <div>
                              <span className="text-[#8B949E]">Total P&L </span>
                              <span className={`font-mono font-bold ${p.total_pnl >= 0 ? "text-[#00C48C]" : "text-red-400"}`}>
                                {p.total_pnl >= 0 ? "+" : ""}${p.total_pnl.toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[#8B949E]">Win rate </span>
                              <span className={`font-mono font-bold ${p.win_rate >= 50 ? "text-[#00C48C]" : "text-red-400"}`}>
                                {p.win_rate}%
                              </span>
                            </div>
                            <div>
                              <span className="text-[#8B949E]">Avg trade </span>
                              <span className={`font-mono font-bold ${p.avg_pnl >= 0 ? "text-[#00C48C]" : "text-red-400"}`}>
                                {p.avg_pnl >= 0 ? "+" : ""}${p.avg_pnl.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Create Rule Form */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-6">
            <h3 className="text-white font-semibold mb-1">New Rule</h3>
            <p className="text-[#8B949E] text-xs mb-5">Set an entry signal, position sizing, and exit strategy</p>

            <div className="mb-5">
              <p className="text-[#8B949E] text-xs mb-2">Quick examples:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_RULES.map((ex) => (
                  <button key={ex.label} onClick={() => fillExample(ex)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-[#30363D] text-[#8B949E] hover:border-[#00C48C] hover:text-[#00C48C] transition-colors">
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-[#0D1117] rounded-lg p-4 border border-[#30363D]">
                <p className="text-xs font-semibold text-[#00C48C] mb-3 uppercase tracking-wide">Entry Signal</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[#8B949E] mb-1 block">Rule name</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Fed rate cut → buy bonds"
                      className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00C48C] placeholder-[#8B949E]" />
                  </div>
                  <div>
                    <label className="text-xs text-[#8B949E] mb-1 block">Market keyword</label>
                    <input value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))}
                      placeholder="e.g. Fed, recession, tariff"
                      className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00C48C] placeholder-[#8B949E]" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[#8B949E] mb-1 block">Condition</label>
                      <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
                        className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00C48C]">
                        <option value="above">Probability above</option>
                        <option value="below">Probability below</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[#8B949E] mb-1 block">Threshold %</label>
                      <input type="number" min="0" max="100" value={form.threshold}
                        onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
                        className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[#00C48C]" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[#8B949E] mb-1 block">Action</label>
                      <select value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
                        className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00C48C]">
                        <option value="buy">Buy</option>
                        <option value="sell">Sell</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[#8B949E] mb-1 block">Ticker</label>
                      <input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                        placeholder="TLT"
                        className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[#00C48C] placeholder-[#8B949E]" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#0D1117] rounded-lg p-4 border border-[#30363D]">
                <p className="text-xs font-semibold text-yellow-400 mb-3 uppercase tracking-wide">Position Sizing</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="dynamic_sizing"
                      checked={form.use_dynamic_sizing}
                      onChange={e => setForm(f => ({ ...f, use_dynamic_sizing: e.target.checked }))}
                      className="w-4 h-4 accent-yellow-400" />
                    <label htmlFor="dynamic_sizing" className="text-sm text-white cursor-pointer">
                      Scale position size with probability confidence
                    </label>
                  </div>

                  {form.use_dynamic_sizing ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[#8B949E] mb-1 block">Min shares (at threshold)</label>
                          <input type="number" min="0.01" step="0.01" value={form.quantity}
                            onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                            className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-yellow-400" />
                        </div>
                        <div>
                          <label className="text-xs text-[#8B949E] mb-1 block">Max shares (at 100%)</label>
                          <input type="number" min="0.01" step="0.01" value={form.max_quantity}
                            onChange={e => setForm(f => ({ ...f, max_quantity: e.target.value }))}
                            className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-yellow-400" />
                        </div>
                      </div>
                      {form.ticker && (
                        <div className="bg-[#161B22] rounded-lg p-3 border border-yellow-400/20">
                          <p className="text-xs text-[#8B949E] mb-2">Size preview:</p>
                          <div className="grid grid-cols-4 gap-2 text-center">
                            {(() => {
                              const t = parseFloat(form.threshold) || 60;
                              return [t, t + (100-t)*0.25, t + (100-t)*0.5, t + (100-t)*0.75].map((prob) => (
                                <div key={prob} className="bg-[#0D1117] rounded p-2">
                                  <p className="text-yellow-400 text-xs font-mono">{prob.toFixed(0)}%</p>
                                  <p className="text-white text-sm font-bold font-mono">{previewSize(prob)}</p>
                                  <p className="text-[#8B949E] text-xs">shares</p>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div>
                      <label className="text-xs text-[#8B949E] mb-1 block">Fixed shares</label>
                      <input type="number" min="0.01" step="0.01" value={form.quantity}
                        onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                        className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[#00C48C]" />
                      <p className="text-xs text-[#8B949E] mt-1">Same number of shares every time</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-[#0D1117] rounded-lg p-4 border border-[#30363D]">
                <p className="text-xs font-semibold text-red-400 mb-3 uppercase tracking-wide">Exit Strategy</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[#8B949E] mb-1 block">Exit condition</label>
                    <select value={form.exit_condition} onChange={e => setForm(f => ({ ...f, exit_condition: e.target.value }))}
                      className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00C48C]">
                      {EXIT_CONDITIONS.map(ec => (
                        <option key={ec.value} value={ec.value}>{ec.label}</option>
                      ))}
                    </select>
                  </div>
                  {(form.exit_condition === "prob_below" || form.exit_condition === "prob_above") && (
                    <div>
                      <label className="text-xs text-[#8B949E] mb-1 block">Exit probability threshold %</label>
                      <input type="number" min="0" max="100" value={form.exit_threshold}
                        onChange={e => setForm(f => ({ ...f, exit_threshold: e.target.value }))}
                        className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[#00C48C]" />
                    </div>
                  )}
                  {form.exit_condition === "take_profit" && (
                    <div>
                      <label className="text-xs text-[#8B949E] mb-1 block">Take profit % gain</label>
                      <input type="number" min="0.1" step="0.1" value={form.take_profit_pct}
                        onChange={e => setForm(f => ({ ...f, take_profit_pct: e.target.value }))}
                        className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[#00C48C]" />
                      <p className="text-xs text-[#8B949E] mt-1">Exit when position gains this % from entry</p>
                    </div>
                  )}
                  {form.exit_condition === "stop_loss" && (
                    <div>
                      <label className="text-xs text-[#8B949E] mb-1 block">Stop loss % loss</label>
                      <input type="number" min="0.1" step="0.1" value={form.stop_loss_pct}
                        onChange={e => setForm(f => ({ ...f, stop_loss_pct: e.target.value }))}
                        className="w-full bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[#00C48C]" />
                      <p className="text-xs text-[#8B949E] mt-1">Exit when position loses this % from entry</p>
                    </div>
                  )}
                  {!form.exit_condition && (
                    <p className="text-xs text-[#8B949E]">Position held until manually closed or rule deleted</p>
                  )}
                </div>
              </div>

              {form.keyword && form.ticker && (
                <div className="bg-[#0D1117] border border-[#30363D] rounded-lg px-4 py-3">
                  <p className="text-xs text-[#8B949E] mb-2">Rule preview:</p>
                  <p className="text-sm text-white mb-1">
                    <span className="text-[#00C48C]">ENTRY:</span> If{" "}
                    <span className="text-[#00C48C] font-mono">"{form.keyword}"</span> prob{" "}
                    <span className="text-yellow-400">{form.condition} {form.threshold}%</span>
                    {" → "}
                    <span className={form.action === "buy" ? "text-[#00C48C]" : "text-red-400"}>
                      {form.action.toUpperCase()}
                    </span>{" "}
                    <span className="font-mono">
                      {form.use_dynamic_sizing
                        ? `${form.quantity}–${form.max_quantity} shares (scaled)`
                        : `${form.quantity} shares`
                      } of {form.ticker}
                    </span>
                  </p>
                  {form.exit_condition && (
                    <p className="text-sm text-white">
                      <span className="text-red-400">EXIT:</span>{" "}
                      {form.exit_condition === "prob_below" && `When prob drops below ${form.exit_threshold}%`}
                      {form.exit_condition === "prob_above" && `When prob rises above ${form.exit_threshold}%`}
                      {form.exit_condition === "take_profit" && `Take profit at +${form.take_profit_pct}%`}
                      {form.exit_condition === "stop_loss" && `Stop loss at -${form.stop_loss_pct}%`}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertTriangle size={14} /> {error}
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 text-[#00C48C] text-sm">
                  <CheckCircle size={14} /> {success}
                </div>
              )}

              <button onClick={handleSubmit} disabled={saving}
                className="w-full bg-[#00C48C] hover:bg-[#00a876] disabled:opacity-50 text-black font-semibold rounded-lg py-2.5 text-sm transition-colors flex items-center justify-center gap-2">
                <Plus size={16} />
                {saving ? "Saving..." : "Create Rule"}
              </button>
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-6">
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                Active Rules
                {rules.length > 0 && (
                  <span className="ml-auto bg-[#00C48C]/20 text-[#00C48C] text-xs font-mono px-2 py-0.5 rounded-full">
                    {rules.filter(r => r.active).length} active
                  </span>
                )}
              </h3>

              {loading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-[#0D1117] rounded-lg p-4 animate-pulse h-16" />
                  ))}
                </div>
              ) : rules.length === 0 ? (
                <p className="text-[#8B949E] text-sm text-center py-6">No rules yet — create one to get started</p>
              ) : (
                <div className="space-y-2">
                  {rules.map((rule) => (
                    <div key={rule.id}
                      className={`p-4 rounded-lg border ${
                        rule.in_position
                          ? "border-[#00C48C]/40 bg-[#00C48C]/5"
                          : rule.active
                          ? "border-[#30363D] bg-[#0D1117]/60"
                          : "border-[#30363D]/40 bg-[#0D1117]/20 opacity-60"
                      }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${
                              rule.action === "buy" ? "bg-[#00C48C]/20 text-[#00C48C]" : "bg-red-500/20 text-red-400"
                            }`}>
                              {rule.action.toUpperCase()} {rule.ticker}
                            </span>
                            {rule.in_position && (
                              <span className="text-xs text-[#00C48C] bg-[#00C48C]/10 px-2 py-0.5 rounded flex items-center gap-1">
                                <TrendingUp size={10} /> IN POSITION
                                {rule.entry_price && ` @ $${rule.entry_price.toFixed(2)}`}
                                {rule.actual_quantity && ` · ${rule.actual_quantity} shares`}
                              </span>
                            )}
                            {!rule.active && (
                              <span className="text-xs text-[#8B949E] bg-[#30363D] px-2 py-0.5 rounded">paused</span>
                            )}
                          </div>
                          <p className="text-white text-sm font-medium truncate">{rule.name}</p>
                          <p className="text-[#8B949E] text-xs mt-0.5">
                            keyword: <span className="font-mono text-white">"{rule.keyword}"</span>
                            {" · "}prob {rule.condition} <span className="font-mono text-yellow-400">{rule.threshold}%</span>
                            {" · "}
                            {rule.use_dynamic_sizing && rule.max_quantity
                              ? <span className="text-yellow-400">{rule.quantity}–{rule.max_quantity} shares (scaled)</span>
                              : `${rule.quantity} shares`
                            }
                          </p>
                          {rule.exit_condition && (
                            <p className="text-xs text-red-400 mt-0.5">Exit: {exitLabel(rule)}</p>
                          )}
                          {rule.triggered_count > 0 && (
                            <p className="text-xs text-[#8B949E] mt-1">
                              triggered {rule.triggered_count}×
                              {rule.last_triggered && ` · last: ${new Date(rule.last_triggered).toLocaleString()}`}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => toggleRule(rule.id)}
                            className="p-1.5 text-[#8B949E] hover:text-white rounded transition-colors"
                            title={rule.active ? "Pause" : "Resume"}>
                            {rule.active ? <Pause size={14} /> : <Play size={14} />}
                          </button>
                          <button onClick={() => deleteRule(rule.id)}
                            className="p-1.5 text-[#8B949E] hover:text-red-400 rounded transition-colors"
                            title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle size={16} className="text-yellow-400" />
                Trigger Log
                <span className="text-xs text-[#8B949E] font-normal ml-1">(last 20)</span>
              </h3>

              {logs.length === 0 ? (
                <p className="text-[#8B949E] text-sm text-center py-6">
                  No triggers yet — rules fire when market conditions are met
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {logs.map((log) => (
                    <div key={log.id} className={`rounded-lg p-3 border ${
                      log.log_type === "exit"
                        ? "bg-red-500/5 border-red-500/20"
                        : "bg-[#0D1117] border-[#30363D]"
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                          log.log_type === "exit"
                            ? "bg-red-500/20 text-red-400"
                            : log.action === "buy"
                            ? "bg-[#00C48C]/20 text-[#00C48C]"
                            : "bg-red-500/20 text-red-400"
                        }`}>
                          {log.log_type === "exit" ? "EXIT" : log.action?.toUpperCase()}{" "}
                          {log.sized_quantity ?? log.quantity}× {log.ticker}
                        </span>
                        <span className="text-xs text-[#8B949E] ml-auto">
                          {new Date(log.triggered_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-[#8B949E] text-xs line-clamp-1">{log.market_question}</p>
                      {log.probability > 0 && (
                        <p className="text-xs text-yellow-400 font-mono mt-0.5">
                          prob: {log.probability?.toFixed(1)}%
                          {log.shift !== null && log.shift !== undefined && ` (shift: ${log.shift > 0 ? "+" : ""}${log.shift?.toFixed(1)}%)`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}