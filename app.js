// app.js — バックテストエンジン + チャート描画

const API_BASE = "";
const $ = (id) => document.getElementById(id);

// UI制御: 投資スタイルの切り替え
window.toggleInvestmentFields = () => {
  const mode = $('investment-mode').value;
  const box  = $('fixed-inv-box');
  if (box) {
    if (mode === 'fixed') box.classList.remove('hidden');
    else box.classList.add('hidden');
  }
};

// ---- DOM参照 ----
const tickerEl = document.getElementById("ticker");
const periodEl = document.getElementById("period");
const strategyEl = document.getElementById("strategy");
const shortMaEl = document.getElementById("short-ma");
const longMaEl = document.getElementById("long-ma");
const rsiPeriodEl = document.getElementById("rsi-period");
const rsiBuyEl = document.getElementById("rsi-buy");
const rsiSellEl = document.getElementById("rsi-sell");
const bbPeriodEl = document.getElementById("bb-period");
const bbSigmaEl = document.getElementById("bb-sigma");
const capitalEl = document.getElementById("backtest-capital");
const runBtn = document.getElementById("run-btn");
const loadingEl = document.getElementById("loading");
const errorBoxEl = document.getElementById("error-box");
const resultAreaEl = document.getElementById("result-area");

// ---- 戦略ごとの期間適性データ ----
const STRATEGY_META = {
  ma_cross: {
    name: '移動平均クロス',
    type: 'トレンドフォロー',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'ok',  mark: '△' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'good', mark: '○' },
    ],
    note: 'シグナルが遅れるため短期は偽シグナルが多い',
  },
  rsi: {
    name: 'RSI逆張り',
    type: '逆張り',
    periods: [
      { label: '数日〜1週間', level: 'good', mark: '○' },
      { label: '1〜2週間',   level: 'best', mark: '◎' },
      { label: '2週間〜1ヶ月', level: 'good', mark: '○' },
      { label: '1〜3ヶ月',   level: 'ok',  mark: '△' },
    ],
    note: '週次スイングと最も相性が良い',
  },
  bb: {
    name: 'ボリンジャーバンド',
    type: '逆張り',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'good', mark: '○' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'good', mark: '○' },
    ],
    note: 'レンジ相場限定で有効。トレンド時は逆効果になりやすい',
  },
  macd: {
    name: 'MACD',
    type: 'トレンドフォロー',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'good', mark: '○' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'good', mark: '○' },
    ],
    note: 'MAクロスより偽シグナルが少なく月次スイング向き',
  },
  donchian: {
    name: 'ドンチャンチャネル',
    type: 'ブレイクアウト',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'ok',  mark: '△' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'best', mark: '◎' },
    ],
    note: '数週間の高値更新でエントリー。トレンドの波を大きく捉える。',
  },
  stoch: {
    name: 'ストキャスティクス',
    type: '逆張り',
    periods: [
      { label: '数日〜1週間', level: 'best', mark: '◎' },
      { label: '1〜2週間',   level: 'best', mark: '◎' },
      { label: '2週間〜1ヶ月', level: 'good', mark: '○' },
      { label: '1〜3ヶ月',   level: 'ok',  mark: '△' },
    ],
    note: '高値・安値ベースのため短期レンジ相場に最も強い',
  },
  psar: {
    name: 'パラボリックSAR',
    type: 'トレンドフォロー',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'best', mark: '◎' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'good', mark: '○' },
    ],
    note: '視覚的にわかりやすく、トレンド反転の検出が得意',
  },
  rci: {
    name: 'RCI',
    type: '逆張り',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'best', mark: '◎' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'good', mark: '○' },
    ],
    note: '日本株で特に人気の高いオシレーター系指標',
  },
  ma_dev: {
    name: '移動平均乖離率',
    type: '逆張り',
    periods: [
      { label: '数日〜1週間', level: 'good', mark: '○' },
      { label: '1〜2週間',   level: 'best', mark: '◎' },
      { label: '2週間〜1ヶ月', level: 'good', mark: '○' },
      { label: '1〜3ヶ月',   level: 'ok',  mark: '△' },
    ],
    note: '自律反発を狙う典型的な逆張り戦略',
  },
  dmi: {
    name: 'DMI',
    type: 'トレンドフォロー',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'good', mark: '○' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'best', mark: '◎' },
    ],
    note: 'トレンドの有無と強さを判定するのに好適',
  },
  psycho: {
    name: 'サイコロジカルライン',
    type: '逆張り',
    periods: [
      { label: '数日〜1週間', level: 'good', mark: '○' },
      { label: '1〜2週間',   level: 'best', mark: '◎' },
      { label: '2週間〜1ヶ月', level: 'ok',  mark: '△' },
    ],
    note: '投資家の心理状態（上昇日の多さ）を数値化',
  },
  std_break: {
    name: '標準偏差ブレイクアウト',
    type: 'ブレイクアウト',
    periods: [
      { label: '数日〜1週間', level: 'ok',  mark: '△' },
      { label: '1〜2週間',   level: 'good', mark: '○' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
      { label: '1〜3ヶ月',   level: 'good', mark: '○' },
    ],
    note: 'ボラティリティの収縮から拡大を捉える',
  },
  hammer: {
    name: 'ハンマー / 逆ハンマー',
    type: 'トレンド転換',
    periods: [
      { label: '数日〜1週間', level: 'best', mark: '◎' },
      { label: '1〜2週間',   level: 'good',  mark: '○' },
    ],
    note: '底値圏での反転狙い。損切設定が必須',
  },
  engulf: {
    name: '包み足',
    type: 'トレンド転換',
    periods: [
      { label: '数日〜1週間', level: 'good', mark: '○' },
      { label: '1〜2週間',   level: 'best', mark: '◎' },
    ],
    note: '前日のローソク足を包み込む強い反転シグナル',
  },
  three: {
    name: '赤三兵 / 黒三兵',
    type: 'トレンド継続・転換',
    periods: [
      { label: '1〜2週間',   level: 'good', mark: '○' },
      { label: '2週間〜1ヶ月', level: 'best', mark: '◎' },
    ],
    note: '3日連続の陽線/陰線。出現率は低いが信頼度が高い',
  },
  prev_high: {
    name: '前日高値ブレイクアウト',
    type: 'ブレイクアウト',
    periods: [
      { label: '目先〜1週間', level: 'best', mark: '◎' },
      { label: '1〜2週間',   level: 'good', mark: '○' },
      { label: '2週間〜1ヶ月', level: 'ok',   mark: '△' },
    ],
    note: '前日の高値を超える「勢い」を捉える短期決戦型。',
  },
};

// ---- 全戦略リスト（ランキング実行用） ----
const ALL_STRATEGIES = [
  { id: 'ma_cross',  name: '移動平均クロス' },
  { id: 'macd',      name: 'MACD' },
  { id: 'psar',      name: 'パラボリックSAR' },
  { id: 'dmi',       name: 'DMI' },
  { id: 'donchian',  name: 'ドンチャンチャネル' },
  { id: 'prev_high', name: '前日高値ブレイクアウト' },
  { id: 'rsi',       name: 'RSI' },
  { id: 'stoch',     name: 'ストキャスティクス' },
  { id: 'rci',       name: 'RCI' },
  { id: 'psycho',    name: 'サイコロジカルライン' },
  { id: 'bb',        name: 'ボリンジャーバンド' },
  { id: 'ma_dev',    name: '移動平均乖離率' },
  { id: 'std_break', name: '標準偏差ブレイクアウト' },
  { id: 'hammer',    name: 'ハンマー / 逆ハンマー' },
  { id: 'engulf',    name: '包み足' },
  { id: 'three',     name: '赤三兵 / 黒三兵' },
];

function updateStrategyHint() {
  const strat = $('strategy').value;
  const meta  = STRATEGY_META[strat];
  const hint  = $('strategyHint');

  if (!meta) {
    hint.innerHTML = '';
    hint.classList.add('hidden');
    return;
  }

  const badges = meta.periods.map(p =>
    `<span class="hint-badge ${p.level}">${p.mark} ${p.label}</span>`
  ).join('');

  hint.innerHTML = `
    <span class="hint-label">${meta.type}</span>
    <span class="hint-text">|</span>
    ${badges}
    <span class="hint-text" style="margin-left:auto">— ${meta.note}</span>
  `;
  hint.classList.remove('hidden');
}

// チャートインスタンス（再生成のため保持）
let chartP = null;
let pnlChart = null;

