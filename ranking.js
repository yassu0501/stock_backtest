// ranking.js — 全戦略ランキング + マルチ戦略監視
import { runBacktest, getNoiseMode } from './simulate.js';
import { ALL_STRATEGIES } from './strategies.js';

const $ = (id) => document.getElementById(id);

// ========================================
// 全戦略自動ランキング
// ========================================
export class AutomaticStrategyRanking {
  constructor() {
    this.results = {};
    this.noiseResults = {};
    this.allResultsArray = [];
    this.noiseResultsArray = [];
    this.currentSort = { key: 'totalPnl', order: 'desc' };
  }

  async runFullRanking(code, priceData) {
    console.log(`[自動ランキング開始] ${code} - ${ALL_STRATEGIES.length}戦略`);
    this.results = {};
    this.noiseResults = {};

    const noiseMode = getNoiseMode();

    for (const strategy of ALL_STRATEGIES) {
      try {
        const result = runBacktest(priceData, strategy.id, 'off');
        this.results[strategy.id] = {
          strategyId: strategy.id,
          strategyName: strategy.name,
          totalPnl: result.totalPnl,
          winRate: result.winRate,
          maxDD: result.maxDD,
          tradesCount: result.trades.length,
          pf: this.calculatePF(result.trades)
        };

        if (noiseMode !== 'off') {
          const noiseResult = runBacktest(priceData, strategy.id, noiseMode);
          this.noiseResults[strategy.id] = {
            strategyId: strategy.id,
            strategyName: strategy.name,
            totalPnl: noiseResult.totalPnl,
            winRate: noiseResult.winRate,
            maxDD: noiseResult.maxDD,
            tradesCount: noiseResult.trades.length,
            pf: this.calculatePF(noiseResult.trades)
          };
        }
      } catch (err) {
        console.warn(`⚠️ ${strategy.name} エラー:`, err.message);
      }
    }

    this.allResultsArray = Object.values(this.results);
    this.noiseResultsArray = Object.values(this.noiseResults);
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

    $('rankingSummary').innerHTML = this.generateSummary(stats);
    $('rankingTop5').innerHTML = this.generateLeaderboard(top5, "🏆 利益 Top 5");
    $('rankingWorst5').innerHTML = this.generateLeaderboard(worst5, "📉 損失 Worst 5");
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
    return `<div class="ranking-section"><h3>${title}</h3>${items}</div>`;
  }

