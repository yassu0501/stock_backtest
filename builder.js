// builder.js — 戦略ビルダーUI / 状態管理（非モジュール）

// ============================================================
// 状態（State）
// ============================================================
let builderState = {
  ticker: '7203.T',
  period: '3y',
  initialCapital: 1000000,
  commission: 0.1,
  fixedInvestment: 300000,
  stopLoss: 2.0,
  takeProfit: 5.0,
  compounding: false,
  noise: 'mid',
  groupLogic: 'OR',
  entryGroups: [
    { id: 'g_default', logic: 'AND', conditions: [] }
  ],
  exitConditions: {
    logic: 'OR',
    conditions: [],
  },
  timeoutDays: 10,
};

// 現在フォーカス中のグループID（インジケーターパネルの追加先）
let activeGroupId = 'g_default';

// ============================================================
// インジケーターテンプレート
// ============================================================
const INDICATOR_TEMPLATES = {
  ma_cross:  { type: 'ma_cross',  label: 'MA',   category: 'trend',  params: { short: 5, long: 25 },             direction: 'golden',              desc: '移動平均クロス' },
  rsi:       { type: 'rsi',       label: 'RSI',  category: 'osc',    params: { period: 14, threshold: 30 },      direction: 'above',               desc: 'RSI' },
  macd:      { type: 'macd',      label: 'MACD', category: 'osc',    params: { short: 12, long: 26, signal: 9 }, direction: 'cross_up',            desc: 'MACD' },
  bb:        { type: 'bb',        label: 'BB',   category: 'trend',  params: { period: 20, sigma: 2 },           direction: 'recover_lower',       desc: 'ボリンジャーバンド' },
  stoch:     { type: 'stoch',     label: 'Stoch',category: 'osc',    params: { k: 14, d: 3, threshold: 20 },     direction: 'cross_up',            desc: 'ストキャスティクス' },
  donchian:  { type: 'donchian',  label: 'DC',   category: 'trend',  params: { period: 20 },                     direction: 'break_high',          desc: 'ドンチャンチャネル' },
  vwap:      { type: 'vwap',      label: 'VWAP', category: 'trend',  params: {},                                 direction: 'cross_up',            desc: 'VWAP' },
  volume:    { type: 'volume',    label: 'VOL',  category: 'vol',    params: { period: 20, multiplier: 1.5 },    direction: 'above',               desc: '出来高急増' },
  gap:       { type: 'gap',       label: 'GAP',  category: 'price',  params: { minPct: 2 },                      direction: 'down',                desc: 'ギャップ（窓）' },
  ichimoku:  { type: 'ichimoku',  label: '一目', category: 'trend',  params: { tenkan: 9, kijun: 26, senkouB: 52 }, direction: 'tk_cross_above_cloud', desc: '一目均衡表' },
  candle:    { type: 'candle',    label: 'C足',  category: 'price',  params: { pattern: 'hammer' },              direction: 'hammer',              desc: 'ローソク足パターン' },
};

const INDICATOR_CATEGORIES = [
  {
    label: 'トレンド系',
    types: ['ma_cross', 'bb', 'ichimoku', 'donchian', 'vwap'],
  },
  {
    label: 'オシレーター系',
    types: ['rsi', 'macd', 'stoch'],
  },
  {
    label: '出来高系',
    types: ['volume'],
  },
  {
    label: '価格パターン',
    types: ['gap', 'candle'],
  },
];

// ============================================================
// グループ操作
// ============================================================
function addGroup() {
  const id = 'g' + Date.now();
  builderState.entryGroups.push({ id, logic: 'AND', conditions: [] });
  activeGroupId = id;
  renderBuilder();
}

function removeGroup(groupId) {
  if (builderState.entryGroups.length <= 1) {
    alert('グループは最低1つ必要です');
    return;
  }
  builderState.entryGroups = builderState.entryGroups.filter(g => g.id !== groupId);
  if (activeGroupId === groupId) {
    activeGroupId = builderState.entryGroups[0].id;
  }
  renderBuilder();
}

