// app.js — エントリーポイント
import InstitutionalAnalyzer from './institutional-analyzer.js';
import { runBacktest, getNoiseMode } from './simulate.js';
import { AutomaticStrategyRanking, MultiStrategyMonitor } from './ranking.js';
import { STRATEGY_META, ALL_STRATEGIES } from './strategies.js';
import {
  renderMetrics,
  renderNoiseComparison,
  renderRegimePerformance,
  drawPrice,
  drawEquity,
  renderTradeTable
} from './chart.js';

const $ = (id) => document.getElementById(id);
const API_BASE = "";

// ---- 取引頻度プリセット ----
const FREQ_PRESETS = {
  normal: {
    'rsi-buy': 30, 'rsi-sell': 70,
    'st-buy': 20, 'st-sel': 80,
    'ichi-mode': 'tk_cross',
    'th-body': 0.3,
    'rci-n': 9, 'rci-buy': -80, 'rci-sel': 80,
    'md-n': 25, 'md-buy': -5, 'md-sel': 5,
    'dmi-n': 14, 'dmi-adx': 25,
    'ps-n': 12, 'ps-buy': 25, 'ps-sel': 75,
  },
  more: {
    'rsi-buy': 35, 'rsi-sell': 65,
    'st-buy': 25, 'st-sel': 75,
    'ichi-mode': 'tk_cross_only',
    'th-body': 0.1,
    'rci-n': 9, 'rci-buy': -60, 'rci-sel': 60,
    'md-n': 25, 'md-buy': -3, 'md-sel': 3,
    'dmi-n': 14, 'dmi-adx': 15,
    'ps-n': 12, 'ps-buy': 35, 'ps-sel': 65,
  }
};

window.setFreqMode = (mode) => {
  $('btn-normal').className = 'freq-btn' + (mode === 'normal' ? ' active-normal' : '');
  $('btn-more').className   = 'freq-btn' + (mode === 'more'   ? ' active-more'   : '');
  const preset = FREQ_PRESETS[mode];
  Object.entries(preset).forEach(([id, val]) => {
    const el = $(id);
    if (el) el.value = val;
  });
};

// ---- DOM参照 ----
const tickerEl = document.getElementById("ticker");
const periodEl = document.getElementById("period");
const strategyEl = document.getElementById("strategy-select");
const runBtn = document.getElementById("run-btn");
const resultAreaEl = document.getElementById("result-area");

// ---- 全戦略リストとランキングインスタンス ----
const rankingInstance = new AutomaticStrategyRanking();
const multiMonitor = new MultiStrategyMonitor();

// ---- 戦略ヒントの更新 ----
function updateStrategyHint() {
  if (!strategyEl) return; // strategyElがnullの場合のチェック
  const strat = strategyEl.value;
  const meta  = STRATEGY_META[strat];
  const hint  = $('strategyHint');

  if (!hint) return; // hintがnullの場合のチェック

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

// ---- パラメータ表示切り替え ----
if (strategyEl) {
  strategyEl.addEventListener("change", () => {
    const val = strategyEl.value;
  // 各戦略のパラメータボックスが表示されるよう、IDに基づき hidden を制御
  const paramBoxes = document.querySelectorAll('.param-box');
  paramBoxes.forEach(box => box.classList.add('hidden'));

  // 汎用的なパラメータコンテナの表示
  const targetId = {
    ma_cross: 'ma-params',
    rsi: 'rsi-params',
    bb: 'bb-params',
    macd: 'p-macd',
    donchian: 'p-donchian',
    stoch: 'p-stoch',
    psar: 'p-psar',
    prev_high: 'p-prev_high',
    rci: 'p-rci',
    ma_dev: 'p-ma_dev',
    dmi: 'p-dmi',
    psycho: 'p-psycho',
    std_break: 'p-std_break',
    hammer: 'p-hammer',
    engulf: 'p-engulf',
    three: 'p-three',
    ichimoku: 'p-ichimoku',
    gap_fill: 'p-gap_fill'
  }[val];

  if (targetId) {
    const el = $(targetId);
    if (el) el.classList.remove('hidden');
  }
  updateStrategyHint();
});
}

// UI制御: 投資スタイルの切り替え
window.toggleInvestmentFields = () => {
  const mode = $('investment-mode').value;
  const box  = $('fixed-inv-box');
  if (box) {
    if (mode === 'fixed') box.classList.remove('hidden');
    else box.classList.add('hidden');
  }
};

// 初期化
window.addEventListener('load', () => {
  setTimeout(() => {
    if (strategyEl) {
      strategyEl.dispatchEvent(new Event('change'));
      if (strategyEl.value === 'std_break') {
        const sbN = $('sb-n'), sbLb = $('sb-lookb'), sbTh = $('sb-th');
        if (sbN && !sbN.value) sbN.value = 20;
        if (sbLb && !sbLb.value) sbLb.value = 10;
        if (sbTh && !sbTh.value) sbTh.value = 50;
      }
    }
  }, 150);
});

// 銘柄チップ
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('ticker-chip')) {
    const ticker = e.target.dataset.ticker;
    if (tickerEl) tickerEl.value = ticker;
  }
});

