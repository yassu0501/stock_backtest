// chart.js — チャート描画 + UI レンダリング

const $ = (id) => document.getElementById(id);

// チャートインスタンス（再生成のため保持）
let chartP = null;
let pnlChart = null;
let miniChart = null;
let currentData = null;

export const timestampPlugin = {
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

// ========================================
// メトリクス表示
// ========================================
export function renderMetrics(resultOff, resultNoise = null) {
  const { totalPnl, returnPct, winRate, maxDD, trades, avgHold, maxDDDays } = resultOff;
  setMetric("m-total-pnl", `${totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString()}円`, totalPnl);
  setMetric("m-return", `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%`, returnPct);
  setMetric("m-win-rate", `${winRate.toFixed(1)}%`, winRate - 50);
  setMetric("m-max-dd", `-${maxDD.toFixed(2)}%`, -1);
  setMetric("m-trades", `${trades.length}回`, 0);
  setMetric("m-avg-hold", `${avgHold.toFixed(1)}日`, 0);
  setMetric("m-max-dd-days", `${maxDDDays}日`, maxDDDays > 10 ? -1 : 0);

  if (resultNoise) {
    const noisePnl = resultNoise.totalPnl;
    const resilience = resultOff.totalPnl === 0 ? 0 : noisePnl / resultOff.totalPnl;
    const rSign = resilience >= 0.7 ? 1 : resilience >= 0.4 ? 0.5 : -1;
    setMetric("m-resilience", resilience.toFixed(2), rSign);
  } else {
    setMetric("m-resilience", "—", 0);
  }

  const profits = trades.map(t => t.pnl);
  const positiveProfits = profits.filter(p => p > 0);
  const totalProfit = positiveProfits.reduce((a, b) => a + b, 0);
  const maxProfit = positiveProfits.length > 0 ? Math.max(...positiveProfits) : 0;
  const dependency = totalProfit === 0 ? 0 : maxProfit / totalProfit;
  const depPct = (dependency * 100).toFixed(0);
  const depSign = dependency > 0.5 ? -1 : dependency > 0.3 ? 0.5 : 1;
  setMetric("m-max-dependency", `${depPct}%`, depSign);

  const equityValues = resultOff.equityCurve.map(e => e.equity);
  let peak = equityValues[0], recoveryDays = 0, maxRecovery = 0, inDD = false;
  for (let i = 1; i < equityValues.length; i++) {
    if (equityValues[i] >= peak) {
      peak = equityValues[i];
      if (inDD) { if (recoveryDays > maxRecovery) maxRecovery = recoveryDays; recoveryDays = 0; inDD = false; }
    } else { inDD = true; recoveryDays++; }
  }
  if (inDD && recoveryDays > maxRecovery) maxRecovery = recoveryDays;
  setMetric("m-max-recovery", `${maxRecovery}日`, maxRecovery > 60 ? -1 : maxRecovery > 30 ? 0.5 : 0);
}

export function setMetric(id, text, sign) {
  const el = document.getElementById(id);
  if (!el) return;
  const valEl = el.querySelector(".metric-value");
  valEl.textContent = text;
  let cls = "metric-value";
  if (sign > 0 && sign !== 0.5) cls += " positive";
  else if (sign === 0.5) cls += " warn";
  else if (sign < 0) cls += " negative";
  valEl.className = cls;
}

// ========================================
// ノイズ比較パネルの描画
// ========================================
export function renderNoiseComparison(resultOff, resultNoise, noiseMode) {
  const panel = $('noise-comparison-panel');
  if (!panel || !resultNoise || noiseMode === 'off') {
    if (panel) panel.classList.add('hidden');
    return;
  }
  const modeLabel = { low: 'Low', medium: 'Medium', high: 'High' }[noiseMode] || noiseMode;
  const dPnl = resultNoise.totalPnl - resultOff.totalPnl;
  const dReturn = resultNoise.returnPct - resultOff.returnPct;
  const dWinRate = resultNoise.winRate - resultOff.winRate;
  const dPF = resultNoise.pf - resultOff.pf;
  const dMaxDD = resultNoise.maxDD - resultOff.maxDD;

  const fmtDiff = (v, u = '', d = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}${u}`;
  const diffClass = (v, inv = false) => ((inv ? -v : v) > 0 ? 'positive' : (inv ? -v : v) < 0 ? 'negative' : '');

  panel.innerHTML = `
    <div class="noise-comparison-header">
      <span class="noise-badge noise-${noiseMode}">🎲 ノイズ: ${modeLabel}</span>
      <span class="noise-skip-info">スキップ: ${resultNoise.skippedByNoise || 0}回</span>
    </div>
    <div class="noise-comparison-grid">
      <div class="noise-comp-item"><div class="comp-label">総損益</div><div class="comp-row"><span class="comp-off">OFF: ${resultOff.totalPnl.toLocaleString()}円</span><span class="comp-on">ON: ${resultNoise.totalPnl.toLocaleString()}円</span><span class="comp-diff ${diffClass(dPnl)}">${fmtDiff(dPnl, '円', 0)}</span></div></div>
      <div class="noise-comp-item"><div class="comp-label">リターン</div><div class="comp-row"><span class="comp-off">OFF: ${resultOff.returnPct.toFixed(2)}%</span><span class="comp-on">ON: ${resultNoise.returnPct.toFixed(2)}%</span><span class="comp-diff ${diffClass(dReturn)}">${fmtDiff(dReturn, '%', 2)}</span></div></div>
      <div class="noise-comp-item"><div class="comp-label">勝率</div><div class="comp-row"><span class="comp-off">OFF: ${resultOff.winRate.toFixed(1)}%</span><span class="comp-on">ON: ${resultNoise.winRate.toFixed(1)}%</span><span class="comp-diff ${diffClass(dWinRate)}">${fmtDiff(dWinRate, '%')}</span></div></div>
      <div class="noise-comp-item"><div class="comp-label">PF</div><div class="comp-row"><span class="comp-off">OFF: ${resultOff.pf.toFixed(2)}</span><span class="comp-on">ON: ${resultNoise.pf.toFixed(2)}</span><span class="comp-diff ${diffClass(dPF)}">${fmtDiff(dPF, '', 2)}</span></div></div>
      <div class="noise-comp-item"><div class="comp-label">最大DD</div><div class="comp-row"><span class="comp-off">OFF: -${resultOff.maxDD.toFixed(2)}%</span><span class="comp-on">ON: -${resultNoise.maxDD.toFixed(2)}%</span><span class="comp-diff ${diffClass(dMaxDD, true)}">${fmtDiff(dMaxDD, '%', 2)}</span></div></div>
      <div class="noise-comp-item"><div class="comp-label">取引回数</div><div class="comp-row"><span class="comp-off">OFF: ${resultOff.trades.length}回</span><span class="comp-on">ON: ${resultNoise.trades.length}回</span><span class="comp-diff">${resultNoise.trades.length - resultOff.trades.length}回</span></div></div>
    </div>
  `;
  panel.classList.remove('hidden');
}

// ========================================
// 相場環境別パフォーマンスの描画
// ========================================
export function renderRegimePerformance(regimePerf) {
  const panel = $('regime-perf-panel');
  if (!panel || !regimePerf) { if (panel) panel.classList.add('hidden'); return; }
  const labels = { uptrend: { name: '上昇トレンド', icon: '📈', cls: 'regime-up' }, downtrend: { name: '下降トレンド', icon: '📉', cls: 'regime-down' }, range: { name: 'レンジ', icon: '↔️', cls: 'regime-range' }, high_volatility: { name: '高ボラ', icon: '⚡', cls: 'regime-vol' } };
  const cards = Object.entries(regimePerf).map(([key, perf]) => {
    const m = labels[key] || { name: key, icon: '❓', cls: '' };
    const wr = perf.trades > 0 ? (perf.wins / perf.trades * 100).toFixed(1) : '—';
    return `
      <div class="regime-card ${m.cls}"><div class="regime-header"><span class="regime-icon">${m.icon}</span><span class="regime-name">${m.name}</span></div>
      <div class="regime-stats"><div class="regime-stat"><span class="regime-stat-label">取引</span><span class="regime-stat-value">${perf.trades}回</span></div>
      <div class="regime-stat"><span class="regime-stat-label">損益</span><span class="regime-stat-value ${perf.profit>=0?'positive':'negative'}">${perf.profit>=0?'+':''}${Math.round(perf.profit).toLocaleString()}円</span></div>
      <div class="regime-stat"><span class="regime-stat-label">勝率</span><span class="regime-stat-value">${wr}%</span></div></div></div>
    `;
  }).join('');
  panel.innerHTML = `<h2 class="panel-title">相場環境別パフォーマンス</h2><div class="regime-grid">${cards}</div>`;
  panel.classList.remove('hidden');
}

// ========================================
// チャート描画
// ========================================
export function drawPrice(data, sigs, lines, trades = []) {
  if (chartP) {
    chartP.destroy();
    chartP = null;
  }
  
  currentData = data;
  // スライダー初期化
  initRangeSliders(data);

  const candleData = data.map((d, i) => ({ x: i, o: d.open, h: d.high, l: d.low, c: d.close }));
  const buys = data.map((d, i) => {
    let p = null;
    if (sigs[i] === 'buy' && data[i+1]) {
      const actualTrade = trades.find(t => t.buyDate === data[i+1].date);
      if (actualTrade) p = actualTrade.buyPrice;
    }
    return { x: i, y: sigs[i] === 'buy' ? d.low * 0.98 : null, actualPrice: p };
  });
  const sells = data.map((d, i) => {
    let p = null;
    if (sigs[i] === 'sell' && data[i+1]) {
      const actualTrade = trades.find(t => t.sellDate === data[i+1].date);
      if (actualTrade) p = actualTrade.sellPrice;
    }
    return { x: i, y: sigs[i] === 'sell' ? d.high * 1.02 : null, actualPrice: p };
  });
  const volDecay = (lines || []).find(l => l.isVolumeDecay);
  const volDecayFlags = volDecay ? volDecay.data : [];

  const datasets = [
    { label: '出来高', type: 'bar', data: data.map((d, i) => ({ x: i, y: d.volume })), backgroundColor: data.map((d, i) => volDecayFlags[i] ? 'rgba(255, 200, 200, 0.3)' : (d.close >= d.open ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 61, 87, 0.15)')), yAxisID: 'yVolume', order: 3 },
    { label: '株価', type: 'candlestick', data: candleData, borderColor: { up: '#00e676', down: '#ff3d57', unchanged: '#888' }, backgroundColor: { up: '#00e676', down: '#ff3d57', unchanged: '#888' }, order: 2 },
    { label: '▲買', type: 'scatter', data: buys, backgroundColor: '#00e676', borderColor: '#00e676', pointRadius: 7, pointStyle: 'triangle', order: 1 },
    { label: '▼売', type: 'scatter', data: sells, backgroundColor: '#ff3d57', borderColor: '#ff3d57', pointRadius: 7, pointStyle: 'triangle', rotation: 180, order: 1 },
    ...(lines || []).filter(l => !l.isVolumeDecay).map(l => {
      if (l.isSenkouA) return { label: l.label, type: 'line', data: l.data.map((v, i) => ({ x: i, y: v })), borderColor: l.color, backgroundColor: 'rgba(76,175,80,0.12)', borderWidth: 1, pointRadius: 0, tension: 0, fill: '+1', yAxisID: 'y', order: 3 };
      if (l.isSenkouB) return { label: l.label, type: 'line', data: l.data.map((v, i) => ({ x: i, y: v })), borderColor: l.color, backgroundColor: 'rgba(244,67,54,0.12)', borderWidth: 1, pointRadius: 0, tension: 0, fill: false, yAxisID: 'y', order: 3 };
      if (l.isVWAPCross) return { label: l.label, type: 'scatter', data: l.data.map((v, i) => ({ x: i, y: v })), backgroundColor: 'rgba(255,165,0,0.4)', borderColor: 'rgba(255,165,0,0.8)', pointStyle: 'rectRot', pointRadius: 4, yAxisID: 'y', order: 0 };
      if (l.isVolumeBreakdown) return { label: l.label, type: 'scatter', data: l.data.map((v, i) => ({ x: i, y: v })), backgroundColor: l.color, borderColor: l.color, pointStyle: 'triangle', pointRadius: 6, yAxisID: 'y', order: 0 };
      const isV = l.isVolumeMA;
      return { label: l.label, type: 'line', data: l.data.map((v, i) => ({ x: i, y: v })), borderColor: l.color, borderWidth: l.isVWAP ? 2 : 1.3, borderDash: isV ? [5, 5] : (l.isHH ? [2, 2] : []), pointRadius: 0, tension: 0, fill: false, yAxisID: isV ? 'yVolume' : 'y', order: isV ? 2 : 1 };
    })
  ];

  chartP = new Chart($('cPrice').getContext('2d'), {
    type: 'candlestick', data: { datasets }, plugins: [timestampPlugin],
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 }, interaction: { mode: 'index', intersect: false },
      plugins: { 
        legend: { labels: { color: '#2e4a68', font: { family: "'Share Tech Mono', monospace", size: 10 }, boxWidth: 12 } }, 
        tooltip: { 
          backgroundColor: '#0c1018', borderColor: '#1a2840', borderWidth: 1, titleColor: '#2e4a68', bodyColor: '#b8cfe8', 
          callbacks: { 
            label: ctx => { 
              const d = ctx.raw; 
              if (d && d.o !== undefined) {
                return [` 始値: ${d.o?.toLocaleString()}`, ` 高値: ${d.h?.toLocaleString()}`, ` 安値: ${d.l?.toLocaleString()}`, ` 終値: ${d.c?.toLocaleString()}`];
              }
              if (!d || ctx.parsed.y === null || isNaN(ctx.parsed.y)) return null;
              if (ctx.dataset.label === '▲買' && d.actualPrice) return ` 買値(翌寄): ${d.actualPrice.toLocaleString()}`;
              if (ctx.dataset.label === '▼売' && d.actualPrice) return ` 売値(翌寄): ${d.actualPrice.toLocaleString()}`;
              return ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}`;
            } 
          } 
        },
        zoom: {
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x', },
          pan: { enabled: true, mode: 'x', },
          onZoom: ({chart}) => updateSlidersFromChart(chart, data),
          onPan: ({chart}) => updateSlidersFromChart(chart, data),
        }
      },
      onClick: (e, elements, chart) => {
        // ダブルクリックでリセット
        if (e.type === 'click' && e.native.detail === 2) {
          chart.resetZoom();
        }
      },
      scales: { x: { type: 'category', labels: data.map(d => d.date), ticks: { color: '#2e4a68', maxTicksLimit: 12, font: { family: "'Share Tech Mono', monospace", size: 9 } }, grid: { color: 'rgba(26,40,64,.5)' } }, y: { ticks: { color: '#2e4a68', font: { family: "'Share Tech Mono', monospace", size: 9 }, callback: v => v.toLocaleString() }, grid: { color: 'rgba(26,40,64,.5)' }, title: { display: true, text: '株価 (円)', color: '#2e4a68', font: { size: 9 } } }, yVolume: { type: 'linear', display: true, position: 'right', grid: { display: false }, min: 0, suggestedMax: Math.max(...data.map(d => d.volume)) * 4, ticks: { display: false } } }
    }
  });
}