function duplicateGroup(groupId) {
  const src = builderState.entryGroups.find(g => g.id === groupId);
  if (!src) return;
  const newGroup = JSON.parse(JSON.stringify(src));
  newGroup.id = 'g' + Date.now();
  newGroup.conditions = newGroup.conditions.map(c => ({
    ...c, id: 'c' + Date.now() + Math.random().toString(36).slice(2)
  }));
  const idx = builderState.entryGroups.findIndex(g => g.id === groupId);
  builderState.entryGroups.splice(idx + 1, 0, newGroup);
  renderBuilder();
}

function toggleGroupLogic(groupId) {
  const g = builderState.entryGroups.find(g => g.id === groupId);
  if (g) { g.logic = g.logic === 'AND' ? 'OR' : 'AND'; renderBuilder(); }
}

function toggleGroupLogic_global() {
  builderState.groupLogic = builderState.groupLogic === 'AND' ? 'OR' : 'AND';
  renderBuilder();
}

// ============================================================
// 条件操作
// ============================================================
function addConditionToGroup(groupId, condType) {
  const g = builderState.entryGroups.find(g => g.id === groupId);
  if (!g) return;
  const tmpl = INDICATOR_TEMPLATES[condType];
  if (!tmpl) return;
  g.conditions.push({
    ...JSON.parse(JSON.stringify(tmpl)),
    id: 'c' + Date.now() + Math.random().toString(36).slice(2),
  });
  renderBuilder();
}

function removeCondition(condId) {
  for (const g of builderState.entryGroups) {
    g.conditions = g.conditions.filter(c => c.id !== condId);
  }
  // 決済条件からも
  if (builderState.exitConditions) {
    builderState.exitConditions.conditions = builderState.exitConditions.conditions.filter(c => c.id !== condId);
  }
  renderBuilder();
}

function updateConditionParam(condId, paramKey, value) {
  const allConds = [];
  for (const g of builderState.entryGroups) allConds.push(...g.conditions);
  if (builderState.exitConditions) allConds.push(...builderState.exitConditions.conditions);

  const c = allConds.find(c => c.id === condId);
  if (!c) return;
  if (paramKey === 'direction') {
    c.direction = value;
  } else {
    c.params[paramKey] = isNaN(value) || value === '' ? value : parseFloat(value);
  }
  // DOMは再描画しない（入力中にカーソルが飛ぶのを防ぐ）
}

// ============================================================
// インジケーターパネル（右サイドバー）
// ============================================================
function setActiveGroup(groupId) {
  activeGroupId = groupId;
  // グループのハイライトを更新
  document.querySelectorAll('.condition-group').forEach(el => {
    el.classList.toggle('active-group', el.dataset.groupId === groupId);
  });
}

function renderIndicatorList() {
  const container = document.getElementById('indicator-list');
  if (!container) return;

  let html = '';
  for (const cat of INDICATOR_CATEGORIES) {
    html += `<div class="ind-category">
      <div class="ind-category-label">${cat.label}</div>
      <div class="ind-items">`;
    for (const type of cat.types) {
      const tmpl = INDICATOR_TEMPLATES[type];
      if (!tmpl) continue;
      html += `
        <div class="ind-item" onclick="addConditionToGroup(activeGroupId, '${type}')">
          <span class="ind-badge ind-${tmpl.category}">${tmpl.label}</span>
          <span class="ind-name">${tmpl.desc}</span>
          <span class="ind-add-icon">＋</span>
        </div>`;
    }
    html += `</div></div>`;
  }
  container.innerHTML = html;
}

// ============================================================
// 保存済み戦略一覧
// ============================================================
const STORAGE_KEY = 'custom_strategies_v1';