const timestampPlugin = {
  id: 'timestampPlugin',
  afterDraw: (chart) => {
    const { ctx } = chart;
    ctx.save();
    ctx.font = "9px 'Share Tech Mono', monospace";
    ctx.fillStyle = "rgba(46, 74, 104, 0.7)";
    ctx.textAlign = "right";
    const now = new Date();
    const ts = `Generated: ${now.getFullYear()}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getDate().toString().padStart(2,'0')}`;
    ctx.fillText(ts, chart.width - 10, chart.height - 10);
    ctx.restore();
  }
};

// ---- 戦略パラメータ切り替え ----
strategyEl.addEventListener("change", () => {
  const val = strategyEl.value;
  $('ma-params').classList.toggle('hidden', val !== 'ma_cross');
  $('rsi-params').classList.toggle('hidden', val !== 'rsi');
  $('bb-params').classList.toggle('hidden', val !== 'bb');
  $('p-macd').classList.toggle('hidden', val !== 'macd');
  $('p-donchian').classList.toggle('hidden', val !== 'donchian');
  $('p-stoch').classList.toggle('hidden', val !== 'stoch');
  $('p-psar').classList.toggle('hidden', val !== 'psar');
  $('p-prev_high').classList.toggle('hidden', val !== 'prev_high');
  $('p-rci').classList.toggle('hidden', val !== 'rci');
  $('p-ma_dev').classList.toggle('hidden', val !== 'ma_dev');
  $('p-dmi').classList.toggle('hidden', val !== 'dmi');
  $('p-psycho').classList.toggle('hidden', val !== 'psycho');
  $('p-std_break').classList.toggle('hidden', val !== 'std_break');
  $('p-hammer').classList.toggle('hidden', val !== 'hammer');
  $('p-engulf').classList.toggle('hidden', val !== 'engulf');
  $('p-three').classList.toggle('hidden', val !== 'three');
  updateStrategyHint();
});

// 初期化：ページロード時に現在の選択状態を反映させる
// ブラウザの自動入力復元などとのタイミング競合を避けるため、ロード完了後に少し遅らせて実行
window.addEventListener('load', () => {
  setTimeout(() => {
    strategyEl.dispatchEvent(new Event('change'));
    
    // 標準偏差ブレイクアウトの場合、万が一空なら初期値を強制的に再設定
    if (strategyEl.value === 'std_break') {
      const sbN = $('sb-n'), sbLb = $('sb-lookb'), sbTh = $('sb-th');
      if (sbN && !sbN.value) sbN.value = 20;
      if (sbLb && !sbLb.value) sbLb.value = 10;
      if (sbTh && !sbTh.value) sbTh.value = 50;
    }
  }, 150);
});

updateStrategyHint(); // ヒントのみ即時反映

// ---- 実行ボタン ----
runBtn.addEventListener("click", async () => {
  const ticker = tickerEl.value.trim();
  if (!ticker) { showError("銘柄コードを入力してください"); return; }

  setLoading(true);
  hideError();
  resultAreaEl.classList.add("hidden");

  try {
    const res = await fetch(`${API_BASE}/api/stock?ticker=${encodeURIComponent(ticker)}&period=${periodEl.value}`);
    if (!res.ok) throw new Error(`サーバーエラー: ${res.status}`);
    const { data } = await res.json();
    if (!data || data.length < 50) throw new Error("データが不足しています（最低50日必要）");

    const result = runBacktest(data);
    renderMetrics(result);
    drawPrice(data, result.signals, result.indicators);
    drawEquity(result);
    renderTradeTable(result.trades);
    resultAreaEl.classList.remove("hidden");
  } catch (e) {
    showError(e.message);
  } finally {
    setLoading(false);
  }
});

// ---- ランキング実行ボタン ----
const runRankingBtn = $('run-ranking-btn');
runRankingBtn.addEventListener('click', async () => {
  const ticker = tickerEl.value.trim();
  const period = periodEl.value;
  if (!ticker) { showError("銘柄コードを入力してください"); return; }

  setLoading(true);
  hideError();
  resultAreaEl.classList.add("hidden");
  $('rankingResultsPanel').classList.add("hidden");

  try {
    const res = await fetch(`${API_BASE}/api/stock?ticker=${encodeURIComponent(ticker)}&period=${period}`);
    if (!res.ok) {
      if (res.status === 404) throw new Error("銘柄が見つかりません");
      throw new Error(`サーバーエラー: ${res.status}`);
    }
    const { data } = await res.json();
    if (!data || data.length < 50) throw new Error("データが不足しています（最低50日必要）");

    await rankingInstance.runFullRanking(ticker, data);
    
    // ランキング完了後、アコーディオンが閉じていたら開く
    const panel = $('rankingResultsPanel');
    if (panel && panel.classList.contains('collapsed')) {
      toggleRankingAccordion();
    }
  } catch (e) {
    showError(e.message);
  } finally {
    setLoading(false);
  }
});

// ========================================
// バックテストエンジン（共通シミュレーター）
// ========================================
function simulate(data, sigs) {
  const capEl = document.querySelector('[data-type="cap"]') || $('cap-v3');
  const cap   = capEl ? parseFloat(capEl.value) : 1_000_000;
  const fee   = (+$('fee').value || 0) / 100;
  const slPct = +($('sl-pct') || {value:0}).value;
  const tpPct   = +($('tp-pct') || {value:0}).value;
  const invMode = ($('investment-mode') || {value: 'compound'}).value;
  const fixedAmt = +($('fixed-inv-amt') || {value: 1000000}).value;

  let cash = cap, pos = null;
  const trades = [], equityCurve = [];

  data.forEach((bar, i) => {
    const p       = bar.close;   // 当日終値（損切り・利確の判定に使用）
    const nextBar = data[i + 1]; // 翌日データ
    let sig       = sigs[i];

    // ポジション保有中: 損切り・利確を終値ベースで判定
    if (pos) {
      const chg = (p - pos.price) / pos.price * 100;
      if (slPct > 0 && chg <= -slPct) {
        sig = 'sell';
        sigs[i] = 'sell'; // チャート表示用に書き込む
      }
      if (tpPct > 0 && chg >= tpPct) {
        sig = 'sell';
        sigs[i] = 'sell'; // チャート表示用に書き込む
      }
    }

    // 買いシグナル: 翌日始値でエントリー予約
    if (sig === 'buy' && !pos && nextBar) {
      const entryPrice = nextBar.open;
      const targetAmt  = invMode === 'compound' ? cash : fixedAmt;
      const entryAmt   = Math.min(cash, targetAmt);
      const shares     = Math.floor(entryAmt * (1 - fee) / entryPrice);
      if (shares > 0) {
        cash -= shares * entryPrice * (1 + fee);
        pos = {
          date:   nextBar.date,   // エントリー日は翌日
          price:  entryPrice,     // 翌日始値
          shares,
        };
      }
    }

    // 売りシグナル: 翌日始値でエグジット予約
    else if (sig === 'sell' && pos && nextBar) {
      const exitPrice = nextBar.open;   // 翌日始値
      const proceeds  = pos.shares * exitPrice * (1 - fee);
      trades.push({
        buyDate:   pos.date,
        buyPrice:  pos.price,
        sellDate:  nextBar.date,        // 売り日は翌日
        sellPrice: exitPrice,
        shares:    pos.shares,
        pnl:  Math.round(proceeds - pos.shares * pos.price),
        pnlPct:  (exitPrice - pos.price) / pos.price * 100,
        holdDays: Math.round(
          (new Date(nextBar.date) - new Date(pos.date)) / 86400000
        ),
      });
      cash += proceeds;
      pos = null;
    }

    // 資産推移（当日終値ベースで評価）
    equityCurve.push({
      date: bar.date,
      equity:  Math.round(cash + (pos ? pos.shares * p : 0)),
    });
  });

  // 最終日にポジションが残っている場合は最終終値で強制決済
  if (pos) {
    const lastBar   = data[data.length - 1];
    const exitPrice = lastBar.close;
    const proceeds  = pos.shares * exitPrice * (1 - fee);
    trades.push({
      buyDate:   pos.date,
      buyPrice:  pos.price,
      sellDate:  lastBar.date + " (未決)",
      sellPrice: exitPrice,
      shares:    pos.shares,
      pnl:  Math.round(proceeds - pos.shares * pos.price),
      pnlPct:  (exitPrice - pos.price) / pos.price * 100,
      holdDays: Math.round(
        (new Date(lastBar.date) - new Date(pos.date)) / 86400000
      ),
      isOpen: true,
    });
    cash += proceeds;
    pos = null;
  }

  // パフォーマンス指標計算
  const last     = equityCurve[equityCurve.length - 1].equity;
  const totalPnl = last - cap;
  const returnPct = totalPnl / cap * 100;
  const wins     = trades.filter(t => t.pnl > 0).length;
  const winRate  = trades.length ? wins / trades.length * 100 : 0;
  const avgHold  = trades.length
    ? trades.reduce((s, t) => s + t.holdDays, 0) / trades.length : 0;

  let peak = equityCurve[0].equity, maxDD = 0;
  equityCurve.forEach(e => {
    if (e.equity > peak) peak = e.equity;
    const dd = (peak - e.equity) / peak;
    if (dd > maxDD) maxDD = dd;
  });

  return { trades, equityCurve, totalPnl, returnPct, winRate, maxDD: maxDD * 100, avgHold };
}