// バックテスト実行
if (runBtn) {
  runBtn.addEventListener("click", async () => {
    const tickerField = document.getElementById("ticker");
    if (!tickerField) return;
    const ticker = tickerField.value.trim();
    if (!ticker) { alert("銘柄コードを入力してください"); return; }

    setLoading(true);
    if (resultAreaEl) resultAreaEl.classList.add("hidden");

    try {
      const res = await fetch(`${API_BASE}/api/stock?ticker=${encodeURIComponent(ticker)}&period=${$('period').value}`);
      if (!res.ok) throw new Error(`サーバーエラー: ${res.status}`);
      const { data } = await res.json();
      if (!data || data.length < 50) throw new Error("データが不足しています（最低50日必要）");

      const resultOff = runBacktest(data, null, 'off');
      const noiseMode = getNoiseMode();
      let resultNoise = null;

      if (noiseMode !== 'off') {
        resultNoise = runBacktest(data, null, noiseMode);
      }

      renderMetrics(resultOff, resultNoise);
      drawPrice(data, resultOff.signals, resultOff.indicators, resultOff.trades);
      drawEquity(resultOff);
      renderTradeTable(resultOff.trades);
      renderNoiseComparison(resultOff, resultNoise, noiseMode);
      renderRegimePerformance(resultOff.regimePerf);

      resultAreaEl.classList.remove("hidden");
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  });
}

// ランキング実行
const runRankingBtn = $('run-ranking-btn');
if (runRankingBtn) {
  runRankingBtn.addEventListener('click', async () => {
    const tickerField = document.getElementById("ticker");
    if (!tickerField) return;
    const ticker = tickerField.value.trim();
    if (!ticker) { alert("銘柄コードを入力してください"); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/stock?ticker=${encodeURIComponent(ticker)}&period=${$('period').value}`);
      const { data } = await res.json();
      await rankingInstance.runFullRanking(ticker, data);
      const panel = $('rankingResultsPanel');
      if (panel && panel.classList.contains('collapsed')) window.toggleRankingAccordion();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  });
}

function setLoading(on) {
  const loading = $('loading');
  if (loading) loading.classList.toggle("hidden", !on);
  runBtn.disabled = on;
}

window.applyRankingStrategy = (id) => {
  if (strategyEl) {
    strategyEl.value = id;
    strategyEl.dispatchEvent(new Event('change'));
  }
  if (runBtn) runBtn.click();
};

window.toggleRankingAccordion = () => {
  const panel = $('rankingResultsPanel');
  const icon  = $('ranking-toggle-icon');
  if (!panel || !icon) return;
  const isCollapsed = panel.classList.toggle('collapsed');
  icon.textContent = isCollapsed ? '開く ▼' : '閉じる ▲';
};