function saveStrategy() {
  const nameEl = document.getElementById('strategy-name-input');
  const name = nameEl ? nameEl.value.trim() : '';
  if (!name) { alert('戦略名を入力してください'); return; }

  // 現在のUI値を読み取り
  syncStateFromUI();

  const saved = loadAllStrategies();
  saved[name] = { ...builderState, savedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  renderSavedList();
  alert(`「${name}」を保存しました`);
}

function loadStrategy(name) {
  const saved = loadAllStrategies();
  if (!saved[name]) return;
  builderState = JSON.parse(JSON.stringify(saved[name]));
  if (!builderState.entryGroups || builderState.entryGroups.length === 0) {
    builderState.entryGroups = [{ id: 'g_default', logic: 'AND', conditions: [] }];
  }
  activeGroupId = builderState.entryGroups[0].id;
  renderBuilder();
  syncUIFromState();
}

function deleteStrategy(name) {
  if (!confirm(`「${name}」を削除しますか？`)) return;
  const saved = loadAllStrategies();
  delete saved[name];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  renderSavedList();
}

function loadAllStrategies() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function renderSavedList() {
  const container = document.getElementById('saved-list');
  if (!container) return;
  const saved = loadAllStrategies();
  const names = Object.keys(saved);
  if (names.length === 0) {
    container.innerHTML = '<div class="empty-msg">保存済み戦略はありません</div>';
    return;
  }
  container.innerHTML = names.map(name => {
    const s = saved[name];
    const date = s.savedAt ? new Date(s.savedAt).toLocaleDateString('ja-JP') : '';
    return `
      <div class="saved-item">
        <div class="saved-item-info">
          <div class="saved-item-name">${name}</div>
          <div class="saved-item-date">${date}</div>
        </div>
        <div class="saved-item-actions">
          <button class="btn-sm" onclick="loadStrategy('${name.replace(/'/g, "\\'")}')">読込</button>
          <button class="btn-sm btn-danger" onclick="deleteStrategy('${name.replace(/'/g, "\\'")}')">削除</button>
        </div>
      </div>`;
  }).join('');
}

// ============================================================
// 損切なしトグル
// ============================================================
function toggleBuilderNoStopLoss(checkbox) {
  const slInput = document.getElementById('stop-loss');
  if (checkbox.checked) {
    slInput.dataset.savedValue = slInput.value;
    slInput.value = 0;
    slInput.disabled = true;
  } else {
    slInput.value = slInput.dataset.savedValue ?? 2;
    slInput.disabled = false;
  }
}

// ============================================================
// UIとstateの同期
// ============================================================
function syncStateFromUI() {
  const get = id => { const el = document.getElementById(id); return el ? el.value : null; };
  builderState.ticker         = get('ticker-input') || builderState.ticker;
  builderState.period         = get('period-select') || builderState.period;
  builderState.initialCapital = parseFloat(get('capital-input')) || builderState.initialCapital;
  builderState.commission     = parseFloat(get('commission-input')) || builderState.commission;
  builderState.noise          = get('noise-select') || builderState.noise;
  builderState.stopLoss       = parseFloat(get('stop-loss')) || 0;
  builderState.takeProfit     = parseFloat(get('take-profit')) || 0;
  builderState.timeoutDays    = parseInt(get('timeout-days')) || 0;

  const modeEl = document.getElementById('investment-mode');
  if (modeEl) {
    builderState.compounding = modeEl.value === 'compound';
    if (!builderState.compounding) {
      builderState.fixedInvestment = parseFloat(get('fixed-inv-amt')) || builderState.fixedInvestment;
    }
  }
}

function syncUIFromState() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('ticker-input',    builderState.ticker);
  set('period-select',   builderState.period);
  set('capital-input',   builderState.initialCapital);
  set('commission-input',builderState.commission);
  set('noise-select',    builderState.noise);
  set('stop-loss',       builderState.stopLoss);
  set('take-profit',     builderState.takeProfit);
  set('timeout-days',    builderState.timeoutDays);
}

// ============================================================
// DOMレンダリング
// ============================================================
function renderBuilder() {
  renderEntryGroups();
  renderSavedList();
  renderIndicatorList();
}

function renderEntryGroups() {
  const container = document.getElementById('entry-groups-container');
  if (!container) return;
  container.innerHTML = '';

  builderState.entryGroups.forEach((group, idx) => {
    if (idx > 0) {
      const between = document.createElement('div');
      between.className = 'between-groups';
      between.innerHTML = `
        <div class="between-line"></div>
        <button class="group-logic-btn" onclick="toggleGroupLogic_global()">
          ${builderState.groupLogic}
        </button>
        <div class="between-line"></div>`;
      container.appendChild(between);
    }
    container.appendChild(createGroupElement(group, idx + 1));
  });
}