// 既存の runBacktest を更新
// ========================================
// バックテスト実行（UI連携用）
// ========================================
function runBacktest(data, overrideStrategy = null) {
  const strategy = overrideStrategy || strategyEl.value;
  let res;

  switch (strategy) {
    case 'ma_cross':  res = signalMA(data); break;
    case 'rsi':       res = signalRSI(data); break;
    case 'bb':        res = signalBB(data); break;
    case 'macd':      res = signalMACD(data); break;
    case 'donchian':  res = signalDonchian(data); break;
    case 'stoch':     res = signalStoch(data); break;
    case 'psar':      res = signalPSAR(data); break;
    case 'prev_high': res = signalPrevHigh(data); break;
    case 'rci':       res = signalRCI(data); break;
    case 'ma_dev':    res = signalMADev(data); break;
    case 'dmi':       res = signalDMI(data); break;
    case 'psycho':    res = signalPsycho(data); break;
    case 'std_break': res = signalStdBreak(data); break;
    case 'hammer':    res = signalHammer(data); break;
    case 'engulf':    res = signalEngulf(data); break;
    case 'three':     res = signalThreeSoldiers(data); break;
    default:          res = signalBB(data);
  }

  const result = simulate(data, res.sigs);
  return { ...result, signals: res.sigs, indicators: res.lines };
}

/**
 * 📊 全戦略自動ランキングクラス
 */
/**
 * 📊 全戦略自動ランキングクラス (Phase 1.5)
 */
class AutomaticStrategyRanking {
  constructor() {
    this.results = {};
    this.allResultsArray = [];
    this.currentSort = { key: 'totalPnl', order: 'desc' };
  }

  async runFullRanking(code, priceData) {
    console.log(`[自動ランキング開始] ${code} - ${ALL_STRATEGIES.length}戦略`);
    this.results = {};

    for (const strategy of ALL_STRATEGIES) {
      try {
        const result = runBacktest(priceData, strategy.id);
        this.results[strategy.id] = {
          strategyId: strategy.id,
          strategyName: strategy.name,
          totalPnl: result.totalPnl,
          winRate: result.winRate,
          maxDD: result.maxDD,
          tradesCount: result.trades.length,
          pf: this.calculatePF(result.trades)
        };
      } catch (err) {
        console.warn(`⚠️ ${strategy.name} エラー:`, err.message);
      }
    }

    this.allResultsArray = Object.values(this.results);
    this.generateAndDisplayRanking();
    this.initializeTabs();
  }

  calculatePF(trades) {
    if (!trades || trades.length === 0) return 0;
    const wins = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const losses = Math.abs(trades.filter(t => t.pnl <= 0).reduce((sum, t) => sum + t.pnl, 0));
    return losses > 0 ? wins / losses : (wins > 0 ? 99.9 : 0);
  }

  initializeTabs() {
    const btns = document.querySelectorAll('.ranking-tab-btn');
    const contents = document.querySelectorAll('.ranking-tab-content');

    btns.forEach(btn => {
      btn.onclick = () => {
        const tabName = btn.getAttribute('data-tab');
        btns.forEach(b => b.classList.toggle('active', b === btn));
        contents.forEach(c => c.classList.toggle('active', c.id === `ranking${this.capitalize(tabName)}`));
      };
    });
  }

  capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  generateAndDisplayRanking() {
    const sorted = [...this.allResultsArray].sort((a, b) => b.totalPnl - a.totalPnl);
    const top5 = sorted.slice(0, 5);
    const worst5 = sorted.length > 5 ? sorted.slice(-5).reverse() : [...sorted].reverse();
    
    const stats = {
      total: sorted.length,
      best: sorted[0]?.totalPnl || 0,
      worst: sorted[sorted.length - 1]?.totalPnl || 0,
      avg: sorted.reduce((s, r) => s + r.totalPnl, 0) / sorted.length,
      profitable: sorted.filter(r => r.totalPnl > 0).length
    };

    // Stage 1: Summary Stats
    $('rankingSummary').innerHTML = this.generateSummary(stats);

    // Stage 2: Leaderboard (Top 5 / Worst 5)
    $('rankingTop5').innerHTML = this.generateLeaderboard(top5, "🏆 利益 Top 5");
    $('rankingWorst5').innerHTML = this.generateLeaderboard(worst5, "📉 損失 Worst 5");

    // Stage 3: All Strategies Table
    $('rankingAll').innerHTML = this.generateAllTable();

    $('rankingResultsPanel').classList.remove('hidden');
  }

  generateSummary(stats) {
    const profitRatio = ((stats.profitable / stats.total) * 100).toFixed(1);
    return `
      <div class="ranking-summary">
        <h3>📊 ランキング統計</h3>
        <div class="summary-grid">
          <div class="summary-item"><span class="label">評価戦略数</span><span class="value">${stats.total}</span></div>
          <div class="summary-item"><span class="label">最高利益</span><span class="value positive">+${Math.round(stats.best).toLocaleString()}円</span></div>
          <div class="summary-item"><span class="label">最大損失</span><span class="value negative">${Math.round(stats.worst).toLocaleString()}円</span></div>
          <div class="summary-item"><span class="label">平均損益</span><span class="value ${stats.avg >= 0 ? 'positive' : 'negative'}">${stats.avg >= 0 ? '+' : ''}${Math.round(stats.avg).toLocaleString()}円</span></div>
          <div class="summary-item"><span class="label">利益戦略率</span><span class="value positive">${stats.profitable} (${profitRatio}%)</span></div>
        </div>
      </div>
    `;
  }

  generateLeaderboard(data, title) {
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    const items = data.map((r, i) => `
      <div class="ranking-item" onclick="applyRankingStrategy('${r.strategyId}')">
        <div class="rank-cell">${medals[i] || '・'}</div>
        <div class="ranking-detail">
          <div class="strategy-name">${r.strategyName}</div>
          <div class="ranking-metrics">
            <span>勝率: ${r.winRate.toFixed(1)}%</span>
            <span>取引: ${r.tradesCount}回</span>
            <span>PF: ${r.pf >= 99.9 ? '∞' : r.pf.toFixed(2)}</span>
          </div>
        </div>
        <div class="ranking-value-container">
          <div class="pnl ${r.totalPnl >= 0 ? 'positive' : 'negative'}">${r.totalPnl >= 0 ? '+' : ''}${Math.round(r.totalPnl).toLocaleString()}円</div>
          <div class="max-dd-badge">Max DD: ${r.maxDD.toFixed(1)}%</div>
        </div>
      </div>
    `).join('');

    return `
      <div class="ranking-section">
        <h3>${title}</h3>
        ${items}
      </div>
    `;
  }