export function drawEquity({ equityCurve }) {
  if (pnlChart) {
    pnlChart.destroy();
    pnlChart = null;
  }
  const labels = equityCurve.map(e => e.date);
  const equities = equityCurve.map(e => e.equity);
  const initial = equities[0];
  pnlChart = new Chart($('pnl-chart').getContext('2d'), {
    type: 'line', data: { labels, datasets: [{ label: '資産推移 (円)', data: equities, borderColor: '#00d4aa', backgroundColor: 'rgba(0,212,170,0.08)', borderWidth: 2, pointRadius: 0, fill: true }] },
    plugins: [timestampPlugin], options: chartOptions('資産 (円)')
  });
}

export function chartOptions(yLabel) {
  return {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: { 
      legend: { labels: { color: '#94a3b8', font: { family: "'JetBrains Mono', monospace", size: 11 }, boxWidth: 14 } }, 
      tooltip: { backgroundColor: '#1c2535', borderColor: '#2a3548', borderWidth: 1, titleColor: '#94a3b8', bodyColor: '#e2e8f0', callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toLocaleString() : '-'}` } },
      zoom: {
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x', },
        pan: { enabled: true, mode: 'x', }
      }
    },
    onClick: (e, elements, chart) => {
      if (e.type === 'click' && e.native.detail === 2) {
        chart.resetZoom();
      }
    },
    scales: { x: { type: 'category', ticks: { color: '#64748b', maxTicksLimit: 12, font: { family: "'JetBrains Mono', monospace", size: 10 } }, grid: { color: 'rgba(42,53,72,0.5)' } }, y: { ticks: { color: '#64748b', font: { family: "'JetBrains Mono', monospace", size: 10 }, callback: v => v.toLocaleString() }, grid: { color: "rgba(42,53,72,0.5)" }, title: { display: true, text: yLabel, color: "#64748b", font: { size: 10 } } } }
  };
}

// ========================================
// スライダー制御ロジック
// ========================================
function initRangeSliders(data) {
  const wrapper = $('range-slider-wrapper');
  const fill = $('range-track-fill');
  const tMin = $('thumb-min');
  const tMax = $('thumb-max');
  if (!wrapper || !fill || !tMin || !tMax) return;

  drawMiniChart(data);

  const len = data.length;
  let cMin = 0;
  let cMax = len - 1;

  const refreshUI = (v1, v2) => {
    cMin = v1; cMax = v2;
    updateTrackFill(v1, v2, len);
    updateDateLabels(v1, v2, data);
    
    tMin.style.left = (v1 / (len - 1)) * 100 + "%";
    tMax.style.left = (v2 / (len - 1)) * 100 + "%";

    if (chartP) {
      chartP.options.scales.x.min = v1;
      chartP.options.scales.x.max = v2;
      chartP.update('none');
    }
  };

  refreshUI(0, len - 1);

  // リスナーが未登録の場合のみ登録
  if (!wrapper.dataset.listener) {
    let activeHandle = null; 
    let startX, startV1, startV2;

    const onDown = (e, type) => {
      activeHandle = type;
      startX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
      startV1 = cMin;
      startV2 = cMax;
      document.body.style.userSelect = 'none';
      if (e.cancelable) e.preventDefault();
    };

    tMin.onmousedown = (e) => onDown(e, 'min');
    tMax.onmousedown = (e) => onDown(e, 'max');
    fill.onmousedown = (e) => onDown(e, 'fill');
    tMin.ontouchstart = (e) => onDown(e, 'min');
    tMax.ontouchstart = (e) => onDown(e, 'max');
    fill.ontouchstart = (e) => onDown(e, 'fill');

    const onMove = (e) => {
      if (!activeHandle) return;
      const clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
      const rect = wrapper.getBoundingClientRect();
      const deltaX = clientX - startX;
      const deltaIndex = Math.round((deltaX / rect.width) * (len - 1));

      let v1 = startV1, v2 = startV2;

      if (activeHandle === 'min') {
        v1 = Math.max(0, Math.min(startV1 + deltaIndex, startV2 - 1));
      } else if (activeHandle === 'max') {
        v2 = Math.max(startV1 + 1, Math.min(startV2 + deltaIndex, len - 1));
      } else if (activeHandle === 'fill') {
        const diff = startV2 - startV1;
        v1 = startV1 + deltaIndex;
        v2 = startV2 + deltaIndex;
        if (v1 < 0) { v1 = 0; v2 = diff; }
        else if (v2 > len - 1) { v2 = len - 1; v1 = v2 - diff; }
      }

      if (v1 !== cMin || v2 !== cMax) {
        refreshUI(v1, v2);
      }
    };

    const onUp = () => {
      activeHandle = null;
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);

    wrapper.dataset.listener = "true";
    
    // 同期用関数の保持
    wrapper._sync = refreshUI;
  } else {
    // 既存の同期関数を更新（クロージャ内の変数を最新に保つ必要はないが、refreshUIを再利用）
    wrapper._sync = refreshUI;
  }

  // 外部からの動悸用
  wrapper.dataset.sync = (v1, v2) => {
    if (wrapper._sync) wrapper._sync(v1, v2);
  };
}

function updateSlidersFromChart(chart, data) {
  const wrapper = $('range-slider-wrapper');
  if (!wrapper || !wrapper.dataset.sync) return;

  const x = chart.scales.x;
  const v1 = Math.max(0, Math.floor(x.min));
  const v2 = Math.min(data.length - 1, Math.ceil(x.max));

  wrapper.dataset.sync(v1, v2);
}

function updateTrackFill(v1, v2, len) {
  const fill = $('range-track-fill');
  if (!fill) return;
  const left = (v1 / (len - 1)) * 100;
  const right = (v2 / (len - 1)) * 100;
  fill.style.left = left + "%";
  fill.style.width = (right - left) + "%";
}

function updateDateLabels(v1, v2, data) {
  const startEl = $('range-start-date');
  const endEl = $('range-end-date');
  if (startEl && data[v1]) startEl.textContent = data[v1].date;
  if (endEl && data[v2]) endEl.textContent = data[v2].date;
}

function drawMiniChart(data) {
  const canvas = $('range-mini-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (miniChart) {
    miniChart.destroy();
    miniChart = null;
  }
  
  miniChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date),
      datasets: [{
        data: data.map(d => d.close),
        borderColor: '#00f2ad',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: true,
        backgroundColor: 'rgba(0, 242, 173, 0.05)',
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false }
      },
      animation: false
    }
  });
}

// ========================================
// テーブルレンダリング
// ========================================
export function renderTradeTable(trades) {
  const tbody = document.querySelector("#trade-table tbody");
  tbody.innerHTML = trades.length === 0 ? '<tr><td colspan="9" style="text-align:center;color:var(--text-muted)">シグナルが発生しませんでした</td></tr>' : '';
  trades.forEach((t, i) => {
    const win = t.pnl > 0, rowClass = t.isOpen ? 'open-position' : (win ? 'trade-win' : 'trade-lose');
    const row = document.createElement("tr");
    row.className = rowClass;
    row.innerHTML = `<td>${i+1}</td><td>${t.buyDate}</td><td>${t.buyPrice.toLocaleString()}</td><td>${t.sellDate}</td><td>${t.sellPrice.toLocaleString()}</td><td>${t.holdDays}日</td><td class="${win?'win':'lose'}">${win?'+':''}${Math.round(t.pnl).toLocaleString()}</td><td class="${win?'win':'lose'}">${win?'+':''}${t.pnlPct.toFixed(2)}%</td><td><span class="exit-reason ${t.isOpen?'ongoing':(win?'win':'lose')}">${t.exitReason || (t.isOpen?'保有中':'シグナル反転')}</span></td>`;
    tbody.appendChild(row);
  });
}

export function renderExitStats(trades) {
  const container = $('exit-statistics');
  if (!container) return;
  const stats = {};
  trades.filter(t => !t.isOpen).forEach(t => {
    const r = t.exitReason || 'シグナル反転';
    if (!stats[r]) stats[r] = { count: 0, wins: 0, totalHold: 0, totalPnlPct: 0 };
    stats[r].count++; stats[r].totalHold += t.holdDays; stats[r].totalPnlPct += t.pnlPct; if (t.pnl > 0) stats[r].wins++;
  });
  if (Object.keys(stats).length === 0) { container.classList.add('hidden'); return; }
  let html = '<h3 class="exit-stats-title">売却理由の統計</h3><div class="exit-stats-grid">';
  Object.entries(stats).forEach(([r, s]) => {
    const wr = (s.wins/s.count*100).toFixed(1), ah = (s.totalHold/s.count).toFixed(1), ap = (s.totalPnlPct/s.count).toFixed(2);
    html += `<div class="exit-stat-card"><div class="exit-stat-reason">${r}</div><div class="exit-stat-details"><span>回数: ${s.count}回</span><span class="${s.wins>s.count/2?'win':'lose'}">勝率: ${wr}%</span><span>保有: ${ah}日</span><span class="${ap>=0?'win':'lose'}">平均損益: ${ap>=0?'+':''}${ap}%</span></div></div>`;
  });
  container.innerHTML = html + '</div>'; container.classList.remove('hidden');
}