function createGroupElement(group, n) {
  const el = document.createElement('div');
  el.className = 'condition-group' + (group.id === activeGroupId ? ' active-group' : '');
  el.dataset.groupId = group.id;
  el.onclick = (e) => {
    if (!e.target.closest('button') && !e.target.closest('input') && !e.target.closest('select')) {
      setActiveGroup(group.id);
    }
  };

  const logicLabel = group.logic === 'AND' ? '以下をすべて満たす' : '以下のいずれかを満たす';

  el.innerHTML = `
    <div class="group-header">
      <span class="group-number">グループ ${n}</span>
      <button class="logic-toggle logic-${group.logic.toLowerCase()}"
              onclick="toggleGroupLogic('${group.id}')">
        ${group.logic}
      </button>
      <span class="group-desc">${logicLabel}</span>
      <div class="group-actions">
        <button class="btn-sm" onclick="duplicateGroup('${group.id}')">複製</button>
        <button class="btn-sm btn-danger" onclick="removeGroup('${group.id}')">削除</button>
      </div>
    </div>
    <div class="conditions-container" id="conds-${group.id}"></div>
    <button class="add-cond-btn" onclick="setActiveGroup('${group.id}'); showTab('indicators')">
      ＋ 条件を追加（右のパネルから選択）
    </button>
  `;

  const condContainer = el.querySelector(`#conds-${group.id}`);
  if (group.conditions.length === 0) {
    condContainer.innerHTML = '<div class="empty-cond-msg">条件がありません。右パネルから追加してください。</div>';
  } else {
    for (const cond of group.conditions) {
      condContainer.appendChild(createConditionRow(cond));
    }
  }
  return el;
}

function createConditionRow(cond) {
  const el = document.createElement('div');
  el.className = 'condition-row';
  el.dataset.condId = cond.id;

  const tmpl = INDICATOR_TEMPLATES[cond.type];
  el.innerHTML = `
    <span class="cond-badge cond-${tmpl?.category || 'other'}">${tmpl?.label || cond.type}</span>
    <span class="cond-name">${tmpl?.desc || cond.type}</span>
    <div class="cond-params-inline">${renderCondParamsHTML(cond)}</div>
    <button class="cond-remove" onclick="removeCondition('${cond.id}')">×</button>
  `;
  return el;
}