  generateAllTable() {
    const sorted = [...this.allResultsArray].sort((a, b) => {
      const { key, order } = this.currentSort;
      let valA = a[key];
      let valB = b[key];
      if (typeof valA === 'string') {
        return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return order === 'asc' ? valA - valB : valB - valA;
    });

    const rows = sorted.map((r, i) => `
      <tr onclick="applyRankingStrategy('${r.strategyId}')" class="ranking-row">
        <td>${i+1}</td>
        <td class="strategy-name">${r.strategyName}</td>
        <td class="pnl ${r.totalPnl >= 0 ? 'positive' : 'negative'}">${r.totalPnl >= 0 ? '+' : ''}${Math.round(r.totalPnl).toLocaleString()}</td>
        <td>${r.winRate.toFixed(1)}%</td>
        <td>${r.pf >= 99.9 ? '∞' : r.pf.toFixed(2)}</td>
        <td>${r.maxDD.toFixed(1)}%</td>
        <td>${r.tradesCount}</td>
      </tr>
    `).join('');

    return `
      <div class="ranking-section">
        <h3>📋 全戦略ランキング一覧</h3>
        <div class="table-wrapper">
          <table class="ranking-table">
            <thead>
              <tr>
                <th>#</th>
                <th class="sortable" onclick="rankingInstance.sortTable('strategyName')">戦略名</th>
                <th class="sortable" onclick="rankingInstance.sortTable('totalPnl')">損益</th>
                <th class="sortable" onclick="rankingInstance.sortTable('winRate')">勝率</th>
                <th class="sortable" onclick="rankingInstance.sortTable('pf')">PF</th>
                <th class="sortable" onclick="rankingInstance.sortTable('maxDD')">最大下落率(%)</th>
                <th class="sortable" onclick="rankingInstance.sortTable('tradesCount')">件数</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  sortTable(key) {
    if (this.currentSort.key === key) {
      this.currentSort.order = this.currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
      this.currentSort.key = key;
      this.currentSort.order = 'desc';
    }
    $('rankingAll').innerHTML = this.generateAllTable();
  }
}

const rankingInstance = new AutomaticStrategyRanking();

window.applyRankingStrategy = (id) => {
  strategyEl.value = id;
  strategyEl.dispatchEvent(new Event('change'));
  runBtn.click();
};

// ---- ランキング・アコーディオン開閉 ----
window.toggleRankingAccordion = () => {
  const panel = $('rankingResultsPanel');
  const icon  = $('ranking-toggle-icon');
  if (!panel || !icon) return;

  const isCollapsed = panel.classList.toggle('collapsed');
  icon.textContent = isCollapsed ? '開く ▼' : '閉じる ▲';
};

/**
 * 📡 マルチ戦略・リアルタイム監視クラス (Phase 2.5)
 */
class MultiStrategyMonitor {
  constructor() {
    this.intervalId = null;
    this.ticker = null;
    this.strategies = [];
    this.isActive = false;
    this.timeline = [];
    this.setupListeners();
    this.initMonitorChecklist(); // ページロード時にチェックリストを初期化
  }

  setupListeners() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.isActive) this.pause();
      } else {
        if (this.isActive) this.resume();
      }
    });

    const btnStart = $('btnStartMultiMonitor');
    const btnReset = $('btnResetMultiMonitor');
    if (btnStart) btnStart.onclick = () => this.toggle();
    if (btnReset) btnReset.onclick = () => this.reset();
  }

  // initChecklist を initMonitorChecklist にリネームし、コンストラクタから呼び出す
  initMonitorChecklist() {
    const container = $('monitorStrategyChecklist');
    if (!container) return;
    
    container.innerHTML = ALL_STRATEGIES.map(s => `
      <label>
        <input type="checkbox" name="m-strat" value="${s.id}" ${['ma_cross','rsi','bb','macd'].includes(s.id) ? 'checked' : ''}>
        ${s.name}
      </label>
    `).join('');
    console.log('[監視] 戦略チェックリストを動的に生成しました');
  }

  toggle() {
    if (this.isActive) {
      this.stop();
    } else {
      this.start();
    }
  }

  start() {
    const ticker = $('multiMonitorTicker').value.trim();
    // チェックされた戦略を取得
    const selected = Array.from(document.querySelectorAll('input[name="m-strat"]:checked')).map(el => el.value);

    if (!ticker) { alert('監視する銘柄コードを入力してください'); return; }
    if (selected.length === 0) { alert('少なくとも1つの戦略を選択してください'); return; }

    this.ticker = ticker;
    this.strategies = selected;
    this.isActive = true;
    
    $('btnStartMultiMonitor').textContent = '監視停止';
    $('btnStartMultiMonitor').classList.add('active');
    $('multiMonitorStatusBadge').textContent = '🟢 監視中';
    $('multiMonitorStatusBadge').classList.add('active');
    $('multiMonitorDisplay').classList.remove('hidden');
    $('displayTickerCode').textContent = ticker;

    console.log(`[一括監視開始] 銘柄:${this.ticker}, 戦略数:${this.strategies.length}`);
    this.resume();
  }

  stop() {
    this.isActive = false;
    this.pause();
    $('btnStartMultiMonitor').textContent = '監視開始';
    $('btnStartMultiMonitor').classList.remove('active');
    $('multiMonitorStatusBadge').textContent = '⚫ 停止中';
    $('multiMonitorStatusBadge').classList.remove('active');
    console.log('[一括監視停止]');
  }

  reset() {
    this.stop();
    this.timeline = [];
    $('multiMonitorTicker').value = '';
    $('strategyCardsGrid').innerHTML = '';
    $('signalTimeline').innerHTML = '';
    $('consensusBuy').style.width = '0%';
    $('consensusWait').style.width = '100%';
    $('consensusSell').style.width = '0%';
    $('consensusVerdict').textContent = 'WAITING...';
    $('multiMonitorDisplay').classList.add('hidden');
  }

  resume() {
    if (this.intervalId) return;
    this.checkAll(); // 初回即座に実行
    this.intervalId = setInterval(() => this.checkAll(), 15 * 60 * 1000); // 15分
  }

  pause() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async checkAll() {
    if (!this.isActive || document.hidden) return;

    try {
      console.log(`[一括監視実行] ${this.ticker} 更新中...`);
      
      // データ取得
      const histRes = await fetch(`/api/stock?ticker=${encodeURIComponent(this.ticker)}&period=1y`);
      const { data: history, ticker } = await histRes.json();
      const priceRes = await fetch(`/api/stock-price/${encodeURIComponent(this.ticker)}`);
      const priceData = await priceRes.json();
      
      if (!priceData.success) throw new Error('現在値取得失敗');
      const latestPrice = priceData.data.close;

      // 銘柄名の表示更新（もし取得できれば）
      $('displayTickerName').textContent = ticker || this.ticker;
      
      // データのマージ
      const latestBar = {
        date: new Date(priceData.data.timestamp).toISOString().split('T')[0],
        open: latestPrice, high: priceData.data.high, low: priceData.data.low, close: latestPrice, volume: 0
      };
      const combined = [...history];
      if (combined.length > 0 && combined[combined.length - 1].date === latestBar.date) {
        combined[combined.length - 1] = latestBar;
      } else {
        combined.push(latestBar);
      }

      // 各戦略の判定
      const results = {};
      const counts = { buy: 0, sell: 0, wait: 0 };

      this.strategies.forEach(stratId => {
        try {
          const res = runBacktest(combined, stratId);
          const lastSig = res.signals[res.signals.length - 1];
          const indicators = res.indicators;
          
          results[stratId] = { signal: lastSig || 'wait', indicators };
          counts[lastSig || 'wait']++;
        } catch (e) {
          console.error(`判定エラー (${stratId}):`, e);
        }
      });

      // UI更新
      this.updateCards(results, latestPrice);
      this.updateConsensus(counts);
      this.updateTimeline(counts, latestPrice);
      
      $('multiLastCheckTime').textContent = `最終確認: ${new Date().toLocaleTimeString('ja-JP')}`;

    } catch (err) {
      console.error('[一括監視エラー]:', err);
    }
  }

  updateCards(results, price) {
    const grid = $('strategyCardsGrid');
    grid.innerHTML = '';

    for (const [id, res] of Object.entries(results)) {
      const card = document.createElement('div');
      card.className = `strategy-card`;
      
      // 指標テキストの生成
      const indText = res.indicators.map(ind => {
        const val = ind.data[ind.data.length - 1];
        return `${ind.label}: ${typeof val === 'number' ? val.toFixed(1) : '--'}`;
      }).join('<br>');

      const strategyName = document.querySelector(`#strategy option[value="${id}"]`)?.textContent || id;

      card.innerHTML = `
        <div class="card-title">${strategyName}</div>
        <div class="card-main">
          <div class="card-signal ${res.signal}">${res.signal.toUpperCase()}</div>
          <div class="card-value">${indText}</div>
        </div>
      `;
      grid.appendChild(card);
    }
  }

  updateConsensus(counts) {
    const total = counts.buy + counts.sell + counts.wait;
    const pBuy = (counts.buy / total) * 100;
    const pWait = (counts.wait / total) * 100;
    const pSell = (counts.sell / total) * 100;

    $('consensusBuy').style.width = `${pBuy}%`;
    $('consensusWait').style.width = `${pWait}%`;
    $('consensusSell').style.width = `${pSell}%`;

    let verdict = 'WAITING...';
    if (pBuy >= 60) verdict = '🔥 STRONG BUY';
    else if (pBuy > 30) verdict = '🟢 BUY LEAN';
    else if (pSell >= 60) verdict = '💀 STRONG SELL';
    else if (pSell > 30) verdict = '🔴 SELL LEAN';
    else if (pWait > 70) verdict = '⚖️ NEUTRAL';

    $('consensusVerdict').textContent = verdict;
  }

  updateTimeline(counts, price) {
    if (counts.buy === 0 && counts.sell === 0) return;

    const time = new Date().toLocaleTimeString('ja-JP');
    const type = counts.buy > counts.sell ? 'buy' : 'sell';
    const action = type === 'buy' ? 'BUY 信号多数' : 'SELL 信号多数';
    
    // タイムラインへの追加
    const item = document.createElement('div');
    item.className = `timeline-item ${type}`;
    item.innerHTML = `
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-info">
          <strong>${action}</strong> (B:${counts.buy} / S:${counts.sell})
          <span class="price">@ ¥${price.toLocaleString()}</span>
        </div>
        <div class="timeline-time">${time}</div>
      </div>
    `;

    const container = $('signalTimeline');
    container.insertBefore(item, container.firstChild);
    
    // 最大10件
    if (container.children.length > 10) {
      container.removeChild(container.lastChild);
    }
  }
}