  generateAllTable() {
    const noiseMode = getNoiseMode();
    const hasNoise = noiseMode !== 'off' && this.noiseResultsArray.length > 0;

    let noiseRankMap = {};
    if (hasNoise) {
      const noiseSorted = [...this.noiseResultsArray].sort((a, b) => b.totalPnl - a.totalPnl);
      noiseSorted.forEach((r, i) => { noiseRankMap[r.strategyId] = i + 1; });
    }

    const sorted = [...this.allResultsArray].sort((a, b) => {
      const { key, order } = this.currentSort;
      let valA = a[key], valB = b[key];
      if (typeof valA === 'string') {
        return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return order === 'asc' ? valA - valB : valB - valA;
    });

    const rows = sorted.map((r, i) => {
      const offRank = i + 1;
      let noiseRankCell = '', deltaRankCell = '';
      if (hasNoise) {
        const noiseRank = noiseRankMap[r.strategyId] || '-';
        const delta = typeof noiseRank === 'number' ? offRank - noiseRank : 0;
        const deltaClass = delta > 0 ? 'rank-up' : delta < 0 ? 'rank-down' : 'rank-same';
        const deltaText = delta > 0 ? `▲${delta}` : delta < 0 ? `▼${Math.abs(delta)}` : '―';
        noiseRankCell = `<td>${noiseRank}</td>`;
        deltaRankCell = `<td class="${deltaClass}">${deltaText}</td>`;
      }
      return `
        <tr onclick="applyRankingStrategy('${r.strategyId}')" class="ranking-row">
          <td>${offRank}</td>
          <td class="strategy-name">${r.strategyName}</td>
          <td class="pnl ${r.totalPnl >= 0 ? 'positive' : 'negative'}">${r.totalPnl >= 0 ? '+' : ''}${Math.round(r.totalPnl).toLocaleString()}</td>
          <td>${r.winRate.toFixed(1)}%</td>
          <td>${r.pf >= 99.9 ? '∞' : r.pf.toFixed(2)}</td>
          <td>${r.maxDD.toFixed(1)}%</td>
          <td>${r.tradesCount}</td>
          ${noiseRankCell}${deltaRankCell}
        </tr>
      `;
    }).join('');

    const noiseHeaders = hasNoise
      ? `<th class="sortable" title="ノイズ適用時の順位">🎲順位</th>
         <th title="順位変動（Δ小=安定, Δ大=脆弱）">ΔRank</th>`
      : '';

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
                ${noiseHeaders}
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

// ========================================
// マルチ戦略監視
// ========================================
export class MultiStrategyMonitor {
  constructor() {
    this.intervalId = null;
    this.ticker = null;
    this.strategies = [];
    this.isActive = false;
    this.timeline = [];
    this.setupListeners();
    this.initMonitorChecklist();
  }

  setupListeners() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.isActive) this.pause(); }
      else { if (this.isActive) this.resume(); }
    });
    const btnStart = $('btnStartMultiMonitor');
    const btnReset = $('btnResetMultiMonitor');
    if (btnStart) btnStart.onclick = () => this.toggle();
    if (btnReset) btnReset.onclick = () => this.reset();
  }

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

  toggle() { this.isActive ? this.stop() : this.start(); }

  start() {
    const ticker = $('multiMonitorTicker').value.trim();
    if (!ticker) { alert('監視する銘柄コードを入力してください'); return; }
    this.ticker = ticker;
    this.strategies = ALL_STRATEGIES.map(s => s.id);
    this.isActive = true;
    $('btnStartMultiMonitor').textContent = '監視停止';
    $('btnStartMultiMonitor').classList.add('active');
    $('multiMonitorStatusBadge').textContent = '🟢 監視中';
    $('multiMonitorStatusBadge').classList.add('active');
    $('multiMonitorDisplay').classList.remove('hidden');
    $('displayTickerCode').textContent = ticker;
    $('displayTickerName').textContent = `全${this.strategies.length}戦略を監視中`;
    console.log(`[監視開始] 銘柄:${ticker}, 戦略数:${this.strategies.length}`);
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
    const countEl = $('signalTickerCount');
    if (countEl) countEl.textContent = '0';
    $('consensusBuy').style.width = '0%';
    $('consensusWait').style.width = '100%';
    $('consensusSell').style.width = '0%';
    $('consensusVerdict').textContent = 'WAITING...';
    $('multiMonitorDisplay').classList.add('hidden');
  }

  resume() {
    if (this.intervalId) return;
    this.checkAll();
    this.intervalId = setInterval(() => this.checkAll(), 15 * 60 * 1000);
  }

  pause() {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  async checkAll() {
    if (!this.isActive || document.hidden) return;
    try {
      console.log(`[監視実行] ${this.ticker} 全戦略チェック中...`);
      const histRes  = await fetch(`/api/stock?ticker=${encodeURIComponent(this.ticker)}&period=1y`);
      const { data: history, ticker } = await histRes.json();
      const priceRes  = await fetch(`/api/stock-price/${encodeURIComponent(this.ticker)}`);
      const priceData = await priceRes.json();
      if (!priceData.success) throw new Error('現在値取得失敗');
      const latestPrice = priceData.data.close;
      $('displayTickerName').textContent = ticker || this.ticker;

      const latestBar = {
        date: new Date(priceData.data.timestamp).toISOString().split('T')[0],
        open: latestPrice, high: priceData.data.high, low: priceData.data.low, close: latestPrice, volume: 0
      };
      const combined = [...history];
      if (combined.length > 0 && combined[combined.length - 1].date === latestBar.date) {
        combined[combined.length - 1] = latestBar;
      } else { combined.push(latestBar); }

      const results = {};
      const counts = { buy: 0, sell: 0, wait: 0 };
      this.strategies.forEach(stratId => {
        try {
          const res = runBacktest(combined, stratId);
          const lastSig = res.signals[res.signals.length - 1];
          results[stratId] = { signal: lastSig || 'wait', indicators: res.indicators };
          counts[lastSig || 'wait']++;
        } catch (e) { console.error(`判定エラー (${stratId}):`, e); }
      });

      this.updateSignalStrategyList(results, latestPrice);
      this.updateConsensus(counts);
      this.updateTimeline(counts);
      $('multiLastCheckTime').textContent = `最終確認: ${new Date().toLocaleTimeString('ja-JP')}`;
    } catch (err) { console.error('[監視エラー]:', err); }
  }

  updateSignalStrategyList(results, price) {
    const grid = $('strategyCardsGrid');
    grid.innerHTML = '';
    const signalEntries = Object.entries(results).filter(([, r]) => r.signal !== 'wait');
    const countEl = $('signalTickerCount');
    if (countEl) countEl.textContent = signalEntries.length;
    if (signalEntries.length === 0) {
      grid.innerHTML = '<div class="no-signal-msg">現在シグナルが出ている戦略はありません</div>';
      return;
    }
    for (const [id, res] of signalEntries) {
      const card = document.createElement('div');
      card.className = `strategy-card sig-${res.signal}`;
      const strategyName = document.querySelector(`#strategy-select option[value="${id}"]`)?.textContent || id;
      card.innerHTML = `
        <div class="card-title">${strategyName}</div>
        <div class="card-main">
          <div class="card-signal ${res.signal}">${res.signal.toUpperCase()}</div>
          <div class="card-value">¥${price.toLocaleString()}</div>
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

  updateTimeline(counts) {
    if (counts.buy === 0 && counts.sell === 0) return;
    const time = new Date().toLocaleTimeString('ja-JP');
    const type = counts.buy > counts.sell ? 'buy' : 'sell';
    const action = type === 'buy' ? 'BUY 信号多数' : 'SELL 信号多数';
    const item = document.createElement('div');
    item.className = `timeline-item ${type}`;
    item.innerHTML = `
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-info"><strong>${action}</strong> (B:${counts.buy} / S:${counts.sell})</div>
        <div class="timeline-time">${time}</div>
      </div>
    `;
    const container = $('signalTimeline');
    container.insertBefore(item, container.firstChild);
    if (container.children.length > 10) container.removeChild(container.lastChild);
  }
}