function renderCondParamsHTML(cond) {
  const id = cond.id;
  const p = cond.params;
  const sel = (name, opts, cur) => `
    <select onchange="updateConditionParam('${id}','${name}',this.value)">
      ${opts.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select>`;
  const num = (name, val, step = 1, w = 48) => `
    <input type="number" value="${val}" step="${step}" style="width:${w}px"
           onchange="updateConditionParam('${id}','${name}',this.value)">`;

  switch (cond.type) {
    case 'ma_cross': return `
      短 ${num('short', p.short, 1, 44)} /
      長 ${num('long', p.long, 1, 44)} 日
      ${sel('direction', [
        ['golden', 'ゴールデンクロス'],
        ['dead',   'デッドクロス'],
      ], cond.direction)}`;

    case 'rsi': return `
      期間 ${num('period', p.period, 1, 44)}
      閾値 ${num('threshold', p.threshold, 1, 44)}
      ${sel('direction', [
        ['above',      '閾値を上抜け（回復）'],
        ['below',      '閾値を下抜け（離脱）'],
        ['oversold',   '売られすぎ域'],
        ['overbought', '買われすぎ域'],
      ], cond.direction)}`;

    case 'macd': return `
      ${num('short', p.short, 1, 36)} /
      ${num('long', p.long, 1, 36)} /
      ${num('signal', p.signal, 1, 36)}
      ${sel('direction', [
        ['cross_up',   '上抜けクロス'],
        ['cross_down', '下抜けクロス'],
      ], cond.direction)}`;

    case 'bb': return `
      期間 ${num('period', p.period, 1, 44)}
      σ ${num('sigma', p.sigma, 0.5, 44)}
      ${sel('direction', [
        ['recover_lower', '下バンドから回復（逆張り買い）'],
        ['break_upper',   '上バンドブレイク（勢い買い）'],
        ['break_lower',   '下バンドブレイク（売りシグナル）'],
        ['above_upper',   '上バンド以上'],
        ['below_lower',   '下バンド以下'],
      ], cond.direction)}`;

    case 'stoch': return `
      K ${num('k', p.k, 1, 40)} /
      D ${num('d', p.d, 1, 40)}
      閾値 ${num('threshold', p.threshold, 1, 44)}
      ${sel('direction', [
        ['cross_up',   'K/Dクロス上抜け（売られすぎ域）'],
        ['cross_down', 'K/Dクロス下抜け（買われすぎ域）'],
      ], cond.direction)}`;

    case 'donchian': return `
      期間 ${num('period', p.period, 1, 44)} 日
      ${sel('direction', [
        ['break_high', 'N日高値ブレイク（買い）'],
        ['break_low',  'N日安値ブレイク（売り）'],
      ], cond.direction)}`;

    case 'vwap': return `
      ${sel('direction', [
        ['cross_up',   'VWAP上抜け'],
        ['cross_down', 'VWAP下抜け'],
        ['above',      'VWAP以上'],
        ['below',      'VWAP以下'],
      ], cond.direction)}`;

    case 'volume': return `
      期間 ${num('period', p.period, 1, 44)} 日平均の
      ${num('multiplier', p.multiplier, 0.1, 44)} 倍
      ${sel('direction', [
        ['above', '以上'],
        ['below', '以下'],
      ], cond.direction)}`;

    case 'gap': return `
      最小幅 ${num('minPct', p.minPct, 0.5, 44)} %
      ${sel('direction', [
        ['down', 'ギャップダウン（買い）'],
        ['up',   'ギャップアップ（売り）'],
      ], cond.direction)}`;

    case 'ichimoku': return `
      転換 ${num('tenkan', p.tenkan, 1, 36)} /
      基準 ${num('kijun', p.kijun, 1, 36)} /
      B期間 ${num('senkouB', p.senkouB, 1, 44)}
      ${sel('direction', [
        ['tk_cross_above_cloud', '転換×基準クロス（雲の上）'],
        ['tk_cross_up',          '転換線が基準線を上抜け'],
        ['price_above_cloud',    '価格が雲を上抜け'],
        ['price_below_cloud',    '価格が雲を下抜け'],
      ], cond.direction)}`;

    case 'candle': return `
      ${sel('direction', [
        ['hammer',      'ハンマー（底打ち）'],
        ['engulf_bull', '陽の包み足（強気）'],
        ['engulf_bear', '陰の包み足（弱気）'],
        ['three_white', '赤三兵'],
        ['three_black', '黒三兵'],
      ], cond.direction)}`;

    default: return '';
  }
}

// ============================================================
// タブ切り替え
// ============================================================
function showTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  const content = document.getElementById(`tab-${tabName}`);
  if (content) content.style.display = 'block';
  const btn = document.querySelector(`[data-tab="${tabName}"]`);
  if (btn) btn.classList.add('active');
}

// ============================================================
// バックテスト実行
// ============================================================
async function runBuilderBacktest() {
  const btn = document.getElementById('run-btn');
  if (btn) { btn.disabled = true; btn.textContent = '計算中...'; }

  const resultsEl = document.getElementById('builder-results');
  if (resultsEl) resultsEl.innerHTML = '';

  try {
    syncStateFromUI();

    const priceData = await fetchPriceData(builderState.ticker, builderState.period);

    const settings = {
      initialCapital:  builderState.initialCapital,
      fixedInvestment: builderState.fixedInvestment,
      commission:      builderState.commission,
      stopLoss:        builderState.stopLoss,
      takeProfit:      builderState.takeProfit,
      compounding:     builderState.compounding,
      noise:           builderState.noise,
    };

    const strategy = {
      entryGroups:    builderState.entryGroups,
      groupLogic:     builderState.groupLogic,
      exitConditions: builderState.exitConditions,
      timeoutDays:    builderState.timeoutDays,
    };

    const result = runCustomBacktest(priceData, strategy, settings);
    displayResults(result, priceData);

  } catch (e) {
    const resultsEl = document.getElementById('builder-results');
    if (resultsEl) resultsEl.innerHTML = `<div class="error-msg">エラー: ${e.message}</div>`;
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '▶ バックテスト実行'; }
  }
}