const multiMonitor = new MultiStrategyMonitor();


// ---- 最大ドローダウン ----
function calcMaxDrawdown(equities) {
  let peak = equities[0];
  let maxDD = 0;
  for (const e of equities) {
    if (e > peak) peak = e;
    const dd = (peak - e) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD * 100;
}

// ---- 単純移動平均 ----
function sma(arr, period) {
  return arr.map((_, i) => {
    if (i < period - 1) return null;
    const slice = arr.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

// ---- 戦略: 移動平均クロス ----
function signalMA(data) {
  const short = parseInt($('short-ma').value);
  const long = parseInt($('long-ma').value);
  if (short >= long) throw new Error("短期MAは長期MAより小さい値にしてください");

  const closes = data.map((d) => d.close);
  const shortMA = sma(closes, short);
  const longMA = sma(closes, long);
  const sigs = data.map((_, i) => {
    if (i === 0 || shortMA[i] === null || longMA[i] === null || shortMA[i - 1] === null || longMA[i - 1] === null) return null;
    if (shortMA[i - 1] <= longMA[i - 1] && shortMA[i] > longMA[i]) return "buy";
    if (shortMA[i - 1] >= longMA[i - 1] && shortMA[i] < longMA[i]) return "sell";
    return null;
  });
  return {
    sigs,
    lines: [
      { label: `MA${short}`, data: shortMA, color: "#3b82f6" },
      { label: `MA${long}`, data: longMA, color: "#f59e0b" },
    ],
  };
}

// ---- 戦略: RSI ----
function calcRSI(closes, period) {
  const rsi = Array(closes.length).fill(null);
  if (closes.length < period + 1) return rsi;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  rsi[period] = 100 - 100 / (1 + avgGain / (avgLoss || 0.001));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    rsi[i] = 100 - 100 / (1 + avgGain / (avgLoss || 0.001));
  }
  return rsi;
}

function signalRSI(data) {
  const period = parseInt($('rsi-period').value);
  const buyTh = parseInt($('rsi-buy').value);
  const sellTh = parseInt($('rsi-sell').value);

  const closes = data.map((d) => d.close);
  const rsiArr = calcRSI(closes, period);
  let inPosition = false;
  const sigs = rsiArr.map((r, i) => {
    if (r === null || i === 0) return null;
    if (!inPosition && rsiArr[i - 1] < buyTh && r >= buyTh) { inPosition = true; return "buy"; }
    if (inPosition && rsiArr[i - 1] > sellTh && r <= sellTh) { inPosition = false; return "sell"; }
    return null;
  });
  return { sigs, lines: [{ label: "RSI", data: rsiArr, color: "#facc15" }] };
}

// ---- 戦略: ボリンジャーバンド ----
function signalBB(data) {
  const period = parseInt($('bb-period').value);
  const sigma = parseFloat($('bb-sigma').value);

  const closes = data.map((d) => d.close);
  const upper = [], lower = [], mid = [];
  closes.forEach((_, i) => {
    if (i < period - 1) { upper.push(null); lower.push(null); mid.push(null); return; }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    mid.push(mean);
    upper.push(mean + sigma * std);
    lower.push(mean - sigma * std);
  });
  let inPosition = false;
  const sigs = closes.map((c, i) => {
    if (lower[i] === null) return null;
    if (!inPosition && c <= lower[i]) { inPosition = true; return "buy"; }
    if (inPosition && c >= upper[i]) { inPosition = false; return "sell"; }
    return null;
  });
  return {
    sigs,
    lines: [
      { label: "BB Upper", data: upper, color: "rgba(239,68,68,0.5)" },
      { label: "BB Mid", data: mid, color: "rgba(100,116,139,0.5)" },
      { label: "BB Lower", data: lower, color: "rgba(59,130,246,0.5)" },
    ],
  };
}

// ========================================
// MACD戦略
// ========================================
function calcEMA(arr, n) {
  const k = 2 / (n + 1);
  const out = Array(arr.length).fill(null);
  let start = n - 1;
  if (arr.length < n) return out;
  out[start] = arr.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = start + 1; i < arr.length; i++) {
    if (out[i - 1] === null) continue;
    out[i] = arr[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

function signalMACD(data) {
  const closes = data.map((d) => d.close);
  const fast = +$("m-fast").value;
  const slow = +$("m-slow").value;
  const sigN = +$("m-sig").value;
  if (fast >= slow) throw new Error("短期EMA < 長期EMA にしてください");

  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const macdLine = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null
  );

  const validStart = macdLine.findIndex((v) => v != null);
  const macdSegment = macdLine.slice(validStart);
  if (macdSegment.length < sigN) return { sigs: Array(closes.length).fill(null), lines: [] };

  const sigValid = calcEMA(macdSegment, sigN);
  const sigLine = Array(validStart).fill(null).concat(sigValid);

  const sigs = macdLine.map((v, i) => {
    if (!i || v == null || sigLine[i] == null || macdLine[i - 1] == null || sigLine[i - 1] == null) return null;
    if (macdLine[i - 1] <= sigLine[i - 1] && v > sigLine[i]) return "buy";
    if (macdLine[i - 1] >= sigLine[i - 1] && v < sigLine[i]) return "sell";
    return null;
  });

  return {
    sigs,
    lines: [
      { label: "MACD", data: macdLine, color: "#00b8ff" },
      { label: "Signal", data: sigLine, color: "#ffca28" },
    ],
  };
}

// ドンチャンチャネル
function signalDonchian(data) {
  const n = +$('dc-n').value;
  const highs  = data.map(d => d.high);
  const lows   = data.map(d => d.low);
  const upper  = data.map((_, i) => i < n ? null : Math.max(...highs.slice(i - n, i)));
  const lower  = data.map((_, i) => i < n ? null : Math.min(...lows.slice(i - n, i)));
  let inPos = false;
  const sigs = data.map((bar, i) => {
    if (upper[i] == null) return null;
    if (!inPos && bar.close >= upper[i]) { inPos = true;  return 'buy'; }
    if (inPos  && bar.close <= lower[i]) { inPos = false; return 'sell'; }
    return null;
  });
  return {
    sigs,
    lines: [
      { label: `DC Upper(${n}d)`, data: upper, color: '#00e676' },
      { label: `DC Lower(${n}d)`, data: lower, color: '#ff3d57' },
    ],
  };
}

// ストキャスティクス
function signalStoch(data) {
  const n   = +$('st-n').value;
  const buy = +$('st-buy').value;
  const sel = +$('st-sel').value;
  const highs = data.map(d => d.high);
  const lows  = data.map(d => d.low);
  const kArr  = data.map((bar, i) => {
    if (i < n - 1) return null;
    const hi = Math.max(...highs.slice(i - n + 1, i + 1));
    const lo = Math.min(...lows.slice(i - n + 1,  i + 1));
    return hi === lo ? 50 : (bar.close - lo) / (hi - lo) * 100;
  });
  let inPos = false;
  const sigs = kArr.map((k, i) => {
    if (k == null || !i || kArr[i-1] == null) return null;
    if (!inPos && kArr[i-1] < buy && k >= buy) { inPos = true;  return 'buy'; }
    if (inPos  && kArr[i-1] > sel && k <= sel) { inPos = false; return "sell"; }
    return null;
  });
  return { sigs, lines: [{ label: "%K", data: kArr, color: "#facc15" }] };
}

// パラボリックSAR
function signalPSAR(data) {
  const afStep = +$('ps-af').value;
  const afMax  = +$('ps-max').value;
  if (!data.length) return { sigs: [], lines: [] };

  let bull = true;
  let af   = afStep;
  let ep   = data[0].low;
  let sar  = data[0].high;
  const sarArr = Array(data.length).fill(null);
  const sigs   = Array(data.length).fill(null);
  let inPos = false;

  for (let i = 1; i < data.length; i++) {
    const bar  = data[i];
    const prev = data[i - 1];

    // SAR更新
    sar = sar + af * (ep - sar);

    if (bull) {
      // 上昇トレンド中
      sar = Math.min(sar, prev.low, i >= 2 ? data[i-2].low : prev.low);
      if (bar.low < sar) {
        // トレンド転換（下落へ）
        bull = false; sar = ep; ep = bar.low; af = afStep;
      } else {
        if (bar.high > ep) { ep = bar.high; af = Math.min(af + afStep, afMax); }
      }
    } else {
      // 下落トレンド中
      sar = Math.max(sar, prev.high, i >= 2 ? data[i-2].high : prev.high);
      if (bar.high > sar) {
        // トレンド転換（上昇へ）
        bull = true; sar = ep; ep = bar.high; af = afStep;
      } else {
        if (bar.low < ep) { ep = bar.low; af = Math.min(af + afStep, afMax); }
      }
    }

    sarArr[i] = Math.round(sar * 10) / 10;

    // シグナル: bull転換→買い、bear転換→売り
    if (!inPos && bull)  { inPos = true;  sigs[i] = 'buy'; }
    if (inPos  && !bull) { inPos = false; sigs[i] = 'sell'; }
  }

  return {
    sigs,
    lines: [{ label: 'SAR', data: sarArr, color: '#ffca28' }],
  };
}

// 前日高値ブレイクアウト
function signalPrevHigh(data) {
  const confirm = $('ph-confirm').value;
  const tpPct   = +$('ph-tp').value / 100;

  const sigs = Array(data.length).fill(null);
  let inPos  = false;
  let entryPrice = 0;

  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const bar  = data[i];

    if (!inPos) {
      // エントリー条件: 前日高値をブレイク
      const breakPrice = prev.high;
      const triggered  = confirm === 'close'
        ? bar.close > breakPrice        // 終値が前日高値を超えた
        : bar.high  > breakPrice;       // ザラ場で前日高値を超えた

      if (triggered) {
        inPos      = true;
        entryPrice = bar.close;
        sigs[i]    = 'buy';
      }
    } else {
      // 利確条件: エントリー価格からtpPct%上昇
      const tp = entryPrice * (1 + tpPct);

      // 損切り条件: 前日安値を終値が下回った
      const sl = prev.low;

      if (bar.high >= tp || bar.close <= sl) {
        inPos   = false;
        sigs[i] = 'sell';
      }
    }
  }

  // インジケーター線: 前日高値ラインを表示
  const prevHighLine = data.map((_, i) =>
    i === 0 ? null : data[i - 1].high
  );
  const prevLowLine = data.map((_, i) =>
    i === 0 ? null : data[i - 1].low
  );

  return {
    sigs,
    lines: [
      { label: '前日高値', data: prevHighLine, color: 'rgba(0,230,118,0.5)' },
      { label: '前日安値', data: prevLowLine,  color: 'rgba(255,61,87,0.5)' },
    ],
  };
}

// ========================================
// RCI（順位相関指数）
// ========================================
/**
 * @param {number[]} arr
 * @param {number} n
 * @returns {(number|null)[]}
 */
function calcRCI(arr, n) {
  if (n < 2) return Array(arr.length).fill(null);
  return arr.map((_, i) => {
    if (i < n - 1) return null;
    const slice = arr.slice(i - n + 1, i + 1);
    // 価格順位: 同値は後のデータを優先（または平均順位だが、簡易的に高い順）
    // slice[0]が一番古いデータ、slice[n-1]が最新
    const priceRanks = slice.map(v => {
      return slice.filter(x => x > v).length + 1;
    });

    let d2sum = 0;
    for (let j = 0; j < n; j++) {
      const dateRank = n - j; // 新しい日が1位
      const d = dateRank - priceRanks[j];
      d2sum += d * d;
    }
    const denom = n * (n * n - 1);
    if (denom === 0) return 0;
    return (1 - (6 * d2sum) / denom) * 100;
  });
}

function signalRCI(data) {
  const n = parseInt($('rci-n').value);
  const buyTh = parseInt($('rci-buy').value);
  const selTh = parseInt($('rci-sel').value);
  if (isNaN(n) || isNaN(buyTh) || isNaN(selTh)) throw new Error("RCIパラメータが不正です");

  const closes = data.map(d => d.close);
  const rci = calcRCI(closes, n);
  let inPos = false;

  const sigs = rci.map((r, i) => {
    if (r == null || i === 0 || rci[i - 1] == null) return null;
    if (!inPos && rci[i - 1] <= buyTh && r > buyTh) { inPos = true; return 'buy'; }
    if (inPos && rci[i - 1] >= selTh && r < selTh) { inPos = false; return 'sell'; }
    return null;
  });

  return { sigs, lines: [{ label: `RCI(${n})`, data: rci, color: '#ff4081' }] };
}

// ========================================
// 移動平均乖離率
// ========================================
function signalMADev(data) {
  const n = parseInt($('md-n').value);
  const buyTh = parseFloat($('md-buy').value);
  const selTh = parseFloat($('md-sel').value);
  if (isNaN(n) || isNaN(buyTh) || isNaN(selTh)) throw new Error("移動平均乖離率パラメータが不正です");

  const closes = data.map(d => d.close);
  const maArr = sma(closes, n);
  const devArr = closes.map((c, i) => {
    if (maArr[i] == null || maArr[i] === 0) return null;
    return ((c - maArr[i]) / maArr[i]) * 100;
  });

  let inPos = false;
  const sigs = devArr.map((d, i) => {
    if (d == null || i === 0 || devArr[i - 1] == null) return null;
    // 下方乖離からの反転で買い
    if (!inPos && devArr[i - 1] <= buyTh && d > buyTh) { inPos = true; return 'buy'; }
    // 上方乖離からの反落で売り
    if (inPos && devArr[i - 1] >= selTh && d < selTh) { inPos = false; return 'sell'; }
    // ゼロクロス（乖離解消）で手仕舞い
    if (inPos && devArr[i - 1] > 0 && d <= 0) { inPos = false; return 'sell'; }
    return null;
  });

  return {
    sigs,
    lines: [{ label: `MA(${n})`, data: maArr, color: '#ffca28' }],
  };
}

// ========================================
// DMI（方向性指数）
// ========================================
function calcDMI(data, n) {
  const len = data.length;
  const plusDI = Array(len).fill(null);
  const minusDI = Array(len).fill(null);
  const adx = Array(len).fill(null);

  if (len < n + 1) return { plusDI, minusDI, adx };

  const tr = [], pdm = [], mdm = [];
  for (let i = 1; i < len; i++) {
    const cur = data[i], prev = data[i - 1];
    const hl = cur.high - cur.low;
    const hpc = Math.abs(cur.high - prev.close);
    const lpc = Math.abs(cur.low - prev.close);
    tr.push(Math.max(hl, hpc, lpc));

    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    pdm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    mdm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Wilderの平滑化
  let trN = tr.slice(0, n).reduce((a, b) => a + b, 0);
  let pdmN = pdm.slice(0, n).reduce((a, b) => a + b, 0);
  let mdmN = mdm.slice(0, n).reduce((a, b) => a + b, 0);

  const diPlus = [trN === 0 ? 0 : (pdmN / trN) * 100];
  const diMinus = [trN === 0 ? 0 : (mdmN / trN) * 100];

  for (let i = n; i < tr.length; i++) {
    trN = trN - trN / n + tr[i];
    pdmN = pdmN - pdmN / n + pdm[i];
    mdmN = mdmN - mdmN / n + mdm[i];
    diPlus.push(trN === 0 ? 0 : (pdmN / trN) * 100);
    diMinus.push(trN === 0 ? 0 : (mdmN / trN) * 100);
  }

  const dx = diPlus.map((p, i) => {
    const sum = p + diMinus[i];
    if (sum === 0) return 0;
    return (Math.abs(p - diMinus[i]) / sum) * 100;
  });

  let adxVal = dx.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const adxArr = [adxVal];
  for (let i = n; i < dx.length; i++) {
    adxVal = (adxVal * (n - 1) + dx[i]) / n;
    adxArr.push(adxVal);
  }

  const offset = n;
  for (let i = 0; i < diPlus.length; i++) {
    plusDI[i + offset] = diPlus[i];
    minusDI[i + offset] = diMinus[i];
  }
  for (let i = 0; i < adxArr.length; i++) {
    adx[i + offset + n - 1] = adxArr[i];
  }

  return { plusDI, minusDI, adx };
}

function signalDMI(data) {
  const n = parseInt($('dmi-n').value);
  const adxTh = parseInt($('dmi-adx').value);
  if (isNaN(n) || isNaN(adxTh)) throw new Error("DMIパラメータが不正です");

  const { plusDI, minusDI, adx } = calcDMI(data, n);
  let inPos = false;

  const sigs = data.map((_, i) => {
    if (i === 0 || plusDI[i] == null || minusDI[i] == null) return null;
    const adxOk = adx[i] != null && adx[i] >= adxTh;
    // +DI が -DI をゴールデンクロス
    if (!inPos && plusDI[i - 1] <= minusDI[i - 1] && plusDI[i] > minusDI[i] && adxOk) {
      inPos = true; return 'buy';
    }
    // -DI が +DI をゴールデンクロス（手仕舞い）
    if (inPos && minusDI[i - 1] <= plusDI[i - 1] && minusDI[i] > plusDI[i]) {
      inPos = false; return 'sell';
    }
    return null;
  });

  return {
    sigs,
    lines: [
      { label: '+DI', data: plusDI, color: '#00e676' },
      { label: '-DI', data: minusDI, color: '#ff3d57' },
      { label: 'ADX', data: adx, color: '#ffca28' },
    ],
  };
}

// ========================================
// サイコロジカルライン
// ========================================
function signalPsycho(data) {
  const n = parseInt($('ps-n').value);
  const buyTh = parseInt($('ps-buy').value);
  const selTh = parseInt($('ps-sel').value);
  if (isNaN(n) || isNaN(buyTh) || isNaN(selTh)) throw new Error("サイコロジカルパラメータが不正です");

  const closes = data.map(d => d.close);
  const psycho = closes.map((_, i) => {
    if (i < n) return null;
    const slice = closes.slice(i - n + 1, i + 1);
    const upDays = slice.filter((c, j) => j > 0 && c > slice[j - 1]).length;
    // (n-1) 日の騰落を見るため分母は n-1
    return (upDays / (n - 1)) * 100;
  });

  let inPos = false;
  const sigs = psycho.map((p, i) => {
    if (p == null || i === 0 || psycho[i - 1] == null) return null;
    if (!inPos && psycho[i - 1] <= buyTh && p > buyTh) { inPos = true; return 'buy'; }
    if (inPos && psycho[i - 1] >= selTh && p < selTh) { inPos = false; return 'sell'; }
    return null;
  });

  return { sigs, lines: [{ label: `Psycho(${n})`, data: psycho, color: '#9c27b0' }] };
}

// ========================================
// 標準偏差ブレイクアウト
// ========================================
function signalStdBreak(data) {
  // 【Codex Light Mode】 nullチェックとデフォルト値の設定
  const nInput = $('sb-n');
  const lookbInput = $('sb-lookb');
  const thInput = $('sb-th');

  const n = nInput ? parseInt(nInput.value) || 20 : 20;
  const lookb = lookbInput ? parseInt(lookbInput.value) || 10 : 10;
  const thPct = (thInput ? parseInt(thInput.value) || 50 : 50) / 100;

  const closes = data.map(d => d.close);
  const stdArr = closes.map((_, i) => {
    if (i < n - 1) return null;
    const sl = closes.slice(i - n + 1, i + 1);
    const mean = sl.reduce((a, b) => a + b, 0) / n;
    const variance = sl.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    return Math.sqrt(variance);
  });

  let inPos = false;
  const sigs = data.map((bar, i) => {
    if (stdArr[i] == null || i < n + lookb - 1) return null;

    const recent = stdArr.slice(i - lookb + 1, i + 1).filter(v => v != null);
    if (recent.length < lookb) return null;

    const minStd = Math.min(...recent);
    const maxStd = Math.max(...recent);
    const range = maxStd - minStd;

    // 現在の標準偏差が過去lookb日間のレンジ内で低い位置（thPct分位）にあるか
    const isContracted = range === 0 ? true : (stdArr[i] - minStd) / range <= thPct;

    // 収縮した状態で、株価が前日を上回れば買い
    if (!inPos && isContracted && bar.close > closes[i - 1]) {
      inPos = true; return 'buy';
    }
    // ボラティリティが拡大し、株価が前日を下回れば売り
    if (inPos && stdArr[i] > stdArr[i - 1] && bar.close < closes[i - 1]) {
      inPos = false; return 'sell';
    }
    return null;
  });

  return { sigs, lines: [{ label: `StdDev(${n})`, data: stdArr, color: '#00bcd4' }] };
}

// ========================================
// 描画
// ========================================
function renderMetrics({ totalPnl, returnPct, winRate, maxDD, trades, avgHold }) {
  setMetric("m-total-pnl", `${totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString()}円`, totalPnl);
  setMetric("m-return", `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%`, returnPct);
  setMetric("m-win-rate", `${winRate.toFixed(1)}%`, winRate - 50);
  setMetric("m-max-dd", `-${maxDD.toFixed(2)}%`, -1);
  setMetric("m-trades", `${trades.length}回`, 0);
  setMetric("m-avg-hold", `${avgHold.toFixed(1)}日`, 0);
}

function setMetric(id, text, sign) {
  const el = document.getElementById(id).querySelector(".metric-value");
  el.textContent = text;
  el.className = "metric-value" + (sign > 0 ? " positive" : sign < 0 ? " negative" : "");
}

function drawPrice(data, sigs, lines) {
  if (chartP) chartP.destroy();

  // ローソク足データ形式に変換（x: インデックス, o, h, l, c）
  const candleData = data.map((d, i) => ({
    x: i,
    o: d.open,
    h: d.high,
    l: d.low,
    c: d.close,
  }));

  // 買い・売りシグナルのスキャッタープロット用データ
  const buys = data
    .map((d, i) => sigs[i] === 'buy' ? { x: i, y: d.low * 0.98 } : null)
    .filter(Boolean);
  const sells = data
    .map((d, i) => sigs[i] === 'sell' ? { x: i, y: d.high * 1.02 } : null)
    .filter(Boolean);

  const datasets = [
    {
      label: '株価',
      type: 'candlestick',
      data: candleData,
      borderColor: {
        up:   '#00e676',
        down: '#ff3d57',
        unchanged: '#888',
      },
      backgroundColor: {
        up:   '#00e676',
        down: '#ff3d57',
        unchanged: '#888',
      },
    },
    {
      label: '▲買',
      type: 'scatter',
      data: buys,
      backgroundColor: '#00e676',
      borderColor: '#00e676',
      pointRadius: 7,
      pointStyle: 'triangle',
    },
    {
      label: '▼売',
      type: 'scatter',
      data: sells,
      backgroundColor: '#ff3d57',
      borderColor: '#ff3d57',
      pointRadius: 7,
      pointStyle: 'triangle',
      rotation: 180,
    },
    // インジケーター線（MA・BB等）
    ...(lines || []).map(l => ({
      label: l.label,
      type: 'line',
      data: l.data.map((v, i) => ({ x: i, y: v })),
      borderColor: l.color,
      borderWidth: 1.3,
      pointRadius: 0,
      tension: 0,
      fill: false,
    })),
  ];

  chartP = new Chart($('cPrice').getContext('2d'), {
    type: 'candlestick',
    data: { datasets },
    plugins: [timestampPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            color: '#2e4a68',
            font: { family: "'Share Tech Mono',monospace", size: 10 },
            boxWidth: 12,
          },
        },
        tooltip: {
          backgroundColor: '#0c1018',
          borderColor: '#1a2840',
          borderWidth: 1,
          titleColor: '#2e4a68',
          bodyColor: '#b8cfe8',
          callbacks: {
            label: ctx => {
              const d = ctx.raw;
              if (d && d.o !== undefined) {
                return [
                  ` 始値: ${d.o?.toLocaleString()}`,
                  ` 高値: ${d.h?.toLocaleString()}`,
                  ` 安値: ${d.l?.toLocaleString()}`,
                  ` 終値: ${d.c?.toLocaleString()}`,
                ];
              }
              return ` ${ctx.dataset.label}: ${ctx.parsed?.y?.toLocaleString() ?? '-'}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'category',
          labels: data.map(d => d.date),
          ticks: {
            color: '#2e4a68',
            maxTicksLimit: 12,
            font: { family: "'Share Tech Mono',monospace", size: 9 },
          },
          grid: { color: 'rgba(26,40,64,.5)' },
        },
        y: {
          ticks: {
            color: '#2e4a68',
            font: { family: "'Share Tech Mono',monospace", size: 9 },
            callback: v => v.toLocaleString(),
          },
          grid: { color: 'rgba(26,40,64,.5)' },
          title: { display: true, text: '株価 (円)', color: '#2e4a68', font: { size: 9 } },
        },
      },
    },
  });
}




function drawEquity({ equityCurve }) {
  const ctx = document.getElementById("pnl-chart").getContext("2d");
  if (pnlChart) pnlChart.destroy();

  const labels = equityCurve.map((e) => e.date);
  const equities = equityCurve.map((e) => e.equity);
  const initial = equities[0];
  const colors = equities.map((e) => (e >= initial ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"));

  pnlChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "資産推移 (円)",
        data: equities,
        borderColor: "#00d4aa",
        backgroundColor: "rgba(0,212,170,0.08)",
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
      }],
    },
    plugins: [timestampPlugin],
    options: chartOptions("資産 (円)"),
  });
}

function chartOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        labels: { color: "#94a3b8", font: { family: "'JetBrains Mono', monospace", size: 11 }, boxWidth: 14 },
      },
      tooltip: {
        backgroundColor: "#1c2535",
        borderColor: "#2a3548",
        borderWidth: 1,
        titleColor: "#94a3b8",
        bodyColor: "#e2e8f0",
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toLocaleString() : "-"}`,
        },
      },
    },
    scales: {
      x: {
        type: 'category',
        ticks: {
          color: "#64748b",
          maxTicksLimit: 12,
          font: { family: "'JetBrains Mono', monospace", size: 10 },
        },
        grid: { color: "rgba(42,53,72,0.5)" },
      },
      y: {
        ticks: {
          color: "#64748b",
          font: { family: "'JetBrains Mono', monospace", size: 10 },
          callback: (v) => v.toLocaleString(),
        },
        grid: { color: "rgba(42,53,72,0.5)" },
        title: { display: true, text: yLabel, color: "#64748b", font: { size: 10 } },
      },
    },
  };
}

function renderTradeTable(trades) {
  const tbody = document.querySelector("#trade-table tbody");
  tbody.innerHTML = "";
  if (trades.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">シグナルが発生しませんでした</td></tr>';
    return;
  }
  trades.forEach((t, i) => {
    const win = t.pnl > 0;
    const row = document.createElement("tr");
    if (t.isOpen) row.classList.add("open-position");
    row.innerHTML = `
      <td>${i + 1}</td>
      <td>${t.buyDate}</td>
      <td>${t.buyPrice.toLocaleString()}</td>
      <td>${t.sellDate}</td>
      <td>${t.sellPrice.toLocaleString()}</td>
      <td>${t.holdDays}日</td>
      <td class="${win ? "win" : "lose"}">${win ? "+" : ""}${t.pnl.toLocaleString()}</td>
      <td class="${win ? "win" : "lose"}">${win ? "+" : ""}${t.pnlPct.toFixed(2)}%</td>
    `;
    tbody.appendChild(row);
  });
}

// ---- UI helpers ----
function setLoading(on) {
  loadingEl.classList.toggle("hidden", !on);
  runBtn.disabled = on;
}
function showError(msg) {
  errorBoxEl.textContent = "⚠️ " + msg;
  errorBoxEl.classList.remove("hidden");
}
function hideError() {
  errorBoxEl.classList.add("hidden");
}


// ---- ATR計算 ----
function calcATR(data, n = 14) {
  const tr = data.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const prev = data[i - 1];
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prev.close),
      Math.abs(bar.low  - prev.close)
    );
  });
  const atr = Array(data.length).fill(null);
  atr[n - 1] = tr.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < data.length; i++) {
    atr[i] = (atr[i - 1] * (n - 1) + tr[i]) / n;
  }
  return atr;
}