// ============================================================
// 結果表示
// ============================================================
let equityChart = null;

function displayResults(result, priceData) {
  const container = document.getElementById('builder-results');
  if (!container) return;

  const { trades, metrics, finalCapital, signals } = result;
  const pnlSign = metrics.totalPnl >= 0 ? 'pos' : 'neg';

  container.innerHTML = `
    <div class="result-section">
      <div class="section-label">📊 バックテスト結果</div>

      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-label">総損益</div>
          <div class="metric-value ${pnlSign}">¥${Math.round(metrics.totalPnl).toLocaleString()}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">リターン</div>
          <div class="metric-value ${pnlSign}">${metrics.returnPct.toFixed(2)}%</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">勝率</div>
          <div class="metric-value">${metrics.winRate.toFixed(1)}%</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">PF</div>
          <div class="metric-value">${metrics.pf === 99.9 ? '∞' : metrics.pf.toFixed(2)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">最大DD</div>
          <div class="metric-value neg">-${metrics.maxDD.toFixed(1)}%</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">平均保有日数</div>
          <div class="metric-value">${metrics.avgHold.toFixed(1)}日</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">総トレード数</div>
          <div class="metric-value">${metrics.totalTrades}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">最終資産</div>
          <div class="metric-value">¥${finalCapital.toLocaleString()}</div>
        </div>
      </div>

      <div class="chart-wrap" style="margin:16px 0">
        <canvas id="builder-equity-chart" height="160"></canvas>
      </div>

      ${renderBuilderTradeTable(trades)}
    </div>
  `;

  // 損益曲線描画
  drawBuilderEquityChart(trades, metrics.totalPnl >= 0);
}

function drawBuilderEquityChart(trades, isProfit) {
  const canvas = document.getElementById('builder-equity-chart');
  if (!canvas || !window.Chart) return;

  if (equityChart) { equityChart.destroy(); equityChart = null; }

  const labels = ['開始'];
  const data   = [builderState.initialCapital];
  let equity = builderState.initialCapital;

  for (const t of trades) {
    equity += t.pnl;
    labels.push(t.exitDate ? t.exitDate.replace('(未決)', '') : '');
    data.push(Math.round(equity));
  }

  const color = isProfit ? '#00f2ad' : '#ff4d4d';
  equityChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '累積資産',
        data,
        borderColor: color,
        backgroundColor: color + '22',
        borderWidth: 2,
        pointRadius: data.length < 60 ? 3 : 0,
        tension: 0.3,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: {
          ticks: { color: '#8899bb', callback: v => '¥' + v.toLocaleString() },
          grid: { color: '#1a2236' },
        },
      },
    },
  });
}

function renderBuilderTradeTable(trades) {
  if (!trades || trades.length === 0) {
    return '<div class="empty-msg" style="margin-top:12px">トレードがありません</div>';
  }
  const rows = trades.map(t => {
    const pnlClass = t.pnl > 0 ? 'pos' : t.pnl < 0 ? 'neg' : '';
    return `<tr>
      <td>${t.entryDate || ''}</td>
      <td>${t.exitDate || ''}</td>
      <td class="num">¥${t.entryPrice.toLocaleString()}</td>
      <td class="num">¥${t.exitPrice.toLocaleString()}</td>
      <td class="num">${t.shares}</td>
      <td class="num ${pnlClass}">¥${t.pnl.toLocaleString()}</td>
      <td class="num ${pnlClass}">${t.pnlPct.toFixed(2)}%</td>
      <td class="num">${t.holdDays}日</td>
      <td>${t.exitReason || ''}</td>
    </tr>`;
  }).join('');

  return `
    <div style="overflow-x:auto;margin-top:16px">
      <table class="trade-tbl">
        <thead>
          <tr>
            <th>買日</th><th>売日</th><th>買値</th><th>売値</th>
            <th>株数</th><th>損益</th><th>損益%</th><th>保有</th><th>理由</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ============================================================
// 初期化
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  syncUIFromState();
  renderBuilder();

  // ティッカーチップクリック
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('ticker-chip')) {
      const el = document.getElementById('ticker-input');
      if (el) el.value = e.target.dataset.ticker;
    }
  });
});