// ---- 戦略: ハンマー / 逆ハンマー ----
function signalHammer(data) {
  const ratio   = +$('hm-ratio').value;
  const hold    = +$('hm-hold').value;
  let inPos     = false;
  let entryIdx  = 0;
  const sigs    = Array(data.length).fill(null);

  for (let i = 1; i < data.length; i++) {
    const bar   = data[i];
    const body  = Math.abs(bar.close - bar.open);
    const upper = bar.high - Math.max(bar.close, bar.open);
    const lower = Math.min(bar.close, bar.open) - bar.low;

    if (!inPos) {
      const isHammer =
        body > 0 && lower >= body * ratio && upper <= body * 0.5;
      const isInvHammer =
        body > 0 && upper >= body * ratio && lower <= body * 0.5;

      if (isHammer || isInvHammer) {
        inPos = true; entryIdx = i; sigs[i] = 'buy';
      }
    } else {
      if (i >= entryIdx + hold) { inPos = false; sigs[i] = 'sell'; }
    }
  }
  return { sigs, lines: [] };
}

// ---- 戦略: 包み足（エンゴルフィング）----
function signalEngulf(data) {
  const type  = $('eg-type').value;
  let inPos   = false;
  const sigs  = Array(data.length).fill(null);

  for (let i = 1; i < data.length; i++) {
    const cur  = data[i];
    const prev = data[i - 1];
    const prevTop    = Math.max(prev.open, prev.close);
    const prevBottom = Math.min(prev.open, prev.close);
    const curTop     = Math.max(cur.open,  cur.close);
    const curBottom  = Math.min(cur.open,  cur.close);

    const isBullEngulf =
      prev.close < prev.open && cur.close > cur.open &&
      curBottom <= prevBottom && curTop >= prevTop;

    const isBearEngulf =
      prev.close > prev.open && cur.close < cur.open &&
      curTop >= prevTop && curBottom <= prevBottom;

    if (!inPos && isBullEngulf) {
      inPos = true; sigs[i] = 'buy';
    } else if (inPos && isBearEngulf && type === 'both') {
      inPos = false; sigs[i] = 'sell';
    }
  }
  return { sigs, lines: [] };
}

// ---- 戦略: 赤三兵 / 黒三兵 ----
function signalThreeSoldiers(data) {
  const type    = $('th-type').value;
  const bodyMin = +$('th-body').value;
  const atr     = calcATR(data, 14);
  let inPos     = false;
  const sigs    = Array(data.length).fill(null);

  for (let i = 2; i < data.length; i++) {
    const d0 = data[i - 2];
    const d1 = data[i - 1];
    const d2 = data[i];
    const minBody = (atr[i] || 0) * bodyMin;

    const body0 = Math.abs(d0.close - d0.open);
    const body1 = Math.abs(d1.close - d1.open);
    const body2 = Math.abs(d2.close - d2.open);

    const isThreeWhite =
      d0.close > d0.open && d1.close > d1.open && d2.close > d2.open &&
      d1.close > d0.close && d2.close > d1.close &&
      body0 >= minBody && body1 >= minBody && body2 >= minBody;

    const isThreeBlack =
      d0.close < d0.open && d1.close < d1.open && d2.close < d2.open &&
      d1.close < d0.close && d2.close < d1.close &&
      body0 >= minBody && body1 >= minBody && body2 >= minBody;

    if (!inPos && isThreeWhite) {
      inPos = true; sigs[i] = 'buy';
    } else if (inPos && isThreeBlack && type === 'both') {
      inPos = false; sigs[i] = 'sell';
    }
  }
  return { sigs, lines: [] };
}

// ============================================================
// 取引回数モード切り替え
// ============================================================
const FREQ_PRESETS = {
  normal: {
    'short-ma': 25, 'long-ma': 75,
    'm-fast': 12, 'm-slow': 26, 'm-sig': 9,
    'rsi-period': 14, 'rsi-buy': 30, 'rsi-sell': 70,
    'bb-period': 20, 'bb-sigma': 2,
    'st-n': 14, 'st-buy': 20, 'st-sel': 80,
    'dc-n': 20,
    'ps-af': 0.02, 'ps-max': 0.2,
    'ph-tp': 3,
    'hm-ratio': 2, 'hm-hold': 5,
    'th-body': 0.3,
    'rci-n': 9, 'rci-buy': -80, 'rci-sel': 80,
    'md-n': 25, 'md-buy': -5, 'md-sel': 5,
    'dmi-n': 14, 'dmi-adx': 25,
    'ps-n': 12, 'ps-buy': 25, 'ps-sel': 75,
    'ph-confirm': 'intra',
  },
  more: {
    'short-ma': 10, 'long-ma': 30,
    'm-fast': 8, 'm-slow': 17, 'm-sig': 9,
    'rsi-period': 14, 'rsi-buy': 40, 'rsi-sell': 60,
    'bb-period': 15, 'bb-sigma': 1.5,
    'st-n': 14, 'st-buy': 30, 'st-sel': 70,
    'dc-n': 10,
    'ps-af': 0.04, 'ps-max': 0.3,
    'ph-confirm': 'intra', 'ph-tp': 2,
    'hm-ratio': 1.5, 'hm-hold': 3,
    'th-body': 0.1,
    'rci-n': 9, 'rci-buy': -60, 'rci-sel': 60,
    'md-n': 25, 'md-buy': -3, 'md-sel': 3,
    'dmi-n': 14, 'dmi-adx': 15,
    'ps-n': 12, 'ps-buy': 35, 'ps-sel': 65,
  }
};

function setFreqMode(mode) {
  // ボタンのスタイル切り替え
  $('btn-normal').className = 'freq-btn' + (mode === 'normal' ? ' active-normal' : '');
  $('btn-more').className   = 'freq-btn' + (mode === 'more'   ? ' active-more'   : '');

  // パラメータを一括適用
  const preset = FREQ_PRESETS[mode];
  Object.entries(preset).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = val;
      // 数値入力の場合、通知が必要な処理があればここで発火（現状は特になし）
    }
  });
}
